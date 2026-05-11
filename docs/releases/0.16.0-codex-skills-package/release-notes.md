# NaCl 0.16.0 — Codex Skills Package

This release packages the Codex adaptation of NaCl as a complete installable
skill set.

The earlier Codex work was intentionally a small pilot: five skills, three
shared references, and a symlink installer that linked only the pilot list.
The repository now contains the full migrated package under
`skills-for-codex/`: 57 installable `SKILL.md` files covering the BA, SA, TL,
utility, and migration layers.

Codex installation uses symlinks to a normal git checkout of this repository,
so future skill updates arrive through `git pull`.

---

## What Changed

### Full Codex skill package

- Added 52 additional Codex skill adaptations, bringing the package to 57
  installable skills.
- Preserved the root-level `nacl-*` directories as the Claude-oriented source
  skills.
- Kept Codex-specific behavior explicit: frontmatter contains only `name` and
  `description`; Claude model routing and Task-agent mechanics are removed;
  NaCl methodology, graph boundaries, verification vocabulary, and handoff
  gates are preserved.

### Installation

- `skills-for-codex/scripts/install-user-symlinks.sh` now discovers every
  `skills-for-codex/*/SKILL.md` directory automatically.
- User-level install target remains `$HOME/.agents/skills/`.
- Existing correct symlinks are left unchanged.
- Existing paths that are not the correct symlink still block safely instead
  of being overwritten.

### Documentation

- `skills-for-codex/README.md` now describes the completed package instead of
  the five-skill pilot.
- `skills-for-codex/INSTALL.md` documents all-skill discovery, verification,
  and uninstall commands.
- `skills-for-codex/MIGRATION.md` records the completed full migration status.
- README, skills reference, methodology, agent, and setup docs now report the
  current 57-skill inventory.

---

## Skill Inventory

- 14 business-analysis skills: `nacl-ba-*`
- 10 system-analysis skills: `nacl-sa-*`
- 26 TeamLead lifecycle skills: `nacl-tl-*`
- 4 utilities: `nacl-core`, `nacl-init`, `nacl-render`, `nacl-publish`
- 3 migration skills: `nacl-migrate`, `nacl-migrate-ba`, `nacl-migrate-sa`

Total: 57 installable Codex skills.

---

## Upgrade Notes

### Fresh Codex Install

Use this path on a machine where the NaCl repository is not cloned. The
canonical skill source is the git checkout; do not install Codex skills from a
copied archive.

macOS:

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

Linux:

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

Windows WSL2: run the Linux command inside WSL2.

Windows PowerShell:

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

### Existing Repository Checkout

Run the installer from the repository root:

```sh
sh skills-for-codex/scripts/install-user-symlinks.sh
```

The installer links every skill directory into `$HOME/.agents/skills/`. If a
destination path already exists and is not the expected symlink, the installer
prints `BLOCKED` and exits non-zero so the operator can inspect the conflict.

### Update Codex Skills

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

---

## Verification

- Counted 57 `skills-for-codex/*/SKILL.md` files.
- Updated the installer to derive the install set from those files.
- Verified release docs and package metadata are prepared in the existing
  `docs/releases/<version>-<slug>/` convention.
- Verified the Codex installer creates user-level symlinks to the repository
  checkout, preserving `git pull` as the update mechanism.
