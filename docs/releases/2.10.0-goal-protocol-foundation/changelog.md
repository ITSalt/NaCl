# Changelog — 2.10.0 goal-protocol-foundation

## Added

- `nacl-goal/SKILL.md` — new skill definition for `/nacl-goal` wrapper
- `nacl-goal/aliases.md` — alias catalog with contracts for `wave`, `fix`, `validate`, `reopened-drain`, and `custom`
- `nacl-goal/checks/wave.sh` — proof check script for `wave:<N>` alias (Tier M)
- `nacl-goal/checks/fix.sh` — proof check script for `fix:<BUG-NNN>` alias (Tier S)
- `nacl-goal/checks/validate.sh` — proof check script for `validate:module:<MOD-ID>` alias (Tier S)
- `nacl-goal/checks/reopened-drain.sh` — proof check script for `reopened-drain` alias (Tier M)
- `nacl-goal/refusal-catalog.md` — ten structured refusal codes with fallback paths
- `nacl-goal/gate-fire-detector.md` — stub (populated in 2.10.1)
- `nacl-goal/pricing.json` — v0 rate table for Opus 4.7 and Haiku 4.5
- `docs/guides/goal-command.md` — overview, when to use, examples (~200 lines)
- `docs/guides/goal-proof-protocol.md` — GOAL_PROOF wire format, schema, and worked examples (~100 lines)
- `docs/guides/goal-run-schema.md` — run-file YAML schema reference (~50 lines)
- `docs/guides/goal-permissions.md` — denylist, per-alias allowlist, and operating modes (~80 lines)
- `docs/releases/2.10.0-goal-protocol-foundation/` — release bundle (release-notes.md, changelog.md, tg-post.md)

## Changed

- `nacl-tl-full/SKILL.md` — added `## Use with /goal` section
- `nacl-tl-conductor/SKILL.md` — added `## Use with /goal` section
- `nacl-tl-reopened/SKILL.md` — added `## Use with /goal` section
- `nacl-sa-validate/SKILL.md` — added `## Use with /goal` section
- `nacl-tl-fix/SKILL.md` — added `## Use with /goal` section
- `nacl-tl-stubs/SKILL.md` — added `## Use with /goal` section
- `nacl-migrate/SKILL.md` — added `## Use with /goal` section
- `nacl-ba-full/SKILL.md` — added `## NOT for /goal` section
- `nacl-sa-full/SKILL.md` — added `## NOT for /goal` section
- `nacl-tl-hotfix/SKILL.md` — added `## NOT for /goal` section
- `nacl-init/` CLAUDE.md template — new `## /goal command — local rules` block
- `docs/skills-reference.md` and `docs/skills-reference.ru.md` — `/nacl-goal` entry added
- `docs/skills-guide.md` and `docs/skills-guide.ru.md` — goal-driven workflows pointer added
- `docs/workflows.md` and `docs/workflows.ru.md` — new "Goal-driven workflow" section
- `README.md` — 2.10.0 mention in recent releases
- `CHANGELOG.md` — 2.10.0 entry prepended

## Documentation

- `docs/guides/` directory created (new)
- Four new guide files covering the `/nacl-goal` command, GOAL_PROOF protocol, run-file schema, and permissions

## Notes

The two-release split is intentional and audit-driven. The `/goal` evaluator (Haiku 4.5) is transcript-only — it cannot run Cypher, read files, or inspect graph state. Safety rails and the GOAL_PROOF wire format ship first so operators understand the constraints before autonomous loops are enabled. Autonomous execution (`--start` fully enabled, `.tl/goal-runs/` writes enforced, concurrent lock, crash/resume, runtime gate detector) arrives in 2.10.1 once the protocol contract is in place in every downstream skill.
