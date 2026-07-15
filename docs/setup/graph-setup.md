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

Start a new session to connect (MCP servers are only picked up at session
start — verified live: there is no hot-reload, and `/mcp reconnect` does not
see newly added `.mcp.json` entries). In the new session, the smoke test is
one call: ask Claude to run `mcp__neo4j__read-cypher "RETURN 1"` — it must
return `1`.

### Claude Code Desktop

Desktop reads the same project `.mcp.json` — no separate configuration. On macOS, the
Desktop app inherits its `PATH` from how it was launched, not your shell profile, so if a
tool like `docker` works in a terminal but the graph setup fails inside Desktop, restart
the Desktop app after changing your shell profile, or add the missing directory to `PATH`
via Desktop's built-in environment variable editor. After `/nacl-init` writes `.mcp.json`,
start a new session — Desktop, like the CLI, only picks up MCP server changes at session
start. Note: typing `/mcp` in Desktop opens the connector directory (adding new
connectors), not a status panel — to verify the connection, just ask Claude to run
`mcp__neo4j__read-cypher "RETURN 1"` in the new session.

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

That path is the **CLI symlink channel**. On the **Claude Code Desktop plugin channel**,
`nacl-core` lives under the plugin root instead — the build rewrites the same command to
`node "$(nacl-home)/nacl-core/scripts/graph-doctor.mjs" --fix`, and the plugin's SessionStart
hook runs it as `node "${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/graph-doctor.mjs" --hook`.
See `docs/setup/install-skills.md` § "Choose your channel" — pick one channel per machine.

`nacl-*` skills now call this automatically and offer to run `--fix` for you when the graph
is unreachable, instead of failing outright.

## Mid-Session Watcher (Plugin Channel)

Plugin installs (`/plugin install nacl@nacl`) also arm a background monitor
(`monitors/monitors.json` → `graph-doctor.mjs --watch`): a long-running process, started
with the session, that re-probes the graph port every 30 seconds. It complements the
SessionStart hook — the hook catches a graph that is already down when the session starts;
the watcher catches a container that dies *after* the session began (previously invisible
until the next graph call failed).

The watcher is silent while the state is stable and prints a single `NACL_GRAPH_WATCH:`
line only on an UP→DOWN or DOWN→UP transition. Per the official plugin docs, every stdout
line from a monitor is delivered to Claude as a notification mid-conversation — so on
container death Claude learns the graph is DOWN (with the `--fix` remedy at hand) without
being asked, and on recovery it learns `mcp__neo4j__*` tools are safe again. In non-NaCl
projects (no `graph:` block in `config.yaml`) the watcher exits immediately and never
notifies.

> **Live Desktop verification pending.** The notification UX above follows the official
> plugin monitors documentation plus a local end-to-end run of `--watch` (real TCP
> transitions, one line per flip); the UP→DOWN notification has **not yet been observed in
> a live Claude Code Desktop session**. Owner step: stop the project's Neo4j container
> mid-session (`docker stop <container>`) and confirm the notification arrives.

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

**MCP connection fails**: Run `node "$HOME/.claude/skills/nacl-core/scripts/graph-doctor.mjs"` (CLI symlink channel) or `node "$(nacl-home)/nacl-core/scripts/graph-doctor.mjs"` (Desktop plugin channel) to check liveness first. Verify the binary exists and is executable (`ls -l ~/.neo4j-mcp-bin/neo4j-mcp`), `.mcp.json` is at the project root and points at that path, then start a new session — MCP servers are only picked up at session start, not by an in-session restart, and `/mcp reconnect` does not see newly added `.mcp.json` entries.

## Next Steps

- [Quick Start](../quickstart.md) — initialize your first project
- [Optional Tools](optional-tools.md) — Docmost and YouGile integration
