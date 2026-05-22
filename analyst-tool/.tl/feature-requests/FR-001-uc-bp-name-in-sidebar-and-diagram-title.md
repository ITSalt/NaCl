# Feature Request: FR-001 UC/BP Name in Sidebar and Diagram Title

## Metadata
| Field | Value |
|-------|-------|
| Created | 2026-05-06 |
| Status | spec-complete |
| Source | /nacl-sa-feature "Show UC/BP name in sidebar and as diagram title" |
| Impact method | Neo4j graph traversal (sa_impact_analysis) + code inspection |

## Feature Description
Currently the sidebar lists boards by their file-derived ID (e.g. "UC-004") with no human-readable name, making it hard to identify boards at a glance. Activity diagrams also lack a title, unlike process (BP) diagrams which already render one. This feature adds a `label` field (the UseCase or BusinessProcess name from the graph) to the board list API, renders it as a subtitle in the sidebar, and adds a title text element to generated activity diagrams matching the existing BP renderer pattern.

## Impact Summary
| Area | Change | Details |
|------|--------|---------|
| Architecture | no change | M-WEB-UI, M-BACKEND-API, M-RENDERERS already exist |
| Domain | +1 attribute | DA-BOARD-LABEL on DE-BOARD (nullable string) |
| Use Cases | ~2 modified | UC-003 (activity title req), UC-008 (label in list req) |
| Roles | no change | |
| UI: Components | ~1 modified | CMP-SIDEBAR — label subtitle |

## Graph Impact Trace
- Modules affected: M-WEB-UI, M-BACKEND-API, M-RENDERERS
- Entities affected: DE-BOARD (+DA-BOARD-LABEL)
- UCs affected: UC-003, UC-008
- Key finding: ba-process renderer already renders `title-{bpId}` — gap is activity renderer only

## Modified UCs

### UC-008 — List Boards
**New requirement (REQ-UC008-01):** `GET /api/v1/boards` response items include a nullable `label` field: for activity boards the `UseCase.name` resolved by `relatedId` from Neo4j; for process boards the `BusinessProcess.name`; null for domain-model, context-map, import, and other boards.

**Implementation note:** Boards service must batch-resolve labels from Neo4j using `relatedId` values collected during directory scan. One Cypher query per board kind (activity / process) to avoid N+1.

### UC-003 — Regenerate Board from Graph
**New requirement (REQ-UC003-02):** The activity renderer must include a centered title text element above the swimlane headers using format `"${uc_name} (${uc_id})"`. Element logical id: `title-{ucId}`. Mirrors the existing ba-process pattern (`title-{bpId}`).

**Implementation note:** `uc_name` is already fetched in the activity renderer's Cypher query — only the `makeText` call and `assembleScene` inclusion are missing.

## New TECH Tasks
None — all changes are incremental to existing files.

## Dependencies
- UC-008 backend change (label field) must land before CMP-SIDEBAR subtitle is useful (but sidebar degrades gracefully to null label)
- UC-003 renderer change is independent of sidebar change

## SA Artifacts Created/Modified
- MODIFIED: DE-BOARD — added DA-BOARD-LABEL attribute
- MODIFIED: UC-008 — added REQ-UC008-01
- MODIFIED: UC-003 — added REQ-UC003-02
- MODIFIED: CMP-SIDEBAR — updated description for label subtitle

## Skills Invoked
- nacl-sa-domain (MODIFY DE-BOARD)
- nacl-sa-uc (MODIFY UC-003, UC-008)
- nacl-sa-ui (MODIFY CMP-SIDEBAR)
