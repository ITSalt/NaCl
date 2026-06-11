---
id: UC-023-BE
type: be
wave: 6
agent: nacl-tl-dev-be
priority: medium
depends_on: [TECH-AUDIT]
blocks: [UC-023-FE]
module: M-RENDERERS
---

# UC-023-BE — State-machine + code-contract renderers

## Description
Broaden renderer coverage of the newer SA schema generation, scoped by TECH-AUDIT:
(a) a **state-machine** board for `RuntimeContract`/`Screen` → states + transitions (support BOTH the
`Runtime*` family — the Runtime*-family sample — AND the `Screen*` family — fc); (b) a **code-contract** board
for `APIEndpoint` and `ExternalContract` as class cards. Plus verify existing renderers against current nesting.

> Read `docs/diagrams/schema-coverage-audit.md` (TECH-AUDIT output) first — it finalizes which boards to build now.

## Target files
- NEW `server/src/render/excalidraw/state-machine.ts` (`renderStateMachine(driver, contractOrScreenId)`)
- NEW (if audit confirms) `server/src/render/excalidraw/code-contract.ts` (`renderCodeContract(driver, scopeId?)`)
- Register both kinds: `render/index.ts`, `services/renderable.ts`, `services/board-classifier.ts`, `routes/skills.ts`
- `server/src/render/render.test.ts` (TDD)

## Graph contract — state machine (two label families, one renderer)
```cypher
// Runtime* family (the Runtime*-family sample)
MATCH (c:RuntimeContract {id:$id})
OPTIONAL MATCH (c)-[:HAS_STATE]->(st:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_INITIAL_STATE]->(ini:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_TERMINAL_STATE]->(term:RuntimeState)
OPTIONAL MATCH (c)-[:HAS_TRANSITION]->(tr:RuntimeTransition)-[:FROM_STATE]->(fs:RuntimeState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:RuntimeState)
RETURN c.id AS contract, collect(DISTINCT st.id) AS states, collect(DISTINCT ini.id) AS initial,
       collect(DISTINCT term.id) AS terminal,
       collect(DISTINCT {tr:tr.id, from:fs.id, to:ts.id, event:tr.on_event}) AS transitions
```
```cypher
// Screen* family (fc) — same shape, Screen/ScreenState/Transition/ScreenEvent
MATCH (scr:Screen {id:$id})
OPTIONAL MATCH (scr)-[:HAS_STATE]->(st:ScreenState)
OPTIONAL MATCH (scr)-[:HAS_TRANSITION]->(tr:Transition)-[:FROM_STATE]->(fs:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
RETURN scr.id AS contract, collect(DISTINCT st.id) AS states,
       [s IN collect(DISTINCT st) WHERE s.state_kind='initial' | s.id] AS initial,
       [s IN collect(DISTINCT st) WHERE s.state_kind='terminal' | s.id] AS terminal,
       collect(DISTINCT {tr:tr.id, from:fs.id, to:ts.id, event:ev.name}) AS transitions
```
Detect family by which label resolves; share one rendering routine over a normalized `{states, initial, terminal, transitions}` shape.

## Graph contract — code contract
```cypher
MATCH (a:APIEndpoint) OPTIONAL MATCH (a)-[:CONSUMES]->(ci:DomainEntity) OPTIONAL MATCH (a)-[:PRODUCES]->(po:DomainEntity)
RETURN 'APIEndpoint' AS kind, a.id AS id, a.method AS method, a.path AS path, a.request_dto AS req, a.response_dto AS res,
       collect(DISTINCT ci.id) AS consumes, collect(DISTINCT po.id) AS produces
UNION
MATCH (e:ExternalContract) RETURN 'ExternalContract' AS kind, e.id AS id, e.kind AS method, coalesce(e.name,e.id) AS path,
       null AS req, null AS res, [] AS consumes, [] AS produces
```

## Main flow (AS-UC023-01..05)
1. (Prereq) TECH-AUDIT done.
2. state-machine board: states as nodes, transitions as labelled arrows (`event [guard]`).
3. Initial state marked (start dot/filled), terminal states double-bordered.
4. code-contract board: APIEndpoint cards (`«interface»` header, `METHOD path`, req/res DTO rows) + ExternalContract cards; CONSUMES/PRODUCES arrows to DomainEntity cards.
5. Verify existing renderers (domain-model/activity/context-map/ba-process) against current nesting — add regression tests where they silently drop new edges (e.g. `RELATES_TO`→`ExternalContract`).

## Requirements (acceptance — from graph)
- REQ-UC023-01 (functional): state-machine board renders states+transitions; both Runtime* and Screen* families supported.
- REQ-UC023-02 (functional): initial/terminal states visually distinguished.
- REQ-UC023-03 (functional): code-contract board renders APIEndpoint + ExternalContract as class cards; CONSUMES/PRODUCES arrows to DomainEntity.
- REQ-UC023-04 (behavioral): a read-only schema-coverage audit precedes implementation (TECH-AUDIT).
- REQ-UC023-05 (behavioral): existing renderers verified against current nesting, no regression.

## TDD
`render.test.ts` via `makeFakeDriver`: state node + transition arrow per family, initial/terminal styling, contract cards + CONSUMES/PRODUCES arrows, determinism. Runner: `npm run test --workspace=server`.
