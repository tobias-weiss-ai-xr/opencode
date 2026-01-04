# Enhanced Hook System for OpenCode

## Overview

The Enhanced Hook System extends OpenCode's experimental hooks to provide comprehensive automation for development workflows. Hooks allow you to run custom commands at specific events during OpenCode execution.

## Hook Events

### Session Lifecycle Hooks

#### `pre_run` - Before Session Starts
Executed before a new OpenCode session begins.

**Use cases:**
- Update git repository
- Run pre-flight checks
- Set up environment
- Start background services

#### `post_run` - After Session Completes
Executed when a session completes successfully.

**Use cases:**
- Git commit changes
- Send notifications
- Run post-session cleanup
- Update project status

#### `on_error` - When Session Fails
Executed when a session encounters an error.

**Use cases:**
- Send error alerts
- Log errors to monitoring system
- Run diagnostics
- Notify team members

### Tool Hooks

#### `tool_<toolname>` - When Tool Is Used
Executed when a specific tool is called (e.g., `tool_bash`, `tool_read`, `tool_write`).

**Use cases:**
- Track file access
- Monitor command usage
- Audit tool calls
- Enforce policies

### File Hooks

#### `file_edited` - When Files Are Modified
Executed when files are read, written, edited, or deleted.

**Use cases:**
- Auto-format code
- Run linters
- Update documentation
- Backup changes

## Configuration

### Basic Configuration (Legacy)

```json
{
  "experimental": {
    "hook": {
      "file_edited": {
        "**/*.ts": [
          {
            "command": ["bun", "run", "format"],
            "working_dir": "{directory}"
          }
        ]
      },
      "session_completed": [
        {
          "command": ["git", "add", "."],
          "working_dir": "{directory}"
        },
        {
          "command": ["git", "commit", "-m", "AI session: {timestamp}"],
          "working_dir": "{directory}"
        }
      ]
    }
  }
}
```

### Enhanced Configuration (New)

```json
{
  "experimental": {
    "hooks": {
      "pre_run": [
        {
          "command": ["git", "fetch"],
          "working_dir": "{directory}"
        },
        {
          "command": ["notify-send", "OpenCode", "Starting session in {directory}"]
        }
      ],
      "post_run": [
        {
          "command": ["git", "add", "."],
          "working_dir": "{directory}"
        },
        {
          "command": ["git", "commit", "-m", "AI session completed at {timestamp}"],
          "working_dir": "{directory}"
        },
        {
          "command": ["curl", "-X", "POST", "$WEBHOOK_URL", "-d", "Session {session_id} completed"]
        }
      ],
      "on_error": [
        {
          "command": ["notify-send", "OpenCode Error", "{error}"],
          "environment": {
            "DISPLAY": ":0"
          }
        },
        {
          "command": ["curl", "-X", "POST", "$ALERT_WEBHOOK", "-d", "OpenCode error in session {session_id}"]
        }
      ],
      "tool": {
        "bash": [
          {
            "command": ["echo", "Command: {command} executed in session {session_id}"],
            "environment": {
              "LOG_FILE": "/tmp/opencode-bash.log"
            }
          }
        ],
        "read": [
          {
            "command": ["bun", "run", "check-for-secrets", "--file", "{filePath}"]
          }
        ],
        "write": [
          {
            "command": ["bun", "run", "format", "--file", "{filePath}"]
          }
        ]
      }
    }
  }
}
```

## Template Variables

Hooks support template variable substitution:

| Variable | Description | Example |
|---------|-------------|---------|
| `{session_id}` | OpenCode session ID | `opencode-1704324800000-abc123` |
| `{user_id}` | Current user | `weiss` |
| `{directory}` | Current working directory | `/home/user/project` |
| `{timestamp}` | ISO 8601 timestamp | `2024-01-04T12:34:56.789Z` |
| `{timestamp_unix}` | Unix timestamp | `1704324896` |
| `{event}` | Hook event type | `session_completed` |
| `{tool}` | Tool name (for tool hooks) | `bash`, `read`, `write` |
| `{command}` | Full command executed | `git add .` |
| `{filePath}` | File path (for file/tool hooks) | `/src/index.ts` |

## Advanced Examples

### Auto-commit with AI Summaries

```json
{
  "experimental": {
    "hooks": {
      "post_run": [
        {
          "command": ["git", "diff", "--stat"],
          "environment": {
            "GIT_DIFF_OUTPUT": "/tmp/git-diff.txt"
          }
        },
        {
          "command": ["python", "-c", "import sys; print(f'AI session {timestamp}: ' + ' '.join(sys.stdin.read().split()[:5]))"],
          "environment": {
            "INPUT_FILE": "/tmp/git-diff.txt"
          }
        },
        {
          "command": ["git", "add", "."]
        },
        {
          "command": ["git", "commit", "-m", "$AUTO_COMMIT_MSG"]
        }
      ]
    }
  }
}
```

### Slack Notifications

```json
{
  "experimental": {
    "hooks": {
      "pre_run": [
        {
          "command": ["slack-notify", "#dev", "Starting OpenCode session in {directory}"],
          "environment": {
            "SLACK_WEBHOOK_URL": "$SLACK_WEBHOOK"
          }
        }
      ],
      "post_run": [
        {
          "command": ["slack-notify", "#dev", "Session {session_id} completed in {duration}ms"],
          "environment": {
            "SLACK_WEBHOOK_URL": "$SLACK_WEBHOOK"
          }
        }
      ],
      "on_error": [
        {
          "command": ["slack-notify", "#dev-alerts", "OpenCode error in session {session_id}: {error}"],
          "environment": {
            "SLACK_WEBHOOK_URL": "$SLACK_WEBHOOK"
          }
        }
      ]
    }
  }
}
```

### Security Scanning on File Edits

```json
{
  "experimental": {
    "hooks": {
      "file_edited": {
        "**/*.ts": [
          {
            "command": ["bun", "run", "security-scan", "--file", "{filePath}"],
            "timeout": 30000
          }
        ],
        "**/*.py": [
          {
            "command": ["python", "-m", "bandit", "-r", "{filePath}"],
            "environment": {
              "PYTHONUNBUFFERED": "1"
            }
          }
        ]
      }
    }
  }
}
```

### Tool Usage Tracking

```json
{
  "experimental": {
    "hooks": {
      "tool": {
        "bash": [
          {
            "command": ["echo", "Bash command: {command} at {timestamp} >> /tmp/opencode-usage.log"]
          }
        ],
        "write": [
          {
            "command": ["echo", "File written: {filePath} at {timestamp} >> /tmp/opencode-files.log"]
          }
        ],
        "edit": [
          {
            "command": ["echo", "File edited: {filePath} at {timestamp} >> /tmp/opencode-files.log"]
          }
        ]
      }
    }
  }
}
```

### Multi-stage Workflow

```json
{
  "experimental": {
    "hooks": {
      "pre_run": [
        {
          "command": ["docker", "compose", "up", "-d", "database"]
        },
        {
          "command": ["wait-for-it", "database:5432"]
        }
      ],
      "post_run": [
        {
          "command": ["bun", "test"],
          "working_dir": "{directory}"
        },
        {
          "command": ["docker", "compose", "down"]
        }
      ],
      "on_error": [
        {
          "command": ["docker", "compose", "logs"],
          "timeout": 10000
        }
      ]
    }
  }
}
```

## Error Handling

Hooks are executed asynchronously. If a hook fails:
- Error is logged to OpenCode logs
- Other hooks continue to execute
- Session continues normally (hooks are non-blocking)

To make a hook blocking (fail the session if hook fails), use exit codes:

```json
{
  "experimental": {
    "hooks": {
      "pre_run": [
        {
          "command": ["pre-check", "--strict"],
          "environment": {
            "STRICT_MODE": "true"
          }
        }
      ]
    }
  }
}
```

## Environment Variables

Hooks inherit all environment variables and can define their own:

```json
{
  "command": ["python", "script.py"],
  "environment": {
    "PYTHONPATH": "/custom/python/path",
    "CUSTOM_VAR": "value",
    "API_KEY": "$API_KEY"
  }
}
```

## Working Directory

By default, hooks execute in the current OpenCode working directory. Override with `working_dir`:

```json
{
  "command": ["git", "status"],
  "working_dir": "{directory}"
}
```

Or specify an absolute path:

```json
{
  "command": ["script.sh"],
  "working_dir": "/absolute/path"
}
```

## Timeouts

Set a timeout for hook execution (in milliseconds):

```json
{
  "command": ["long-running-task"],
  "timeout": 60000
}
```

If timeout is exceeded, the process is killed.

## Best Practices

1. **Keep hooks fast** - Hooks execute synchronously, avoid long operations
2. **Use environment variables** - Don't hardcode paths, use env vars
3. **Handle errors gracefully** - Hooks should not crash OpenCode
4. **Log extensively** - Use echo statements for debugging
5. **Test hooks locally** - Run hook commands manually first
6. **Use absolute paths** - Avoid relative path issues
7. **Set appropriate timeouts** - Prevent hanging hooks
8. **Document hooks** - Comment what each hook does

## Troubleshooting

### Hook Not Executing

```
Hook registered but not running
```

**Check:**
- Hook is enabled (`"enabled": true`)
- Event is triggered (check logs)
- Command path is correct
- Environment variables are set

### Hook Failing

```
Hook command failed with exit code 1
```

**Debug:**
- Run command manually
- Check working directory
- Verify environment variables
- Review error logs

### Hook Timing Out

```
Hook command timed out after 30000ms
```

**Solution:**
- Increase timeout
- Optimize hook command
- Run in background with nohup

## Migration from Legacy Hooks

Old format:
```json
{
  "experimental": {
    "hook": {
      "session_completed": [[...]]
    }
  }
}
```

New format:
```json
{
  "experimental": {
    "hooks": {
      "post_run": [[...]]
    }
  }
}
```

**Mapping:**
- `session_completed` → `post_run`
- `file_edited` → `file_edited` (no change, moved to `hooks` object)

## API

### Programmatic Hook Execution

```typescript
import { getHookManager } from "@/hooks"
import { HookEvent } from "@/hooks"

// Trigger a hook programmatically
await getHookManager().triggerHook("pre_run", {
  sessionId: "session-123",
  directory: "/project",
  timestamp: new Date(),
  event: "session_started",
})

// Listen to hook events
Bus.on(HookEvent.SessionStarted, (data) => {
  console.log("Session started:", data.sessionId)
})
```

## Next Steps

1. Add hooks to `~/.opencode/config.json` or project `opencode.json`
2. Test hooks manually
3. Run OpenCode and verify hooks execute
4. Check logs for hook execution details
5. Adjust configuration as needed

## References

- [Hook System Documentation](../hooks/index.ts)
- [OpenCode Configuration](https://opencode.ai/docs/config)
- [Bus Event System](../bus/bus-event.ts)
