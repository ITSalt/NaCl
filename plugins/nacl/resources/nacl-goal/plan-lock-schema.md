# /nacl-goal artifact schemas

All schemas for the artifacts under `.tl/goal-runs/<run_id>/` used by the
`intake` alias. Each schema is the wire format between the wrapper, the
inner skills, the `intake.sh` check script, and any future
`/nacl-goal status|resume|abort` tooling (2.10.2+).

Stability:
- Field renames are major-version bumps for `/nacl-goal`.
- New optional fields may be added without a version bump.
- Removed fields require a major-version bump.

---

## Directory layout

```
.tl/goal-runs/
├── index.json                          # fingerprint → run_id index (flock-protected)
├── index.lock                          # flock target (empty file)
└── <run_id>/
    ├── request.json                    # user invocation snapshot — PII
    ├── intake.json                     # /nacl-tl-intake --emit-state output
    ├── plan.lock.json                  # locked execution plan
    ├── authorization.json              # envelope authorization record
    ├── budget.json                     # enforceable wall-clock + best-effort token/turn
    ├── goal-final-sha.txt              # written after last atom verified
    ├── pr.json                         # source of truth for the goal-run PR
    ├── pr-body.md                      # current PR body (re-rendered on transitions)
    ├── progress.jsonl                  # wrapper-level event log, append-only
    ├── progress.<N>.jsonl              # rotated logs (when prior exceeds 10MB)
    ├── regression-baseline.json        # pre-execution test ID snapshot
    ├── regression-postfix.json         # post-deliver test ID snapshot
    ├── exceptions.log                  # JSONL audit trail
    ├── atoms/
    │   └── <atom_id>.state.json        # per-atom state machine record
    ├── planning/                       # populated only for FEATURE_HEAVY blocks
    │   ├── feature-plan.md
    │   └── open-decisions.md
    └── clusters/                       # conduct only (orchestrator="conduct")
        └── <cluster_id>/               # one subdir per cluster, mirrors the run-root layout
            ├── pr.json                 # this cluster's PR (one PR per cluster)
            ├── pr-body.md
            ├── cluster-final-sha.txt   # frozen after this cluster's last atom verified
            ├── regression-postfix.json # diffed against the SINGLE run-root baseline
            └── atoms/
                └── <atom_id>.state.json
```

Under `conduct`, `regression-baseline.json` stays at the run root (a single
baseline captured at `integration_base_sha`); each cluster writes its own
`regression-postfix.json` and diffs against that one baseline, so a regression
introduced by any cluster is caught regardless of which cluster's wave it lands in.

Wrapper-authored exception YAMLs live OUTSIDE this directory at
`.tl/exceptions/goal-runs/<run_id>/EXC-goal-<gate>.yaml` so they share the
exception namespace, not the run namespace. Both are gitignored.

---

## `index.json`

```json
{
  "version": 1,
  "entries": [
    {
      "fingerprint": "sha256:<hex>",
      "run_id": "goal-intake-<utc-iso>-<short-hash>",
      "state": "init|planned|plan_blocked|running|goal_ok|goal_blocked|failed",
      "resumable": true,
      "reason": null,
      "branch": "feature/goal-<short-hash>",
      "pr_url": "https://github.com/.../pull/123",
      "issued_at": "<utc-iso>",
      "ended_at": "<utc-iso>|null"
    }
  ]
}
```

`reason` is `null` for `init|planned|running|goal_ok` states. For
`plan_blocked|goal_blocked|failed` entries it carries the refusal/block code
from `refusal-catalog.md` (e.g. `"PLAN_BLOCKED_DIRTY_WORKTREE"`).

`resumable` is determined by the `Resumable state table` in SKILL.md §Flow
step 14:
- `true` for transient interruptions (running with no terminal state, planned
  not-yet-executed, transient CI/staging disconnects)
- `false` for drift, regressions, atom failures, product-decision blocks,
  deployed-SHA mismatches, and all `plan_blocked` states
- `"partial"` (conduct only) for `GOAL_BLOCKED_PARTIAL_WAVE` — `resume
  --clusters=<ids>` re-runs only the blocked clusters

conduct runs add an optional `clusters_summary` array to their index entry for
fast resume — `[{cluster_id, wave, state, pr_url}]`, a denormalized snapshot of
`plan.lock.json.clusters[]`. It is advisory (the authoritative state is
`plan.lock.json` + `clusters/<id>/`); absent on `intake` runs.

### Write protocol

All writes to `index.json` MUST follow:

1. `flock --exclusive --timeout 30 .tl/goal-runs/index.lock` (else
   `PLAN_BLOCKED_INDEX_LOCK_BUSY`)
2. Read current `index.json` (treat absent file as `{"version": 1, "entries": []}`)
3. Mutate in memory
4. Write to `index.json.tmp.<pid>`
5. `fsync` + atomic `rename(index.json.tmp.<pid>, index.json)`
6. Release flock

This is necessary because two concurrent `/nacl-goal intake` invocations
could otherwise corrupt the index.

---

## `request.json`

```json
{
  "schema_version": 1,
  "run_id": "goal-intake-...",
  "goal": "<full free-text goal as the user invoked it>",
  "images": [
    {
      "ref": "<image identifier as passed in invocation>",
      "content_sha256": "<hex>",
      "byte_length": 0
    }
  ],
  "invocation_args": {
    "plan_only": false,
    "strict": false,
    "target": "auto|staging|dev-only",
    "budget_profile": null,
    "new_run": false
  },
  "goal_fingerprint": "sha256:<hex>",
  "user_email": "<git user.email>",
  "project_root": "/absolute/path",
  "git_remote_url": "<canonicalized origin URL>",
  "target_requested": "auto|staging|dev-only",
  "issued_at": "<utc-iso>"
}
```

**PII warning**: `goal`, `images[].ref`, and `user_email` are personal /
client-confidential. This file is gitignored. The privacy precheck (Flow
step 0) refuses with `PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` if the
gitignore is missing, before any write happens.

---

## `intake.json`

Direct output of `/nacl-tl-intake --emit-state`. The wrapper does not
synthesize this — it executes `/nacl-tl-intake --yes --emit-state <path>`
and treats the file as authoritative.

```json
{
  "schema_version": 1,
  "atoms": [
    {
      "id": "atom-<short_sha256(type + linked_uc + normalized_title)>",
      "type": "BUG|TASK|FEATURE_SMALL|FEATURE_HEAVY",
      "title": "...",
      "linked_uc": "UC-NNN|TECH-NNN|null",
      "evidence": ["GRAPH", "CODE", "HEURISTIC", "USER_OVERRIDE"],
      "confidence": "HIGH|MEDIUM|LOW",
      "risk_level": "L0|L1|L2|L3",
      "depends_on": ["atom-<...>"],
      "hard_refuse_triggers": ["billing"],
      "trigger_evidence": "Goal mentions Stripe billing for API key tiers",
      "spec_gap": false,
      "residual_note": {
        "reason": "spec_gap_residual|medium_confidence_alternative",
        "summary": "...",
        "working_assumption": "...",
        "followup_task": "<YouGile subtask id | .tl/open-questions.md anchor>"
      },
      "diagnosis": {
        "hypotheses": [
          { "id": "H_bug", "statement": "...", "verdict": "confirmed|refuted|inconclusive" }
        ],
        "checks": [
          { "kind": "grep|read|db|git", "target": "<path or query>", "result": "<one line>" }
        ],
        "score": 0.95,
        "threshold_used": 0.7,
        "leaning": "BUG|FEATURE|TASK|null",
        "blocking_fact": "<plain-language fact preventing a confident call>|null",
        "evidence_refs": ["<file:line | query summary | sha>"]
      },
      "skill_path": "nacl-tl-fix|nacl-tl-dev|nacl-sa-feature -> nacl-tl-dev"
    }
  ],
  "classification_metadata": {
    "ambiguous": false,
    "ambiguity_reason": null,
    "requires_split": false,
    "split_reason": null
  }
}
```

### `diagnosis` object (2.16+, optional)

Written by `nacl-tl-intake` Step 2a.5 PROBE for atoms the graph alone did not
resolve. `null` / absent when the probe did not run (HIGH+GRAPH atoms) and in
pre-2.16 artifacts — readers MUST tolerate its absence. `score` is
rubric-derived (see `nacl-tl-core/references/intake-scoring.md`), never
free-form; `threshold_used` freezes the `intake.route_threshold` that was in
effect, so audit tooling interprets the routing without re-reading
`config.yaml`. `CODE` in `evidence` means "verified against the actual
codebase/DB by the probe". All of this (plus `residual_note`) is **additive
and optional → NOT a `schema_version` bump** (see Stability above).

### Closed `hard_refuse_triggers` set

| Trigger | Wrapper refusal |
|---|---|
| `schema_migration` | `PLAN_BLOCKED_FEATURE_REQUIRES_SCHEMA_MIGRATION` |
| `public_api_contract` | `PLAN_BLOCKED_FEATURE_REQUIRES_SCHEMA_MIGRATION` |
| `auth_or_security` | `PLAN_BLOCKED_FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE` |
| `permissions` | `PLAN_BLOCKED_FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE` |
| `billing` | `PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION` (or `_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION` if FEATURE) |
| `destructive_data_operation` | `PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION` |
| `l2_l3_architecture` | `PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION` |
| `product_decision_required` | `PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION` |
| `hotfix_or_release_routing` | REFUSE (interactive `/nacl-tl-hotfix` or `/nacl-tl-release`) |

The set is closed: `/nacl-tl-intake` MUST NOT emit triggers outside this
list. Future trigger additions are a major-version bump for the intake
emit-state schema and require corresponding refusal entries here.

---

## `plan.lock.json`

```json
{
  "schema_version": 1,
  "run_id": "goal-intake-...",
  "goal_fingerprint": "sha256:<hex>",
  "goal": "...",
  "branch": "feature/goal-<short-hash> OR the user's current branch (branch_mode=current)",
  "branch_mode": "current|new",
  "push_cadence": "per-atom|deferred|none",
  "branch_base_sha": "<sha of merge-base(branch, base_branch) at run start; null in branch_mode=new>",
  "prior_unpushed_commits": 0,
  "preexisting_dirty_files": [
    "relative/path/to/uncommitted-file.ts"
  ],
  "deploy_target": "staging|dev-only",
  "atoms": [
    {
      "id": "atom-<short_sha256(...)>",
      "type": "BUG|TASK|FEATURE_SMALL",
      "skill_path": "nacl-tl-fix",
      "linked_uc": "UC-NNN",
      "risk_level": "L1",
      "depends_on": [],
      "title": "..."
    }
  ],
  "hard_blocks": [],
  "authorization": {
    "source": "user invocation",
    "user_email": "<git user.email>",
    "issued_at": "<utc-iso>",
    "strict_mode": false,
    "envelope_gates": ["spec-first-prerequisite", "spec-gap-routing",
                       "medium-confidence-routing"]
  }
}
```

### Atom ID invariant

`atom.id` is assigned exactly once at LOCK PLAN time (Flow step 5) and is
**immutable** for the run. Resume reads `plan.lock.json` and
`atoms/<atom_id>.state.json` — it does NOT re-run classification or
regenerate IDs.

Suggested deterministic form:

```
atom_id = "atom-" + short_sha256(atom.type + "|" + atom.linked_uc + "|" + normalize(atom.title))[:12]
```

where `normalize` lowercases and collapses whitespace. Other forms are
acceptable as long as the invariant holds.

### Topological execution

Atoms execute in topological order of `depends_on`. Cycle → `PLAN_BLOCKED_ATOM_DEPENDENCY_CYCLE`. Tie-break for unrelated atoms: BUG before
FEATURE_SMALL, then by `id` lexicographically.

### Smart-WIP fields (2.14+; `branch_mode=current` only)

- `branch_mode` / `push_cadence`: resolved at Flow step 3, frozen here.
  Pre-2.13 plan.lock.json files lack these keys — readers MUST default
  them to `"new"` / `"per-atom"` (the pre-2.14 behavior).
- `preexisting_dirty_files`: the `git status --porcelain` path snapshot
  taken at Flow step 3. These files belong to other agents working in the
  shared worktree: the goal run never stages, commits, or reverts them.
  `/nacl-tl-ship` (append mode) refuses to stage any path in this list;
  the wrapper's step-9 commit-time gate is the backstop
  (`GOAL_BLOCKED_WIP_COLLISION`, resumable). On resume after a collision
  the wrapper re-snapshots this list (progress.jsonl event
  `wip_resnapshotted`) and rewrites it here atomically.
- `branch_base_sha` / `prior_unpushed_commits`: audit anchors for the
  PR-body "Pre-existing commits" section and the GOAL_PROOF advisory keys —
  they let a reviewer separate the user's prior batch work from goal-run
  commits. In `branch_mode=new` they are `null` / `0`.

### conduct fields (2.18.0; `orchestrator="conduct"` only)

These are ADDITIVE — no `schema_version` bump. When `orchestrator` is absent or
`"intake"`, readers treat the file as a single-PR `intake` lock and the
`clusters` array does not exist (full backward compatibility; `conduct.sh` and
`intake.sh` self-select on `orchestrator`).

```json
{
  "orchestrator": "conduct",
  "integration_branch": "integration/goal-<short-hash>",
  "integration_base_sha": "<git rev-parse base_branch at run start>",
  "cluster_dag_valid": true,
  "integration_drift": false,
  "clusters": [
    {
      "cluster_id": "cl-<short_sha256(module + sorted_atom_ids)[:8]>",
      "module": "auth | billing | <inferred-zone>",
      "branch": "feature/goal-<short-hash>-<cluster_id>",
      "branch_base_sha": "<integration HEAD when this cluster was cut>",
      "wave": 0,
      "depends_on_clusters": ["cl-..."],
      "push_cadence": "deferred",
      "atoms": ["atom-...", "atom-..."],
      "state": "pending|implementing|verified|shipped|ci_passed|deployed|blocked|skipped_blocked_dependency|unsupported",
      "block_code": null,
      "pr_url": null,
      "ci_status": "pending|success|failure|n/a",
      "deploy_status": "n/a|healthy|degraded|failed",
      "cluster_final_sha": null,
      "qa": {
        "required": true,
        "max_iterations": 3,
        "iterations": 0,
        "aggregate_status": "NOT_RUN|VERIFIED|PARTIALLY_VERIFIED|UNVERIFIED|FAILED|BLOCKED",
        "deferred_minor_bugs": []
      }
    }
  ]
}
```

Field rules:
- `cluster_id` is assigned once at the conduct LOCK step and is immutable for the
  run (same invariant as `atom.id`).
- `integration_branch` is cut from `base_branch` (resolved from `config.yaml`,
  never a hardcoded `main`/`master`); the wrapper NEVER commits code to it — it
  only merges verified cluster branches into it between waves so a later wave's
  branches are cut from a base that already contains their dependencies.
- `state == "deployed"` is the per-cluster terminal-green state; the run reaches
  `GOAL_OK` only when EVERY cluster is `deployed` and green (see `aliases.md`
  §conduct result_decision_rule). `blocked` / `skipped_blocked_dependency` /
  `unsupported` are terminal-non-green and force `GOAL_BLOCKED_PARTIAL_WAVE` once
  the wave drains.
- `qa.required == false` (no UI-bearing atom) → the cluster passes the QA gate
  trivially; the wrapper records `aggregate_status: "VERIFIED"` (or `conduct.sh`
  normalizes `NOT_RUN` to VERIFIED for the green test). `deferred_minor_bugs[]`
  holds MINOR-severity QA findings that were filed but did not consume the
  bounded iteration budget.
- `integration_drift: true` is set by the wrapper's wave barrier when the
  integration branch HEAD moved unexpectedly → `GOAL_BLOCKED_INTEGRATION_DRIFTED`.

---

## `authorization.json`

A copy of `plan.lock.json.authorization` written as a standalone artifact for
audit tooling. Identical schema. Wrapper writes both at LOCK PLAN time and
never modifies them after.

---

## `budget.json`

```json
{
  "schema_version": 1,
  "run_id": "goal-intake-...",
  "started_at": "<utc-iso>",
  "wall_clock_limit_seconds": 10800,
  "turn_soft_limit": 200,
  "token_soft_limit": 4000000,
  "inner_skill_runs": [
    {
      "skill": "nacl-tl-fix",
      "atom_id": "atom-001",
      "started_at": "<utc-iso>",
      "ended_at": "<utc-iso>",
      "duration_seconds": 145,
      "exit_status": "shipped|failed|skipped"
    }
  ]
}
```

- **Wall-clock is enforceable** by the wrapper checking `now() - started_at`
  before each atom and at deliver-time. Exceeding the limit emits
  `GOAL_BLOCKED_BUDGET_EXHAUSTED` with `resumable: false`.
- **Turn / token are best-effort**. NaCl inner skills do not all expose turn
  or token counters; until they do, these fields are advisory.
- **`inner_skill_runs[]` is append-only**. Each inner-skill invocation
  records its envelope here, not in `progress.jsonl` (which is reserved
  for wrapper-level events).

The wrapper exports `NACL_GOAL_BUDGET_FILE=<absolute path to budget.json>`
into the environment of every inner-skill invocation so that PR2 changes to
inner skills can append to this file directly.

---

## `atoms/<atom_id>.state.json`

```json
{
  "schema_version": 1,
  "atom_id": "atom-...",
  "state": "pending|implementing|shipped|verified|failed|unsupported",
  "retyped_to": "FEATURE_SMALL|FEATURE_HEAVY|null",
  "last_commit_sha": "<sha>|null",
  "verify_status": "pass|fail|skipped|null",
  "error": "<string>|null",
  "block_code": "GOAL_BLOCKED_WIP_COLLISION|null",
  "updated_at": "<utc-iso>"
}
```

State transitions (one direction only, per atom):

```
pending → implementing → shipped → verified
                                 → failed
implementing → failed     # inner-skill returned a non-shippable status
implementing → pending      # re-type (2.16+): /nacl-tl-fix exited with
                            # exit_reason "L3-feature" and the FEATURE size
                            # rule yields FEATURE_SMALL — atom re-enters the
                            # loop under the new type (retyped_to recorded;
                            # the only sanctioned backward transition)
implementing → unsupported  # re-type (2.16+): same exit, but FEATURE_HEAVY —
                            # terminal advisory state: correctly classified
                            # out of scope, NOT a failure; run continues
```

`retyped_to` (2.16+, optional): set on both re-type transitions. The atom
`id` stays frozen (assignment-once invariant); only `type` in the live state,
`retyped_to`, and `state` mutate. Readers of pre-2.16 artifacts MUST tolerate
the absent key. Additive → NOT a `schema_version` bump.

Resume scans `atoms/*.state.json` and continues from the first atom whose
`state != "verified"`. A `failed` atom is non-resumable on its own — the
run as a whole becomes `goal_blocked` with `resumable: false`. An
`unsupported` atom does NOT block the run: remaining atoms execute, the atom
counts toward `unsupported_atoms_count`, and the final result is at best
`GOAL_NOT_OK` (never a false `GOAL_OK`).

Exception (2.14+): a `failed` atom carrying
`block_code: "GOAL_BLOCKED_WIP_COLLISION"` IS resumable — the wrapper's
step-9 collision gate (or `/nacl-tl-ship`'s staging-time guard) set it
because the atom's file set overlapped another agent's uncommitted WIP.
After the user resolves the overlap, `/nacl-goal resume` re-snapshots
`preexisting_dirty_files` and re-runs this atom from `pending`.
`intake.sh` maps this `block_code` to `GOAL_BLOCKED_WIP_COLLISION`
(precedence over the generic `GOAL_BLOCKED_ATOM_FAILED`). `block_code` is
absent/null in pre-2.14 artifacts and for every other failure kind.

---

## `pr.json`

```json
{
  "schema_version": 1,
  "url": "https://github.com/.../pull/123",
  "number": 123,
  "branch": "feature/goal-<short-hash>",
  "head_ref": "feature/goal-<short-hash>",
  "head_sha": "<sha>",
  "created_at": "<utc-iso>",
  "updated_at": "<utc-iso>"
}
```

Source of truth for the goal-run PR. Written by `/nacl-tl-ship` (in append
mode, recognized via `NACL_SHIP_MODE=append`) on the first push that opens
the PR. Updated on every subsequent push.

`intake.sh` reads `pr.json` first; falls back to `gh pr list --head <branch>` only
if the file is missing or stale. This avoids re-querying the GitHub API on every
GOAL_PROOF turn.

---

## `goal-final-sha.txt`

Plain text file. One line. The HEAD SHA of the goal-run branch after
the last atom is verified and before `/nacl-tl-deliver` starts.

```
abc1234567890abcdef...
```

---

## `dev-verified.json` (2.14+; dev-only target)

```json
{
  "schema_version": 1,
  "dev_verified": true,
  "verified_at": "<utc-iso>",
  "verify_scope": "UC-NNN, UC-MMM"
}
```

Written by the wrapper at Flow step 11 on the dev-only path after the
local `/nacl-tl-verify` pass. `intake.sh` reads `dev_verified` from here;
absent file → `n/a` (pre-2.14 runs never wrote it, and GOAL_OK on the
dev-only branch of the decision rule was unreachable for them).

Used by:
- Step 10 PRE-DELIVER DRIFT CHECK (compare `git rev-parse HEAD` and `gh pr view --json headRefOid`)
- Step 11.5 POST-DELIVER DRIFT CHECK (same comparison)
- `intake.sh` for the `goal_final_sha` evidence key

---

## `pr-body.md`

The current PR body content, rendered from `plan.lock.json` per the template
in `nacl-goal/pr-body-template.md`. The wrapper writes this file at LOCK
PLAN time (initial WIP body), refreshes it on every atom state transition,
and finalizes it at GOAL_OK / GOAL_BLOCKED.

`/nacl-tl-ship` in append mode reads this file when it opens or updates the
PR. The wrapper does not call `gh pr edit` directly — it lets `/nacl-tl-ship`
own the GitHub API surface, which keeps PR2's inner-skill changes minimal.

---

## `progress.jsonl`

Append-only event log. One JSON event per line. Wrapper-level events ONLY.

```jsonl
{"ts":"...","kind":"run_init","run_id":"..."}
{"ts":"...","kind":"plan_locked","atoms_total":2}
{"ts":"...","kind":"envelope_materialized","gate":"spec-first-prerequisite","atom_ids":["atom-001"]}
{"ts":"...","kind":"atom_state","atom_id":"atom-001","state":"implementing"}
{"ts":"...","kind":"atom_state","atom_id":"atom-001","state":"shipped","commit":"..."}
{"ts":"...","kind":"atom_state","atom_id":"atom-001","state":"verified"}
{"ts":"...","kind":"goal_final_sha","sha":"..."}
{"ts":"...","kind":"pre_deliver_drift_check","result":"ok"}
{"ts":"...","kind":"deliver_complete"}
{"ts":"...","kind":"post_deliver_drift_check","result":"ok"}
{"ts":"...","kind":"regression_check","result":"clean"}
{"ts":"...","kind":"goal_ok"}
```

Inner skills MUST NOT write to `progress.jsonl`. They append entries to
`budget.json → inner_skill_runs[]` instead. This keeps the log small enough
to tail manually and prevents inner-skill verbosity from drowning the
wrapper signal.

### Rotation

When `progress.jsonl` exceeds 10 MB, rename it to `progress.<N>.jsonl` (next
integer N starting from 1) and start a fresh `progress.jsonl`. Old rotated
files are kept for audit and never deleted by the wrapper.

---

## `exceptions.log`

JSONL audit trail of wrapper-authored exceptions. One line per exception YAML.

```jsonl
{"ts":"...","run_id":"...","exc_file":".tl/exceptions/goal-runs/.../EXC-goal-spec-first-prerequisite.yaml","gate":"spec-first-prerequisite","atom_ids":["atom-001"],"owner":"<email>","expires":"..."}
```

This is the machine-readable face of the audit; the YAML files themselves
remain the canonical record. Future audit / status tooling (2.10.2+) reads
this log to summarize per-run exception authorization without needing to
parse every YAML.

---

## `regression-baseline.json` / `regression-postfix.json`

Shared schema. See `nacl-goal/regression-schema.md` for the per-runner
test-ID extractor table and the best-effort fallback semantics.

```json
{
  "schema_version": 1,
  "captured_at": "<utc-iso>",
  "command": "npm test",
  "runner": "vitest|jest|pytest|go|unknown",
  "exit_code": 0,
  "collected_count": 42,
  "tests": {
    "passed":  ["<test-id>", "..."],
    "failed":  ["<test-id>", "..."],
    "skipped": ["<test-id>", "..."]
  }
}
```

---

## `planning/feature-plan.md` and `planning/open-decisions.md`

Markdown documents produced by CLASSIFY (Flow step 4) when an atom is
typed `FEATURE_HEAVY`. Together they form the artifact handed back to the
user when the wrapper refuses with
`PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION`.

- `feature-plan.md` — what we understood from the goal, candidate UCs to
  create, suggested module placement, suggested NFRs, missing inputs
- `open-decisions.md` — the explicit product-decision questions the user
  needs to answer before this work can be classified down to FEATURE_SMALL

The wrapper writes these and stops. It never authors the decisions itself.

---

## Version control

This schema is versioned via `schema_version: 1` on every artifact root.
Reading code MUST refuse unknown versions. Increment to `2` on any breaking
field rename or removal; ship a migration path for existing run
directories alongside the bump.
