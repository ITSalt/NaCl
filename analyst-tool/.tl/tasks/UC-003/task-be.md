---
id: UC-003-BE
uc: UC-003
title: Activity renderer — add centered diagram title element
type: uc-be
wave: 1
agent: nacl-tl-dev-be
feature_request: FR-001
priority: high
status: pending
depends_on: []
blocks: [UC-003-FE]
---

# UC-003-BE — Activity renderer: add centered diagram title

## User Story

As an Analyst, I want activity diagrams to display a centered title (`UseCase name (UC-id)`)
above the swimlanes, just like process (BP) diagrams do, so that I can identify the diagram
at a glance without reading the file name.

## Actor

**SR-ANALYST** (single human operator; admin; local).

## Preconditions

- A board of kind `activity` exists for `UC-{id}` (filename pattern `activity-UC-{id}.excalidraw`).
- The Neo4j graph contains a `UseCase {id, name}` node for the related UC id.

## Postconditions

- Regenerated activity boards include a title text element with id `title-{ucId}` and
  text `${uc_name} (${ucId})`, centered above the swimlane headers.
- `title-{ucId}` is included in `assembleScene` output.
- Process (BP) renderer is unchanged.

## Main Flow (system steps from graph — `step_type: system-action`)

| # | Step ID         | Description                                                                                       | Source file                                |
|---|-----------------|---------------------------------------------------------------------------------------------------|--------------------------------------------|
| 3 | AS-UC003-03     | Server `POST /skills/regenerate` enqueues a run via the run-queue.                                | `server/src/routes/skills.ts`              |
| 4 | AS-UC003-04     | Skill runner invokes the deterministic Excalidraw renderer pipeline against the live Neo4j graph. | `server/src/services/skill-runner.ts`      |
| 5 | AS-UC003-05     | Renderer writes the regenerated `.excalidraw`, archives the previous version, broadcasts `board.changed`. | `server/src/services/snapshots.ts`  |

The FR-001 change is localized to step 4 — specifically, inside the
activity renderer at `server/src/render/excalidraw/activity.ts`. The renderer's
existing Cypher query already returns `uc_name` (line 162 of `activity.ts`).

## Requirements

| ID            | Type       | Priority | Description                                                                                                                                                                  |
|---------------|------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| REQ-UC003-01  | Functional | Must     | Regenerate uses the deterministic renderer pipeline against Neo4j; no LLM call is made. (Existing — not changed by FR-001.)                                                 |
| REQ-UC003-02  | Functional | Must     | The activity renderer must include a centered title text element above the swimlane headers, format `"${uc_name} (${ucId})"`. Element logical id: `title-{ucId}`. **NEW (FR-001).** |

## Authorization

Unchanged. `SR-ANALYST` has full access.

## Acceptance Criteria (slice for FR-001)

- Given a regenerated activity board, when the file is opened, the title element with id
  `title-{ucId}` is present.
- The title text equals `${uc_name} (${ucId})` exactly (matches the BA-process formatting).
- Existing acceptance criteria for UC-003 (regenerate via skill-runner, snapshot archive,
  StatusBar timestamp, button disabled while running) continue to pass — no regression.

## Implementation Pointer (for the dev agent — do not paste, just orient)

- **Reference pattern:** `server/src/render/excalidraw/ba-process.ts` lines 408–420 (already
  emits a centered title via `makeText` + `semIds.baTitle(bpId)`).
- **Add a sibling helper** in `server/src/render/semantic-ids.ts`:
  `ucTitle: (ucId: string) => 'title-${ucId}'` (or reuse the existing `baTitle` helper —
  the prefix `title-` is shared because UC and BP id namespaces don't collide).
- **Modify** `server/src/render/excalidraw/activity.ts`:
  - Build `titleText` with `makeText`, logical id `${ucId}::title`, id `title-${ucId}`,
    text `${uc_name} (${ucId})`, `fontSize: 24`, centered above swimlane headers (mirror
    BA-process geometry: y = -50, x slightly inside the swimlane label column).
  - Append `titleText` to the `elements` array passed to `assembleScene` (line ~497–503).
- **Test fixture:** see `test-spec.md`. Renderer tests live in
  `server/src/render/render.test.ts`. Add a focused test that asserts the rendered
  scene contains an element with `id === 'title-UC-003'` and `text === 'Regenerate Board from Graph (UC-003)'`.

## Notes

- Process (BP) renderer is **out of scope** for FR-001 — title already works there.
- Domain-model and context-map renderers are out of scope (they emit their own title-style
  text via `moduleText` / entity headers; no diagram-level title needed by FR-001).
