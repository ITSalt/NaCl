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

### 3. Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

> This installs the CLI. NaCl skills also work with IDE extensions (VS Code, JetBrains) which share the same `~/.claude/skills/` directory.

## Installation

### Clone the repository

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

### Link skills

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

Add to `~/.bashrc` for easy updates:

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done'
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
ls ~/.claude/skills/ | wc -l    # should show ~56
claude                           # start Claude Code (or open IDE extension)
# Then type: /nacl-init --dry-run
```

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Excalidraw
- [Quick Start](../quickstart.md) — first project
