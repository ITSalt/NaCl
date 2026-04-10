[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка на Windows

🇬🇧 [English version](install-windows.md)

# Установка на Windows

Два варианта: WSL2 (рекомендуется) или нативный.

## Вариант A: WSL2 (рекомендуется)

```powershell
# PowerShell от имени администратора
wsl --install -d Ubuntu
```

После перезагрузки откройте Ubuntu из меню Пуск и следуйте [инструкции для Linux](install-linux.ru.md).

Установите [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/):
- Settings > General > "Use the WSL 2 based engine" — включить
- Settings > Resources > WSL Integration — включить для вашего дистрибутива Ubuntu

## Вариант B: Нативный (PowerShell)

Установите: [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/), [Node.js 20](https://nodejs.org/), [Git](https://git-scm.com/download/win)

```powershell
npm install -g @anthropic-ai/claude-code    # CLI; скиллы также работают в десктоп-приложении и расширениях IDE
git clone https://github.com/ITSalt/NaCl.git $HOME\NaCl
```

Подключение скиллов (PowerShell от имени администратора):

```powershell
$skillsDir = "$env:USERPROFILE\.claude\skills"
New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null

Get-ChildItem -Path "$HOME\NaCl" -Directory | ForEach-Object {
    if (Test-Path "$($_.FullName)\SKILL.md") {
        $target = Join-Path $skillsDir $_.Name
        if (Test-Path $target) { Remove-Item $target -Force -Recurse }
        New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
    }
}
```

> Скиллы, подключённые к `~/.claude/skills/` (или `%USERPROFILE%\.claude\skills\` на нативном Windows), автоматически доступны на всех локальных платформах Claude Code: CLI, десктоп-приложение и расширения для IDE.

## Типичные проблемы

- **Окончания строк**: `git config --global core.autocrlf input` перед клонированием
- **Длинные пути**: `git config --global core.longpaths true`
- **Симлинки**: нужны права администратора или включённый Developer Mode

## Дальше

- [Графовая инфраструктура](graph-setup.ru.md) — Neo4j + Excalidraw
- [Быстрый старт](../quickstart.ru.md) — первый проект
