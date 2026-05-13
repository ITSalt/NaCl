# NaCl Skills For Codex

This folder contains the Codex adaptation of the NaCl skill set. The root-level
`nacl-*` folders remain the Claude-oriented source skills and must not be
modified by this migration.

## Principle

Codex adaptation preserves NaCl methodology, not Claude execution mechanics.
The goal is to keep graph-first analysis, BA/SA/TL layer boundaries, contracts,
TDD discipline, orchestration contracts and gates, and honest verification while
removing Claude-specific model routing and Task-agent assumptions.

## Scope

The current Codex package contains all 58 migrated `SKILL.md` files:

- `nacl-core`, `nacl-init`, `nacl-render`, `nacl-publish`
- `nacl-tl-core` shared TL references
- 14 `nacl-ba-*` business-analysis skills
- 10 `nacl-sa-*` system-analysis skills
- 26 `nacl-tl-*` TeamLead lifecycle skills
- `nacl-migrate`, `nacl-migrate-ba`, `nacl-migrate-sa`

No placeholder directories are created. Every installable skill directory must
contain a `SKILL.md` file.

## Installation

The verified installation strategy is user-level symlinks from
`$HOME/.agents/skills/` to the canonical skills under `skills-for-codex/`.
Repo-local `.agents/skills/` wrappers are intentionally not used for this
project. The installer discovers every `skills-for-codex/*/SKILL.md` directory
and links it.

For a fresh machine, clone the repository and install symlinks to that checkout:

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

See `INSTALL.md` for macOS, Linux, Windows WSL2, Windows PowerShell,
verification commands, and uninstall instructions.

## References

The Codex package includes three shared reference files:

- `references/migration-rules.md`
- `references/orchestration-model.md`
- `references/verification-vocabulary.md`

Additional shared references, scripts, or assets should be added only when they
remove real duplication across migrated skills.
