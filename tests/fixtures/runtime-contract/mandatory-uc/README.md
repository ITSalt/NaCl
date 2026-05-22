# Fixture: Mandatory RuntimeContract — UC-FX01 (Video Transcoding Queue)

Wave: W8-runtime-fsm
Owner: nacl-sa-uc (consumer: future sa-validate / tl-review)
Purpose: replay artifact to assert that the sa-uc decision-tree query
classifies this UC as `mandatory: true` and that sa-uc refuses to leave
`detail_status='detailed'` until a RuntimeContract subgraph exists.

## Why a RuntimeContract is MANDATORY for this UC

UC-FX01 ("Transcode uploaded video") satisfies all five clauses of the
decision tree in `nacl-sa-uc/references/runtime-contract.cypher` § 7:

| Clause | Match | Evidence |
|---|---|---|
| Q1 — async ActivityStep keywords | YES | Step `UC-FX01-AS02` description: "Worker claims queue item and starts ffmpeg job". Keywords: worker, queue, job. |
| Q2 — domain entity has state attribute | YES | `BusinessEntity` "TranscodingTask" has `status` ∈ {pending, running, failed, succeeded, cancelled}. |
| Q3 — calls async external provider | YES | Requirement RQ-FX-001 references api.kie.example.invalid async `POST /api/v1/jobs/createTask` + polling. |
| Q4 — behavioral requirement mentions retry/cancel/recover | YES | RQ-FX-002: "On worker crash, in-flight tasks must be recoverable and re-enqueued without duplication." RQ-FX-003: "User may cancel a running task; cancel must win over a concurrent fail." |
| Q5 — DEPENDS_ON queue/worker UC | YES | `DEPENDS_ON` UC-FX00 "Enqueue transcoding job". |

Any single match makes the contract mandatory. UC-FX01 matches all five —
it is the canonical example of a UC where omitting the RuntimeContract
would let exactly the Project-Alpha-restart and project-beta-cancel-race bugs
slip through.

## Worked examples encoded in this fixture

1. **Project-Alpha restart-with-running-tasks** — the `restart` transition
   (failed → pending) must be inside a `single_tx` with `row_for_update`
   AND must DELETE the previous `queue_items` row, because `INSERT … ON
   CONFLICT DO NOTHING` silently no-ops on the existing failed row.
2. **Project-Beta cancel-while-failing race** — the `fail` and `cancel`
   transitions must both take `row_for_update` and must have a
   `RESOLVES_RACE_WITH` edge declaring cancel as the winner; fail
   reacquires the lock, observes `status=cancelled`, and exits without a
   state change.

## Expected sa-uc behaviour against this fixture

- `sa-uc detail UC-FX01` MUST stop in Phase 4.5 (Runtime Contract) with
  `BLOCKED — runtime_contract_missing` until a `RuntimeContract` node and
  its full subgraph (≥ 1 RuntimeState, ≥ 1 RuntimeTransition, ≥ 1
  IdempotencyKey, ≥ 1 RecoveryProcedure) are created.
- After contract creation, the read-back query in
  `runtime-contract.cypher` § 6 must return a non-empty subgraph and the
  validation report in Phase 5 must include:
  - 5 states (pending, running, failed, succeeded, cancelled)
  - At minimum the `restart` transition with `txn_boundary=single_tx` and
    `lock_strategy=row_for_update`
  - At minimum the `RESOLVES_RACE_WITH` edge between `fail` and `cancel`
  - At least one RecoveryProcedure with trigger `process_crash`

## Fixture data shape (illustrative — not actually written here)

```yaml
use_case:
  id: UC-FX01
  name: Transcode uploaded video
  actor: Worker
  priority: MVP
  has_ui: false
  detail_status: not_started
activity_steps:
  - id: UC-FX01-AS01
    actor: System
    description: Receive uploaded video reference from UC-FX00 enqueue
  - id: UC-FX01-AS02
    actor: System
    description: Worker claims queue item and starts ffmpeg job
  - id: UC-FX01-AS03
    actor: System
    description: Poll provider for completion (async api.kie.example.invalid job)
  - id: UC-FX01-AS04
    actor: System
    description: On completion write artifact to S3 and emit task.completed event
requirements:
  - id: RQ-FX-001
    rq_type: functional
    description: Provider api.kie.example.invalid async polling, max 60 attempts, 5s interval
  - id: RQ-FX-002
    rq_type: behavioral
    description: On worker crash, in-flight tasks must be recoverable and re-enqueued without duplication
  - id: RQ-FX-003
    rq_type: behavioral
    description: User may cancel a running task; cancel must win over a concurrent fail
dependencies:
  - depends_on: UC-FX00  # "Enqueue transcoding job" — queue/worker name
```

This file is documentation-only; the graph nodes are created at fixture-
replay time by downstream consumers (W11 pilot). The fixture's purpose
is to declare the contract under which sa-uc must mark this UC as
incomplete until a RuntimeContract is attached.
