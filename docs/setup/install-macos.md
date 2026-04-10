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

### 4. Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
```

Authenticate:

```bash
claude login
```

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

Add to `~/.zshrc` for easy updates:

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
claude                           # start Claude Code
# Then type: /nacl-init --dry-run
```

## Next Steps

- [Graph Setup](graph-setup.md) — Neo4j + Excalidraw
- [Quick Start](../quickstart.md) — first project
