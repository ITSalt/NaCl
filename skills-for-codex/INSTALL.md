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

## Symlink Mappings

The user-level install must contain these mappings:

| User-level link | Canonical source |
|---|---|
| `$HOME/.agents/skills/nacl-core` | `skills-for-codex/nacl-core` |
| `$HOME/.agents/skills/nacl-ba-context` | `skills-for-codex/nacl-ba-context` |
| `$HOME/.agents/skills/nacl-sa-domain` | `skills-for-codex/nacl-sa-domain` |
| `$HOME/.agents/skills/nacl-tl-dev-be` | `skills-for-codex/nacl-tl-dev-be` |
| `$HOME/.agents/skills/nacl-tl-conductor` | `skills-for-codex/nacl-tl-conductor` |

## Install

From anywhere in the repository, run:

```sh
sh skills-for-codex/scripts/install-user-symlinks.sh
```

The installer is safe by default. It creates missing symlinks, leaves existing
correct symlinks unchanged, and prints `BLOCKED` without overwriting any existing
path that is not the correct symlink.

## Verify

Check each installed skill link:

```sh
readlink "$HOME/.agents/skills/<skill>"
test -f "$HOME/.agents/skills/<skill>/SKILL.md"
```

Replace `<skill>` with each pilot skill name:

```text
nacl-core
nacl-ba-context
nacl-sa-domain
nacl-tl-dev-be
nacl-tl-conductor
```

Verify Codex discovery and read-only invocation:

```sh
codex debug prompt-input 'List available skills only.'
codex debug prompt-input 'Use /nacl-core to explain NaCl verification vocabulary.'
```

## Uninstall

Remove only the five user-level symlinks:

```sh
rm "$HOME/.agents/skills/nacl-core"
rm "$HOME/.agents/skills/nacl-ba-context"
rm "$HOME/.agents/skills/nacl-sa-domain"
rm "$HOME/.agents/skills/nacl-tl-dev-be"
rm "$HOME/.agents/skills/nacl-tl-conductor"
```

These commands remove the user-level links only. They do not remove canonical
skills under `skills-for-codex/`.
