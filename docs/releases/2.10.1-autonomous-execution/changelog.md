# Changelog — 2.10.1 autonomous-execution

## Added

- `nacl-goal/checks/stubs-cleanup.sh` — proof check script for `stubs-cleanup:<MOD-ID>` alias (Tier S)
- `nacl-goal/checks/migrate-canary.sh` — proof check script for `migrate-canary` alias (Tier L)
- `nacl-goal/checks/feature.sh` — proof check script for `feature:<FR-NNN>` alias (Tier L)
- `nacl-goal/checks/probe-stop-signals.sh` — stop-signal detector run each turn alongside the alias script
- `.tl/goal-runs/` — directory created on first `--start`; schema defined in `docs/guides/goal-run-schema.md`
- `nacl-goal/gate-fire-detector.md` — machine-detectable Tier-C gate signatures (stub in 2.10.0, populated here)
- `docs/releases/2.10.1-autonomous-execution/` — release bundle (release-notes.md, changelog.md, tg-post.md)

## Changed

- `nacl-goal/SKILL.md` — `--start` fully enabled for all tiers; Tier L/XL now show dollar-cost estimate
- `nacl-goal/aliases.md` — three new alias entries: `stubs-cleanup`, `migrate-canary`, `feature`
- `nacl-goal/pricing.json` — `last_updated` field refreshed; rates verified at release time

## Enabled

- `--start` flag — now issues real `/goal` for Tier S, M, L, XL (Tier XL carries unattended-overnight warning)
- `.tl/goal-runs/<run_id>.md` writes — enforced on every `--start`; built incrementally from GOAL_PROOF blocks
- Concurrent-execution lock — `goal_lock_by` / `goal_lock_until` on graph nodes; `REFUSE_CONCURRENT_GOAL_LOCKED` on collision
- Crash / resume — `/nacl-goal resume` and `/nacl-goal abort <run_id>`; stale `goal_in_progress` marker detected on session start
- Runtime gate detector — PostToolUse hook fires during `/nacl-goal` sessions; triggers `GOAL_BLOCKED` on Tier-C signature

## Notes

All v0 tier budget numbers (turns, wall-clock, observed token target) remain provisional. Real Tier S and Tier M acceptance runs on a fixture project were conducted before ship. Tier XL is not recommended for unattended overnight use until 2.10.2 calibration data is available. The `migrate-canary` alias still enforces the retrospective gate: any attempt to cross it returns `GOAL_BLOCKED` with reason `retrospective_gate_already_passed_use_interactive_skill`.
