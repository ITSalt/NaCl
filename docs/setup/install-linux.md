[Home](../../README.md) > [Quick Start](../quickstart.md) > Linux Setup

🇷🇺 [Русская версия](install-linux.ru.md)

# Linux Setup

Complete setup guide for Linux (Ubuntu/Debian and Fedora/RHEL).

## Prerequisites

### 1. Docker Engine

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

**Fedora/RHEL:**
```bash
sudo dnf install -y docker docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Or use [nvm](https://github.com/nvm-sh/nvm):
```bash
nvm install 20
```

### 3. Agent runtime

Install Claude Code or Codex, depending on which agent runtime you use. For
Claude Code CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

NaCl skills also work with Claude Code IDE extensions and Codex. Use the skill
install guide below for the runtime-specific skill package.

## Installation

### Clone the repository

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

### Install skills

For Claude Code **CLI**, one command installs both skills and agents:

```bash
sh ~/NaCl/scripts/install-claude-code-skills.sh
```

The script runs `git pull --ff-only` first, then refreshes symlinks for
every `nacl-*` skill with a `SKILL.md` and every agent profile under
`.claude/agents/`. Pass `--no-pull` to skip git.

For **Claude Code Desktop**, the current channel (v2.24.0+) is the `nacl`
plugin instead of this symlink script: `/plugin marketplace add ITSalt/NaCl`
then `/plugin install nacl@nacl` inside Desktop. Pick one channel per
machine — do not install both the symlinked skills and the plugin. See
[Skill Installation § Choose your channel](install-skills.md) for the full
channel matrix.

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
public MCP or Git reinstall is required. Until publication, use the
separately documented immutable Git/full-plugin compatibility channel and its
installation doctor.

### Graph and authorization

Use a per-project Neo4j 5 Community container through Docker Engine/Desktop or
connect to a separately operated VPS. Server access currently implies access
to every project database hosted there; `project_scope` is routing, not
authorization. The Skills-only path uses local/project MCP and does not add
public HTTP/OAuth.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Analyst Tool boards
- [Skill Installation](install-skills.md) — Claude Code or Codex
- [Quick Start](../quickstart.md) — first project
