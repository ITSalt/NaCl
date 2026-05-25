[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка скиллов

:gb: [English version](install-skills.md)

# Установка скиллов

NaCl можно использовать из Claude Code и из Codex. Установите пакет скиллов,
который соответствует агентской среде на этой машине.

| Среда | Куда устанавливается | Пакет |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Корневые `nacl-*` скиллы из репозитория |
| Codex | `$HOME/.agents/skills/` | `skills-for-codex/` из этого репозитория |

Установка выполняется один раз на уровне пользователя. После этого скиллы
доступны во всех проектах, которые открывает эта среда на той же машине.

## Claude Code

Claude Code использует корневые папки скиллов NaCl и профили агентов из
`.claude/agents/`. Один скрипт ставит и то и другое.

### macOS / Linux / WSL2

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/scripts/install-claude-code-skills.sh"
```

Скрипт сначала выполняет `git pull --ff-only`, потом обновляет симлинки
пользователя для каждой `nacl-*` директории с `SKILL.md` и каждого файла
агента в `.claude/agents/`. Передайте `--no-pull` чтобы пропустить git-шаг
в offline или sandboxed окружении.

### Windows PowerShell

Запустите PowerShell от имени Администратора (или с включённым Developer
Mode — см. [Установка на Windows](install-windows.ru.md)):

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Поведение то же: опциональный `git pull` плюс обновление симлинков для
скиллов и агентов. Передайте `-NoPull` чтобы пропустить git-шаг. Для
скиллов при недоступности symlink скрипт делает fallback на directory
junction; для агентов нужны настоящие symlink (то есть Administrator или
Developer Mode).

### Проверка Claude Code

```sh
ls "$HOME/.claude/skills" | wc -l
```

Откройте Claude Code в проекте и выполните:

```text
/nacl-init --dry-run
```

## Codex

Codex использует адаптированный пакет `skills-for-codex/` из обычного git
checkout. Не устанавливайте Codex-скиллы из скопированных архивов: ссылки
должны указывать в репозиторий, чтобы `git pull` обновлял скиллы для всех
проектов на машине.

### macOS

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Linux

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Windows WSL2

Выполните Linux-команду внутри WSL2. Скиллы будут установлены в
`$HOME/.agents/skills/` пользователя WSL.

### Windows PowerShell

Инсталлятор создаёт directory symlink, если Windows это позволяет. Если
создание symlink недоступно, он использует directory junction.

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

### Команда для Codex

Если Codex запущен на машине, где NaCl еще не установлен, отправьте ему такой
запрос:

```text
Install NaCl Codex skills globally on this machine.

Clone https://github.com/ITSalt/NaCl.git into $HOME/NaCl if it is not already present. If it is present, run git pull --ff-only there. Then run the Codex installer from $HOME/NaCl/skills-for-codex/scripts and verify that $HOME/.agents/skills contains 59 NaCl skill links and that each linked directory has SKILL.md. Use network or escalated permission if needed.
```

### Проверка Codex

macOS / Linux / WSL2:

```sh
find "$HOME/.agents/skills" -maxdepth 1 -type l -name 'nacl-*' | wc -l
test -f "$HOME/.agents/skills/nacl-core/SKILL.md"
```

Windows PowerShell:

```powershell
(Get-ChildItem "$HOME\.agents\skills" -Filter "nacl-*").Count
Test-Path "$HOME\.agents\skills\nacl-core\SKILL.md"
```

## Обновление Claude-Code-скиллов

Запустите тот же скрипт, что и для первой установки. Он идемпотентен: делает
`git pull --ff-only`, пересоздаёт существующие симлинки на тот же таргет,
создаёт новые симлинки для любых добавленных скиллов или агентов.

### macOS / Linux / WSL2

```sh
sh "$HOME/NaCl/scripts/install-claude-code-skills.sh"
```

### Windows PowerShell

```powershell
& "$HOME\NaCl\scripts\install-claude-code-skills.ps1"
```

Добавьте `--no-pull` (sh) или `-NoPull` (PowerShell), чтобы обновить
симлинки без подтягивания новых коммитов.

## Обновление Codex-скиллов

Обновите checkout репозитория:

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

Ссылки продолжают указывать на тот же checkout, поэтому существующие скиллы
обновляются сразу после `git pull`. Повторный запуск installer нужен только
для новых директорий скиллов или восстановления отсутствующих ссылок.
