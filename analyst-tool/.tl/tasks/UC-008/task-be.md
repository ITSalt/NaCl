---
id: UC-008-BE
uc: UC-008
title: /boards — include UC/BP `label` in list response
type: uc-be
wave: 1
agent: nacl-tl-dev-be
feature_request: FR-001
priority: high
status: pending
depends_on: []
blocks: [UC-008-FE]
---

# UC-008-BE — `/boards` includes label

## User Story

As an Analyst, I want each board in the sidebar list to carry a human-readable
label (the UseCase or BusinessProcess name from Neo4j), so that I can identify
boards at a glance instead of reading the raw id.

## Actor

**SR-ANALYST** (single human operator; admin; local).

## Preconditions

- `getConfig().boardsDir` resolves to the active project's boards directory.
- (Best effort) Neo4j is reachable; if not, labels degrade to `null`.

## Postconditions

- Each `BoardListItem` returned by `GET /boards` carries a `label: string | null` field.
- For `kind === 'activity'`: `label` is the UseCase name resolved by `relatedId`.
- For `kind === 'process'`: `label` is the BusinessProcess name resolved by `relatedId`.
- For all other kinds: `label === null`.
- Resolution is batched: at most one Cypher query per kind per call.

## Main Flow (server-side)

| # | Step                                                                                                | Source file                            |
|---|-----------------------------------------------------------------------------------------------------|----------------------------------------|
| 1 | Route `GET /boards` calls `listBoards()`.                                                           | `server/src/routes/boards.ts`          |
| 2 | `listBoards()` enumerates `*.excalidraw` files, classifies each, computes sync status, etc.        | `server/src/services/boards.ts`        |
| 3 | **NEW (FR-001):** After classification, batch-collect activity ids and process ids.                 | `server/src/services/boards.ts`        |
| 4 | **NEW (FR-001):** Run two Cypher queries (one for UC names, one for BP names) via `getDriverAsync`. | `server/src/services/boards.ts`        |
| 5 | **NEW (FR-001):** Attach the resolved name as `label` on each item; `null` for non-resolved.        | `server/src/services/boards.ts`        |
| 6 | Return the list.                                                                                    | `server/src/routes/boards.ts`          |

## Domain context

No new domain entity. The FR mentions `DA-BOARD-LABEL` as an SA-layer attribute
on `DE-BOARD`, but it represents a **derived** value (read from `UseCase.name` /
`BusinessProcess.name` on demand) — not stored anywhere.

## Cypher queries to add

```cypher
// Resolve UseCase names for activity boards
UNWIND $ucIds AS ucId
MATCH (uc:UseCase {id: ucId})
RETURN uc.id AS id, uc.name AS name
```

```cypher
// Resolve BusinessProcess names for process boards
UNWIND $bpIds AS bpId
MATCH (bp:BusinessProcess {id: bpId})
RETURN bp.id AS id, bp.name AS name
```

(One query each — total 2 per `listBoards()` call.)

## Requirements

| ID            | Type       | Priority | Description                                                                                                                                              |
|---------------|------------|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| REQ-UC008-01  | Functional | Must     | `GET /boards` items include nullable `label`: UseCase.name for activity, BusinessProcess.name for process, null otherwise. Batched resolution (no N+1). |

## Authorization

Unchanged. `SR-ANALYST` (local).

## Acceptance Criteria

- See `acceptance.md`. Key items: `label` populated for activity+process,
  `null` for others, no N+1, graceful degradation when Neo4j is down.

## Implementation Pointer

- Type to extend: `BoardListItem` in `server/src/services/boards.ts:16-28`.
- Add `label: string | null` to the type.
- After the per-entry classification loop in `listBoards()`, before returning,
  resolve labels in two batched queries via `getDriverAsync(getConfig().repoRoot)`.
- Wrap the Neo4j calls in try/catch — on failure, leave `label` at `null` for all items.

## Notes

- Do **not** change the route file (`server/src/routes/boards.ts`) — the response
  shape change is automatic via the type.
- Do **not** rename the route to `/api/v1/boards` in this FR (see api-contract.md note).
- Shared types: this server uses no published shared-types package; the frontend
  type lives separately in `web/`. Update `web/src/api/client.ts` (or wherever
  `BoardListItem` is mirrored on the FE) as part of UC-008-FE — not here.
