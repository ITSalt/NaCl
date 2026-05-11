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

**Агентская среда**: Claude Code или Codex. Для Claude Code CLI:
`npm install -g @anthropic-ai/claude-code && claude login`

Скиллы NaCl работают с Claude Code CLI, расширениями IDE и Codex. Установите
пакет скиллов под вашу среду.

## Установка

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl

```

Алиас для обновления (добавить в `~/.bashrc`):

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done && for f in ~/NaCl/.claude/agents/*.md; do [ -f "$f" ] && ln -sf "$f" ~/.claude/agents/"$(basename "$f")"; done'
```

Для установки скиллов выберите Claude Code или Codex в
[инструкции по установке скиллов](install-skills.ru.md). Раздел Codex содержит
команду установки из GitHub Release без клонирования репозитория.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Установка скиллов](install-skills.ru.md) — Claude Code или Codex
- [Быстрый старт](../quickstart.ru.md) — первый проект
