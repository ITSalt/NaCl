NaCl 2.10.1 — autonomous-goal-intake-orchestrator

`/nacl-goal intake "<goal>"` — set a goal in plain language, walk away, see the result on a stand.

The wrapper ingests a free-text + image intent, classifies it via `/nacl-tl-intake` into atoms (BUG / TASK / FEATURE_SMALL), locks an execution plan with dependency ordering, runs the atoms on a single feature branch, opens a single PR, drives it through CI, and verifies a healthy staging stand. Autonomy is the default; opt-out flags are `--plan-only`, `--strict`, `--target=dev-only`, `--new-run`.

What ships:

— One goal-run = one branch = one PR. Atoms with `depends_on` execute in topological order; cycles refuse pre-`/goal`. Multi-PR split is a refusal state, not a silent default.
— Closed default safe-exception envelope (2 gates: `spec-first-prerequisite`, `spec-gap-routing`) auto-authorized by the user's `/nacl-goal intake` invocation. Hard-refuse list (production mutation, migrations, auth, billing, L2/L3 architecture, destructive ops, hotfix routing) is non-bypassable.
— User-facing refusal vocabulary. `PLAN_BLOCKED_*` codes fire before `/goal` is issued; `GOAL_BLOCKED_*` codes only fire during the loop. 24 new codes, each with a copy-paste fallback. The existing 10 `REFUSE_*` codes for the 2.10.0 aliases stay unchanged.
— Privacy precheck before any PII is written. `request.json` (user email, free-text goal, image refs) lives only in gitignored `.tl/goal-runs/`. Wrapper-authored exception YAMLs carry only a sanitized preview + cryptographic fingerprint, never the raw goal.
— Branch / PR-head SHA drift detection before AND after deliver. Stray pushes during the CI window can no longer make staging serve a SHA the wrapper never verified.
— Mechanical regression check via test-ID set diff. Per-runner extractors for pytest, jest, vitest, go test; unknown runners fall back to summary-line diff with `regression_check_mode: best_effort` disclosed in the GOAL_PROOF block.
— Conditional resume — not blind retry. Transient interruptions resume from the first non-verified atom. Drift / regression / atom failure / product-decision blocks set `resumable: false` and require explicit `--new-run`.
— Goal-context env vars (`NACL_GOAL_RUN_ID`, `NACL_GOAL_BRANCH`, `NACL_SHIP_MODE=append`, `NACL_GOAL_BUDGET_FILE`) recognized additively by `/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-ship`, `/nacl-tl-intake`, `/nacl-sa-feature`. When env vars are absent, every inner skill behaves exactly as today.

7 new contract files under `nacl-goal/` (envelope, plan-lock-schema, run-artifacts, gate-prediction, retry-policy, regression-schema, pr-body-template), one new check script (`intake.sh` reads only `.tl/goal-runs/<run_id>/` + git + gh + curl, always exits 0, emits GOAL_PROOF per the canonical pattern).

One required action per project that wants to use `/nacl-goal intake`: add `.tl/goal-runs/` and `.tl/exceptions/goal-runs/` to `.gitignore`. The wrapper refuses with `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` before any PII is written if either is missing. `/nacl-init` adds them automatically for new projects.

Not in 2.10.1: FEATURE_HEAVY autonomous execution (refuses with planning artifacts), multi-PR orchestration (refuses with split-required), project-local exception policy, explicit `/nacl-goal status|resume|abort` commands, `deploy.dev.url` config schema, auto-close of superseded PRs on `--new-run`, Codex variant of `intake`.

The original 2.10.0 release shipped `/nacl-goal` as preview-by-default for the four built-in aliases. 2.10.1 adds the first alias with autonomy as the default and the orchestration contract that lets one user intent drive multi-step inner-skill work without per-step human gates.

Tier M: 200 turns / 3 h wall-clock / 4 M tokens (soft). Wall-clock is enforceable.

Docs: nacl-goal/SKILL.md §`intake` alias UX + §Flow; nacl-goal/envelope.md; nacl-goal/run-artifacts.md.
