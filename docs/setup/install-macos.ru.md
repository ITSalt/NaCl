[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на macOS

🇬🇧 [English version](install-macos.md)

# Установка на macOS

## Предварительные требования

1. **Homebrew**: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
2. **Docker Desktop**: `brew install --cask docker` (запустите после установки)
3. **Node.js 18+**: `brew install node`
4. **Агентская среда**: Claude Code или Codex. Для Claude Code CLI:
   `npm install -g @anthropic-ai/claude-code && claude login`

Скиллы NaCl работают с Claude Code CLI, десктоп-приложением Claude,
расширениями IDE и Codex. Установите пакет скиллов под вашу среду.

## Установка

```bash
# Клонировать
git clone https://github.com/ITSalt/NaCl.git ~/NaCl

# Опционально: CLI-инструменты
cd ~/NaCl/docmost-sync && npm install && npm run build
cd ~/NaCl/yougile-setup && npm install && npm run build
```

Для установки скиллов выберите Claude Code или Codex в
[инструкции по установке скиллов](install-skills.ru.md). Раздел Codex содержит
команду установки из GitHub Release без клонирования репозитория.

Алиас для обновления (добавить в `~/.zshrc`):

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done && for f in ~/NaCl/.claude/agents/*.md; do [ -f "$f" ] && ln -sf "$f" ~/.claude/agents/"$(basename "$f")"; done'
```

## Проверка

```bash
# Claude Code
ls ~/.claude/skills/ | wc -l

# Codex
find ~/.agents/skills -maxdepth 1 -type l -name 'nacl-*' | wc -l
```

Затем откройте агентскую среду в проекте и выполните `/nacl-init --dry-run`.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Установка скиллов](install-skills.ru.md) — Claude Code или Codex
- [Быстрый старт](../quickstart.ru.md) — первый проект
