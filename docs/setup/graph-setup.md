[Home](../../README.md) > [Quick Start](../quickstart.md) > Graph Setup

🇷🇺 [Русская версия](graph-setup.ru.md)

# Graph Infrastructure Setup

Neo4j + Excalidraw Docker stack for graph-based skills. Required for all `graph_*` skills.

## What You Get

| Service | Purpose | Default Port |
|---------|---------|-------------|
| Neo4j | Knowledge graph database | 3574 (HTTP), 3587 (Bolt) |
| Excalidraw | Visual whiteboard for diagrams | 3580 |
| Excalidraw Room | Real-time collaboration | 3581 |

## Step 1: Start Docker Stack

```bash
cd ~/NaCl
cp graph-infra/.env.example graph-infra/.env    # edit passwords if needed
docker compose -f graph-infra/docker-compose.yml up -d
```

Verify containers are running:

```bash
docker compose -f graph-infra/docker-compose.yml ps
```

You should see 3 containers: neo4j, excalidraw, excalidraw-room.

## Step 2: Load Schema

Wait ~30 seconds for Neo4j to start, then:

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep neo4j | head -1)
NEO4J_PASS=$(grep NEO4J_PASSWORD graph-infra/.env | cut -d= -f2)

for f in graph-infra/schema/ba-schema.cypher graph-infra/schema/sa-schema.cypher graph-infra/schema/tl-schema.cypher; do
  docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASS" < "$f"
done
```

Verify:

```bash
docker exec "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASS" "SHOW CONSTRAINTS" | head -5
```

## Step 3: Install Neo4j MCP Server

The Neo4j MCP server lets Claude Code communicate with your graph database.

```bash
npm install -g @anthropic/neo4j-mcp
```

## Step 4: Configure Claude Code MCP

Add to your target project's `.mcp.json` (or `~/.claude.json` for global config):

```json
{
  "mcpServers": {
    "neo4j": {
      "type": "stdio",
      "command": "neo4j-mcp",
      "env": {
        "NEO4J_URI": "bolt://localhost:3587",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "neo4j_graph_dev",
        "NEO4J_DATABASE": "neo4j"
      }
    }
  }
}
```

Restart Claude Code to connect.

## Step 5: Smoke Test

In Claude Code:

```
/graph_ba_context
```

If it starts asking about your project's business domain, the setup is working.

## Multiple Projects

Each project gets its own Docker stack with different ports. The `project-init` skill handles this automatically:

```
/project-init "Second Project"
# → auto-detects used ports
# → proposes next available port block (+10)
# → generates .env and docker-compose.yml
```

## Platform Notes

### macOS
- Use Docker Desktop. Ensure it has at least 4GB RAM allocated.
- Rosetta 2 emulation works for x86 images on Apple Silicon.

### Linux
- Docker Engine or Docker Desktop both work.
- If using Docker Engine, ensure your user is in the `docker` group.

### Windows
- Docker Desktop with WSL2 backend is required.
- Run Docker commands from WSL2 terminal for best results.
- Container names and ports are shared between WSL2 and Windows.

## Troubleshooting

**Neo4j won't start**: Check Docker has enough memory (min 2GB for Neo4j).

**Schema won't load**: Open Neo4j Browser at `http://localhost:3574`, login with `bolt://localhost:3587` / `neo4j` / `neo4j_graph_dev`, and run each `.cypher` file manually.

**MCP connection fails**: Verify `neo4j-mcp` is installed (`which neo4j-mcp`), `.mcp.json` is at project root, and Claude Code was restarted.

## Next Steps

- [Quick Start](../quickstart.md) — initialize your first project
- [Optional Tools](optional-tools.md) — Docmost and YouGile integration
