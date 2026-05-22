# UC-EXP-001 — Widget archival pipeline (BE)

**Wave:** 1
**Module:** MOD-API
**Actor:** SYSTEM (scheduled archival job)
**UC traits:** queue, idempotent

## Goal

Provide a backend service that transitions widgets from ACTIVE to a
terminal archival state. The archival operation is initiated by either
a user action or a scheduled cleanup job and must be idempotent.

## Business rules

- BR-1: A widget in state INACTIVE may be archived without restriction.
- BR-2: A widget in state DELETED must NOT be archivable; attempt
  returns a 409 Conflict.
- BR-3: After archival, the widget is no longer returned by the default
  catalogue listing endpoint.

## Domain enum reference

`WidgetStatus` is the lifecycle enum that drives widget state
transitions. The values are:

- `ACTIVE` — newly created widget, eligible for use.
- `INACTIVE` — soft-suspended widget; transitional, archivable.
- `DELETED` — terminal removed state; no further transitions allowed.

When the archival job processes an INACTIVE widget it transitions the
widget to the archival sink state and stops emitting it from the
listing endpoint.

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Calling `archiveWidget(WidgetStatus.INACTIVE)` returns the archival sink state and persists the new state to the database. |
| AC-2 | Calling `archiveWidget(WidgetStatus.DELETED)` throws and does not modify the database row. |
| AC-3 | The catalogue listing endpoint returns widgets only when their status is not in {DELETED, archival-sink}. |

## Notes

This task-be.md was authored before the W3 vocabulary realignment.
The wave-3 changelog records that the archival sink token was renamed
from `INACTIVE` to `ARCHIVED` in the canonical shared enum and in the
Prisma schema. This document was not regenerated and therefore still
references the pre-rename token `INACTIVE` throughout the rules and
acceptance criteria. See `review-be.md` minor `m-1` for the catalogued
drift and reconciliation route.
