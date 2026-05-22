---
id: UC-003
title: Acceptance criteria — Regenerate Board from Graph (FR-001 slice)
feature_request: FR-001
---

# UC-003 — Acceptance Criteria

## Pre-existing UC-003 criteria (must continue to pass — no regression)

- Given a renderable board, when I click Regenerate, then the server invokes the
  deterministic renderer via the skill runner.
- Given an import-only board, when it is selected, then the Regenerate button is
  disabled.
- Given Regenerate succeeds, when the run completes, then the StatusBar shows an
  updated last-generated timestamp.
- Given Regenerate is already running, when I click again, then the button is
  disabled until the prior run finishes.

## New criteria for FR-001

| ID  | Given                                                     | When                              | Then                                                                                                                |
|-----|-----------------------------------------------------------|-----------------------------------|---------------------------------------------------------------------------------------------------------------------|
| AC-FR001-UC003-01 | An activity board for `UC-{id}` exists in the graph and on disk | Regenerate completes              | The output `.excalidraw` contains a text element with `id === 'title-UC-{id}'`.                                  |
| AC-FR001-UC003-02 | The UseCase has `name: '<X>'` in Neo4j                    | Regenerate completes              | The title element's `text` equals `'<X> (UC-{id})'` exactly.                                                       |
| AC-FR001-UC003-03 | The Excalidraw editor opens the regenerated board         | Visual inspection                 | The title is centered horizontally above the swimlane headers and visible.                                         |
| AC-FR001-UC003-04 | A process (BP) board is regenerated                       | Comparing output to baseline      | The BP renderer's output is unchanged (no regression).                                                              |

## Definition of Done

- [ ] All four FR-001 ACs above pass.
- [ ] Pre-existing UC-003 ACs continue to pass.
- [ ] `npm run test --workspace=server` is green, including the new title tests.
- [ ] Manual visual check confirms the title shows in the canvas.
- [ ] No unrelated files modified.
