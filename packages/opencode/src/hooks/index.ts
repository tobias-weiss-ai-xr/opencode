import { Log } from "../util/log"
import { Config } from "../config/config"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { z } from "zod"

const log = Log.create({ service: "hooks" })

export interface HookContext {
  sessionId?: string
  userId?: string
  directory?: string
  timestamp: Date
  event?: string
}

export interface HookCommand {
  command: string[]
  environment?: Record<string, string>
  workingDir?: string
  timeout?: number
}

export interface HookDefinition {
  name: string
  commands: HookCommand[]
  enabled: boolean
}

export const HookEvent = {
  SessionStarted: BusEvent.define(
    "hook.session.started",
    z.object({
      sessionId: z.string(),
      directory: z.string(),
    }),
  ),
  SessionCompleted: BusEvent.define(
    "hook.session.completed",
    z.object({
      sessionId: z.string(),
      duration: z.number(),
      messageCount: z.number(),
      tokenCount: z.number(),
    }),
  ),
  SessionFailed: BusEvent.define(
    "hook.session.failed",
    z.object({
      sessionId: z.string(),
      error: z.string(),
      duration: z.number(),
    }),
  ),
  ToolUsed: BusEvent.define(
    "hook.tool.used",
    z.object({
      sessionId: z.string(),
      tool: z.string(),
      args: z.object({}).passthrough(),
      duration: z.number(),
      success: z.boolean(),
    }),
  ),
  FileEdited: BusEvent.define(
    "hook.file.edited",
    z.object({
      sessionId: z.string(),
      filePath: z.string(),
      action: z.enum(["read", "write", "edit", "delete"]),
      linesAdded: z.number().optional(),
      linesDeleted: z.number().optional(),
    }),
  ),
}

export class HookManager {
  private hooks: Map<string, HookDefinition[]> = new Map()

  constructor() {
    this.loadHooksFromConfig()
    this.setupEventListeners()
  }

  private loadHooksFromConfig(): void {
    const config = Config.get()
    const experimental = config.experimental

    if (!experimental?.hooks) return

    if (experimental.hooks.file_edited) {
      for (const [pattern, hooks] of Object.entries(experimental.hooks.file_edited)) {
        hooks.forEach(hook => {
          this.registerHook("file_edited", {
            name: pattern,
            commands: hook,
            enabled: true,
          })
        })
      }
    }

    if (experimental.hooks.session_completed) {
      experimental.hooks.session_completed.forEach(hook => {
        this.registerHook("session_completed", {
          name: `session_completed_${hooks.length}`,
          commands: hook,
          enabled: true,
        })
      })
    }
  }

  private setupEventListeners(): void {
    Bus.on(HookEvent.SessionStarted, async (data) => {
      await this.executeHooks("pre_run", {
        sessionId: data.sessionId,
        directory: data.directory,
        timestamp: new Date(),
        event: "session_started",
      })
    })

    Bus.on(HookEvent.SessionCompleted, async (data) => {
      await this.executeHooks("post_run", {
        sessionId: data.sessionId,
        timestamp: new Date(),
        event: "session_completed",
        duration: data.duration,
        messageCount: data.messageCount,
        tokenCount: data.tokenCount,
      })
    })

    Bus.on(HookEvent.SessionFailed, async (data) => {
      await this.executeHooks("on_error", {
        sessionId: data.sessionId,
        timestamp: new Date(),
        event: "session_failed",
        error: data.error,
        duration: data.duration,
      })
    })

    Bus.on(HookEvent.ToolUsed, async (data) => {
      const eventType = `tool_${data.tool}`
      await this.executeHooks(eventType, {
        sessionId: data.sessionId,
        timestamp: new Date(),
        event: "tool_used",
        tool: data.tool,
        args: data.args,
        duration: data.duration,
        success: data.success,
      })
    })

    Bus.on(HookEvent.FileEdited, async (data) => {
      await this.executeHooks("file_edited", {
        sessionId: data.sessionId,
        timestamp: new Date(),
        event: "file_edited",
        filePath: data.filePath,
        action: data.action,
        linesAdded: data.linesAdded,
        linesDeleted: data.linesDeleted,
      })
    })
  }

  private registerHook(eventType: string, hook: HookDefinition): void {
    if (!this.hooks.has(eventType)) {
      this.hooks.set(eventType, [])
    }
    this.hooks.get(eventType)!.push(hook)
    log.debug(`Registered hook`, { event: eventType, name: hook.name })
  }

  private async executeHooks(eventType: string, context: HookContext): Promise<void> {
    const hooks = this.hooks.get(eventType)
    if (!hooks || hooks.length === 0) return

    log.info(`Executing hooks`, { event: eventType, count: hooks.length })

    const results = await Promise.allSettled(
      hooks.map(hook => this.executeHook(hook, context))
    )

    const failures = results.filter(r => r.status === "rejected")
    if (failures.length > 0) {
      log.error(`Hook execution failed`, {
        event: eventType,
        failures: failures.length,
        errors: failures.map(f => f.reason),
      })
    }
  }

  private async executeHook(hook: HookDefinition, context: HookContext): Promise<void> {
    if (!hook.enabled) return

    log.debug(`Executing hook`, { name: hook.name, event: context.event })

    for (const hookCmd of hook.commands) {
      try {
        await this.executeCommand(hookCmd, context)
      } catch (error) {
        log.error(`Hook command failed`, {
          hook: hook.name,
          command: hookCmd.command.join(" "),
          error: String(error),
        })
        throw error
      }
    }
  }

  private async executeCommand(hookCmd: HookCommand, context: HookContext): Promise<void> {
    const { command, environment, workingDir, timeout } = hookCmd

    const resolvedCommand = command.map(arg => this.substituteVariables(arg, context))

    const spawn = Bun.spawn({
      cmd: resolvedCommand,
      cwd: workingDir || context.directory,
      env: { ...process.env, ...environment },
      stdout: "pipe",
      stderr: "pipe",
    })

    if (timeout) {
      setTimeout(() => {
        spawn.kill()
      }, timeout)
    }

    await spawn.exited
    log.debug(`Hook command completed`, {
      command: resolvedCommand.join(" "),
      exitCode: spawn.exitCode,
    })
  }

  private substituteVariables(input: string, context: HookContext): string {
    const variables: Record<string, string> = {
      "{session_id}": context.sessionId || "",
      "{user_id}": context.userId || "",
      "{directory}": context.directory || "",
      "{timestamp}": context.timestamp.toISOString(),
      "{timestamp_unix}": String(Math.floor(context.timestamp.getTime() / 1000)),
      "{event}": context.event || "",
      "{tool}": context.tool || "",
    }

    let result = input
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value)
    }

    return result
  }

  public async triggerHook(eventType: string, context: HookContext): Promise<void> {
    await this.executeHooks(eventType, context)
  }

  public getHooks(eventType: string): HookDefinition[] {
    return this.hooks.get(eventType) || []
  }
}

let hookManager: HookManager | null = null

export function getHookManager(): HookManager {
  if (!hookManager) {
    hookManager = new HookManager()
  }
  return hookManager
}

export function initializeHooks(): void {
  getHookManager()
  log.info("Hook system initialized")
}
