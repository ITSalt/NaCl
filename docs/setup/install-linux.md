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

Choose Claude Code or Codex in [Skill Installation](install-skills.md). The
Codex section installs symlinks to a git checkout so updates come from
`git pull`.

Add to `~/.bashrc` for easy updates:

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done && for f in ~/NaCl/.claude/agents/*.md; do [ -f "$f" ] && ln -sf "$f" ~/.claude/agents/"$(basename "$f")"; done'
```

### Build optional CLI tools

```bash
cd ~/NaCl/docmost-sync && npm install && npm run build
cd ~/NaCl/yougile-setup && npm install && npm run build
```

## Graph Infrastructure

See [Graph Setup](graph-setup.md) for Docker + Neo4j + Excalidraw configuration.

## Verify

```bash
# Claude Code
ls ~/.claude/skills/ | wc -l

# Codex
find ~/.agents/skills -maxdepth 1 -type l -name 'nacl-*' | wc -l
```

Then open your agent runtime in a project and run `/nacl-init --dry-run`.

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Excalidraw
- [Skill Installation](install-skills.md) — Claude Code or Codex
- [Quick Start](../quickstart.md) — first project
