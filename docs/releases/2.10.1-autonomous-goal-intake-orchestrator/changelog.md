# Changelog — 2.10.1 autonomous-goal-intake-orchestrator

## Added

### New `intake` alias and orchestration contracts

- `nacl-goal/checks/intake.sh` — observer check script; arg schema `--run-id <id>`; reads only run artifacts + git + gh + curl; always exits 0; emits sentinel-delimited GOAL_PROOF block
- `nacl-goal/envelope.md` — closed default safe-exception envelope (2 auto-enabled gates: `spec-first-prerequisite`, `spec-gap-routing`); hard-refuse list; YAML template with `sanitized_preview`; lifecycle; namespace `.tl/exceptions/goal-runs/<run_id>/`
- `nacl-goal/plan-lock-schema.md` — all 13 intake artifact schemas (index.json, request.json, intake.json, plan.lock.json, authorization.json, budget.json, atoms/state.json, pr.json, goal-final-sha.txt, pr-body.md, progress.jsonl, exceptions.log, regression-baseline.json / regression-postfix.json); flock + atomic-rename protocol; atom-ID invariant; closed `hard_refuse_triggers` set
- `nacl-goal/run-artifacts.md` — directory contract, exact-normalized fingerprint algorithm, re-invocation rules with resumable state table, `--new-run` caveats
- `nacl-goal/gate-prediction.md` — deterministic `(skill_path, risk/evidence) → predicted gates` table; uncertain predictions block conservatively
- `nacl-goal/retry-policy.md` — transient (gh API, CI watch, staging 5xx, curl) vs deterministic (test failures, auth, drift, mismatch, regressions, hard-refuse) classification; 3× backoff at 5s / 15s / 45s
- `nacl-goal/regression-schema.md` — shared baseline/postfix JSON schema; per-runner test-ID extractor table (pytest nodeid, jest / vitest file + full name, go pkg + test, unknown → best-effort)
- `nacl-goal/pr-body-template.md` — goal-run PR body template rendered from `plan.lock.json`; footer invariant for traceability
- `docs/releases/2.10.1-autonomous-goal-intake-orchestrator/` — release bundle (release-notes.md, changelog.md, tg-post.md)

### New flags on inner skills

- `nacl-tl-fix --auto-ship` already existed in 2.10.0; in 2.10.1 it additionally honors `NACL_GOAL_*` env vars (see §Env-var integration below)
- `nacl-tl-dev --auto-ship` — new flag for parity with `nacl-tl-fix --auto-ship`
- `nacl-tl-dev-be --auto-ship` — new flag (skill also got a new `## Flags` table; the existing `## --continue Flag` H2 stays)
- `nacl-tl-dev-fe --auto-ship` — new flag
- `nacl-tl-intake --emit-state <path>` — new flag; writes deterministic routing table as JSON per `plan-lock-schema.md §intake.json`
- `nacl-sa-feature --bounded-only` — new mode; refuses to draft spec that exceeds bounded execution envelope; emits planning artifacts on refuse

### New refusal codes in `nacl-goal/refusal-catalog.md`

Scoped to the `intake` alias; the existing 10 `REFUSE_*` codes for the four 2.10.0 aliases are unchanged.

Pre-`/goal` (`PLAN_BLOCKED_*`):
- `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED`
- `PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION`
- `PLAN_BLOCKED_DIRTY_WORKTREE`
- `PLAN_BLOCKED_BASELINE_RED`
- `PLAN_BLOCKED_BASELINE_COMMAND_MISSING`
- `PLAN_BLOCKED_GH_AUTH_OR_CI_PERMISSION_MISSING`
- `PLAN_BLOCKED_STAGING_REQUIRED_BUT_MISSING`
- `PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION`
- `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`
- `PLAN_BLOCKED_ATOM_DEPENDENCY_CYCLE`
- `PLAN_BLOCKED_FEATURE_REQUIRES_SCHEMA_MIGRATION`
- `PLAN_BLOCKED_FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE`
- `PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION`
- `PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION`
- `PLAN_BLOCKED_DUPLICATE_GOAL_USE_NEW_RUN`
- `PLAN_BLOCKED_INDEX_LOCK_BUSY`
- `PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW`

Runtime (`GOAL_BLOCKED_*`):
- `GOAL_BLOCKED_ATOM_FAILED`
- `GOAL_BLOCKED_CI_FAILED`
- `GOAL_BLOCKED_STAGING_UNHEALTHY`
- `GOAL_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION`
- `GOAL_BLOCKED_BUDGET_EXHAUSTED`
- `GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED`
- `GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER`
- `GOAL_BLOCKED_DEPLOYED_SHA_MISMATCH`

## Changed

- `nacl-goal/SKILL.md` — frontmatter `description` updated to note the two coexisting UX modes (preview-by-default for 2.10.0 aliases, autonomy-by-default for `intake`); Contract section's input list extended with the `intake`-only opt-out flags; new `## intake alias (2.10.1 — autonomous goal orchestrator)` H2 with the 14-step Flow + env-var contract + resumable state table; check-scripts list shows `intake.sh` shipped, the other 2.10.1-deferred scripts remain deferred; Referenced files table extended with the 7 new contract files + `intake.sh`; Version note expanded to describe the three sub-PRs for 2.10.1 and the deferred items
- `nacl-goal/aliases.md` — header updated to mention `intake` as the first `default_mode: autonomous` alias; alias contract format extended with `default_mode` field; new `## intake (2.10.1)` H2 with the full alias contract (Tier M, `--run-id` check-script schema, expected_evidence_keys, success_condition, tier_c_collisions); old "Aliases deferred to 2.10.1" header renamed to "Aliases deferred (post-2.10.1)" with `stubs-cleanup` / `migrate-canary` / `feature` still listed
- `nacl-goal/refusal-catalog.md` — new section `# /nacl-goal intake-alias block codes (2.10.1)` appended after the existing 10 `REFUSE_*` codes, documenting the 25 new `PLAN_BLOCKED_*` / `GOAL_BLOCKED_*` codes with full table rows (Triggers / Message / Fallback / Logs / Reference) per the existing format
- `nacl-tl-fix/SKILL.md` — Step 6.SF rule 4: spec-first exception lookup glob extended to scan BOTH `.tl/exceptions/*.yaml` (human-authored) AND `.tl/exceptions/goal-runs/*/EXC-goal-*.yaml` (wrapper-authored). New `## Goal-context env vars (2.10.1+)` section
- `nacl-tl-ship/SKILL.md` — new `## Goal-context append mode (2.10.1+)` section: when `NACL_SHIP_MODE=append AND NACL_GOAL_BRANCH` set, push to existing goal-run branch + reuse single goal-run PR + write `pr.json` + append envelope to `budget.json`; without env, default behavior unchanged
- `nacl-tl-dev/SKILL.md`, `nacl-tl-dev-be/SKILL.md`, `nacl-tl-dev-fe/SKILL.md` — `--auto-ship` flag added; new `## Goal-context env vars (2.10.1+)` section
- `nacl-tl-intake/SKILL.md` — `--emit-state <path>` flag added with full JSON schema; FEATURE size class rule; `depends_on` hint semantics; `hard_refuse_triggers` closed set
- `nacl-sa-feature/SKILL.md` — `--bounded-only` mode added with refuse criteria, refuse output, and accept path
- `nacl-init/SKILL.md` — `.gitignore` entries extended with `.tl/goal-runs/` and `.tl/exceptions/goal-runs/`; refusal-code reference for missing entries
- `.gitignore` — added `.tl/goal-runs/` and `.tl/exceptions/goal-runs/` to the NaCl repo's own root

## Enabled

- `/nacl-goal intake "<goal>"` — autonomous goal orchestrator, end-to-end:
  - Privacy precheck (refuses before any PII write if wrapper paths not gitignored)
  - INIT_RUN with flock-protected `index.json` (30s timeout)
  - Precheck (dirty worktree, production branch guard, baseline command resolution, baseline capture)
  - CLASSIFY via `/nacl-tl-intake --yes --emit-state`
  - LOCK PLAN with topological sort of `depends_on` and immutable atom IDs
  - `--strict` pre-flight (refuses if plan predicts a gate would need envelope)
  - MATERIALIZE EXCEPTION ENVELOPE (skipped if `--strict`)
  - ISSUE `/goal` with composed condition
  - EXECUTE per-atom state machine on single goal-run branch
  - PRE-DELIVER + POST-DELIVER drift checks
  - DELIVER via `/nacl-tl-deliver` (staging) or local verify (dev-only)
  - POST-DELIVER mechanical regression diff
  - OBSERVE & EMIT GOAL_PROOF via `intake.sh`
  - Terminal-state index update + audit trail

- Goal-context env-var integration in `/nacl-tl-fix`, `/nacl-tl-dev`, `/nacl-tl-dev-be`, `/nacl-tl-dev-fe`, `/nacl-tl-ship`, `/nacl-tl-intake`, `/nacl-sa-feature` — additive, opt-in via env presence

- `git check-ignore`-based privacy precheck for wrapper paths

- Wrapper-authored `EXC-goal-*.yaml` exception namespace at `.tl/exceptions/goal-runs/<run_id>/`, scanned by `/nacl-tl-fix` Step 6.SF alongside the existing flat namespace

## Renamed

- `docs/releases/2.10.1-autonomous-execution/` → `docs/releases/2.10.1-autonomous-goal-intake-orchestrator/`

The previous directory contained drafts for the OLD 2.10.1 plan (7 separate infrastructure components deferred from 2.10.0). The directory was renamed to match the shipped milestone codename, and all three artifacts inside (release-notes.md, changelog.md, tg-post.md) were rewritten for the actual shipped scope.

## Notes

- All inner-skill changes (PR2) are **additive and env-var gated**. When `NACL_GOAL_*` env vars are absent, every inner skill behaves exactly as today. Interactive `/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-ship`, etc. are unaffected.
- The 2.10.1 release shipped via three sub-PRs into a long-running `release/2.10.1` branch (PR1: wrapper contracts; PR2: inner-skill env-var integration; PR3: release artifacts), then `release/2.10.1 → main` merge.
- Wall-clock budget is enforceable; turn/token are best-effort until inner skills expose counters (deferred to 2.10.2+).
- `--new-run` does NOT close or reuse a prior PR in 2.10.1. Auto-close is deferred to 2.10.2+.
