# Release 2.10.1 — `autonomous-goal-intake-orchestrator`

## Theme

Ship the autonomous goal orchestrator. `/nacl-goal intake "<goal>"` ingests a free-text + image intent, classifies it into BUG / TASK / FEATURE_SMALL atoms via `/nacl-tl-intake`, locks an execution plan with dependency ordering, runs the atoms on a single feature branch producing a single PR, and drives that PR through CI to a healthy staging stand. Autonomy is the default; `--plan-only`, `--strict`, `--target`, `--new-run` are opt-outs.

The original 2.10.0 release shipped the `/nacl-goal` safety wrapper as preview-by-default for the four built-in aliases (`wave`, `fix`, `validate`, `reopened-drain`). 2.10.1 adds the FIRST alias with `default_mode: autonomous` and the orchestration contract that lets it drive multi-step inner-skill work without per-step human gates.

The user should be able to set a goal in natural language, walk away, and see the result on a stand.

## What's New

### `intake` alias — autonomous goal orchestrator

```
/nacl-goal intake "<goal>"                      # autonomous; staging target by default
/nacl-goal intake "<goal>" --plan-only          # planning artifacts only; no /goal, no PR
/nacl-goal intake "<goal>" --strict             # disable default safe-exception envelope
/nacl-goal intake "<goal>" --target=dev-only    # local verify + PR only (no staging claim)
/nacl-goal intake "<goal>" --new-run            # force fresh run-id on fingerprint match
```

Tier M (200 turns / 3h wall-clock / 4M tokens, soft). Wall-clock is enforceable; turn/token are best-effort.

### Single goal-run = single branch = single PR

Atoms in one user intent ship together on `feature/goal-<short-hash>` and produce one PR. Multi-PR split is a refusal state (`PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`), not a default.

`depends_on` between atoms drives topological execution order. Cycles → `PLAN_BLOCKED_ATOM_DEPENDENCY_CYCLE`. Tie-break for unrelated atoms: BUG before FEATURE_SMALL, then by id.

### Default safe-exception envelope

A closed whitelist of 2 gates (`spec-first-prerequisite`, `spec-gap-routing`) is auto-authorized by the user's `/nacl-goal intake` invocation. The wrapper materializes properly-signed `EXC-goal-<gate>.yaml` files at `.tl/exceptions/goal-runs/<run_id>/` (a new namespace distinct from the shared `.tl/exceptions/` root). Inner skills (`/nacl-tl-fix` Step 6.SF in particular) scan both namespaces unconditionally — the wrapper-authored YAMLs satisfy the same W4 schema.

`--strict` disables the envelope; pre-flight refuses (`PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW`) if the plan predicts a gate would need envelope authorization.

Hard-refuse list is non-bypassable: production-branch mutation, migrations / schema changes, auth / security / permissions, billing / payment, destructive data ops, L2/L3 architecture, ambiguous feature requirements, hotfix / release routing.

### User-facing refusal vocabulary

`PLAN_BLOCKED_*` codes fire BEFORE `/goal` is issued (precheck, classify, lock, strict pre-flight, privacy precheck, fingerprint dedup). `GOAL_BLOCKED_*` codes fire DURING the loop. Each entry in `nacl-goal/refusal-catalog.md` includes a copy-paste fallback and links to the relevant artifact under `.tl/goal-runs/<run_id>/`.

16 new `PLAN_BLOCKED_*` codes + 8 new `GOAL_BLOCKED_*` codes (scoped to `intake`; the existing 10 `REFUSE_*` codes are unchanged).

### Privacy precheck before any PII is written

Flow step 0 verifies `.tl/goal-runs/` and `.tl/exceptions/goal-runs/` are gitignored using `git check-ignore` from `project_root`. If either is missing, refuses with `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` BEFORE any artifact is created. The wrapper does NOT auto-patch `.gitignore` in 2.10.1; the user must add the two lines manually. `nacl-init` now requires the two lines in its `.gitignore` template for downstream projects.

`request.json` (which contains user email, free-text goal, image refs, and project path) only ever lives in the gitignored directory.

### YAML-injection-safe exception authorization

The wrapper-authored `EXC-goal-<gate>.yaml` carries a `sanitized_preview` of the goal (max 200 chars, newlines collapsed, YAML control chars escaped, non-printable bytes stripped) plus the cryptographic goal_fingerprint — never the raw goal text. The full goal stays in `request.json`. This prevents both YAML parser breakage and accidental log exposure of PII.

### Branch / PR-head SHA drift detection

The wrapper freezes `goal_final_sha` after the last atom is verified and writes `goal-final-sha.txt`. Both before deliver (step 10) and after deliver (step 11.5), the wrapper re-queries `git rev-parse HEAD` and `gh pr view --json headRefOid` and refuses with `GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER` if either diverges. This catches stray pushes that would otherwise make the staging deploy refer to a SHA the wrapper never verified.

### Mechanical regression check via test-ID set diff

Before execution (Step 3) the wrapper captures `regression-baseline.json` containing the set of passed / failed / skipped test IDs. After deliver (Step 12) it captures `regression-postfix.json` and computes the set difference: (new failures) ∪ (baseline-pass now failing) ∪ (baseline-pass now skipped). Any non-empty diff → `GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED`.

Per-runner extractors documented for pytest (nodeid), jest / vitest (file + full test name), go test (pkg + test). Unknown runners fall back to summary-line diff with `regression_check_mode: best_effort` disclosed in the GOAL_PROOF block.

### Conditional resume — not blind retry

`.tl/goal-runs/index.json` carries per-entry `resumable: bool`. Transient interruptions (process crash, network) → `resumable: true` → re-invocation resumes from the first non-`verified` atom. Drift / regression / atom-failure / product-decision blocks → `resumable: false` → re-invocation refuses with the prior reason and requires explicit `--new-run`. The fingerprint deduplication is exact-normalized (NFC + lowercase + whitespace-collapse), not semantic.

### Goal-context env vars for inner skills

When `/nacl-goal intake` invokes an inner skill, it exports:

| Variable | Honored by |
|---|---|
| `NACL_GOAL_RUN_ID` | `/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-ship`, `/nacl-tl-intake` (logging only) |
| `NACL_GOAL_BRANCH` | `/nacl-tl-ship` (push target) |
| `NACL_SHIP_MODE=append` | `/nacl-tl-ship` (push to existing branch + reuse single goal-run PR + write `pr.json`) |
| `NACL_GOAL_BUDGET_FILE` | All inner skills append envelope entries (best-effort observability) |

**Invariant**: when these env vars are absent, every inner skill behaves exactly as today. Interactive `/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-ship`, etc. are unaffected. The 2.10.1 inner-skill changes are purely additive.

### `--bounded-only` mode for `/nacl-sa-feature`

The wrapper invokes `/nacl-sa-feature --bounded-only` for FEATURE_SMALL atoms. The skill refuses to draft a spec that exceeds the bounded execution envelope (migration / auth / billing / L2-L3 / destructive / unresolved product decision). On refuse, it writes `planning/feature-plan.md` + `planning/open-decisions.md` to `.tl/goal-runs/<run_id>/` and exits `BOUNDED REFUSE`. Without `--bounded-only`, the skill's default flow runs unchanged.

### `--emit-state <path>` for `/nacl-tl-intake`

`/nacl-tl-intake --yes --emit-state .tl/goal-runs/<run_id>/intake.json` writes a deterministic routing table to JSON. Each atom carries: stable id, type (incl. FEATURE_SMALL / FEATURE_HEAVY size class), linked_uc, evidence, confidence, risk_level, `depends_on` hints, `hard_refuse_triggers` from a closed set + `trigger_evidence`. The wrapper consumes this directly; classification is never re-run.

### `/nacl-tl-dev`, `/nacl-tl-dev-be`, `/nacl-tl-dev-fe` get `--auto-ship`

Parity with `/nacl-tl-fix --auto-ship`. Used by the wrapper for TASK and FEATURE_SMALL atom paths.

## Wrapper artifact layout

```
.tl/
├── goal-runs/                               # gitignored
│   ├── index.json                           # fingerprint → run_id (flock-protected)
│   ├── index.lock                           # zero-byte flock target
│   └── <run_id>/
│       ├── request.json                     # PII (user email, full goal, image refs)
│       ├── intake.json                      # /nacl-tl-intake --emit-state output
│       ├── plan.lock.json                   # immutable execution plan with atom depends_on
│       ├── authorization.json               # envelope authorization record
│       ├── budget.json                      # wall-clock + best-effort token/turn
│       ├── goal-final-sha.txt               # frozen after last atom verified
│       ├── pr.json                          # source of truth for the goal-run PR
│       ├── pr-body.md                       # current PR body
│       ├── progress.jsonl                   # wrapper-level events (10MB rotation)
│       ├── regression-baseline.json
│       ├── regression-postfix.json
│       ├── exceptions.log                   # JSONL audit summary
│       ├── atoms/<atom_id>.state.json       # per-atom state machine
│       └── planning/                        # FEATURE_HEAVY artifacts only
└── exceptions/
    ├── EXC-*.yaml                           # human-authored (tracked)
    └── goal-runs/<run_id>/                  # gitignored
        └── EXC-goal-<gate>.yaml             # wrapper-authored, run-scoped
```

## Contract files added in 2.10.1

- `nacl-goal/envelope.md` — default safe-exception envelope contract
- `nacl-goal/plan-lock-schema.md` — all 13 artifact schemas
- `nacl-goal/run-artifacts.md` — directory contract, fingerprint, idempotence
- `nacl-goal/gate-prediction.md` — `--strict` pre-flight prediction table
- `nacl-goal/retry-policy.md` — transient vs deterministic operation classification
- `nacl-goal/regression-schema.md` — per-runner test-ID extractor table
- `nacl-goal/pr-body-template.md` — PR body template
- `nacl-goal/checks/intake.sh` — `--run-id <id>` observer check script

## Install Or Update

The 2.10.1 wrapper is documented entirely in SKILL.md and the contract files above. The skills are Claude-driven; no compiled binary changes. After `git pull origin main`, the new contracts are immediately available to Claude Code sessions.

If you are using the bundled installer script:

```sh
sh skills-for-codex/scripts/install-user-symlinks.sh
```

(2.10.1 does not change the Codex skill set. The Codex variant of `intake` is deferred — see Not Included.)

## Required project-level change

If you intend to use `/nacl-goal intake` in a project, add the following two lines to that project's `.gitignore`:

```
.tl/goal-runs/
.tl/exceptions/goal-runs/
```

The wrapper's privacy precheck (Flow step 0) refuses with `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` before any PII is written if these are missing. `/nacl-init` adds them automatically for new projects from 2.10.1 onward; existing projects must add them by hand.

## Safety Constraints

- `feedback_no_private_info_in_public_repo`: release text avoids private project names, machine-specific paths, and operational anecdotes.
- `feedback_release_artifacts`: release notes and TG post draft live in this release directory.
- `feedback_autonomy_default_ux`: refusal copy is user-facing, not internal-gate-named; autonomy is the default with opt-outs.
- `feedback_goal_run_is_unitary`: one goal-run = one branch = one PR; multi-PR split is a refusal state.
- `feedback_memory_after_merge_not_after_plan`: memory `project_goal_integration.md` flips to "shipped" only after the `release/2.10.1 → main` merge lands.

## Verification

Verification evidence from this release:

```sh
# All 7 new contract files present and readable
ls nacl-goal/{envelope,plan-lock-schema,run-artifacts,gate-prediction,retry-policy,regression-schema,pr-body-template}.md
# 7 files

# intake.sh executable + syntax-checked
test -x nacl-goal/checks/intake.sh && bash -n nacl-goal/checks/intake.sh && echo "ok"
# ok

# Missing --run-id smoke test emits a valid GOAL_PROOF block
nacl-goal/checks/intake.sh 2>&1 | grep -E "^(GOAL_PROOF|alias:|result:|END_GOAL_PROOF)$"
# GOAL_PROOF
# alias: intake
# result: GOAL_BLOCKED
# END_GOAL_PROOF

# Non-existent run-id smoke test emits a valid GOAL_PROOF block
nacl-goal/checks/intake.sh --run-id nonexistent-run 2>&1 | grep -E "^(GOAL_PROOF|alias:|result:|END_GOAL_PROOF)$"
# GOAL_PROOF
# alias: intake
# result: GOAL_BLOCKED
# END_GOAL_PROOF

# Wrapper paths gitignored at repo root
mkdir -p .tl/goal-runs .tl/exceptions/goal-runs && \
  touch .tl/goal-runs/x .tl/exceptions/goal-runs/x && \
  git check-ignore -v .tl/goal-runs/x .tl/exceptions/goal-runs/x && \
  rm -rf .tl/goal-runs .tl/exceptions/goal-runs
# .gitignore:N:.tl/goal-runs/    .tl/goal-runs/x
# .gitignore:N:.tl/exceptions/goal-runs/    .tl/exceptions/goal-runs/x

# Three sub-PRs into release/2.10.1
gh pr list --base release/2.10.1 --state merged --json number,title --jq '.[] | "PR#\(.number) \(.title)"'

# Tag exists on main
git tag --list "v2.10.1"
# v2.10.1
```

## Not Included

- FEATURE_HEAVY autonomous execution. FEATURE_HEAVY classification produces planning artifacts (`feature-plan.md` + `open-decisions.md`) and exits `PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION`.
- Multi-PR orchestration. Plans that require splitting refuse with `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`.
- Project-local exception policy file (`.tl/project-exception-policy.yaml`) and project-specific gates (e.g. `column-display-undocumented`). The 2.10.1 envelope auto-enabled list is exactly two global gates.
- Explicit `/nacl-goal status|resume|abort <run_id>` commands. The artifact layout is designed so these can be added in 2.10.2+ without re-spec.
- `deploy.dev.url` config schema extension. Dev-only target requires explicit `--target=dev-only` and runs local `/nacl-tl-verify` per linked UC instead of remote dev deploy.
- Auto-close of superseded PRs on `--new-run`. The user is responsible for closing or abandoning the old PR.
- Codex variant of `intake` (under `skills-for-codex/nacl-goal/`). 2.10.2's codex sync did not include `intake`; the next codex-sync release will catch it up.
- The 2.10.0-original 7-component infrastructure layer (concurrent-execution lock in graph, runtime gate detector hook, post-completion structural re-check, stop-signal probe, three additional aliases). That milestone was deferred when the wrapper UX was redesigned around `intake`; the structural re-check and stop-signal probe are covered by the per-atom state machine + mechanical drift + regression checks instead. The three aliases (`stubs-cleanup`, `migrate-canary`, `feature`) remain deferred.

## Note for prior 2.10.1 plan readers

If you were tracking the old `2.10.1 — autonomous-execution` milestone (deferred since 2.10.0 ship): its scope was 7 separate infrastructure components for the `wave` / `fix` / `validate` / `reopened-drain` aliases. The plan was revised to deliver a single coherent feature — the `intake` orchestrator — that delivers most of the same end-user value (autonomous loops with safe failure modes) through a different architecture. The original 7 components are not all individually shipped; the equivalents that exist in 2.10.1 are noted above.
