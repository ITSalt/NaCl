[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на Linux

🇬🇧 [English version](install-linux.md)

# Установка на Linux

## Предварительные требования

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker
```

**Fedora/RHEL:**
```bash
sudo dnf install -y docker docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

**Node.js 18+**: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`

**Claude Code**: `npm install -g @anthropic-ai/claude-code && claude login`

> Это устанавливает CLI. Скиллы NaCl также работают с расширениями для IDE (VS Code, JetBrains), которые используют общую директорию `~/.claude/skills/`.

## Установка

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl

mkdir -p ~/.claude/skills
for dir in ~/NaCl/*/; do
  [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"
done
echo "Подключено $(ls ~/.claude/skills/ | wc -l) скиллов"

# Подключить агентов
mkdir -p ~/.claude/agents
for file in ~/NaCl/.claude/agents/*.md; do
  [ -f "$file" ] && ln -sf "$file" ~/.claude/agents/"$(basename "$file")"
done
echo "Подключено $(ls ~/.claude/agents/ | wc -l) агентов"
```

Алиас для обновления (добавить в `~/.bashrc`):

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done && for f in ~/NaCl/.claude/agents/*.md; do [ -f "$f" ] && ln -sf "$f" ~/.claude/agents/"$(basename "$f")"; done'
```

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Быстрый старт](../quickstart.ru.md) — первый проект
