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

## Выберите канал

У Claude Code два канала установки. На одной машине выбирайте один -- не
устанавливайте оба.

| Хост | Канал | Пакет |
|---|---|---|
| Claude Code CLI | Симлинки на скиллы | Корневые `nacl-*` скиллы, ставятся `scripts/install-claude-code-skills.sh/.ps1` (ниже) |
| Claude Code Desktop | Плагин | Закоммиченный артефакт `plugin/`, ставится из встроенного маркетплейса |

Оба канала поставляют одни и те же скиллы, отличается только упаковка.
Установка обоих на одной машине дублирует каждый скилл под двумя разными
именами (`nacl-*` и `/nacl:*`). SessionStart-хук плагина обнаруживает
установленные симлинки `~/.claude/skills/nacl-*` и предупреждает; и наоборот,
при установленных симлинках неясно, какой из двух скиллов сработает первым,
если оба канала стоят одновременно. Выберите канал, соответствующий тому,
как вы запускаете Claude Code, и придерживайтесь его.

### Claude Code Desktop (плагин)

Добавить маркетплейс NaCl и установить плагин можно двумя равнозначными
способами: через GUI настроек или двумя slash-командами. Оба приводят к одной
и той же установке `nacl@nacl`.

**Вариант A — GUI настроек (мышкой)**

1. Откройте **Settings** (или наберите `/plugin` в поле ввода внизу — откроется
   та же панель).
2. В левом сайдбаре, в разделе **Customize**, нажмите **Plugins**.
3. Справа сверху нажмите **Add ▾** → **Add marketplace**.
4. Выберите **Add from a repository** («Sync a plugin marketplace from a GitHub
   repository or git URL»).
5. В поле **URL** введите `ITSalt/NaCl`. Достаточно GitHub `owner/repo` — полный
   `https://…` URL, путь к локальной папке или заранее склонированный
   репозиторий не нужны. Подтвердите предупреждение о доверии.
6. Нажмите **Sync**. Маркетплейс `nacl` добавлен.
7. Вернувшись в панель **Plugins**, нажмите **Browse**. В открывшемся диалоге
   **Directory** выберите слева **Plugins** и нажмите вкладку **Code** сверху.
   Найдите карточку **NaCl Spec-Graph Framework** (автор `ITSalt`) и нажмите на
   ней кнопку **`+`**, чтобы установить.

Если на шаге 6 появляется **«Failed to add marketplace»**, с репозиторием всё в
порядке — это известное ограничение десктоп-клиента. См.
[Устранение неполадок](#устранение-неполадок-failed-to-add-marketplace) ниже и
воспользуйтесь Вариантом B.

**Вариант B — slash-команды**

Внутри Claude Code Desktop выполните:

```text
/plugin marketplace add ITSalt/NaCl
/plugin install nacl@nacl
```

Любой из вариантов установит 53 из 59 скиллов как slash-команды `/nacl:<name>` и
7 профилей агентов как `@nacl:<name>`. `nacl-goal` исключён (он оборачивает
CLI-only команду `/goal`, которую Desktop не может запустить); `nacl-postmortem`
и три скилла `nacl-migrate*` исключены как редкие/требующие checkout
репозитория; `nacl-core` исключён как shared-библиотека, поставляемая целиком в
корне плагина, а не как вызываемый скилл (всего 6 исключений: 59 − 6 = 53).
MCP-сервер neo4j по-прежнему настраивается на проект командой `/nacl:init`, а
не плагином. См. [Настройку графа](graph-setup.ru.md) — там описана
специфика графовой инфраструктуры для Desktop (определение Docker Desktop,
автозапуск sidecar, закреплённый бинарник `neo4j-mcp`, liveness-проба
`graph-doctor`).

Для обновления плагина используйте встроенный механизм обновления плагинов
Claude Code Desktop; отдельного скрипта NaCl для этого канала нет.

#### Устранение неполадок: «Failed to add marketplace»

Если шаг GUI **Add marketplace → Sync** падает с голым
**«Failed to add marketplace»** (в логе клиента при этом
`MARKETPLACE_ERROR:UNKNOWN` и `Unrecognized git clone error output`),
репозиторий NaCl и его `marketplace.json` ни при чём — это ограничение
десктоп-клиента Claude.

Под капотом GUI вызывает встроенный `claude`-CLI, чтобы выполнить `git clone`
репозитория маркетплейса, и убивает этот clone примерно через 60 секунд. Когда
clone уходит в SSH (CLI предпочитает SSH для формы `owner/repo`), а у
неинтерактивного процесса десктопа нет доступного ssh-agent или записи в
`known_hosts`, clone зависает на промпте host-key или учётных данных и убивается
по таймауту. Клиент не может распарсить оборванный вывод и показывает общую
ошибку — хотя тот же clone из обычного терминала завершается за секунды.

Обходной путь — выполните те же две команды из обычного терминала, где SSH
полностью настроен, а таймаут clone составляет 120 секунд:

```text
claude plugin marketplace add ITSalt/NaCl
claude plugin install nacl@nacl
```

Затем перезапустите Claude Code Desktop — установленный плагин `nacl@nacl`
подхватится автоматически. Это собственные команды канала плагинов Desktop (они
обновляют список маркетплейсов и `enabledPlugins`), а не канал симлинков —
поэтому такой обходной путь не создаёт двойную установку.

### Claude Code CLI (симлинки на скиллы)

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

Clone https://github.com/ITSalt/NaCl.git into $HOME/NaCl if it is not already present. If it is present, run git pull --ff-only there. Then run the Codex installer from $HOME/NaCl/skills-for-codex/scripts and verify that $HOME/.agents/skills contains 60 NaCl skill links (skills-for-codex/ ships 60 SKILL.md directories, including nacl-tl-core, which is not among the 59 root skills) and that each linked directory has SKILL.md. Use network or escalated permission if needed.
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
