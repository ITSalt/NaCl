[Home](../README.md) > Quick Start

🇷🇺 [Русская версия](quickstart.ru.md)

# Quick Start

Get from zero to your first skill run in 10 minutes.

## Prerequisites

- Claude Code or Codex installed and authenticated
- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/) (only for optional CLI tools)

## Step 1: Clone the repository

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

> Adjust `~/NaCl` to your preferred location. All instructions below use `$NACL_DIR` to refer to this path.

## Step 2: Install skills for your agent runtime

NaCl supports Claude Code and Codex. They use different user-level skill
directories, so choose the section that matches your runtime:

- [Claude Code installation](setup/install-skills.md#claude-code)
- [Codex installation](setup/install-skills.md#codex)

The guide includes macOS, Linux, Windows WSL2, and Windows PowerShell commands.

## Step 3: Start the graph infrastructure

```bash
cd ~/NaCl
cp graph-infra/.env.example graph-infra/.env
docker compose -f graph-infra/docker-compose.yml up -d
```

Wait ~30 seconds for Neo4j to start, then load the schema:

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep neo4j | head -1)
NEO4J_PASS=$(grep NEO4J_PASSWORD graph-infra/.env | cut -d= -f2)

for f in graph-infra/schema/ba-schema.cypher graph-infra/schema/sa-schema.cypher graph-infra/schema/tl-schema.cypher; do
  docker exec -i "$CONTAINER" cypher-shell -u neo4j -p "$NEO4J_PASS" < "$f"
done
```

## Step 4: Configure the Neo4j MCP server

There's nothing to install manually here — `/nacl-init` (next step) downloads a
version-pinned, checksum-verified `neo4j-mcp` binary and writes your project's `.mcp.json`
for you. See [Graph Setup](setup/graph-setup.md#step-3-install-the-neo4j-mcp-server) for
the manual-download fallback (blocked egress) and the Claude Code Desktop notes.

## Step 5: Initialize your first project

Open your agent runtime in the target project directory (the main checkout, not a linked
worktree):

```
/nacl-init "My Project Name"
```

This creates `CLAUDE.md` and `config.yaml`, and sets up `.mcp.json` for the Neo4j MCP
server. Run `/mcp` afterward and start a new session if `neo4j` isn't listed yet — MCP
servers are only picked up at session start. Then start the full pipeline:

```
/nacl-ba-full
```

Claude will guide you through business analysis interactively, storing everything in the Neo4j graph.

## What's Next?

- **Full pipeline**: [Workflows](workflows.md) -- end-to-end scenarios
- **All skills**: [Skills Reference](skills-reference.md) -- complete catalog
- **Architecture**: [Architecture](architecture.md) -- how it all fits together
- **Skill installation**: [Claude Code or Codex](setup/install-skills.md)
- **Platform setup**: [macOS](setup/install-macos.md) | [Linux](setup/install-linux.md) | [Windows](setup/install-windows.md)
- **Optional tools**: [Docmost & YouGile](setup/optional-tools.md)
