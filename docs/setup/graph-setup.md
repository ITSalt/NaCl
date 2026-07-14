[Home](../../README.md) > [Quick Start](../quickstart.md) > Graph Setup

🇷🇺 [Русская версия](graph-setup.ru.md)

# Graph Infrastructure Setup

Neo4j Docker stack for graph-based skills. Required for all `nacl-*` skills.

## What You Get

| Service | Purpose | Default Port |
|---------|---------|-------------|
| Neo4j | Knowledge graph database | 3574 (HTTP), 3587 (Bolt) |

> **Excalidraw boards** are now managed by the **NaCl Analyst Tool** (`analyst-tool/`), which runs as a local Node.js process outside Docker. Start it separately with `cd analyst-tool && npm install && npm run dev` — it listens on `http://localhost:3582`.

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

You should see 1 container: neo4j.

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

## Step 3: Install the Neo4j MCP Server

The Neo4j MCP server lets Claude Code communicate with your graph database. There is no
npm package for this anymore — `@anthropic/neo4j-mcp` was an early npm launcher and was
abandoned (cold start over 30s regularly blew past the MCP connect timeout, and its stdout
banner corrupted the stdio JSON-RPC stream). `/nacl-init` now downloads the official Go
binary from the `neo4j/mcp` GitHub releases directly:

```
/nacl-init "Your Project"
```

This downloads a **version-pinned, sha256-verified** release asset (pin + checksums live
in `nacl-tl-core/scripts/neo4j-mcp.pin`) to `~/.neo4j-mcp-bin/neo4j-mcp`, and writes
`.mcp.json` at the project root pointing straight at that binary — no `PATH` lookup, no
global install. To track a different release, set `NEO4J_MCP_VERSION=<tag>` before running
`/nacl-init` (or `NEO4J_MCP_VERSION=latest` to skip pinning, which also skips checksum
verification — a loud warning is printed).

**Manual fallback (blocked egress):** if the environment can't reach GitHub, download the
matching `neo4j-mcp_<OS>_<ARCH>.tar.gz` asset for the pinned version from
`https://github.com/neo4j/mcp/releases` in a browser, extract it, and place the `neo4j-mcp`
binary at `~/.neo4j-mcp-bin/neo4j-mcp` (`chmod +x`) before running `/nacl-init` — the setup
script reuses an existing binary at that path instead of downloading.

## Step 4: Configure Claude Code MCP

`/nacl-init` writes this for you; the file looks like:

```json
{
  "mcpServers": {
    "neo4j": {
      "type": "stdio",
      "command": "<home>/.neo4j-mcp-bin/neo4j-mcp",
      "args": [],
      "env": {
        "NEO4J_URI": "bolt://localhost:3587",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "neo4j_graph_dev",
        "NEO4J_DATABASE": "neo4j",
        "NEO4J_TELEMETRY": "false"
      }
    }
  }
}
```

Run `/mcp` to confirm the `neo4j` server is listed, then start a new session to connect
(a plain in-session "restart" is not enough — MCP servers are only (re)spawned at session
start).

### Claude Code Desktop

Desktop reads the same project `.mcp.json` — no separate configuration. On macOS, the
Desktop app inherits its `PATH` from how it was launched, not your shell profile, so if a
tool like `docker` works in a terminal but the graph setup fails inside Desktop, restart
the Desktop app after changing your shell profile, or add the missing directory to `PATH`
via Desktop's built-in environment variable editor. After `/nacl-init` writes `.mcp.json`,
run `/mcp` in Desktop and start a new session if `neo4j` isn't listed — Desktop, like the
CLI, only picks up MCP server changes at session start.

## Step 5: Smoke Test

In Claude Code:

```
/nacl-ba-context
```

If it starts asking about your project's business domain, the setup is working.

## Multiple Projects

Each project gets its own Docker stack with different ports. The `nacl-init` skill handles this automatically:

```
/nacl-init "Second Project"
# → auto-detects used ports
# → proposes next available port block (+10)
# → generates .env and docker-compose.yml
```

## Parallel Sessions and Worktrees

Config (`config.yaml`, `.mcp.json`) and graph infra (`graph-infra/`) live at the **main
checkout** — always run `/nacl-init` from there, never from a linked worktree (a worktree
has no `.mcp.json` of its own). Parallel Claude Code sessions, including multiple Desktop
windows, all talk to the same one graph for a given project: run at most one *writing*
BA/SA skill at a time to avoid concurrent-edit races; read-only skills (query, review) are
safe to run in parallel.

## Liveness Check

`node "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs"` is a fast, dependency-free
liveness probe. It prints `NACL_GRAPH_DOCTOR: status=UP|DOWN|NOT_NACL` without doing a full
MCP handshake. Run it with `--fix` to repair automatically — it starts the local Docker
container (local mode) or relaunches the remote sidecar (remote mode), idempotently:

```bash
node "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs" --fix
```

`nacl-*` skills now call this automatically and offer to run `--fix` for you when the graph
is unreachable, instead of failing outright.

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

**MCP connection fails**: Run `node "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs"` to check liveness first. Verify the binary exists and is executable (`ls -l ~/.neo4j-mcp-bin/neo4j-mcp`), `.mcp.json` is at the project root and points at that path, then run `/mcp` and start a new session — MCP servers are only picked up at session start, not by an in-session restart.

## Next Steps

- [Quick Start](../quickstart.md) — initialize your first project
- [Optional Tools](optional-tools.md) — Docmost and YouGile integration
