# Codex NaCl Skill Installation

## Locations

The canonical Codex skill source is this repository folder:

```sh
skills-for-codex/
```

The verified user-level Codex install location is:

```sh
$HOME/.agents/skills/
```

Use symlinks from `$HOME/.agents/skills/` to `skills-for-codex/` instead of
copies. Symlinks keep one canonical source of truth, avoid drift between the
repository and the user install, and make future skill updates visible to Codex
without copying files again.

Do not use repo-local `.agents/skills/` wrappers for this project.

## Fresh Install From GitHub Release

Use this path on a machine where the NaCl repository is not cloned.

### macOS / Linux

Linux requires `curl` and `tar`.

```sh
mkdir -p "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
curl -L https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz -o /tmp/nacl-codex-skills-v0.16.0.tar.gz &&
tar -xzf /tmp/nacl-codex-skills-v0.16.0.tar.gz -C "$HOME/.agents/nacl-codex-skills/v0.16.0" &&
sh "$HOME/.agents/nacl-codex-skills/v0.16.0/skills-for-codex/scripts/install-user-symlinks.sh"
```

### Windows WSL2

Run the macOS / Linux command inside WSL2. The install target is the WSL user's
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

## Ask Codex To Install

Send this prompt to Codex on a machine where NaCl is not installed:

```text
Install NaCl Codex skills globally on this machine.

Download https://github.com/ITSalt/NaCl/releases/download/v0.16.0/nacl-codex-skills-v0.16.0.tar.gz, extract it to $HOME/.agents/nacl-codex-skills/v0.16.0, run the installer from skills-for-codex/scripts, and verify that $HOME/.agents/skills contains 57 NaCl skill symlinks and that each linked directory has SKILL.md. Use network or escalated permission if needed.
```

## Symlink Mappings

The user-level install must contain one symlink for every
`skills-for-codex/*/SKILL.md` directory. At this release, that is 57 skill
links.

Mapping pattern:

```text
$HOME/.agents/skills/<skill> -> <repo>/skills-for-codex/<skill>
```

## Install From An Existing Repository Checkout

From anywhere in the repository, run:

```sh
sh skills-for-codex/scripts/install-user-symlinks.sh
```

The installer is safe by default. It discovers all skill directories, creates
missing symlinks, leaves existing correct symlinks unchanged, and prints
`BLOCKED` without overwriting any existing path that is not the correct symlink.

## Verify

Check the installed skill links:

```sh
find skills-for-codex -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed 's#^skills-for-codex/##; s#/SKILL.md$##' \
  | while read skill; do
      readlink "$HOME/.agents/skills/$skill"
      test -f "$HOME/.agents/skills/$skill/SKILL.md"
    done
```

Verify Codex discovery and read-only invocation:

```sh
codex debug prompt-input 'List available skills only.'
codex debug prompt-input 'Use /nacl-core to explain NaCl verification vocabulary.'
```

On Windows PowerShell:

```powershell
(Get-ChildItem "$HOME\.agents\skills" -Filter "nacl-*").Count
Test-Path "$HOME\.agents\skills\nacl-core\SKILL.md"
```

## Uninstall

Remove only the user-level symlinks created from this package:

```sh
find skills-for-codex -mindepth 2 -maxdepth 2 -name SKILL.md \
  | sed 's#^skills-for-codex/##; s#/SKILL.md$##' \
  | while read skill; do
      rm "$HOME/.agents/skills/$skill"
    done
```

These commands remove the user-level links only. They do not remove canonical
skills under `skills-for-codex/`.
