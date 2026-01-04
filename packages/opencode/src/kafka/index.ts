import { Log } from "../util/log"
import { Config } from "../config/config"
import { z } from "zod"

const log = Log.create({ service: "kafka" })

const defaultConfig = {
  brokers: "localhost:9092",
  apiTopic: "opencode-api-events",
  toolTopic: "opencode-tool-events",
  sessionTopic: "opencode-session-events",
  errorTopic: "opencode-error-events",
  flushInterval: 5000,
  flushTimeout: 30000,
  clientId: "opencode",
}

export interface KafkaConfig {
  enabled: boolean
  brokers: string
  apiTopic: string
  toolTopic: string
  sessionTopic: string
  errorTopic: string
  flushInterval: number
  flushTimeout: number
  clientId: string
  sasl?: {
    mechanism: "plain" | "scram-sha-256" | "scram-sha-512"
    username: string
    password: string
  }
  ssl?: {
    caPath?: string
    certPath?: string
    keyPath?: string
    rejectUnauthorized: boolean
  }
}

export const KafkaConfigSchema = z
  .object({
    enabled: z.boolean().optional().describe("Enable Kafka event streaming"),
    brokers: z.string().optional().describe("Kafka broker addresses (comma-separated)"),
    apiTopic: z.string().optional().describe("Topic for API usage events"),
    toolTopic: z.string().optional().describe("Topic for tool execution events"),
    sessionTopic: z.string().optional().describe("Topic for session lifecycle events"),
    errorTopic: z.string().optional().describe("Topic for error events"),
    flushInterval: z.number().optional().describe("Batch flush interval in milliseconds"),
    flushTimeout: z.number().optional().describe("Flush timeout in milliseconds"),
    clientId: z.string().optional().describe("Kafka client ID"),
    sasl: z
      .object({
        mechanism: z.enum(["plain", "scram-sha-256", "scram-sha-512"]),
        username: z.string(),
        password: z.string(),
      })
      .optional(),
    ssl: z
      .object({
        caPath: z.string().optional(),
        certPath: z.string().optional(),
        keyPath: z.string().optional(),
        rejectUnauthorized: z.boolean().optional(),
      })
      .optional(),
  })
  .describe("Kafka event streaming configuration")

export type KafkaConfigType = z.infer<typeof KafkaConfigSchema>

let producer: any = null
let config: KafkaConfig | null = null
let eventQueue: Map<string, any[]> = new Map()
let flushInterval: ReturnType<typeof setInterval> | null = null

export async function initialize(): Promise<void> {
  const globalConfig = Config.get()
  const kafkaConfig = globalConfig.experimental?.kafka

  if (!kafkaConfig?.enabled) {
    log.info("Kafka event streaming disabled")
    return
  }

  config = {
    enabled: true,
    ...defaultConfig,
    ...kafkaConfig,
  }

  try {
    await connectProducer()
    log.info("Kafka event streaming initialized", {
      brokers: config.brokers,
      clientId: config.clientId,
    })

    startEventBatching()
  } catch (error) {
    log.error("Failed to initialize Kafka", { error: String(error) })
    config.enabled = false
  }
}

async function connectProducer(): Promise<void> {
  if (!config || !config.enabled) {
    throw new Error("Kafka not configured or disabled")
  }

  try {
    const kafkajs = await import("kafkajs")
    const { Kafka, Partitioners } = kafkajs

    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers.split(","),
      sasl: config.sasl
        ? {
            mechanism: config.sasl.mechanism,
            username: config.sasl.username,
            password: config.sasl.password,
          }
        : undefined,
      ssl: config.ssl
        ? {
            ca: config.ssl.caPath ? [await Bun.file(config.ssl.caPath).text()] : undefined,
            cert: config.ssl.certPath ? [await Bun.file(config.ssl.certPath).text()] : undefined,
            key: config.ssl.keyPath ? [await Bun.file(config.ssl.keyPath).text()] : undefined,
            rejectUnauthorized: config.ssl.rejectUnauthorized,
          }
        : undefined,
    })

    producer = kafka.producer({
      allowAutoTopicCreation: true,
      maxInFlightRequests: 1,
      idempotent: true,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
      transactionTimeout: config.flushTimeout,
    })

    await producer.connect()
    log.info("Kafka producer connected")
  } catch (error) {
    throw new Error(`Failed to create Kafka producer: ${String(error)}`)
  }
}

function startEventBatching(): void {
  if (!config || !config.enabled) return

  flushInterval = setInterval(async () => {
    await flushEvents()
  }, config.flushInterval)

  log.debug("Event batching started", { interval: config.flushInterval })
}

async function flushEvents(): Promise<void> {
  if (!producer || eventQueue.size === 0) return

  log.debug(`Flushing ${eventQueue.size} events to Kafka`)

  const flushPromises: Promise<void>[] = []

  for (const [topic, events] of eventQueue.entries()) {
    if (events.length === 0) continue

    const flushPromise = (async () => {
      try {
        await producer.send({
          topic,
          messages: events.map(e => ({
            key: e.key || null,
            value: JSON.stringify(e.value),
            headers: {
              timestamp: Date.now().toString(),
              source: "opencode",
              version: "1.0.0",
            },
          })),
        })

        log.debug(`Flushed ${events.length} events to topic ${topic}`)
      } catch (error) {
        log.error(`Failed to send events to ${topic}`, { error: String(error) })
      }
    })()

    flushPromises.push(flushPromise)
  }

  await Promise.all(flushPromises)
  eventQueue.clear()
}

export async function publishApiEvent(event: any): Promise<void> {
  if (!config?.enabled) return

  const queueKey = config.apiTopic
  if (!eventQueue.has(queueKey)) {
    eventQueue.set(queueKey, [])
  }

  eventQueue.get(queueKey)!.push({
    key: event.sessionId || event.id,
    value: {
      type: "api_event",
      timestamp: Date.now(),
      ...event,
    },
  })
}

export async function publishToolEvent(event: any): Promise<void> {
  if (!config?.enabled) return

  const queueKey = config.toolTopic
  if (!eventQueue.has(queueKey)) {
    eventQueue.set(queueKey, [])
  }

  eventQueue.get(queueKey)!.push({
    key: `${event.sessionId}_${event.tool}`,
    value: {
      type: "tool_event",
      timestamp: Date.now(),
      ...event,
    },
  })
}

export async function publishSessionEvent(event: any): Promise<void> {
  if (!config?.enabled) return

  const queueKey = config.sessionTopic
  if (!eventQueue.has(queueKey)) {
    eventQueue.set(queueKey, [])
  }

  eventQueue.get(queueKey)!.push({
    key: event.sessionId,
    value: {
      type: "session_event",
      timestamp: Date.now(),
      ...event,
    },
  })
}

export async function publishErrorEvent(event: any): Promise<void> {
  if (!config?.enabled) return

  const queueKey = config.errorTopic
  if (!eventQueue.has(queueKey)) {
    eventQueue.set(queueKey, [])
  }

  eventQueue.get(queueKey)!.push({
    key: `${event.sessionId}_${Date.now()}`,
    value: {
      type: "error_event",
      timestamp: Date.now(),
      ...event,
    },
  })
}

export function isEnabled(): boolean {
  return config?.enabled || false
}

export async function close(): Promise<void> {
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }

  await flushEvents()

  if (producer) {
    log.info("Disconnecting Kafka producer")
    await producer.disconnect()
    producer = null
  }
}

export function getConfig(): KafkaConfig | null {
  return config
}

export function getQueuedEventCount(): number {
  let total = 0
  for (const events of eventQueue.values()) {
    total += events.length
  }
  return total
}

export interface ApiEvent {
  sessionId: string
  provider?: string
  model?: string
  promptLength?: number
  responseLength?: number
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  duration?: number
  success: boolean
}

export interface ToolEvent {
  sessionId: string
  tool: string
  args?: any
  duration: number
  success: boolean
  error?: string
  outputPath?: string
}

export interface SessionEvent {
  sessionId: string
  userId?: string
  directory: string
  startTime: number
  endTime?: number
  duration?: number
  mode?: string
  exitCode?: number
  error?: string
  messageCount?: number
  toolCount?: number
}

export interface ErrorEvent {
  sessionId: string
  errorType: string
  errorMessage: string
  stackTrace?: string
  timestamp: number
  tool?: string
  recoveryAttempted?: boolean
  recoverySucceeded?: boolean
}
