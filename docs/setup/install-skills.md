[Home](../../README.md) > [Quick Start](../quickstart.md) > Skill Installation

:ru: [Русская версия](install-skills.ru.md)

# Skill Installation

NaCl can be used from Claude Code and from Codex. Install the skill package that
matches the agent runtime you use on this machine.

| Runtime | Install location | Package |
|---|---|---|
| Claude Code | `~/.claude/skills/` | Root-level `nacl-*` skills from this repository |
| Codex | `$HOME/.agents/skills/` | `skills-for-codex/` from this repository |

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

The installer creates directory symlinks when Windows allows it. If symlink
creation is unavailable, it falls back to directory junctions.

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

Codex uses the `skills-for-codex/` package from a normal git checkout. Do not
install Codex skills from copied archives: links must point to the repository so
`git pull` updates the skills for every project on the machine.

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

Run the Linux command inside WSL2. The install target is the WSL user's
`$HOME/.agents/skills/`.

### Windows PowerShell

The installer creates directory symlinks when Windows allows it. If symlink
creation is unavailable, it falls back to directory junctions.

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

### Ask Codex To Install NaCl Skills

If Codex is running on a machine where NaCl is not installed, send this prompt:

```text
Install NaCl Codex skills globally on this machine.

Clone https://github.com/ITSalt/NaCl.git into $HOME/NaCl if it is not already present. If it is present, run git pull --ff-only there. Then run the Codex installer from $HOME/NaCl/skills-for-codex/scripts and verify that $HOME/.agents/skills contains 58 NaCl skill links and that each linked directory has SKILL.md. Use network or escalated permission if needed.
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

## Update Claude Code Skills

After pulling new commits, existing skills update instantly because the install
is a set of symlinks into the repository checkout. New skill directories,
however, are **not** linked automatically — re-run the installer to add them.

### macOS / Linux / WSL2

```sh
cd "$HOME/NaCl"
git pull --ff-only

for dir in "$HOME"/NaCl/*/; do
  [ -f "$dir/SKILL.md" ] && ln -sf "$dir" "$HOME/.claude/skills/$(basename "$dir")"
done
```

### Windows PowerShell

Run as Administrator (or with Developer Mode enabled):

```powershell
cd $HOME\NaCl
git pull --ff-only

$skillsDir = "$env:USERPROFILE\.claude\skills"
Get-ChildItem -Path "$HOME\NaCl" -Directory | ForEach-Object {
    if (Test-Path "$($_.FullName)\SKILL.md") {
        $target = Join-Path $skillsDir $_.Name
        if (Test-Path $target) { Remove-Item $target -Force -Recurse }
        New-Item -ItemType SymbolicLink -Path $target -Target $_.FullName | Out-Null
    }
}
```

Both snippets are idempotent: existing symlinks are recreated to the same
target; new skill directories with `SKILL.md` get fresh symlinks. After the
loop, verify the count matches the number of root-level `nacl-*` directories
in the repository:

```sh
ls "$HOME/.claude/skills" | wc -l
```

## Update Codex Skills

Update the repository checkout:

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

The skill links continue to point to the same checkout, so existing skills update
as soon as `git pull` completes. Re-running the installer is only needed to add
new skill directories or repair missing links.
