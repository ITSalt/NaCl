# Fixture: Non-mandatory RuntimeContract — UC-FX02 (List Documents Read-Only)

Wave: W8-runtime-fsm
Owner: nacl-sa-uc
Purpose: replay artifact to assert that the sa-uc decision-tree query
classifies this UC as `mandatory: false` and that sa-uc allows
`detail_status='detailed'` WITHOUT a RuntimeContract subgraph.

## Why a RuntimeContract is NOT mandatory for this UC

UC-FX02 ("List visible documents in current workspace") fails every
clause of the decision tree in `nacl-sa-uc/references/runtime-contract.cypher` § 7:

| Clause | Match | Evidence |
|---|---|---|
| Q1 — async ActivityStep keywords | NO | Steps `UC-FX02-AS01` ("User opens documents page") and `UC-FX02-AS02` ("System renders document list"). No queue/worker/job/poll/schedule/cron/outbox/saga/restart/retry/cancel keywords. |
| Q2 — domain entity has state attribute | NO | `BusinessEntity` "Document" has only `id`, `title`, `created_at`, `owner_id`, `workspace_id`. No `status`, `state`, `lifecycle`, `phase`. |
| Q3 — calls async external provider | NO | No external provider call; pure DB read with RLS. |
| Q4 — behavioral requirement mentions retry/cancel/recover | NO | Only validation requirements (pagination bounds, workspace visibility). |
| Q5 — DEPENDS_ON queue/worker UC | NO | No DEPENDS_ON edges. |

Zero clause matches → contract is NOT mandatory.

## Why this matters

Read-only listing UCs vastly outnumber queue/workflow UCs in any real
system. Requiring a RuntimeContract on every UC would be an extreme
process tax with no safety return — these UCs have no durable state
transition, no lock contention, no provider lifecycle, no cancel race.
The decision tree must filter them out cleanly.

## Expected sa-uc behaviour against this fixture

- `sa-uc detail UC-FX02` MUST complete Phase 4.5 (Runtime Contract) with
  status `not_required` (a free-text note in the UC's `detail_status_note`
  property, NOT a graph node) — no `RuntimeContract` node is created.
- Phase 5 validation report MUST NOT flag UC-FX02 for `BLOCKED —
  runtime_contract_missing`. It MUST report `runtime_contract: not_required`.
- A later re-detail that adds an async ActivityStep MUST flip the verdict
  to mandatory and BLOCK until a contract is attached. (Idempotency: the
  decision tree is re-evaluated every detail run; it is not cached.)

## Fixture data shape (illustrative — not actually written here)

```yaml
use_case:
  id: UC-FX02
  name: List visible documents in current workspace
  actor: User
  priority: MVP
  has_ui: true
  detail_status: not_started
activity_steps:
  - id: UC-FX02-AS01
    actor: User
    description: User opens documents page
  - id: UC-FX02-AS02
    actor: System
    description: System renders paginated document list filtered by workspace
forms:
  - id: FORM-DocumentList
    fields:
      - id: FORM-DocumentList-F01
        name: search
        field_type: text
        maps_to: Document.title
requirements:
  - id: RQ-FX-010
    rq_type: validation
    description: Page size must be 10–100; default 25
  - id: RQ-FX-011
    rq_type: functional
    description: Only documents in the active workspace are visible (RLS)
dependencies: []
```

This file is documentation-only. Its purpose is to assert that the
decision tree does NOT over-trigger — read-only listing UCs must NOT be
forced to carry a RuntimeContract.
