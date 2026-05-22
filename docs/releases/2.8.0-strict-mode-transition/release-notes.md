# NaCl 2.8.0 — Strict-Mode Transition

NaCl's skill chain transitions from **evidence-descriptive** to **evidence-blocking** gates. Missing evidence — a `BLOCKED` task, an `UNVERIFIED` sub-skill, an unanswered external-contract gap, a stale graph — now halts the chain instead of being explained away. The only sanctioned overrides are signed exceptions and one-shot emergency mode.

This is a major version bump because the closure semantics of the chain change. Pre-2.0 projects that relied on quiet downgrades will hit blocking gates immediately after upgrading. See *Migration guidance* below for the closure runbook.

---

## Breaking changes

- **`gate_mode: strict` is the default.** Projects no longer auto-pass on missing artifacts. `lenient` remains expressible in `config.yaml` for opt-out, but is intended for the migration window only and is itself audited.
- **Eight skip flags removed.** `--skip-merge`, `--skip-verify`, `--skip-deploy`, `--skip-qa`, `--skip-deliver`, `--skip-plan`, `--no-test`, and `--force` no longer parse. Calls that pass them fail with an explicit refusal naming the replaced gate path (signed exception or emergency mode).
- **`--skip-e2e` preserved with explicit scope.** This is the only retained skip flag. Its scope is documented in `nacl-tl-qa/SKILL.md` and it requires a written rationale captured in the task chat — it does not silence the QA gate, only the E2E surface.
- **Forbidden terminal success states enforced.** Closure skills (`nacl-tl-release`, `nacl-tl-conductor`, `nacl-tl-deliver`) refuse to declare success on any task with terminal state in `{UNVERIFIED, BLOCKED, FAILED, NOT_RUN}`. The pre-2.8 behavior of "PASS with footer" is gone.
- **`.cypher` graph exports are no longer accepted as graph source of truth.** The chain queries live Neo4j. If the runtime container is unreachable, the relevant skill BLOCKs instead of falling back to a stale `.cypher` snapshot.

---

## New artifact contracts

- **`.tl/exceptions/`** — signed, scoped, expiring exception records. Schema in `.tl/exceptions/_template.yaml`. Every override of a strict-mode gate must reference exactly one exception ID. Expired exceptions stop overriding (the gate fires again).
- **`.tl/emergencies/`** — one-shot emergency-mode records. Schema in `.tl/emergencies/_template.yaml`. Loud by design: an emergency record is paired with a follow-up wave-plan obligation and surfaces in conductor reports until cleared.
- **`.tl/reconciliation/`** — cross-artifact reconciliation snapshots emitted by `nacl-tl-conductor`'s Phase 4.5 P-S1..P-S5 pair-check. Schema in `.tl/reconciliation/_template.json`. Records the alignment between `status.json`, `conductor-state.json`, `changelog.md`, `release-status.json`, the graph, and the exception inventory at a given UTC instant.
- **`.tl/clean-checkout/`** — assets that must reside in a clean working tree for a release to proceed. Missing-asset detection now blocks before push.
- **`.tl/external-contracts/`** — per-provider and per-protocol contract files written by `nacl-sa-architect` during the External Contracts phase, consumed by `nacl-tl-plan`'s W6 missing-contract gate. Template at `.tl/external-contracts/_template.md`.

---

## New reference documentation

Five long-form references live under `nacl-tl-core/references/`. SKILL.md bodies remain operational; the references are where the rules are.

- **`strict-mode-changes.md`** — the stable changelog of what the W0–W11 reform changed. Lists the eleven skills modified, the artifacts produced, the forbidden terminal states, and the two sanctioned bypass paths.
- **`gate-fire-catalog.md`** — the canonical eleven gate-fires with their inputs, refusal text, and exception classes. The catalog `nacl-tl-conductor`'s Phase 4 quality gate, `nacl-tl-release`'s pre-merge query, and `nacl-tl-deliver`'s deploy preflight all read from.
- **`project-gap-closure.md`** — planning runbook for inspecting a pre-2.8 project against the strict-mode chain. Emits a GAP register and a wave plan that closes it. Planning-only by default; agents do not remediate from this runbook unless explicitly launched as remediation subagents.
- **`config-schema.md`** — the typed `config.yaml` schema including the strict-mode keys (`gate_mode`, `exception_inventory`, `external_contracts_dir`) and the constraints on each.
- **`emergency-mode.md`** — how to enter and exit emergency mode safely, what records must be filed, and what follow-up obligations attach automatically.

---

## Migration guidance

If you are upgrading an existing project from a pre-2.8 NaCl:

1. **Start at `nacl-tl-core/references/project-gap-closure.md`.** It is the entry point. The runbook walks an inspector agent through the ten canonical GAP categories.
2. **Expect immediate gate fires.** Projects that relied on quiet `UNVERIFIED` downgrades will see `BLOCKED` at the first conductor pass. This is correct behavior — the closure runbook tells you how to triage.
3. **File signed exceptions for known gaps that cannot be closed in the current wave.** Exceptions are scoped, expiring, and audited. They unblock progress without silencing the gate.
4. **Do not delete `.tl/` artifacts to "reset" the chain.** The conductor's reconciliation pass (Phase 4.5) treats missing-where-required as a P-S* failure, which is itself a gate fire.
5. **The strict-mode default applies on first run** of any 2.8 skill against an existing project. If you need a longer migration window, set `gate_mode: lenient` in `config.yaml` — but lenient mode is itself audited and emits a per-skill advisory.

---

## Acknowledgments

This release reflects findings from four postmortems and a twelve-wave plan that informed the design across the BA, SA, and TL layers. The skill chain's evidence vocabulary, exception schema, and emergency-mode contract draw on those reviews. The postmortems themselves are now part of the public `docs/retrospectives/` tree, sanitized for public distribution.

Specific design contributions that landed in 2.0.0:

- The closed evidence vocabulary (`VERIFIED / PARTIALLY_VERIFIED / BLOCKED / FAILED / NOT_RUN / UNVERIFIED`) is preserved from 0.18.0 and tightened into a blocking contract.
- The wire-evidence gate in `nacl-tl-sync` (W2) and the external-contract gate in `nacl-tl-plan` (W6) both surface from the same root cause analyzed across the postmortems: missing contracts produce mock-passing tests that mask provider drift.
- The graph-truth pre-merge query in `nacl-tl-release` and the cross-artifact reconciliation in `nacl-tl-conductor` Phase 4.5 both surface the same root cause: changelog and state files drift from the live graph between conductor and release calls.

---

## Repository hygiene

This release ships the public repo with all client project references, personal local paths, and operational deployment hostnames redacted. The `ITSalt` org name, the documented Neo4j ports (`3587` Bolt / `3574` HTTP), and the real public URLs (`github.com/ITSalt/NaCl`, `github.com/ITSalt/pinch`) are preserved.
