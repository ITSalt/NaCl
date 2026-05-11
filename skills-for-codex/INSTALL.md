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

The user-level install must contain one symlink for every
`skills-for-codex/*/SKILL.md` directory. At this release, that is 57 skill
links.

Mapping pattern:

```text
$HOME/.agents/skills/<skill> -> <repo>/skills-for-codex/<skill>
```

## Install

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
