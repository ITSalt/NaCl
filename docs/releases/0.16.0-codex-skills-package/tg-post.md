**NaCl 0.16.0 released — Codex skills package**

This release turns the Codex adaptation from a five-skill pilot into a complete
installable package.

What changed:

— `skills-for-codex/` now contains 57 installable `SKILL.md` files: 14 BA, 10
SA, 26 TL, 4 utilities, and 3 migration skills.

— The user-level installer now discovers every `skills-for-codex/*/SKILL.md`
directory and links it into `$HOME/.agents/skills/`. It remains safe by
default: correct links are left alone, conflicts are reported as `BLOCKED`.

— Codex docs now describe the completed package instead of the five-skill
pilot. README, skills reference, methodology, setup, and install docs were
updated to the 57-skill inventory.

— Codex installation uses symlinks to a normal git checkout of the repository.
Updates are ordinary `git pull`, not archive downloads.

Fresh Codex install on macOS/Linux:

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

Full release notes: docs/releases/0.16.0-codex-skills-package/release-notes.md
