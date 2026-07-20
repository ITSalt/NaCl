# NaCl 2.26.2 — safe-alloc-and-replan-preserve

**Three planning-contract defects fixed: the UC allocator can no longer hand out an
existing id, incremental re-planning can no longer reopen shipped tasks, and clearing
a stale flag can no longer leave a permanent false-positive version drift.**

All three surfaced in one live incremental-feature cycle (`sa-feature → tl-plan →
tl-dev`) on a project that numbers its UCs globally, and were reproduced RED on a
disposable Neo4j before the fixes landed.

## Defect 1 — UC allocation was collision-prone under global numbering

`sa_next_uc_in_module` computed `max(UC number WITHIN the module) + 1` and never
checked the candidate against other modules' UCs. The methodology's range mechanism
(`uc_range_start` 100/200/300…) prevents collisions **when the ranges are used** —
but on a project that numbers UCs globally (UC-001..UC-014 straight through all
modules, ranges present-but-unused) the module-local candidate reproduces an
existing sibling-module id.

**Fix:** the query keeps the module-local candidate (an empty module still starts at
`uc_range_start`), then MANDATORY-collision-checks it against ALL `UseCase` ids; on
collision it falls back to global max + 1, which cannot collide. Range-partitioned
projects see no behavior change. The previously divergent Step 2.5 / Step 3d
variants are unified, and the queries-file variant gains the `uc_range_start`
fallback it was missing. This mirrors the FR-id allocator's existing global
collision discipline in the same skill.

## Defect 2 — re-planning reset shipped tasks

`nacl-tl-plan` Step 2.4's Task MERGE used a plain unconditional `SET`: re-planning a
stale task wiped `status` and all six `phase_*` fields back to `pending` — even when
the task was already `done` with a commit and verification evidence on record. That
contradicted Step 1.5b's own "tasks and dev state survive" promise and silently
reopened shipped code for re-development. The skill had no policy at all for
stale-but-done tasks.

**Fix:** the template computes `preserve = status IN ['done','verified-pending']`
(both mean the code already shipped) and CASEs every state field:

- **Shipped stale tasks** keep status, phase progress, commit and verification
  evidence; only their FILES regenerate, with a `## Delta since v<pfv>` section.
  The delta code is carried by a NEW task of the feature; reopening a shipped task
  is an explicit operator decision — never a MERGE side effect.
- **Active stale tasks** (including `blocked`/`failed`/`regression`) still reset to
  `pending` — the spec change is usually what unblocks them.
- On CREATE the status is null, so fresh tasks are born `pending` exactly as before.

## Defect 3 — planned_from_version never advanced outside planning

`Task.planned_from_version` (pfv) was written only by `nacl-tl-plan`, yet
`nacl-tl-fix` may clear a task's stale flag after self-syncing its files, and
`nacl-tl-reconcile` rewrites `.tl/tasks/*` with no version handling at all. Both
silenced Signal 2 while Signal 1 (`spec_version > planned_from_version`) kept firing
forever — a permanent false-positive drift that re-flags current tasks on every plan
run and, combined with defect 2, would have reset their shipped state.

**Fix:** the **pfv-advance contract** is codified in the provenance runbook (TL-core
references): any skill that rewrites a task's files to match `spec_version = N` AND
clears its stale flag must `SET planned_from_version = N` in the same write; a skill
that defers regen to planning leaves both alone. `nacl-tl-fix` Step 7 gains the
concrete self-sync write block (`$syncedTaskIds`), `nacl-tl-reconcile` gains
Step 3.4b (`$syncedUcIds`, conditional on graph reachability, api-contract-only
updates excluded), and a read-only acceptance query ships in the runbook — zero rows
expected after any sanctioned clear.

## RED/GREEN evidence

New `tests/graph/regression-uc-allocator-task-merge.sh` — a disposable-Docker
regression matrix that extracts the Cypher under test from the shipped artifacts at
run time. On the pre-fix tree: `alloc-global-collision` (existing id allocated),
`alloc-empty-module` (range fallback missing), `merge-preserve-done` (done wiped to
pending), `pfv-advance` (Signal 1 stays lit) all FAIL; after the fixes all 8 cases
pass, with the invariant cases (range-partitioned allocation, active-task reset,
fresh create) passing on both trees.

## Compatibility

Behavior-correcting; no schema or wire-format changes. Range-partitioned projects
and fresh task creation are bit-for-bit unaffected. Projects that already carry
false-positive Signal-1 rows from historical fix/reconcile runs clear them on their
next full re-plan or by a one-time baseline per the provenance runbook.

## Upgrade

- **CLI (symlinks):** `git pull` in the NaCl checkout.
- **Claude Code Desktop (plugin):** Settings → Customize → Plugins → `nacl`
  marketplace → Sync, then Update; or `claude plugin marketplace update nacl &&
  claude plugin update nacl@nacl`, restart Desktop. Verify version 2.26.2.
