[Главная](../../README.ru.md) > [Быстрый старт](../quickstart.ru.md) > Установка скиллов

:gb: [English version](install-skills.md)

# Установка скиллов

NaCl можно использовать из Claude Code и из Codex. Установите пакет скиллов,
который соответствует агентской среде на этой машине.

| Среда | Куда устанавливается | Пакет |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Корневые `nacl-*` скиллы из репозитория |
| Codex | `$HOME/.agents/skills/` | `skills-for-codex/` из GitHub Release |

Установка выполняется один раз на уровне пользователя. После этого скиллы
доступны во всех проектах, которые открывает эта среда на той же машине.

## Claude Code

Claude Code использует корневые папки скиллов NaCl и профили агентов из
`.claude/agents/`.

### macOS / Linux / WSL2

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"

mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents"

for dir in "$HOME"/NaCl/*/; do
  [ -f "$dir/SKILL.md" ] && ln -sf "$dir" "$HOME/.claude/skills/$(basename "$dir")"
done

for file in "$HOME"/NaCl/.claude/agents/*.md; do
  [ -f "$file" ] && ln -sf "$file" "$HOME/.claude/agents/$(basename "$file")"
done
```

### Windows PowerShell

Запустите PowerShell от имени администратора или включите Developer Mode для
создания симлинков.

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"

$skillsDir = "$env:USERPROFILE\.claude\skills"
$agentsDir = "$env:USERPROFILE\.claude\agents"
New-Item -ItemType Directory -Force -Path $skillsDir, $agentsDir | Out-Null

Get-ChildItem -Path "$HOME\NaCl" -Directory | ForEach-Object {
    if (Test-Path "$($_.FullName)\SKILL.md") {
        $target = Join-Path $skillsDir $_.Name
        if (Test-Path $target) { Remove-Item $target -Force -Recurse }
        New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
    }
}

Get-ChildItem -Path "$HOME\NaCl\.claude\agents" -Filter "*.md" | ForEach-Object {
    $target = Join-Path $agentsDir $_.Name
    if (Test-Path $target) { Remove-Item $target -Force }
    New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
}
```

### Проверка Claude Code

```sh
ls "$HOME/.claude/skills" | wc -l
```

Откройте Claude Code в проекте и выполните:

```text
/nacl-init --dry-run
```

## Codex

Codex использует адаптированный пакет из GitHub Release. Для установки на
чистой машине не нужно клонировать репозиторий.

### macOS

```sh
mkdir -p "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
curl -L https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz -o /tmp/nacl-codex-skills-v0.16.0.tar.gz &&
tar -xzf /tmp/nacl-codex-skills-v0.16.0.tar.gz -C "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
sh "$HOME/.agents/nacl-codex-skills/v0.16.0/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Linux

Если в дистрибутиве нет `curl` или `tar`, установите их пакетным менеджером.

```sh
mkdir -p "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
curl -L https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz -o /tmp/nacl-codex-skills-v0.16.0.tar.gz &&
tar -xzf /tmp/nacl-codex-skills-v0.16.0.tar.gz -C "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
sh "$HOME/.agents/nacl-codex-skills/v0.16.0/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Windows WSL2

Выполните Linux-команду внутри WSL2. Скиллы будут установлены в
`$HOME/.agents/skills/` пользователя WSL.

### Windows PowerShell

Запустите PowerShell от имени администратора или включите Developer Mode для
создания симлинков.

```powershell
$version = "v0.16.0"
$base = Join-Path $HOME ".agents\nacl-codex-skills\$version"
$archive = Join-Path $env:TEMP "nacl-codex-skills-$version.tar.gz"
$url = "https://github.com/ITSalt/NaCl/releases/download/$version/nacl-codex-skills-$version.tar.gz"

New-Item -ItemType Directory -Force -Path $base | Out-Null
Invoke-WebRequest -Uri $url -OutFile $archive
tar.exe -xzf $archive -C $base
& "$base\skills-for-codex\scripts\install-user-symlinks.ps1"
```

### Команда для Codex

Если Codex запущен на машине, где NaCl еще не установлен, отправьте ему такой
запрос:

```text
Install NaCl Codex skills globally on this machine.

Download https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz, extract it to $HOME/.agents/nacl-codex-skills/v0.16.0, run the installer from skills-for-codex/scripts, and verify that $HOME/.agents/skills contains 57 NaCl skill symlinks and that each linked directory has SKILL.md. Use network or escalated permission if needed.
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

## Обновление Codex-скиллов

Повторите команду установки для новой версии релиза. Корректные существующие
симлинки останутся на месте; конфликты будут показаны как `BLOCKED`.
