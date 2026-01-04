# Knowledge Graph Feature

OpenCode now supports Neo4j knowledge graph logging for tracking all AI coding sessions, operations, and file access patterns.

## Installation

First, ensure you have Neo4j installed and running:

```bash
# Using Docker
docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest

# Using Neo4j Desktop
# Download from https://neo4j.com/download/
```

## Configuration

Enable knowledge graph logging in one of three ways:

### 1. CLI Flags

```bash
opencode run "fix the bug" \
  --kg \
  --kg-uri bolt://localhost:7687 \
  --kg-user neo4j \
  --kg-pass password \
  --kg-database neo4j
```

### 2. Environment Variables

```bash
export OPENCODE_KG_ENABLED=true
export OPENCODE_KG_URI=bolt://localhost:7687
export OPENCODE_KG_USERNAME=neo4j
export OPENCODE_KG_PASSWORD=password

opencode run "add feature"
```

### 3. Configuration File

Add to `~/.opencode/config.json` or `opencode.json` in your project:

```json
{
  "experimental": {
    "kg": {
      "enabled": true,
      "uri": "bolt://localhost:7687",
      "username": "neo4j",
      "password": "password",
      "database": "neo4j"
    }
  }
}
```

## What Gets Logged

### Sessions
- Session ID and timestamps
- Hostname and username
- Working directory and command line
- Exit code and errors
- Request and token counts

### Operations
- Tool usage (bash, read, write, edit, etc.)
- Tool arguments and results
- Execution duration
- Errors and failures

### Files
- File access patterns
- Access actions (read, write, edit)
- Access timestamps
- File access counts

### Projects
- Project root detection
- Git repository tracking
- Language/framework markers

## Querying the Knowledge Graph

Once you have data in Neo4j, you can query it using Cypher:

### Find all sessions
```cypher
MATCH (s:Session)
RETURN s
ORDER BY s.start_time DESC
LIMIT 10
```

### Get session statistics
```cypher
MATCH (s:Session {session_id: 'opencode-xxx-xxx'})
OPTIONAL MATCH (s)-[:HAS_OPERATION]->(o)
RETURN s, count(o) as operation_count
```

### Find accessed files
```cypher
MATCH (s:Session {session_id: 'opencode-xxx-xxx'})-[:ACCESSED]->(f:File)
RETURN f.path, f.access_count
ORDER BY f.access_count DESC
```

### Find operations by tool
```cypher
MATCH (o:Operation)
WHERE o.tool_name = 'bash'
RETURN o.timestamp, o.tool_args, o.duration_ms
ORDER BY o.timestamp DESC
LIMIT 10
```

### Get project summary
```cypher
MATCH (p:Project)<-[:WORKED_ON]-(s:Session)
RETURN p.path, count(s) as session_count
ORDER BY session_count DESC
```

### Find error patterns
```cypher
MATCH (s:Session)
WHERE s.error IS NOT NULL
RETURN s.session_id, s.error, s.end_time
ORDER BY s.end_time DESC
LIMIT 20
```

## Knowledge Graph Schema

```
(:Session {
  session_id,
  start_time,
  end_time,
  host_name,
  user_name,
  mode,
  cwd,
  command,
  args,
  exit_code,
  error,
  request_count,
  token_count
})

(:Operation {
  operation_id,
  timestamp,
  tool_name,
  tool_args,
  result,
  error,
  duration_ms
})

(:File {
  path,
  first_accessed,
  last_accessed,
  access_count
})

(:Project {
  path
})

(:Session)-[:HAS_OPERATION]->(:Operation)
(:Session)-[:ACCESSED]->(:File)
(:Session)-[:WORKED_ON]->(:Project)
```

## Use Cases

### 1. Session Audit Trail
Track all AI coding sessions for compliance and auditing:
```cypher
MATCH (s:Session)
WHERE s.user_name = $username
  AND s.start_time >= datetime($start_date)
  AND s.start_time <= datetime($end_date)
RETURN s
ORDER BY s.start_time
```

### 2. Impact Analysis
Understand which files are most frequently modified:
```cypher
MATCH (s:Session)-[a:ACCESSED]->(f:File)
WHERE a.action IN ['write', 'edit']
RETURN f.path, count(s) as modification_count
ORDER BY modification_count DESC
LIMIT 20
```

### 3. Performance Analytics
Identify slow operations:
```cypher
MATCH (o:Operation)
WHERE o.duration_ms > 5000
RETURN o.tool_name, avg(o.duration_ms) as avg_duration, count(o) as count
ORDER BY avg_duration DESC
```

### 4. Error Detection
Find common failure patterns:
```cypher
MATCH (o:Operation)
WHERE o.error IS NOT NULL
RETURN o.tool_name, o.error, count(*) as error_count
ORDER BY error_count DESC
LIMIT 10
```

### 5. Project Heatmap
Visualize active projects:
```cypher
MATCH (p:Project)<-[:WORKED_ON]-(s:Session)
WHERE s.start_time >= datetime($start_date)
RETURN p.path, count(s) as session_count,
       sum(s.token_count) as total_tokens
ORDER BY session_count DESC
```

## Neo4j Browser

View your knowledge graph visually using Neo4j Browser:

1. Open http://localhost:7474 in your browser
2. Login with your credentials
3. Enter Cypher queries in the top bar
4. Visualize nodes and relationships

## Example Queries

### Get recent activity
```cypher
MATCH (s:Session)-[r:HAS_OPERATION]->(o:Operation)
WHERE s.start_time > datetime() - duration('P7D')
RETURN s.session_id, o.tool_name, o.timestamp
ORDER BY o.timestamp DESC
LIMIT 50
```

### Find file dependencies
```cypher
MATCH path = (f1:File)<-[:ACCESSED]-(s:Session)-[:ACCESSED]->(f2:File)
WHERE f1.path <> f2.path
RETURN f1.path, f2.path, count(*) as co_access_count
ORDER BY co_access_count DESC
LIMIT 20
```

### User activity summary
```cypher
MATCH (s:Session)
RETURN s.user_name, count(*) as session_count,
       sum(s.token_count) as total_tokens,
       avg(s.request_count) as avg_requests
ORDER BY session_count DESC
```

## Performance Considerations

- **Network Latency**: Knowledge graph logging adds ~10-50ms per operation
- **Storage**: Each session uses ~1-5KB in Neo4j
- **Scalability**: Neo4j can handle millions of nodes and relationships
- **Indexing**: Session IDs are automatically indexed for fast lookups

## Troubleshooting

### Connection Failed
```
Failed to initialize neo4j: Connection refused
```
Check that Neo4j is running and accessible:
```bash
curl http://localhost:7474
```

### Authentication Failed
```
Failed to initialize neo4j: Authentication failed
```
Verify your credentials in Neo4j Browser:
```bash
export OPENCODE_KG_PASSWORD=correct-password
```

### Slow Performance
Consider:
1. Adding indexes for frequent queries
2. Using Neo4j clusters for large deployments
3. Implementing data retention policies

## Disable Knowledge Graph

To disable knowledge graph logging:

```bash
# CLI flag
opencode run "task" --kg=false

# Config file
{
  "experimental": {
    "kg": {
      "enabled": false
    }
  }
}
```
