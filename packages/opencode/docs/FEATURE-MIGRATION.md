# claude-enhanced vs OpenCode: Features Worth Migrating

## Complete Feature Comparison

| Feature | claude-enhanced | OpenCode | Migration Value |
|---------|-------------------|------------|-----------------|
| **Knowledge Graph Logging** | ✅ Neo4j | ✅ Just added | ✅ DONE |
| **PAL Server (MCP)** | ✅ Custom MCP server | ✅ MCP support | ⭐ HIGH |
| **Kafka Event Streaming** | ✅ Producer | ❌ No | ⭐ MEDIUM |
| **LangGraph Workflows** | ✅ Graph orchestration | ❌ No | ⭐ HIGH |
| **Plugin System** | ✅ Hooks + plugins | ⚠️ Plugin system | ⭐ MEDIUM |
| **Hook System** | ✅ Pre/post/error hooks | ⚠️ Experimental hooks | ⭐ MEDIUM |
| **Multi-Provider LLM** | ✅ 5+ providers | ✅ All major providers | ✅ DONE |
| **Settings Management** | ✅ JSON + env vars | ✅ JSONC + env vars | ✅ DONE |
| **Mode System** | ✅ YOLO/SAFE | ✅ Build/Plan agents | ✅ DONE |
| **File Tracking** | ✅ Plugin-based | ✅ Implicit through tools | ⭐ LOW |
| **Project Detection** | ✅ Auto-detect | ✅ Auto-detect | ✅ DONE |
| **Session Logging** | ✅ Complete | ✅ Complete | ✅ DONE |

---

## Top Features Worth Migrating

### 1. PAL (Personal Assistant Layer) MCP Server ⭐⭐⭐ HIGH VALUE

**What it is:**
A custom MCP server with specialized tools optimized for different AI models.

**Key Features:**
- **25+ specialized tools** organized by priority:
  - **Core**: chat, listmodels, version
  - **Collaboration**: planner, codereview, debug, thinkdeep
  - **Workflow**: precommit, testgen, consensus, apilookup
  - **Advanced**: refactor, secaudit, docgen, analyze, tracer
  - **Utility**: explain, optimize, migrate, dependency, commitmsg, prdesc

- **Multi-model optimization**: Different tools use different models
  - Qwen 235B: Complex reasoning (planner, thinkdeep, consensus)
  - Qwen 32B: Small coding tasks (debug, refactor, explain)
  - Gemini 2.5 Pro: Code review & security
  - Gemini 2.5 Flash: General chat
  - Ollama: Local, free tools (precommit, commitmsg, prdesc)

- **5 AI Providers**: Qwen, Gemini, OpenAI, X.AI, OpenRouter, SAIA
- **Transport modes**: stdio and Unix socket
- **Tool disabling**: Configurable via `DISABLED_TOOLS` env var

**Why migrate to OpenCode:**
1. ✅ OpenCode **already has MCP support** - seamless integration
2. ⭐ Specialized tools add value beyond basic coding
3. ⭐ Multi-model optimization improves quality/efficiency
4. ⭐ Security audit and code review tools are unique
5. ⭐ Workflow automation (precommit, testgen) saves time

**Migration complexity:**
- **LOW** - OpenCode has MCP infrastructure
- PAL server is standalone and can be run alongside
- Just need to integrate PAL client in OpenCode tools

**Integration approach:**
```typescript
// OpenCode can connect to PAL MCP server
// Add to .opencode/config.json:
{
  "mcp": {
    "pal": {
      "type": "local",
      "command": ["claude-enhanced", "--mcp-mode=stdio"],
      "enabled": true
    }
  }
}
```

---

### 2. Kafka Event Streaming ⭐⭐ MEDIUM VALUE

**What it is:**
Real-time event streaming to Apache Kafka for monitoring and analytics.

**Key Features:**
- **4 Kafka topics**:
  - `api-usage-events`: API call tracking
  - `tool-execution-events`: Tool usage tracking
  - `session-events`: Session lifecycle tracking
  - `error-events`: Error aggregation
- **Batch publishing**: Configurable flush intervals
- **Environment configuration**: Brokers, topics, timeouts via env vars
- **Graceful shutdown**: Automatic connection cleanup

**Why migrate to OpenCode:**
1. ⭐ Enterprise monitoring at scale
2. ⭐ Real-time analytics dashboards
3. ⭐ Alert on errors/failures
4. ⭐ Multi-instance coordination
5. ⭐ Audit trail with search

**Use cases:**
- Real-time usage dashboards (Grafana, Kibana)
- Cost tracking per API provider
- Error rate monitoring and alerting
- Session replay/debugging
- Capacity planning

**Migration complexity:**
- **MEDIUM** - Need Kafka client library
- Event model needs to match OpenCode's event system

**Integration approach:**
```typescript
// src/kafka/index.ts
import { Kafka } from 'kafkajs'

export async function publishEvent(type: string, data: any) {
  if (!isEnabled()) return
  await producer.send({
    topic: getTopic(type),
    messages: [{ value: JSON.stringify(data) }]
  })
}

// Integrate into session events
session.on('tool.use', (tool) => {
  publishEvent('tool-execution', {
    tool: tool.name,
    args: tool.args,
    duration: tool.duration
  })
})
```

---

### 3. LangGraph Workflow Orchestration ⭐⭐⭐ HIGH VALUE

**What it is:**
Graph-based workflow orchestration using LangGraph for complex multi-step tasks.

**Key Features:**
- **Predefined workflows**:
  - Planning: `kg_lookup → planner → synthesizer`
  - Analysis: `analyze → enrich → synthesize`
  - Code Review: `review → prioritize → report`
- **Graph builder API**:
  - Add tool/LLM nodes
  - Connect nodes with edges
  - Set entry points
  - Visualize workflow graphs
- **State management**: Automatic state passing between nodes
- **Composable workflows**: Reuse nodes across workflows
- **Integration with knowledge graph**: KG context lookup

**Why migrate to OpenCode:**
1. ⭐⭐⭐ Enables complex, multi-agent workflows
2. ⭐⭐ Better than simple tool calls for complex tasks
3. ⭐ Visual debugging of workflows
4. ⭐ Composable and reusable
5. ⭐ Could enable "AI workflows" as a feature

**Use cases:**
1. **Planning workflow**:
   - Look up related code from KG
   - Break down task into steps
   - Prioritize and estimate effort
   - Generate implementation plan

2. **Code review workflow**:
   - Review code with multiple agents
   - Check security vulnerabilities
   - Categorize by severity
   - Generate remediation report

3. **Test generation workflow**:
   - Analyze code structure
   - Generate unit tests
   - Generate integration tests
   - Generate E2E tests
   - Combine into test suite

4. **Migration workflow**:
   - Analyze old framework code
   - Find equivalents in new framework
   - Generate migrated code
   - Generate migration guide

**Migration complexity:**
- **HIGH** - Need LangGraph or equivalent
- Significant architecture change
- Requires workflow definition language

**Integration approach:**
```typescript
// src/workflow/graph.ts
import { Graph, StateGraph } from '@langchain/langgraph'

export class WorkflowGraph {
  graph: StateGraph

  constructor() {
    this.graph = new StateGraph({
      nodes: {
        kg_lookup: this.kgLookup.bind(this),
        planner: this.planner.bind(this),
        synthesizer: this.synthesizer.bind(this)
      },
      edges: [
        ['kg_lookup', 'planner'],
        ['planner', 'synthesizer'],
        ['synthesizer', END]
      ]
    })
  }

  async run(task: string) {
    return await this.graph.invoke({
      task,
      context: {}
    })
  }
}

// OpenCode command
opencode workflow plan "add user authentication"
```

---

### 4. Enhanced Hook System ⭐ MEDIUM VALUE

**What it is:**
Pre-run, post-run, and on-error hooks for custom automation.

**Key Features:**
- **3 hook types**:
  - `pre-run`: Before Claude executes
  - `post-run`: After successful completion
  - `on-error`: When Claude fails
- **Command execution**: Hooks run shell commands
- **Async execution**: Hooks run concurrently with Claude
- **Error handling**: Hook failures don't stop Claude

**Why migrate to OpenCode:**
1. OpenCode has experimental hooks but limited
2. ⭐ Pre-run hooks for environment setup
3. ⭐ Post-run hooks for cleanup/notifications
4. ⭐ On-error hooks for alerting/logging
5. ⭐ Enables custom workflows

**Use cases:**
```json
{
  "hooks": {
    "pre-run": {
      "session_started": ["git status", "git fetch"]
    },
    "post-run": {
      "session_completed": [
        "git add .",
        "git commit -m 'AI session completed'"
      ]
    },
    "on-error": {
      "session_failed": [
        "notify-send 'OpenCode failed'",
        "curl -X POST $WEBHOOK_URL -d 'Session failed'"
      ]
    }
  }
}
```

**Migration complexity:**
- **LOW** - OpenCode already has experimental.hooks
- Just extend the system to support more events

**Integration approach:**
```typescript
// src/hooks/index.ts
export class HookManager {
  async executeHook(type: string, data: any) {
    const hooks = Config.get(`hooks.${type}`, [])
    for (const hook of hooks) {
      await this.runCommand(hook, data)
    }
  }

  private async runCommand(hook: string[], data: any) {
    // Replace placeholders
    const command = hook.map(arg =>
      arg.replace('{session_id}', data.sessionId)
    )

    await Bun.spawn({
      cmd: command,
      env: process.env
    })
  }
}
```

---

### 5. Advanced Skills/Tools ⭐⭐ HIGH VALUE

**What it is:**
Specialized tools beyond basic coding capabilities.

**Key Tools:**

#### Security Audit Tool
- OWASP Top 10 vulnerability scanning
- Common security patterns detection
- SQL injection, XSS, CSRF checks
- Severity classification

#### Test Generation Tool
- Generate unit tests from code
- Generate integration tests
- Generate E2E tests
- Test coverage analysis

#### Documentation Generation
- Generate JSDoc/TSDoc
- Generate API documentation
- Generate README files
- Generate code examples

#### Refactoring Tool
- Code smell detection
- Suggest refactoring patterns
- Performance optimizations
- Dead code elimination

#### Pre-commit Validation
- Check code quality
- Run linters/formatters
- Validate tests pass
- Check for TODO comments

**Why migrate to OpenCode:**
1. ⭐⭐ Security auditing fills a gap
2. ⭐⭐ Test generation is in high demand
3. ⭐ Documentation generation saves time
4. ⭐ Refactoring suggestions improve code quality
5. ⭐ All can be integrated as tools

**Migration complexity:**
- **MEDIUM** - Tools need to be ported
- Each tool needs LLM integration
- Can be added incrementally

---

## Recommended Migration Priority

### Phase 1: Quick Wins (1-2 weeks)
1. ✅ **Knowledge Graph** - DONE
2. **PAL Server Integration** - Just connect to existing MCP
3. **Enhanced Hooks** - Extend existing system

### Phase 2: Medium Effort (1-2 months)
4. **Advanced Tools** - Port tools one by one
5. **Kafka Integration** - Add event streaming

### Phase 3: Major Features (3-6 months)
6. **LangGraph Workflows** - New architecture
7. **Enhanced Plugin System** - More extensible than OpenCode's

---

## PAL Server Quick Start Guide

### Option 1: Run PAL Server as Background Service

```bash
# Start PAL server in background
claude-enhanced --mcp-mode=socket --daemon &

# Configure OpenCode to use PAL
cat > ~/.opencode/config.json << 'EOF'
{
  "mcp": {
    "pal": {
      "type": "local",
      "command": ["claude-enhanced", "--mcp-mode=stdio"],
      "enabled": true
    }
  }
}
EOF

# Use PAL tools in OpenCode
opencode run "Use codereview tool to review this file"
```

### Option 2: Integrate PAL Tools Directly

Create custom tools in OpenCode that delegate to PAL:

```typescript
// src/tools/pal.ts
export class PALTool {
  async callTool(name: string, args: any) {
    const client = new PALClient()
    return await client.callTool(name, args)
  }
}
```

---

## Kafka Quick Start Guide

### Option 1: Run Kafka Locally

```bash
docker-compose up -d kafka

# Configure environment variables
export KAFKA_BROKERS=localhost:9092
export KAFKA_ENABLED=true

# Run OpenCode
opencode run "task" --kafka
```

### Option 2: Use Managed Kafka

```bash
# Add to config
{
  "experimental": {
    "kafka": {
      "enabled": true,
      "brokers": ["pkc-xxx.us-east-1.aws.confluent.cloud:9092"],
      "topics": {
        "api": "opencode-api-events",
        "tool": "opencode-tool-events",
        "session": "opencode-session-events",
        "error": "opencode-error-events"
      }
    }
  }
}
```

---

## LangGraph Quick Start Guide

### Option 1: Add Workflow Commands

```bash
# Add workflow commands to OpenCode
opencode workflow plan "Add user authentication"
opencode workflow analyze "Review this code"
opencode workflow review "Check security of auth module"
```

### Option 2: Define Custom Workflows

```typescript
// src/workflows/my-workflow.ts
export const myWorkflow = new GraphBuilder()
  .addNode('analyze', analyzeCode)
  .addNode('generate', generateTests)
  .addNode('run', runTests)
  .addEdge('analyze', 'generate')
  .addEdge('generate', 'run')
  .build()
```

---

## Conclusion

### Highest Impact Features:
1. ⭐⭐⭐ **PAL Server** - Most value, easiest to integrate
2. ⭐⭐⭐ **LangGraph Workflows** - Enables complex multi-agent tasks
3. ⭐⭐ **Advanced Tools** - Security, testing, documentation

### Recommended Path:
1. **Start with PAL** - Run alongside OpenCode, integrate via MCP
2. **Add Kafka** - For enterprise monitoring needs
3. **Port tools** - Add specialized tools one by one
4. **Build LangGraph** - For workflow orchestration

The PAL Server is the best starting point because:
- ✅ OpenCode already supports MCP
- ✅ PAL has 25+ production-ready tools
- ✅ Multi-model optimization is unique
- ✅ Can be used immediately without code changes
- ✅ Security audit and code review are highly valuable
