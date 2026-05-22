---
task: UC-EXP-001
phase: be
verdict: approved
headline: REVIEW APPLIED — APPROVED (with carried-forward minor drift)
reviewed: 2026-04-12
reviewer: nacl-tl-review
blockers: []
prior_blockers_resolved: []
---

# Review: UC-EXP-001 BE — Widget archival pipeline

Workflow status: `REVIEW APPLIED — APPROVED`. Code judgment: **APPROVED**.
The archival service is correctly implemented against the canonical
`WidgetStatus` enum. One non-blocking vocabulary drift is carried
forward as a minor finding for the documentation track.

## Stub Gate

PASS — Zero TODO/FIXME/STUB markers in
`api/src/services/widget.service.ts` or its test.

## Test Run

`npm test` from the fixture root: 3 passed. Duration: <1s.

## Acceptance Criteria

| Criterion | Verdict | Notes |
|---|---|---|
| AC-1 archival of transitional state returns sink state | PASS | `archiveWidget` transitions to `WidgetStatus.ARCHIVED` (canonical post-W3 name) |
| AC-2 archival of DELETED throws | PASS | Throws "Cannot archive a deleted widget" |
| AC-3 listing endpoint hides terminal states | PASS | Predicate `isArchived` covers the archival sink |

## Critical Issues

None.

## Minor Issues (carried forward, non-blocking)

- **m-1:** Spec vocabulary drift — `task-be.md` still refers to the
  pre-W3 token `INACTIVE` for the archival sink state, while the
  canonical Prisma schema (`api/prisma/schema.prisma:14`) and the
  shared enum (`shared/src/enums.ts`) use `ARCHIVED`. Code is
  internally consistent on `ARCHIVED` across all usages. Pre-existing,
  route to `/nacl-tl-reconcile`. Not a BE-code issue.

## Verdict

**APPROVED.** Code matches the canonical `WidgetStatus` enum. The
remaining vocabulary drift is documentation only and has been routed
to the reconciliation track via minor `m-1`.

## Next Steps

1. Mark `phases.be = approved` and `phases.review-be = approved` in
   `.tl/status.json`.
2. Optionally route `m-1` to `/nacl-tl-reconcile` as a follow-up
   doc-sync. Non-blocking for UC promotion.
