---
id: UC-021-BE
type: be
wave: 5
agent: nacl-tl-dev-be
priority: high
depends_on: []
blocks: []
module: M-RENDERERS
---

# UC-021-BE — Render requirements on activity diagram

## Description
Extend the activity-diagram renderer so functional/behavioral requirements anchored to a step via
`(:Requirement)-[:REALIZED_BY]->(:ActivityStep)` are drawn as «requirement» stereotyped cards,
connected by an arrow to each step they realize. Vacuous (no regression) when a UC has no such edges.

**Actor:** Analyst (SR-ANALYST). **No new HTTP endpoint** — board regenerates through the existing
`POST /skills/regenerate { board: "activity-<UC-ID>" }` path.

## Target files
- `server/src/render/excalidraw/activity.ts` (extend `renderActivity`)
- `server/src/render/semantic-ids.ts` (ids for requirement cards + arrows)
- `server/src/render/render.test.ts` (TDD; uses `makeFakeDriver`)
- factories already available: `server/src/render/elements.ts` (`makeRect`, `makeText`, `makeArrow`), `groupIds`

## Graph contract (what to query)
The activity renderer currently runs `ACTIVITY_QUERY` (UseCase + HAS_STEP→ActivityStep). Add a second
query for requirements anchored to this UC's steps:

```cypher
MATCH (uc:UseCase {id: $ucId})-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (rq)-[rel:REALIZED_BY]->(s:ActivityStep)<-[:HAS_STEP]-(uc)
WHERE coalesce(rq.rq_type, rq.req_type, rq.type,'') IN ['functional','behavioral']
RETURN rq.id AS rq_id, coalesce(rq.rq_type,rq.req_type,rq.type,'functional') AS rq_type,
       rq.description AS description, collect(DISTINCT s.id) AS realized_steps
ORDER BY rq.id
```
- A requirement with N `realized_steps` → one card + N arrows (one per step).
- Requirements with `rq_type` ∉ {functional,behavioral} (e.g. nfr) are NOT drawn on the activity board (interface/validation belong to UC-022).

## Main flow (ActivitySteps AS-UC021-01..04)
1. Query `HAS_REQUIREMENT`→`Requirement` and `REALIZED_BY`→`ActivityStep` for the UC.
2. For each anchored functional/behavioral requirement, render a «requirement» stereotyped card in a
   column right of the swimlanes. Header = guillemet stereotype `«requirement»` + `rq_type` + `rq.id`;
   body = wrapped `description`. Colour by `rq_type` (pick a distinct stroke/fill per type; document the legend).
3. Draw a `REALIZED_BY` arrow from each requirement card to every `ActivityStep` it anchors. Bind via
   `boundElements` (same pattern as existing step arrows); arrows are NOT placed in `groupIds`.
4. If the UC has zero `REALIZED_BY`→`ActivityStep` edges, render exactly as before — no requirement
   column, byte-identical to the pre-feature board.

## Element/customData rules
- Card rect id: `req-<ucIdNoHyphens>-<rqId>`; header/body text ids via `semantic-ids.ts`.
- `customData: { nodeId: rq.id, nodeType: 'Requirement', stereotype: rq_type, synced: true }`.
- Requirement card + its texts share `groupIds: ['group-req-<rqId>']` (move as a unit).
- Determinism: stable ordering by `rq.id`; deterministic seeds (`deterministic-id.ts`).

## Requirements (acceptance — from graph)
- REQ-UC021-01 (interface): functional/behavioral Requirements anchored via REALIZED_BY render as «requirement» rectangles.
- REQ-UC021-02 (functional): each card connects by arrow to every ActivityStep it anchors; N steps → N arrows.
- REQ-UC021-03 (behavioral): zero REALIZED_BY→step edges → board identical to pre-feature (vacuous, deterministic).
- REQ-UC021-04 (interface): card shows rq_type + rq.id in stereotype header; carries customData.nodeId/nodeType.

## TDD
Write failing tests first in `render.test.ts` via `makeFakeDriver` returning Requirement + REALIZED_BY rows:
card present, stereotype text, arrow count == realized_steps count, vacuous case unchanged, render→hash→render identical.
Runner: `npm run test --workspace=server`.
