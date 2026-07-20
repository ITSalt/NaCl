[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на Windows

🇬🇧 [English version](install-windows.md)

# Установка на Windows

Два варианта: WSL2 (рекомендуется) или нативный PowerShell.

## Вариант A: WSL2 (рекомендуется)

### 1. Установить WSL2

Откройте PowerShell от имени администратора:

```powershell
wsl --install -d Ubuntu
```

Перезагрузите компьютер и откройте Ubuntu.

### 2. Установить Docker Desktop

Установите [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/). В настройках включите
**Use the WSL 2 based engine** и WSL Integration для Ubuntu.

### 3. В WSL2 следовать Linux-инструкции

Продолжите по [инструкции для Linux](install-linux.ru.md). Пути будут
Linux-формата. После публикации обычный Codex-путь — официальная Skills-only
карточка в UI; до публикации используйте отдельно описанный immutable
Git/full-plugin канал совместимости.

## Вариант B: Нативный Windows (PowerShell)

### 1. Предварительные требования

Установите Docker Desktop с WSL2 backend, Node.js 20, Git for Windows и Claude Code или Codex.
Для Claude Code CLI:

```powershell
npm install -g @anthropic-ai/claude-code
```

### 2. Клонировать репозиторий

Этот шаг нужен для Claude Code CLI и разработки, но не для обычной Codex UI-установки.

```powershell
git clone https://github.com/ITSalt/NaCl.git $HOME\NaCl
```

### 3. Установить скиллы

Для Claude Code CLI запустите PowerShell от имени администратора или включите Developer Mode:

```powershell
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Скрипт связывает `nacl-*` с `%USERPROFILE%\.claude\skills`, а профили агентов — с
`%USERPROFILE%\.claude\agents`. Для скиллов есть fallback на directory junction; агентам нужны symlink.

После публичного релиза целевой нормальный Codex-путь — официальная Skills-only
карточка в **Plugins**. Приведённый PowerShell installer через symlink остаётся
только legacy-каналом, не является официальной карточкой и не должен
совмещаться с текущим полным Git-плагином. См.
[Установку скиллов](install-skills.ru.md).

```powershell
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Этот installer нужен только существующим legacy Codex-машинам. Для symlink
требуются права Administrator или Developer Mode; не запускайте его после
установки полной Git-карточки или официальной Skills-only карточки.

### После `git pull`

Повторно запустите Claude-инсталлятор: он идемпотентен, обновит старые ссылки и добавит новые.

### 4. Собрать опциональные CLI-инструменты

```powershell
cd $HOME\NaCl\docmost-sync; npm install; npm run build
cd $HOME\NaCl\yougile-setup; npm install; npm run build
```

## Типичные проблемы Windows

- Окончания строк: `git config --global core.autocrlf input`.
- Длинные пути: `git config --global core.longpaths true`.
- Docker Desktop: включите WSL2 engine.
- Symlink: нужны права администратора или Developer Mode.
- Legacy Codex skills: нативный Windows и WSL2 имеют разные user-level-каталоги.

## Графовая инфраструктура

Конфигурацию Docker + Neo4j см. в [Настройке графа](graph-setup.ru.md). Доски Excalidraw ведёт
NaCl Analyst Tool, работающий вне Docker.

### Neo4j MCP на Windows

`/nacl-init` запускает `nacl-tl-core\scripts\setup-graph.ps1`, который:

- скачивает официальный `neo4j-mcp.exe` и распаковывает его через `Expand-Archive`;
- для Claude/full-plugin compatibility пишет `.mcp.json` прямо на бинарник, не
  используя npm-лаунчер с лишним STDOUT;
- для планируемого Codex Skills-only пути создаёт launcher без секрета и
  объединяет `[mcp_servers.nacl_neo4j]` в доверенном проектном
  `.codex/config.toml`: абсолютный путь к найденному Node в `command`, launcher/`--binary`/
  проверенный бинарник в `args` и только несекретные параметры Neo4j в `env`;
  launcher читает секрет только из защищённого `graph-infra/.env` и проверяет
  binary/install receipt; эта адаптация Wave 9 ещё не доказана текущим скриптом;
- пишет `.env`, Claude `.mcp.json`, Codex `.codex/config.toml` и схему в UTF-8
  без BOM;
- запускает Docker, загружает схему и отказывается сообщать об успехе до прохода жёстких gates.

Приёмка: контейнер `healthy`, `SHOW CONSTRAINTS` возвращает ожидаемое число,
бинарник отвечает на `initialize` и `tools/list`, а в новой сессии проходит один запрос `RETURN 1`.
`/mcp` в Claude Code Desktop открывает каталог коннекторов, поэтому рабочий smoke-запрос надёжнее.
При сбое setup печатает `NACL_GRAPH_RESULT: status=FAILED`; после устранения причины шаг можно безопасно повторить.

Для Codex `.mcp.json` не является свидетельством приёмки. Откройте новую
задачу в том же каноническом доверенном корне и потребуйте обнаружения
`nacl_neo4j` из `.codex/config.toml`, затем тот же handshake/read check.
Абсолютные пути этой машины к Node, launcher и бинарнику допустимы, но в них не
должно быть секрета, developer checkout или plugin cache. Сырой секрет запрещён
в `command`, `args` и `env`.

## Codex Desktop

### Установка в UI

После публичного релиза один раз установите официальную Skills-only карточку
NaCl из **Plugins**, выдайте только показанные права, откройте новую задачу
проекта и запустите read-only preflight `nacl-init`. После подтверждённого
bootstrap, создания launcher без секрета и записи проектного
`.codex/config.toml` откройте ещё одну новую задачу в том же каноническом
доверенном корне для загрузки проектного MCP. Проектный `.mcp.json` относится
только к Claude/compatibility. PowerShell setup, путь к репозиторию, публичный MCP и
повторная Git-установка не нужны. До публикации используйте отдельно описанный
immutable Git/full-plugin канал совместимости и его installation doctor.

### Граф и авторизация

Локальный режим использует контейнер Neo4j 5 Community проекта через WSL2 backend Docker Desktop;
удалённый режим подключается к отдельно администрируемому VPS. Доступ к серверу означает доступ
ко всем базам проектов на нём; `project_scope` — маршрутизация и provenance, а не авторизация.
Skills-only путь использует локальный/проектный MCP и не добавляет публичный HTTP/OAuth.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j и доски Analyst Tool.
- [Установка скиллов](install-skills.ru.md) — Claude Code и Codex.
- [Быстрый старт](../quickstart.ru.md) — первый проект.
