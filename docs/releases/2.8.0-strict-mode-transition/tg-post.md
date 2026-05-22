**NaCl 2.8.0 released — strict-mode transition**

The skill chain transitions from evidence-descriptive to evidence-blocking gates. Until 2.0, missing evidence — a BLOCKED task, an UNVERIFIED sub-skill, an unanswered external-contract gap, a stale graph — could be downgraded to "explained" and the chain would close PASS with a footer. From 2.8 forward, missing evidence halts the chain. The only sanctioned overrides are signed exceptions and one-shot emergency mode.

This is a major version bump because closure semantics change. Pre-2.0 projects that relied on quiet downgrades will hit blocking gates immediately. The migration runbook at `nacl-tl-core/references/project-gap-closure.md` is the entry point.

Breaking changes:

— **`gate_mode: strict` is the default.** `lenient` remains expressible in `config.yaml` for the migration window, but is itself audited.

— **Eight skip flags removed.** `--skip-merge`, `--skip-verify`, `--skip-deploy`, `--skip-qa`, `--skip-deliver`, `--skip-plan`, `--no-test`, `--force` — calls that pass them fail with an explicit refusal naming the replaced gate path. `--skip-e2e` is the only retained skip flag.

— **Forbidden terminal success states enforced.** Closure skills (`nacl-tl-release`, `nacl-tl-conductor`, `nacl-tl-deliver`) refuse to declare success on any task in {UNVERIFIED, BLOCKED, FAILED, NOT_RUN}. The "PASS with footer" pattern is gone.

— **`.cypher` exports are not graph source of truth.** The chain queries live Neo4j. Container unreachable → relevant skill BLOCKs.

New artifact contracts:

— **`.tl/exceptions/`** — signed, scoped, expiring overrides. Every strict-mode override references exactly one exception ID. Expired exceptions stop overriding.

— **`.tl/emergencies/`** — one-shot emergency records. Loud by design; paired with a follow-up wave-plan obligation.

— **`.tl/reconciliation/`** — `nacl-tl-conductor` Phase 4.5 cross-artifact alignment snapshots between `status.json`, `conductor-state.json`, `changelog.md`, `release-status.json`, the live graph, and the exception inventory.

— **`.tl/clean-checkout/`** — assets that must reside in a clean tree for a release to proceed.

— **`.tl/external-contracts/`** — per-provider/per-protocol contracts written by `nacl-sa-architect`, consumed by `nacl-tl-plan`'s W6 missing-contract gate.

New reference documentation under `nacl-tl-core/references/`:

— **`strict-mode-changes.md`** — stable changelog of what the W0–W11 reform changed.

— **`gate-fire-catalog.md`** — the canonical eleven gate-fires with inputs, refusal text, exception classes.

— **`project-gap-closure.md`** — planning runbook for inspecting a pre-2.8 project against the strict-mode chain. Emits a GAP register and a wave plan that closes it.

— **`config-schema.md`** — typed `config.yaml` schema including strict-mode keys.

— **`emergency-mode.md`** — how to enter and exit emergency mode safely, what records must be filed, what follow-up obligations attach.

Upgrade path: start at `nacl-tl-core/references/project-gap-closure.md`. Expect immediate gate fires on existing projects — that is correct behavior. File signed exceptions for gaps that cannot be closed in the current wave. Do not delete `.tl/` artifacts to "reset" the chain — the reconciliation pass treats missing-where-required as a gate fire.

The release reflects findings from four postmortems and a twelve-wave plan that informed the design across the BA, SA, and TL layers. The postmortems themselves are now part of the public `docs/retrospectives/` tree.
