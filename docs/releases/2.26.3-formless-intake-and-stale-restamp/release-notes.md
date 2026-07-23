# NaCl 2.26.3 — formless-intake-and-stale-restamp

**Three planning-contract defects fixed: a formless screen can no longer draw a false
nav-actions BLOCK, `tl-plan` now stamps `Task.intake_id` deterministically so conductor
batch gates stop under-counting, and an L2 `tl-fix` can no longer exit leaving a dangling
stale stamp.**

All three surfaced in a live conductor intake batch and were reproduced RED before the fix
— on a disposable Neo4j, or as a structural guard on the shipped skill text — and closed
GREEN after (PR #33).

## Defect 1 — formless screens false-BLOCKed the nav-actions review gate

The `nav_actions_consumer_check` gate in `nacl-tl-review` (and its rule owner —
`nacl-sa-ui` W7 and `references/reachability.cypher`) refuses VERIFIED for any
actor-triggered UC whose Form has no inbound `HAS_INBOUND_ACTION`. Its exemption list knew
three cases (`actor=SYSTEM`, `has_ui=false`, `entrypoint_type ∈ {deep-link-only,
embed-only}`), and the Cypher treated the **absence of a Form** as a blocker
(`reason='no-form'`).

But the SA layer deliberately allows a **formless screen**: `has_ui=true`,
`Screen.formless=true`, no Form created (a stub Form is forbidden by the no-stubs-in-docs
rule). Such a UC matches none of the three exemptions, yet by construction has no
`USES_FORM` — so any formless-root UC (a landing page at `/`, a 404) drew a false
`REVIEW APPLIED — BLOCKED (nav-actions-missing)`.

**Fix:** a fourth, structural, self-justifying exemption — a `HAS_SCREEN` screen with
`formless=true` — is added as a `NOT EXISTS { (uc)-[:HAS_SCREEN]->(scr) WHERE
coalesce(scr.formless,false)=true }` carve-out in the Cypher (mirroring `sa-validate`
L10.2's existing formless carve-out) and to every exemption list, including the rule owner
in `sa-ui` and `reachability.cypher`. Condition 2 (natural entrypoint) is reformulated for
the formless case to read against the **screen route**: a root entrypoint (`route='/'`) is
satisfied by direct navigation, since nothing sits above the root to click through from. A
real Form that merely lacks an inbound action is untouched and still blocks
(`no-inbound-action`).

## Defect 2 — `tl-plan` never stamped `Task.intake_id`

`nacl-tl-conductor`'s Phase-4 graph-truth / evidence-completeness gates and Phase-4.5
reconciliation all filter `WHERE t.intake_id = $intakeId`, but the `tl-plan` Step 2.4 Task
MERGE never wrote the property. Asking the planner to set it via prompt text was
non-deterministic — measured 2-of-4 runs silently left it null — so the conductor's gates
saw fewer tasks than the plan created and required manual back-fill.

**Fix:** the Step 2.4 template gains one line —
`t.intake_id = coalesce($intakeId, t.intake_id)` — optional and null-safe (a standalone
`nacl-tl-plan` passes null and never clobbers a prior value). A new `--intake` param and a
**Configuration Resolution** step resolve `$intakeId` deterministically (the argument,
else the `intake_id` field of `.tl/conductor-state.json`, else null), and a **post-write
verification gate** re-reads the graph and HALTs if any task this run created is left
unstamped. `intake_id` is added to the documented conductor-state schema, and the conductor
passes `--intake` when it delegates to `tl-plan`.

## Defect 3 — an L2 `tl-fix` left a dangling stale stamp

An L2 fix stamps a dependent task `review_status='stale'` and bumps the source UC's
`spec_version` (Phase A / Step 5), then brings the code to spec (Phase B). The
clear/advance write that should re-stamp `planned_from_version` and remove the stale flags
already existed — but orphaned inside Phase A, with prose telling the agent to "clear that
task's flag at Step 7", while Step 7 never actually ran it. So a completed fix exited with
its own stamp still hanging, and an hour later another session's Phase-4.5 `P-S6`
(`stale-downstream`) failed on it.

**Fix:** the conditional clear/advance write moves into a new **Step 7.5b** in Phase B that
runs only after the fix's status is GREEN — advancing `planned_from_version` to the source
UC's `spec_version` and removing the stale flags on the task (and the UC once no stale task
remains) in one write, the exact mirror of the `tl-plan` Step 2.4 clear. A partial fix
(only one layer re-synced) leaves the stamp for `nacl-tl-plan` and says so in the report; a
graph-unreachable run defers with a printed note (mirroring `tl-reconcile` Step 3.4b). The
Step 8 report line now reflects self-sync clearing.

## RED/GREEN evidence

- New `tests/graph/regression-nav-actions-intake.sh` — a disposable-Docker matrix (5 cases)
  that extracts the Cypher under test from the shipped skill artifacts at run time. On the
  pre-fix tree `nav-formless` (formless UC blocked, `reason=no-form`) and `intake-stamp`
  (`intake_id` null) FAIL; after the fix both pass, while the control cases
  (`nav-form-no-inbound` still blocks, `nav-form-with-inbound` passes, `intake-preserve`
  keeps a prior value) hold on both trees.
- New `scripts/tl-fix-phaseb-stale-clear.test.mjs` — a CI structural guard (node `--test`)
  that the `$syncedTaskIds` clear/advance write lives inside Phase B / Step 7, exactly once.
  RED on the pre-fix tree (the write was in Phase A), GREEN after the move.
- The existing `regression-uc-allocator-task-merge.sh` (8 cases) still passes; its
  `run_step24` helper now binds `$intakeId`, and its `pfv-advance` case still extracts and
  runs the relocated clear/advance fence.

## Compatibility

Behavior-correcting; no schema or wire-format changes. `$intakeId` is optional, so
standalone planning is unaffected. The formless exemption only narrows the nav-actions
gate for screens already marked `formless=true` in the SA layer; ordinary form-bearing UCs
are unchanged. The `tl-fix` change only clears stamps the same fix set, and only after a
GREEN status.

## Upgrade

- **CLI (symlinks):** `git pull` in the NaCl checkout.
- **Claude Code Desktop (plugin):** Settings → Customize → Plugins → `nacl` marketplace →
  Sync, then Update; or `claude plugin marketplace update nacl && claude plugin update
  nacl@nacl`, restart Desktop. Verify version 2.26.3.
