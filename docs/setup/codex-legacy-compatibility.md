[Home](../../README.md) > [Codex plugin](install-codex-plugin.md) > Legacy compatibility

🇷🇺 [Русская версия](codex-legacy-compatibility.ru.md)

# Legacy Codex skill-link compatibility

This appendix is only for an existing Codex installation that used user-level NaCl skill links. New and ordinary Codex Desktop users should use the [plugin UI path](install-codex-plugin.md).

<!-- doc-key: scope -->
## Scope and safety boundary

Plugin mode and legacy skill-link mode must not coexist. The installation doctor reports `mode=both` as `FAILED`, and all project and graph workflows stop until one mode remains.

The bounded migration recognizes a fixed catalog of 60 legacy `nacl-*` links. It never deletes link targets, real files, real directories, unknown artifacts, project data, graph state, agent profiles, or Keychain state. Broken links, changed hashes, unsafe roots, and unknown `nacl-*` entries block automatic apply.

<!-- doc-key: detect -->
## Detect the current mode

After installing or enabling the plugin, fully restart Codex, create a new task, and send:

```text
Call nacl_installation_doctor exactly once with no arguments. Report status, mode, pluginVersion, and executionLocation. Stop if mode is not plugin-only.
```

- `plugin-only` with `VERIFIED` needs no legacy migration.
- `both` requires the bounded plan below; do not run workflows.
- `legacy-only` means the plugin is not active; use either that compatibility mode or switch deliberately to the plugin.
- `invalid-legacy-artifacts` requires manual inspection of only the listed entries.

<!-- doc-key: migrate-plan -->
## Plan migration to plugin-only

Ask Codex:

```text
Run nacl_legacy_symlinks_plan only. Show every recognized entry, its target, parity class, blockers, accepted and missing counts against the fixed 60-name catalog, planToken, and returned confirmation. Do not apply.
```

Review every entry. Apply is allowed only when the plan is current, has no blocker, and recognizes only symlinks from the fixed catalog. A real file, directory, broken link, unknown artifact, target mismatch, or hash drift remains `BLOCKED`; do not rename or delete it automatically.

<!-- doc-key: migrate-apply -->
## Apply only the returned plan

If and only if the plan is `VERIFIED` and ready, authorize Codex with:

```text
Apply the latest verified legacy symlink removal plan once. Use the returned planToken value as plan_token and the returned confirmation value as confirmation; do not construct, shorten, substitute, or reuse either value. Show the receipt and read-back, then call nacl_installation_doctor again.
```

The expected final evidence is a verified receipt followed by `VERIFIED/plugin-only` in a fresh doctor read-back. If apply is `PARTIALLY_VERIFIED`, preserve the returned quarantine and receipt exactly, stop all workflows, and obtain recovery guidance. Never blind-retry with an old plan.

<!-- doc-key: migration-rollback -->
## Migration rollback and recovery

The apply operation quarantines validated links before completing removal and returns recovery evidence. Rollback must use that exact receipt and quarantine state; there is no safe generic restore command. If the result is not fully verified, do not reinstall, move, delete, or overwrite anything until the maintainer has reviewed the receipt.

To return deliberately from a healthy plugin-only setup to legacy mode, first uninstall the NaCl plugin from its card and fully restart. Only then use the compatibility installer below. Run the doctor in a new task and require `VERIFIED/legacy-only`. Never reinstall legacy links while the plugin is active.

<!-- doc-key: legacy-install -->
## Install legacy links only when required

These commands are compatibility-only. They are not part of the ordinary plugin journey.

**macOS, Linux, or WSL2:**

```sh
git clone https://github.com/ITSalt/NaCl.git "$HOME/NaCl"
sh "$HOME/NaCl/skills-for-codex/scripts/install-user-symlinks.sh"
```

If the trusted checkout already exists, update it before running the installer:

```sh
cd "$HOME/NaCl"
git pull --ff-only
sh skills-for-codex/scripts/install-user-symlinks.sh
```

**Windows PowerShell:**

```powershell
git clone https://github.com/ITSalt/NaCl.git "$HOME\NaCl"
& "$HOME\NaCl\skills-for-codex\scripts\install-user-symlinks.ps1"
```

Windows may require Developer Mode or elevated rights for directory links; the installer can use directory junctions where supported.

<!-- doc-key: legacy-update -->
## Update or remove legacy links

Update the trusted checkout and rerun the same legacy installer to add new names or repair missing recognized links. Verify that each installed `nacl-*` entry resolves to a directory with a readable `SKILL.md` whose frontmatter name matches the entry.

For removal during plugin migration, use only `nacl_legacy_symlinks_plan` and `nacl_legacy_symlinks_apply`. Do not use broad deletion commands against `$HOME/.agents/skills`; that directory may contain unrelated user skills.

<!-- doc-key: persistence -->
## Preserved data

Migration changes only validated user-level symlink entries. Their source targets remain untouched. Project files, graph registry and audit state, Docker volumes and backups, Keychain items, and optional `.codex/agents/` profiles remain untouched. Uninstalling the plugin also preserves those assets.

<!-- doc-key: support -->
## Support evidence

Collect the doctor `status` and `mode`, the complete plan summary and blockers, accepted/missing/unknown counts, the plan receipt, and the final doctor read-back. For a partial apply, preserve the reported quarantine location but redact personal path segments before sharing it.

Never share credentials, Keychain values, project contents, link-target contents, or broad home-directory listings.
