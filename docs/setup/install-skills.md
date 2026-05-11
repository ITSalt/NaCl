[Home](../../README.md) > [Quick Start](../quickstart.md) > Skill Installation

:ru: [Русская версия](install-skills.ru.md)

# Skill Installation

NaCl can be used from Claude Code and from Codex. Install the skill package that
matches the agent runtime you use on this machine.

| Runtime | Install location | Package |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Root-level `nacl-*` skills from this repository |
| Codex | `$HOME/.agents/skills/` | `skills-for-codex/` from the GitHub release asset |

Install once at the user level. The skills are then available from every
project opened by that runtime on the same machine.

## Claude Code

Claude Code uses the root-level NaCl skill folders and the `.claude/agents/`
agent profiles.

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

Run PowerShell as Administrator, or enable Developer Mode for symlinks.

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

### Verify Claude Code

```sh
ls "$HOME/.claude/skills" | wc -l
```

Start Claude Code in a project and run:

```text
/nacl-init --dry-run
```

## Codex

Codex uses the Codex-adapted package from the GitHub release asset. A repository
clone is not required for a fresh-machine install.

### macOS

```sh
mkdir -p "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
curl -L https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz -o /tmp/nacl-codex-skills-v0.16.0.tar.gz &&
tar -xzf /tmp/nacl-codex-skills-v0.16.0.tar.gz -C "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
sh "$HOME/.agents/nacl-codex-skills/v0.16.0/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Linux

Install `curl` and `tar` if your distribution does not include them.

```sh
mkdir -p "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
curl -L https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz -o /tmp/nacl-codex-skills-v0.16.0.tar.gz &&
tar -xzf /tmp/nacl-codex-skills-v0.16.0.tar.gz -C "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
sh "$HOME/.agents/nacl-codex-skills/v0.16.0/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Windows WSL2

Run the Linux command inside WSL2. The install target is the WSL user's
`$HOME/.agents/skills/`.

### Windows PowerShell

Run PowerShell as Administrator, or enable Developer Mode for symlinks.

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

### Ask Codex To Install NaCl Skills

If Codex is running on a machine where NaCl is not installed, send this prompt:

```text
Install NaCl Codex skills globally on this machine.

Download https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz, extract it to $HOME/.agents/nacl-codex-skills/v0.16.0, run the installer from skills-for-codex/scripts, and verify that $HOME/.agents/skills contains 57 NaCl skill symlinks and that each linked directory has SKILL.md. Use network or escalated permission if needed.
```

### Verify Codex

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

## Update Codex Skills

Re-run the install command for the newer release version. Existing correct
symlinks are left unchanged; conflicts are reported as `BLOCKED`.
