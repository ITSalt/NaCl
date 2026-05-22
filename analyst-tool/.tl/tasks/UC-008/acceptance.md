---
id: UC-008
title: Acceptance criteria — List Boards (FR-001 slice)
feature_request: FR-001
---

# UC-008 — Acceptance Criteria

## Pre-existing UC-008 criteria (must continue to pass — no regression)

- Given the active project resolves, when `GET /boards` is called, then the
  response lists boards grouped (e.g. Imports).
- Given a board is added on disk, when the sidebar refreshes, then the new
  board appears.
- Given no boards exist, when listed, then an empty array is returned.

## New criteria for FR-001

### Backend (UC-008-BE)

| ID                  | Given                                                                                  | When                              | Then                                                                                                       |
|---------------------|----------------------------------------------------------------------------------------|-----------------------------------|------------------------------------------------------------------------------------------------------------|
| AC-FR001-UC008-B1   | A `UseCase {id: 'UC-003', name: 'X'}` exists in Neo4j and `activity-UC-003.excalidraw` exists on disk | `GET /boards` is called           | The item for that file has `label === 'X'`.                                                                |
| AC-FR001-UC008-B2   | A `BusinessProcess {id: 'BP-001', name: 'Y'}` exists in Neo4j and `process-BP-001.excalidraw` exists | `GET /boards` is called           | The item has `label === 'Y'`.                                                                              |
| AC-FR001-UC008-B3   | `domain-model.excalidraw`, `context-map.excalidraw` exist                              | `GET /boards` is called           | Their items have `label === null`.                                                                         |
| AC-FR001-UC008-B4   | A board's `relatedId` has no matching node in Neo4j                                    | `GET /boards` is called           | That item has `label === null` (no error).                                                                 |
| AC-FR001-UC008-B5   | The list contains 5 activity boards and 3 process boards                               | `GET /boards` is called           | Neo4j receives at most 2 queries total (no N+1).                                                           |
| AC-FR001-UC008-B6   | Neo4j is unreachable                                                                   | `GET /boards` is called           | Endpoint returns 200 with `label: null` on every item; does not 500.                                       |

### Frontend (UC-008-FE)

| ID                  | Given                                                       | When                              | Then                                                                                                |
|---------------------|-------------------------------------------------------------|-----------------------------------|-----------------------------------------------------------------------------------------------------|
| AC-FR001-UC008-F1   | A board has `label: 'Regenerate Board from Graph'`          | The sidebar renders               | The row shows two lines: `displayName` (top) and the label (smaller, muted, below).                  |
| AC-FR001-UC008-F2   | A board has `label: null`                                   | The sidebar renders               | The row shows only `displayName`. No empty subtitle space.                                          |
| AC-FR001-UC008-F3   | The user types a substring of a board's `label` into search | The list filters                  | Boards whose `label` contains the substring are visible; non-matching are hidden.                    |
| AC-FR001-UC008-F4   | A subtitle is present                                       | The user looks at the row         | The Regenerate button on the right is still fully visible and clickable; layout doesn't break.       |

## Definition of Done (whole UC, both halves)

- [ ] All 10 FR-001 ACs above pass.
- [ ] Pre-existing UC-008 ACs continue to pass.
- [ ] `npm run test --workspace=server` is green (BE TCs).
- [ ] `npm run test --workspace=e2e` is green (FE TCs).
- [ ] Manual end-to-end check: dev server up, real project loaded, sidebar shows
      labels for activity/process and none for domain-model.
- [ ] No unrelated files modified in either half.
