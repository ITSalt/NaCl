# UC-112 — Restart failed task (BE)

**Wave:** 5 (post-MVP follow-up)
**Module:** MOD-CONTENT
**Actor:** end_user
**UC traits:** queue, long-running, recoverable (DB-backed retry)

## Source

Reconstructed from project-alpha-postmortem.md § 3.5 ("UC-112
restart silent no-op — SPEC MISSING") and commit `67a6a44` ("fix(UC-112):
clear stale queue_items before restart + TASK_NOT_RESTARTABLE → 409").

## Symptom

Pressing "Restart" on a failed task returns 200 but the task stays in
`failed`. UC-112 calls `enqueueFirstStep`, which uses `enqueue()` with
`ON CONFLICT DO NOTHING`. A previous `failed` `queue_item` exists for
`(task_id, step_id)` so the insert is suppressed. Worker never picks it
up.

## API contract

| Method | Path                                  | Body                | Response                |
|--------|---------------------------------------|---------------------|-------------------------|
| POST   | `/api/content/tasks/:id/restart`      | (empty)             | 200 / 409 / 404         |

## Spec gap (what this fixture demonstrates)

The UC-201 `enqueue` contract enforces idempotency via `(task_id, step_id)`
uniqueness, returning the existing row on conflict. UC-112 needs the
opposite: PURGE the previous failed `queue_items` before re-inserting.

The spec on disk is silent on which path applies for restart-from-failure,
which transition the worker FSM passes through, what lock to acquire,
which events to emit, and how to recover from a process crash mid-restart.

## RuntimeContract status: **MISSING**

Per W8 (sa-uc Runtime Contract phase), UC-112 has at least three of the
five mandatory clauses:

1. queue (writes to `queue_items` table)
2. long-running (worker picks up async)
3. recoverable (the entire UC is "make a stuck task pick-up-able again")

No `RuntimeContract` node, no `RuntimeState` set, no `RuntimeTransition`
set, no transactional boundary documentation, no lock-acquisition rule,
no idempotency-key strategy, no recovery procedure. The sa-uc Phase 4.5
read-back step refuses to mark UC-112 complete.

## Expected W11-pilot fire point

`nacl-sa-uc/SKILL.md` Phase 4.5: `BLOCKED — runtime_contract_missing`.

## Source commit

`67a6a44` fix(UC-112): clear stale queue_items before restart +
TASK_NOT_RESTARTABLE → 409 — added the DELETE-before-INSERT path AFTER
the spec gap surfaced in production. The fix landed without a preceding
spec-update commit, hitting W10 spec-first prerequisite as well.
