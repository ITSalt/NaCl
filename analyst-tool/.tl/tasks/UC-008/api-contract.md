---
id: UC-008
title: List Boards — API contract
feature_request: FR-001
status: contract-change
---

# UC-008 — API Contract

## Endpoint

| Method | Path                | Auth     | Description                                       |
|--------|---------------------|----------|---------------------------------------------------|
| GET    | `/api/v1/boards`    | none (local; SR-ANALYST implicit) | List all boards in the active project, with classification + sync status + **`label`** (FR-001). |

> Implementation note: the existing in-tree route is `/boards` (no `/api/v1/`
> prefix). FR-001 spec text uses `/api/v1/boards` because that is the pinned
> path in `docs/`. **Do not rename the route in this FR** — keep `/boards` as
> implemented; treat the FR's `/api/v1/boards` as a pending docs-versioning
> task, separate from this slice.

## Request

No request body. No query parameters.

## Response (200) — full schema after FR-001

```ts
type SyncStatus = 'synced' | 'dirty' | 'never-synced';

type BoardKind =
  | 'domain-model'
  | 'context-map'
  | 'activity'
  | 'process'
  | 'import'
  | 'other';

type BoardListItem = {
  name: string;             // boardName without .excalidraw, e.g. "activity-UC-003"
  path: string;             // absolute filesystem path
  kind: BoardKind;
  relatedId: string | null; // e.g. "UC-003" for activity, "BP-001" for process, null for context-map etc.
  displayName: string;      // existing classifier output (e.g. "UC-003")
  group: string;            // sidebar group bucket
  mtime: string;            // ISO timestamp
  syncStatus: SyncStatus;
  lastGeneratedAt: string | null;
  lastSyncedAt: string | null;
  hasUnsyncedEdits: boolean;

  // --- NEW in FR-001 ---
  label: string | null;     // UseCase.name (kind === 'activity'), BusinessProcess.name (kind === 'process'), null otherwise.
};

type GetBoardsResponse = BoardListItem[];
```

### `label` resolution rules (REQ-UC008-01)

| `kind`         | `label` value                                                         |
|----------------|------------------------------------------------------------------------|
| `activity`     | `MATCH (uc:UseCase {id: $relatedId}) RETURN uc.name` — `null` if not found. |
| `process`      | `MATCH (bp:BusinessProcess {id: $relatedId}) RETURN bp.name` — `null` if not found. |
| `domain-model` | `null`                                                                 |
| `context-map`  | `null`                                                                 |
| `import`       | `null`                                                                 |
| `other`        | `null`                                                                 |

### Performance constraint

Labels MUST be resolved with at most **2** Cypher queries per `listBoards()` call,
batched by kind (one for all activity boards, one for all process boards).
**Do not** run one query per board (N+1).

If Neo4j is unreachable, `label` is `null` for every item — the endpoint must
not fail. (Mirrors the existing `/renderable` graceful-degradation pattern.)

## Errors

Unchanged.

| Code | Body                            | When                           |
|------|---------------------------------|---------------------------------|
| 500  | `{ "error": "Failed to list boards" }` | Filesystem read fails.   |

`label` resolution failure does **not** trigger 500 — it degrades to `null`.

## Authentication

`SR-ANALYST` (single local user; no real auth in the analyst-tool).

## Backwards compatibility

The new `label` field is **additive** and **nullable**. Existing clients that
ignore unknown fields keep working. The current Sidebar code (line 308 of
`web/src/components/Sidebar.tsx` shows `board.displayName`) continues to render
correctly when `label` is null.
