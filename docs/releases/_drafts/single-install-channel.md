# Draft: switching Claude Code channels without duplicates

### Added
- `scripts/uninstall-claude-code-skills.sh` / `.ps1`: removes the symlink
  install (`~/.claude/skills/nacl-*`, `~/.claude/agents/*.md`), deleting only
  links that point into the NaCl checkout, stale ones included. Real
  directories, files, and foreign links are kept. `--dry-run` / `-DryRun`
  previews. Covered by `scripts/uninstall-claude-code-skills.test.sh`
  (install → dry-run → uninstall → reinstall round-trip in a throwaway HOME).

### Docs
- `docs/setup/install-skills.md` (+ru): new "Switch channels" section,
  covering both directions (keep the plugin / keep the symlinks) and what
  `NACL_ALLOW_DUAL=1` really does: it silences the warning, but every skill
  and agent still loads twice.
- `docs/skills-guide.md` (+ru): new "Duplicate skills" section. The plugin's
  coexistence hook already pointed to this file, but it had no removal
  instructions.
