import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import * as KG from "../src/kg"

describe("Knowledge Graph", () => {
  beforeAll(async () => {
    await KG.initialize({
      enabled: false,
    })
  })

  afterAll(async () => {
    await KG.close()
  })

  it("should generate session IDs", () => {
    const id = KG.generateSessionID()
    expect(id).toStartWith("opencode-")
    expect(id.length).toBeGreaterThan(10)
  })

  it("should generate operation IDs", () => {
    const id = KG.generateOperationID()
    expect(id).toStartWith("op-")
    expect(id.length).toBeGreaterThan(10)
  })

  it("should detect project path", async () => {
    const path = await KG.detectProjectPath(process.cwd())
    expect(path).toBeDefined()
    expect(typeof path).toBe("string")
  })

  it("should be disabled by default", () => {
    expect(KG.isEnabled()).toBe(false)
  })

  it("should handle session info", () => {
    const sessionInfo: KG.SessionInfo = {
      sessionID: "test-123",
      startTime: new Date(),
      hostName: "localhost",
      userName: "testuser",
      mode: "test",
      cwd: "/tmp",
      command: "test",
      args: [],
      requestCount: 0,
      tokenCount: 0,
    }

    expect(sessionInfo.sessionID).toBe("test-123")
    expect(sessionInfo.hostName).toBe("localhost")
  })

  it("should handle operation info", () => {
    const opInfo: KG.OperationInfo = {
      operationID: "op-123",
      sessionID: "test-123",
      timestamp: new Date(),
      toolName: "test-tool",
      toolArgs: "{}",
      result: "success",
      duration: 100,
    }

    expect(opInfo.operationID).toBe("op-123")
    expect(opInfo.toolName).toBe("test-tool")
    expect(opInfo.duration).toBe(100)
  })
})
