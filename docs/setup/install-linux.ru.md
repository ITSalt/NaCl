[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на Linux

🇬🇧 [English version](install-linux.md)

# Установка на Linux

## Предварительные требования

### 1. Docker Engine

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Fedora/RHEL:

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

Или установите Node.js 20 через `nvm`.

### 3. Агентская среда

Установите Claude Code или Codex. Для Claude Code CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

Claude Code Desktop в 2.24.0 использует marketplace-плагин `nacl`; на одной машине
выбирайте один Claude-канал. См. [Установку скиллов](install-skills.ru.md).

## Установка

### Клонировать репозиторий

Этот шаг нужен для Claude Code CLI и разработки, но не для обычной Codex UI-установки.

```bash
git clone https://github.com/ITSalt/NaCl.git ~/NaCl
```

### Установить скиллы

Для Claude Code CLI:

```bash
sh ~/NaCl/scripts/install-claude-code-skills.sh
```

Скрипт делает `git pull --ff-only`, обновляет симлинки `nacl-*` и профили
агентов; `--no-pull` пропускает Git-шаг. Codex в нормальном режиме устанавливает
полный плагин из **Plugins**.

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

Откройте проект и запустите `/nacl-init --dry-run`. Для полного Codex-плагина сначала
проверьте installation doctor из новой задачи.

## Codex Desktop

### Установка в UI

Установите доверенную карточку NaCl из **Plugins**, выдайте только показанные права,
полностью перезапустите Codex и в новой задаче проверьте `status=VERIFIED`,
`mode=plugin-only` и `executionLocation=installed-cache` через `nacl_installation_doctor`.

### Граф и авторизация

Используйте контейнер Neo4j 5 Community проекта через Docker Engine/Desktop или подключитесь к
отдельно администрируемому VPS. Доступ к серверу означает доступ ко всем базам
проектов на нём; `project_scope` маршрутизирует, но не авторизует. Публичный HTTP/OAuth и релиз
остаются `NOT_RUN`.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j и доски Analyst Tool.
- [Установка скиллов](install-skills.ru.md) — Claude Code и Codex.
- [Быстрый старт](../quickstart.ru.md) — первый проект.
