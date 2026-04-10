[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на macOS

🇬🇧 [English version](install-macos.md)

# Установка на macOS

## Предварительные требования

1. **Homebrew**: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
2. **Docker Desktop**: `brew install --cask docker` (запустите после установки)
3. **Node.js 18+**: `brew install node`
4. **Claude Code**: `npm install -g @anthropic-ai/claude-code && claude login`

> Это устанавливает CLI. Скиллы NaCl также работают с [десктоп-приложением Claude](https://claude.ai/download) и расширениями для IDE (VS Code, JetBrains) -- они используют общую директорию `~/.claude/skills/`.

## Установка

```bash
# Клонировать
git clone https://github.com/ITSalt/NaCl.git ~/NaCl

# Подключить скиллы
mkdir -p ~/.claude/skills
for dir in ~/NaCl/*/; do
  [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"
done
echo "Подключено $(ls ~/.claude/skills/ | wc -l) скиллов"

# Опционально: CLI-инструменты
cd ~/NaCl/docmost-sync && npm install && npm run build
cd ~/NaCl/yougile-setup && npm install && npm run build
```

Алиас для обновления (добавить в `~/.zshrc`):

```bash
alias nacl-update='cd ~/NaCl && git pull && for dir in ~/NaCl/*/; do [ -f "$dir/SKILL.md" ] && ln -sf "$dir" ~/.claude/skills/"$(basename "$dir")"; done'
```

## Проверка

```bash
ls ~/.claude/skills/ | wc -l    # должно показать ~56
claude                           # запустить Claude Code (или откройте десктоп-приложение / IDE)
# Введите: /nacl-init --dry-run
```

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Быстрый старт](../quickstart.ru.md) — первый проект
