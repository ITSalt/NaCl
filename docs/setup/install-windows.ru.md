[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на Windows

🇬🇧 [English version](install-windows.md)

# Установка на Windows

Два варианта: WSL2 (рекомендуется) или нативный.

## Вариант A: WSL2 (рекомендуется)

```powershell
# PowerShell от имени администратора
wsl --install -d Ubuntu
```

После перезагрузки откройте Ubuntu из меню Пуск и следуйте
[инструкции для Linux](install-linux.ru.md). Для скиллов используйте
[установку скиллов](install-skills.ru.md) и выберите Claude Code или Codex.

Установите [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/):
- Settings > General > "Use the WSL 2 based engine" — включить
- Settings > Resources > WSL Integration — включить для вашего дистрибутива Ubuntu

## Вариант B: Нативный (PowerShell)

Установите: [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/), [Node.js 20](https://nodejs.org/), [Git](https://git-scm.com/download/win), Claude Code или Codex

```powershell
npm install -g @anthropic-ai/claude-code    # CLI; скиллы также работают в десктоп-приложении и расширениях IDE
git clone https://github.com/ITSalt/NaCl.git $HOME\NaCl
```

Для Claude Code запустите штатный инсталлятор (PowerShell от имени
Администратора или с включённым Developer Mode):

```powershell
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Скрипт линкует каждую `nacl-*` директорию с `SKILL.md` в
`%USERPROFILE%\.claude\skills` и каждый профиль агента в
`%USERPROFILE%\.claude\agents`. Сначала выполняется `git pull --ff-only`,
поэтому одна команда работает и для первой установки, и для обновления.
Передайте `-NoPull`, чтобы пропустить git-шаг. Для скиллов при недоступности
symlink есть fallback на directory junction; для агентов нужны настоящие
symlink.

Для Codex (отдельный дистрибутив) — соответствующий скрипт:

```powershell
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Полный справочник для обоих runtime:
[Установка скиллов](install-skills.ru.md).

> Скиллы и агенты, подключённые к `%USERPROFILE%\.claude\` на нативном
> Windows (или `~/.claude/` в WSL2), автоматически доступны на всех
> локальных платформах Claude Code: CLI, десктоп-приложение и расширения
> для IDE. Codex использует `%USERPROFILE%\.agents\skills`.

### После `git pull`

Инсталлятор и для обновлений тоже. Запустите ту же команду — она идемпотентна:
существующие симлинки пересоздаются на тот же таргет, для новых `nacl-*`
директорий из релиза создаются новые ссылки. Полная процедура для всех
платформ:
[Обновление Claude-Code-скиллов](install-skills.ru.md#обновление-claude-code-скиллов).

## Типичные проблемы

- **Окончания строк**: `git config --global core.autocrlf input` перед клонированием
- **Длинные пути**: `git config --global core.longpaths true`
- **Симлинки**: нужны права администратора или включённый Developer Mode
- **Codex-скиллы**: нативная Windows-установка использует `%USERPROFILE%\.agents\skills`; WSL2 использует `~/.agents/skills` внутри WSL.

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Установка скиллов](install-skills.ru.md) — Claude Code или Codex
- [Быстрый старт](../quickstart.ru.md) — первый проект
