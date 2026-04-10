[Home](../../README.md) > [Quick Start](../quickstart.md) > Optional Tools

🇷🇺 [Русская версия](optional-tools.ru.md)

# Optional Tools

These integrations are **not required** for core NaCl functionality. Skills work without them — results go to the terminal and local files instead of external services.

## Docmost Integration

[Docmost](https://docmost.com/) is a self-hosted wiki. NaCl can publish analysis results to Docmost pages.

### What it enables

- `nacl-publish` — publish graph data to Docmost wiki pages
- Automated documentation sync from Neo4j to readable wiki

### Setup

**1. MCP Server**

Install the Docmost MCP server (with comment support):

```bash
git clone https://github.com/ITSalt/docmost-mcp.git
cd docmost-mcp
npm install && npm run build
```

**2. Claude Code configuration**

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "docmost": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/docmost-mcp/dist/index.js"],
      "env": {
        "DOCMOST_API_URL": "https://your-docmost-instance/api",
        "DOCMOST_EMAIL": "your-email",
        "DOCMOST_PASSWORD": "your-password"
      }
    }
  }
}
```

**3. CLI tool (token-efficient publishing)**

```bash
cd ~/NaCl/docmost-sync && npm install && npm run build
```

Usage:
```bash
node ~/NaCl/docmost-sync/dist/index.js --scope sa --mode dry-run --project-dir /path/to/project
```

## YouGile Integration

[YouGile](https://yougile.com/) is a project management tool. NaCl can create tasks, move them through columns, and post updates.

### What it enables

- `nacl-tl-ship` — post commit summaries to task chat
- `nacl-tl-intake` — read user requests from YouGile
- `nacl-tl-verify` / `nacl-tl-reopened` — move tasks through verification workflow

### Setup

**1. MCP Server**

```bash
git clone https://github.com/ichinya/yougile-mcp.git
cd yougile-mcp
npm install && npm run build
```

**2. Claude Code configuration**

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "yougile": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/yougile-mcp/yougile.cjs"],
      "env": {
        "YOUGILE_API_KEY": "your-api-key"
      }
    }
  }
}
```

**3. Board setup CLI**

```bash
cd ~/NaCl/yougile-setup && npm install && npm run build
```

The `nacl-init` skill can automatically set up YouGile boards.

## Without Optional Tools

If you don't set up Docmost or YouGile:

- **Publishing**: Graph data stays in Neo4j. Use `nacl-render` to export to local Markdown files.
- **Task tracking**: Tasks are managed via `.tl/tasks/` files and git. No external board sync.
- **All analysis and development skills work normally**.

## Next Steps

- [Quick Start](../quickstart.md) — back to the main guide
- [Graph Setup](graph-setup.md) — Docker infrastructure
