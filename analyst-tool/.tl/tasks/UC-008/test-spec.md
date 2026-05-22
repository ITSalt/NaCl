---
id: UC-008-BE
title: Test spec — /boards label resolution
runner: vitest
file: server/src/services/boards.test.ts (new) or server/src/routes/boards.routes.test.ts (existing)
feature_request: FR-001
---

# UC-008-BE Test Spec

## Test infrastructure

- Runner: **vitest**.
- Run: `npm run test --workspace=server`.
- Neo4j driver: **mock** (do not require a live Neo4j in unit tests). The existing
  pattern in `server/src/services/neo4j.test.ts` and `server/src/routes/projects.routes.test.ts`
  shows how the driver is stubbed — follow it.

## Required test cases

### TC-1: `BoardListItem` includes `label` field on every item

Given a stubbed boards directory with one activity, one process, and one
domain-model board, when `listBoards()` is called, every returned item has a
`label` property (string or null) — even when Neo4j is not stubbed (degrades to null).

**RED → GREEN.** Fails before the type/code change.

### TC-2: `label` resolves UseCase.name for activity boards

Given a fixture: file `activity-UC-003.excalidraw` exists in `boardsDir`, and the
mocked Neo4j driver returns `{ id: 'UC-003', name: 'Regenerate Board from Graph' }`
for the UC name query. Then `listBoards()` returns an item with
`label === 'Regenerate Board from Graph'`.

### TC-3: `label` resolves BusinessProcess.name for process boards

Given file `process-BP-001.excalidraw` and the mock returns `{ id: 'BP-001', name: 'Onboarding' }`.
Then `label === 'Onboarding'`.

### TC-4: `label` is null for non-activity/non-process kinds

Given files `domain-model.excalidraw`, `context-map.excalidraw`,
`import-Foo.excalidraw`. Then each item has `label === null`.

### TC-5: `label` is null when the graph has no matching node

Given file `activity-UC-999.excalidraw` and the mocked driver returns an empty
result for `UC-999`. Then `label === null` (no error).

### TC-6: Batched resolution — no N+1

Given five activity files and three process files, when `listBoards()` runs,
the mocked driver records exactly **2** session.run calls (or whatever the
underlying primitive is — assert on the call count). Not 8.

**This is the critical perf assertion.** Without it, the implementation can
silently regress to per-board queries.

### TC-7: Graceful degradation when Neo4j is unreachable

Given the mocked driver throws on `session()` or `run()`, when `listBoards()`
runs, then it returns successfully with `label === null` on every item. The
endpoint does not 500.

### TC-8: Existing behaviour preserved

- `kind`, `relatedId`, `displayName`, `group`, `mtime`, `syncStatus`, etc.
  remain correct (snapshot or field-by-field).
- Files inside `.snapshots/` or starting with `.` are still skipped.
- ENOENT on `boardsDir` still returns `[]`, not 500.

## Validation rules

| Field          | Rule                                                                  |
|----------------|-----------------------------------------------------------------------|
| `label`        | `string` (non-empty) or `null`. Never `undefined`.                    |
| Resolution     | At most 2 Cypher queries per call regardless of board count.          |
| Failure mode   | Neo4j errors → all labels `null`; no exception propagates.            |

## TDD ordering

Write TC-1 first → confirm RED. Implement type extension → GREEN.
Write TC-2/TC-3 → RED. Implement batched resolution → GREEN.
Write TC-6 last (perf guard) — implement properly to keep it green.
