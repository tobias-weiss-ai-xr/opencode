# PAL Server Integration Guide for OpenCode

## Overview

PAL (Personal Assistant Layer) is a custom MCP server with 25+ specialized AI tools, each optimized for different models. Since OpenCode already has full MCP support, integrating PAL is straightforward.

## Quick Start

### Option 1: Run PAL Server as Background Service

```bash
# Step 1: Start PAL server in background
claude-enhanced --mcp-mode=socket --daemon &

# Step 2: Get socket path
# Default: /tmp/pal.sock (Linux/Mac) or \\\\.\\pipe\\pal (Windows)

# Step 3: Configure OpenCode
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

# Step 4: Use PAL tools
opencode run "Use the codereview tool to review this file"
opencode run "Use debug tool to analyze this error"
opencode run "Use precommit to validate my changes"
```

### Option 2: Use PAL via Socket Connection

```json
// ~/.opencode/config.json
{
  "mcp": {
    "pal": {
      "type": "local",
      "command": [],
      "environment": {
        "PAL_SOCKET_PATH": "/tmp/pal.sock"
      },
      "enabled": true
    }
  }
}
```

## Available PAL Tools

### Core Tools (Always Enabled)
- `chat` - General conversation with any model
- `listmodels` - List all available models
- `version` - Display server version

### Collaboration & Planning (Priority 1)
- `planner` - Break down complex tasks into actionable steps
  - **Model**: Qwen 235B (complex reasoning)
  - **Parameters**: task (string)
  - **Output**: Structured plan with steps

- `codereview` - Professional code review with severity-tiered feedback
  - **Model**: Gemini 2.5 Pro (strong analysis)
  - **Parameters**: code (string), language (string), context (string)
  - **Output**: Code review with security, bugs, performance, maintainability

- `debug` - Systematic debugging with root cause analysis
  - **Model**: Qwen 32B (fast reasoning)
  - **Parameters**: error (string), code (string), context (string)
  - **Output**: Root cause, fix suggestions, prevention strategies

- `thinkdeep` - Extended reasoning with deep analysis
  - **Model**: Qwen 235B (deep reasoning)
  - **Parameters**: topic (string), depth (number, default 3)
  - **Output**: Multi-perspective analysis

### Workflow Tools (Priority 2)
- `precommit` - Pre-commit validation
  - **Model**: Ollama (local, fast)
  - **Parameters**: diff (string)
  - **Output**: Validation results (lint, format, tests)

- `testgen` - Generate comprehensive tests
  - **Model**: Gemini 2.5 Pro
  - **Parameters**: code_description (string), framework (string)
  - **Output**: Unit, integration, E2E tests

- `consensus` - Multi-model expert opinions
  - **Model**: Qwen 235B + Gemini 2.5 Pro
  - **Parameters**: topic (string), perspectives (number, default 3)
  - **Output**: Consensus view with disagreements noted

- `apilookup` - Current API documentation
  - **Model**: Ollama (local)
  - **Parameters**: query (string)
  - **Output**: Relevant API documentation

### Advanced Tools (Priority 3)
- `refactor` - Code refactoring suggestions
  - **Model**: Qwen 32B
  - **Parameters**: code (string), language (string)
  - **Output**: Refactored code with explanations

- `secaudit` - Security audits (OWASP Top 10)
  - **Model**: Gemini 2.5 Pro (security expertise)
  - **Parameters**: code (string), language (string)
  - **Output**: Security findings with severity

- `docgen` - Documentation generation
  - **Model**: Qwen 32B
  - **Parameters**: code (string), type (string: "jsdoc", "api", "readme")
  - **Output**: Generated documentation

- `analyze` - Architecture analysis
  - **Model**: Qwen 235B
  - **Parameters**: code_description (string)
  - **Output**: Architecture analysis with patterns

- `tracer` - Call-flow tracing
  - **Model**: Qwen 235B
  - **Parameters**: entry_point (string), depth (number)
  - **Output**: Call graph with analysis

## PAL Model Configuration

PAL automatically selects the best model for each tool:

| Task Type | Model | Reason |
|-----------|-------|---------|
| Complex Reasoning | Qwen 235B | Largest context, best reasoning |
| Small Coding | Qwen 32B | Fast, cost-effective |
| Code Review | Gemini 2.5 Pro | Strong security analysis |
| General Chat | Gemini 2.5 Flash | Fast, responsive |
| Local Tasks | Ollama | Private, no latency |

## Environment Variables

Configure PAL server:

```bash
# Required for cloud providers
export GEMINI_API_KEY=your-key
export QWEN_API_KEYS=key1,key2,key3  # Key rotation support
export OPENAI_API_KEY=your-key
export XAI_API_KEY=your-key
export OPENROUTER_API_KEY=your-key

# PAL Server Configuration
export PAL_SOCKET_PATH=/tmp/pal.sock  # Default
export PAL_DEFAULT_MODEL=qwen/qwen-2.5-coder-32b  # Override default

# Disable specific tools
export DISABLED_TOOLS=explain,optimize,migrate,dependency
```

## Usage Examples

### Code Review with PAL

```bash
opencode run << 'EOF'
Review this authentication code using the codereview tool:

\`\`\`typescript
export function authenticate(username: string, password: string) {
  if (username === 'admin' && password === 'password') {
    return { success: true, token: 'abc123' }
  }
  return { success: false }
}
\`\`\`

Use the codereview tool with language="typescript"
EOF
```

### Debugging with PAL

```bash
opencode run << 'EOF'
I'm getting an error: "Cannot read property 'token' of undefined"

Use the debug tool to analyze this error and find the root cause.
EOF
```

### Planning with PAL

```bash
opencode run << 'EOF'
Use the planner tool to break down this task:

"Implement a REST API for user management with CRUD operations"

Use the planner tool to create a detailed implementation plan.
EOF
```

### Security Audit with PAL

```bash
opencode run << 'EOF'
Perform a security audit on this code using the secaudit tool:

\`\`\`python
@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    user = User.query.filter_by(username=username).first()
    if user and check_password(user.password, password):
        session['user_id'] = user.id
        return redirect('/dashboard')
    return 'Invalid credentials'
\`\`\`

Use the secaudit tool with language="python" to check for OWASP Top 10 vulnerabilities.
EOF
```

### Test Generation with PAL

```bash
opencode run << 'EOF'
Generate comprehensive tests using the testgen tool:

\`\`\`typescript
export function calculateTax(price: number, rate: number): number {
  return price * rate;
}
\`\`\`

Use the testgen tool with framework="jest" to generate unit, integration, and E2E tests.
EOF
```

## Troubleshooting

### PAL Server Not Found

```
Error: Failed to connect to PAL server
```

**Solution:**
```bash
# Check if PAL server is running
ps aux | grep claude-enhanced

# Check socket exists
ls -la /tmp/pal.sock

# Start PAL server
claude-enhanced --mcp-mode=socket --daemon
```

### PAL Tools Not Visible

```
Available tools don't include PAL tools
```

**Solution:**
```bash
# Verify MCP configuration
cat ~/.opencode/config.json

# Restart OpenCode to reload config
opencode --help

# List MCP tools
opencode mcp list
```

### Provider Authentication Failed

```
PAL tool failed: authentication required
```

**Solution:**
```bash
# Set API keys
export GEMINI_API_KEY=your-key
export QWEN_API_KEYS=your-keys

# Restart PAL server
pkill -f "claude-enhanced.*--mcp-mode"
claude-enhanced --mcp-mode=socket --daemon &
```

## Advanced Configuration

### Custom PAL Socket Path

```json
{
  "mcp": {
    "pal": {
      "type": "local",
      "command": [],
      "environment": {
        "PAL_SOCKET_PATH": "/custom/path/pal.sock"
      },
      "enabled": true
    }
  }
}
```

### Disabled PAL Tools

```bash
export DISABLED_TOOLS=refactor,docgen,analyze
```

### PAL Tool Model Override

You can override the model for any tool:

```bash
opencode run << 'EOF'
Use the codereview tool with model="anthropic/claude-sonnet-4-20250514"

Review this code:
\`\`\`javascript
function processData(data) {
  return data.map(x => x * 2)
}
\`\`\`
EOF
```

## Best Practices

1. **Use PAL for specialized tasks** - PAL tools are optimized for specific use cases
2. **Leverage multi-model optimization** - Let PAL choose the best model for each tool
3. **Use debug for errors first** - Debug tool provides systematic analysis
4. **Use planner for complex tasks** - Planner breaks down tasks into actionable steps
5. **Use codereview before committing** - Catch issues early
6. **Use secaudit for security-sensitive code** - OWASP Top 10 coverage

## Next Steps

1. ✅ Install claude-enhanced (if not already installed)
2. ✅ Start PAL server in background
3. ✅ Configure OpenCode to use PAL MCP
4. ✅ Try using PAL tools
5. ✅ Customize based on your needs

## References

- [PAL Server Documentation](../claude-enhanced/pkg/palserver/README.md)
- [OpenCode MCP Documentation](https://opencode.ai/docs/mcp)
- [OpenCode Configuration](https://opencode.ai/docs/config)
