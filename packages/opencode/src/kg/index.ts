import { Log } from "../util/log"
import { Config } from "../config/config"
import { File } from "../file"
import { Instance } from "../project/instance"
import { Project } from "../project/project"
import type { Driver, Session as NeoSession } from "neo4j-driver"

const log = Log.create({ service: "kg" })

let driver: Driver | undefined
let enabled = false

export interface KGConfig {
  uri: string
  username: string
  password: string
  database: string
}

export interface SessionInfo {
  sessionID: string
  startTime: Date
  endTime?: Date
  hostName: string
  userName: string
  mode: string
  cwd: string
  command: string
  args: string[]
  exitCode?: number
  error?: string
  requestCount: number
  tokenCount: number
}

export interface OperationInfo {
  operationID: string
  sessionID: string
  timestamp: Date
  toolName: string
  toolArgs: string
  result: string
  error?: string
  duration: number
}

async function getDriver(): Promise<Driver> {
  if (!driver) {
    const neo4j = await import("neo4j-driver")
    driver = neo4j.default.driver(
      Config.get("kg.uri", "bolt://localhost:7687"),
      neo4j.default.auth.basic(
        Config.get("kg.username", "neo4j"),
        Config.get("kg.password", ""),
      ),
    )
  }
  return driver!
}

export async function initialize(cfg?: Partial<KGConfig>): Promise<void> {
  if (cfg) {
    if (cfg.uri) Config.set("kg.uri", cfg.uri)
    if (cfg.username) Config.set("kg.username", cfg.username)
    if (cfg.password) Config.set("kg.password", cfg.password)
    if (cfg.database) Config.set("kg.database", cfg.database)
  }

  enabled = Config.get("kg.enabled", false)

  if (!enabled) {
    log.info("knowledge graph disabled")
    return
  }

  try {
    const d = await getDriver()
    const serverInfo = await d.getServerInfo()
    log.info("knowledge graph connected", { serverInfo })
  } catch (error) {
    log.error("failed to connect to knowledge graph", { error })
    enabled = false
  }
}

export function isEnabled(): boolean {
  return enabled
}

export function disable(): void {
  enabled = false
}

export async function close(): Promise<void> {
  if (driver) {
    await driver.close()
    driver = undefined
  }
}

async function getSession(): Promise<NeoSession> {
  const d = await getDriver()
  return d.session({
    database: Config.get("kg.database", "neo4j"),
  })
}

export async function runQuery(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  if (!enabled) return []

  const session = await getSession()
  try {
    const result = await session.run(cypher, params)
    const records: Record<string, unknown>[] = []
    for (const record of result.records) {
      const recordMap: Record<string, unknown> = {}
      for (const key of record.keys) {
        recordMap[key] = record.get(key)
      }
      records.push(recordMap)
    }
    return records
  } finally {
    await session.close()
  }
}

export async function startSession(info: SessionInfo): Promise<void> {
  if (!enabled) return

  const session = await getSession()
  try {
    await session.run(
      `
      CREATE CONSTRAINT session_id_unique IF NOT EXISTS
      FOR (s:Session) REQUIRE s.session_id IS UNIQUE
    `,
    )

    await session.run(
      `
      CREATE (s:Session {
        session_id: $session_id,
        start_time: datetime($start_time),
        host_name: $host_name,
        user_name: $user_name,
        mode: $mode,
        cwd: $cwd,
        command: $command,
        args: $args,
        request_count: 0,
        token_count: 0
      })
    `,
      {
        session_id: info.sessionID,
        start_time: info.startTime.toISOString(),
        host_name: info.hostName,
        user_name: info.userName,
        mode: info.mode,
        cwd: info.cwd,
        command: info.command,
        args: info.args,
      },
    )

    log.info("session started", { sessionID: info.sessionID })
  } catch (error) {
    log.error("failed to start session", { error, sessionID: info.sessionID })
  } finally {
    await session.close()
  }
}

export async function endSession(info: SessionInfo): Promise<void> {
  if (!enabled) return

  const session = await getSession()
  try {
    await session.run(
      `
      MATCH (s:Session {session_id: $session_id})
      SET s.end_time = datetime($end_time),
          s.exit_code = $exit_code,
          s.error = $error,
          s.request_count = $request_count,
          s.token_count = $token_count
    `,
      {
        session_id: info.sessionID,
        end_time: info.endTime ? info.endTime.toISOString() : new Date().toISOString(),
        exit_code: info.exitCode,
        error: info.error,
        request_count: info.requestCount,
        token_count: info.tokenCount,
      },
    )

    log.info("session ended", { sessionID: info.sessionID })
  } catch (error) {
    log.error("failed to end session", { error, sessionID: info.sessionID })
  } finally {
    await session.close()
  }
}

export async function logOperation(op: OperationInfo): Promise<void> {
  if (!enabled) return

  const session = await getSession()
  try {
    await session.run(
      `
      MATCH (s:Session {session_id: $session_id})
      CREATE (o:Operation {
        operation_id: $operation_id,
        timestamp: datetime($timestamp),
        tool_name: $tool_name,
        tool_args: $tool_args,
        result: $result,
        error: $error,
        duration_ms: $duration
      })
      CREATE (s)-[:HAS_OPERATION]->(o)
    `,
      {
        session_id: op.sessionID,
        operation_id: op.operationID,
        timestamp: op.timestamp.toISOString(),
        tool_name: op.toolName,
        tool_args: op.toolArgs,
        result: op.result,
        error: op.error,
        duration: op.duration,
      },
    )
  } catch (error) {
    log.error("failed to log operation", { error, operationID: op.operationID })
  } finally {
    await session.close()
  }
}

export async function logFileAccess(
  sessionID: string,
  action: string,
  filePath: string,
): Promise<void> {
  if (!enabled) return

  const session = await getSession()
  try {
    await session.run(
      `
      MATCH (s:Session {session_id: $session_id})
      MERGE (f:File {path: $path})
      ON CREATE SET f.first_accessed = datetime()
      SET f.last_accessed = datetime(), f.access_count = coalesce(f.access_count, 0) + 1
      CREATE (s)-[:ACCESSED {action: $action, timestamp: datetime()}]->(f)
    `,
      {
        session_id: sessionID,
        path: filePath,
        action,
      },
    )
  } catch (error) {
    log.error("failed to log file access", { error, path: filePath })
  } finally {
    await session.close()
  }
}

export async function logProject(sessionID: string, projectPath: string): Promise<void> {
  if (!enabled) return

  const session = await getSession()
  try {
    await session.run(
      `
      MATCH (s:Session {session_id: $session_id})
      MERGE (p:Project {path: $path})
      CREATE (s)-[:WORKED_ON]->(p)
    `,
      {
        session_id: sessionID,
        path: projectPath,
      },
    )

    log.info("project logged", { sessionID, projectPath })
  } catch (error) {
    log.error("failed to log project", { error, projectPath })
  } finally {
    await session.close()
  }
}

export async function getSessionStats(
  sessionID: string,
): Promise<Record<string, unknown> | null> {
  if (!enabled) return null

  const session = await getSession()
  try {
    const result = await session.run(
      `
      MATCH (s:Session {session_id: $session_id})
      OPTIONAL MATCH (s)-[:HAS_OPERATION]->(o)
      RETURN s,
             count(o) as operation_count,
             sum(o.duration_ms) as total_duration_ms
    `,
      { session_id: sessionID },
    )

    if (result.records.length === 0) return null

    const record = result.records[0]
    return {
      operation_count: record.get("operation_count"),
      total_duration_ms: record.get("total_duration_ms"),
    }
  } catch (error) {
    log.error("failed to get session stats", { error, sessionID })
    return null
  } finally {
    await session.close()
  }
}

export async function detectProjectPath(cwd: string): Promise<string> {
  const markers = [".git", "go.mod", "package.json", "Cargo.toml", "pyproject.toml", "composer.json"]

  let dir = cwd
  while (true) {
    for (const marker of markers) {
      const markerPath = `${dir}/${marker}`
      try {
        await File.access(markerPath)
        return dir
      } catch {
        continue
      }
    }

    const parent = File.dirname(dir)
    if (parent === dir) {
      return cwd
    }
    dir = parent
  }
}

export function generateSessionID(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `opencode-${timestamp}-${random}`
}

export function generateOperationID(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `op-${timestamp}-${random}`
}
