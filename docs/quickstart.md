[Home](../README.md) > Quick Start

🇷🇺 [Русская версия](quickstart.ru.md)

# Quick Start

Get from zero to your first skill run in 10 minutes.

## Prerequisites

- [Claude Code CLI](https://claude.ai/code) installed and authenticated
- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Git](https://git-scm.com/)
- [Node.js 18+](https://nodejs.org/) (only for optional CLI tools)

## Step 1: Clone the repository

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

> Adjust `~/NaCl` to your preferred location. All instructions below use `$NACL_DIR` to refer to this path.

## Step 2: Link skills to Claude Code

```bash
mkdir -p ~/.claude/skills

for dir in ~/NaCl/*/; do
  if [ -f "$dir/SKILL.md" ]; then
    name=$(basename "$dir")
    ln -sf "$dir" ~/.claude/skills/"$name"
  fi
done

echo "Linked $(ls ~/.claude/skills/ | wc -l) skills"
```

This creates symlinks so Claude Code discovers the skills as slash commands.

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

Install the Neo4j MCP server:

```bash
npm install -g @anthropic/neo4j-mcp
```

Add it to your project's `.mcp.json`:

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

Restart Claude Code to pick up the MCP server.

## Step 5: Initialize your first project

Open Claude Code in your target project directory:

```
/project-init "My Project Name"
```

This creates `CLAUDE.md` and `config.yaml`. Then start the full pipeline:

```
/graph_ba_full
```

Claude will guide you through business analysis interactively, storing everything in the Neo4j graph.

## What's Next?

- **Full pipeline**: [Workflows](workflows.md) -- end-to-end scenarios
- **All skills**: [Skills Reference](skills-reference.md) -- complete catalog
- **Architecture**: [Architecture](architecture.md) -- how it all fits together
- **Platform setup**: [macOS](setup/install-macos.md) | [Linux](setup/install-linux.md) | [Windows](setup/install-windows.md)
- **Optional tools**: [Docmost & YouGile](setup/optional-tools.md)
