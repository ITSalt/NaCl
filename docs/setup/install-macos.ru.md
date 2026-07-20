[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на macOS

🇬🇧 [English version](install-macos.md)

# Установка на macOS

## Предварительные требования

### 1. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Docker Desktop

Выполните `brew install --cask docker`, затем запустите Docker Desktop.

### 3. Node.js 18+

```bash
brew install node
```

### 4. Агентская среда

Установите Claude Code или Codex. Для Claude Code CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

Claude Code Desktop устанавливает плагин `nacl` из marketplace-панели или
командами Claude; не совмещайте его с CLI-каналом на одной машине. См.
[Выбор канала](install-skills.ru.md#выберите-канал).

## Установка

### Клонировать репозиторий

Этот шаг нужен для Claude Code CLI и разработки, но не для обычной установки Codex-плагина.

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

### Установить скиллы

Для Claude Code CLI:

```bash
sh ~/NaCl/scripts/install-claude-code-skills.sh
```

Скрипт делает `git pull --ff-only`, обновляет симлинки `nacl-*` и профили
агентов. `--no-pull` пропускает Git-шаг. Для Codex см. [UI-канал](install-skills.ru.md#codex).

```bash
alias nacl-update='sh ~/NaCl/scripts/install-claude-code-skills.sh'
```

### Собрать опциональные CLI-инструменты

```bash
cd ~/NaCl/docmost-sync && npm install && npm run build
cd ~/NaCl/yougile-setup && npm install && npm run build
```

## Графовая инфраструктура

Конфигурацию Docker + Neo4j и доски Analyst Tool см. в [Настройке графа](graph-setup.ru.md).

## Проверка

```bash
# Claude Code CLI
ls ~/.claude/skills/ | wc -l

# Codex: только legacy-канал совместимости
find ~/.agents/skills -maxdepth 1 -type l -name 'nacl-*' | wc -l
```

Затем откройте проект и запустите `/nacl-init --dry-run`.

## Codex Desktop

### Установка в UI

После публичного релиза нормальный Codex-путь — официальная Skills-only
карточка NaCl из **Plugins**. Установите её один раз, выдайте только показанные
права, откройте новую задачу проекта и запустите read-only preflight
`nacl-init`. После подтверждённого bootstrap и записи проектного `.mcp.json`
откройте ещё одну новую задачу для загрузки проектного MCP. Checkout, терминал,
публичный MCP и повторная Git-установка не нужны. До публикации карточки
используйте отдельно описанный immutable Git/full-plugin канал совместимости и
его installation doctor.

### Граф и авторизация

Для локального контейнера Neo4j 5 Community проекта используйте Docker Desktop или
подключитесь к отдельно администрируемому VPS. Доступ к серверу означает доступ ко всем базам
проектов на нём; `project_scope` маршрутизирует, но не авторизует. Skills-only
путь использует локальный/проектный MCP и не добавляет публичный HTTP/OAuth.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j и доски Analyst Tool.
- [Установка скиллов](install-skills.ru.md) — Claude Code и Codex.
- [Быстрый старт](../quickstart.ru.md) — первый проект.
