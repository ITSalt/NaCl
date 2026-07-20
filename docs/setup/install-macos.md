[Home](../../README.md) > [Quick Start](../quickstart.md) > macOS Setup

🇷🇺 [Русская версия](install-macos.ru.md)

# macOS Setup

Complete setup guide for macOS.

## Prerequisites

### 1. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Docker Desktop

Download from [docker.com](https://docs.docker.com/desktop/install/mac-install/) or:

```bash
brew install --cask docker
```

Start Docker Desktop and ensure it's running.

### 3. Node.js 18+

```bash
brew install node
```

### 4. Agent runtime

Install Claude Code or Codex, depending on which agent runtime you use. For
Claude Code CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

NaCl skills also work with the [Claude Desktop app](https://claude.ai/download),
Claude Code IDE extensions, and Codex. **Claude Code Desktop installs via the
`nacl` plugin** (`/plugin marketplace add ITSalt/NaCl` then `/plugin install
nacl@nacl` inside Desktop) — not the symlink script below. Pick one channel per
machine; do not install both. See
[Skill Installation § Choose your channel](install-skills.md) for the full
channel matrix.

## Installation

### Clone the repository

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

### Install skills

For Claude Code, one command installs both skills and agents:

```bash
sh ~/NaCl/scripts/install-claude-code-skills.sh
```

The script runs `git pull --ff-only` first, then refreshes symlinks for
every `nacl-*` skill with a `SKILL.md` and every agent profile under
`.claude/agents/`. Pass `--no-pull` to skip git.

For Codex, see [Skill Installation](install-skills.md#codex).

The same script doubles as the update tool — add a short alias for daily use:

```bash
alias nacl-update='sh ~/NaCl/scripts/install-claude-code-skills.sh'
```

### Build optional CLI tools

```bash
cd ~/NaCl/docmost-sync && npm install && npm run build
cd ~/NaCl/yougile-setup && npm install && npm run build
```

## Graph Infrastructure

See [Graph Setup](graph-setup.md) for Docker + Neo4j configuration. Excalidraw boards are managed by the NaCl Analyst Tool (`analyst-tool/`), which runs outside Docker.

## Verify

```bash
# Claude Code
ls ~/.claude/skills/ | wc -l

# Codex legacy compatibility channel only
find ~/.agents/skills -maxdepth 1 -type l -name 'nacl-*' | wc -l
```

Then open your agent runtime in a project and run `/nacl-init --dry-run`.

## Codex Desktop

### UI installation

After public release, the normal Codex path is the official NaCl Skills-only
card from **Plugins**. Install it once, grant only displayed permissions, open
a new project task, and run the `nacl-init` read-only preflight. After confirmed
bootstrap creates the no-secret launcher and merges project
`.codex/config.toml`, open another new task at the same canonical trusted root
for project MCP pickup. Project `.mcp.json` is Claude/compatibility-only. No
source checkout, terminal, public MCP, or Git reinstall is required.
Until that card is published, use the separately documented immutable
Git/full-plugin compatibility channel and its installation doctor.

### Graph and authorization

Use Docker Desktop for the default per-project Neo4j 5 Community container, or
connect to a separately operated VPS. Server access currently implies access
to all project databases hosted there; `project_scope` routes a project but is
not an authorization boundary. The Skills-only path uses local/project MCP and
does not add public HTTP/OAuth.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Analyst Tool boards
- [Skill Installation](install-skills.md) — Claude Code or Codex
- [Quick Start](../quickstart.md) — first project
