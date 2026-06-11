---
id: UC-022-BE
type: be
wave: 5
agent: nacl-tl-dev-be
priority: high
depends_on: []
blocks: [UC-022-FE]
module: M-RENDERERS
---

# UC-022-BE — Interface-model board renderer

## Description
New deterministic board kind **`interface-model`** that draws each `Form`/`Screen` as a UML-class-like
card (fields as members), with `MAPS_TO` arrows to domain-entity cards and attached interface/validation
requirements (anchored via `REALIZED_BY`). "Interface" in the NaCl methodology = Form/Screen (where
`interface`-type requirements anchor) — NOT API/contract nodes (those are UC-023).

## Target files (new board kind — touch every registration point)
- NEW `server/src/render/excalidraw/interface-model.ts` (`renderInterfaceModel(driver, scopeId?)`) — pattern from `domain-model.ts`
- `server/src/render/index.ts` — add `'interface-model'` to `RenderKind` + dispatch
- `server/src/services/renderable.ts` — discovery query (board available iff ≥1 Form/Screen)
- `server/src/services/board-classifier.ts` — name pattern (`interface-model` singleton, or `interface-model-<MOD>` per module — see Granularity)
- `server/src/routes/skills.ts` — `/skills/regenerate` accepts the new board name
- `server/src/render/render.test.ts` — TDD via `makeFakeDriver`
- factories: `elements.ts`, ids: `semantic-ids.ts`

## Granularity decision
Default to a **single `interface-model`** board (like `domain-model`). If a project has many forms,
fall back to per-module `interface-model-<MOD>` using `(:Module)-[:CONTAINS_UC]->(:UseCase)-[:USES_FORM]->(:Form)`.
Pick the singleton first; the audit (TECH-AUDIT) may revise.

## Graph contract
```cypher
// Forms/Screens + their fields
MATCH (x) WHERE x:Form OR x:Screen
OPTIONAL MATCH (x)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
RETURN labels(x)[0] AS kind, x.id AS id, coalesce(x.name,x.id) AS name,
       collect(DISTINCT {field: ff.id, fname: ff.name, ftype: ff.field_type,
                         maps_to_attr: da.name, maps_to_entity: de.id}) AS fields
ORDER BY id
```
```cypher
// interface/validation requirements anchored to a Form/FormField/Screen
MATCH (rq:Requirement)-[:REALIZED_BY]->(t)
WHERE (t:Form OR t:FormField OR t:Screen)
  AND coalesce(rq.rq_type,rq.req_type,rq.type,'') IN ['interface','validation']
RETURN rq.id AS rq_id, coalesce(rq.rq_type,rq.req_type,rq.type) AS rq_type,
       rq.description AS description, labels(t)[0] AS target_label, t.id AS target_id
ORDER BY rq.id
```

## Main flow (AS-UC022-01..05)
1. Discover Form/Screen + HAS_FIELD members (optionally per module).
2. Draw each Form/Screen as a class-like card: header `«interface»`/`«form»`/`«screen»` + node id; member rows = FormFields (`name: field_type`).
3. Draw `MAPS_TO` arrows from each field row (or card) to the target DomainEntity card (render referenced domain entities as compact cards, or arrow to existing domain-model ids — keep within this board).
4. Draw interface/validation requirements anchored via `REALIZED_BY` as attached «requirement» rectangles, arrow to the Form/FormField/Screen card.
5. Register the board kind across index/renderable/classifier/skills (so it is discoverable + regenerable).

## customData / determinism
- card id `iface-<id>`; `customData {nodeId:id, nodeType: <Form|Screen>, synced:true}`.
- requirement cards as in UC-021 (`customData.nodeType='Requirement'`).
- group each card with its texts; arrows outside groups; stable ordering by id; deterministic seeds.

## Requirements (acceptance — from graph)
- REQ-UC022-01 (functional): each Form/Screen → class-like card; header shows stereotype + id.
- REQ-UC022-02 (functional): FormFields as member rows; MAPS_TO drawn as arrows to domain entities.
- REQ-UC022-03 (interface): interface/validation requirements anchored to Form/FormField/Screen render as attached «requirement» rects with arrows.
- REQ-UC022-04 (behavioral): board discoverable (renderable+classifier), regenerable via /skills/regenerate.
- REQ-UC022-05 (behavioral): empty graph → vacuous board; unchanged graph re-render byte-identical.

## TDD
`render.test.ts` with `makeFakeDriver`: card per form with field rows, MAPS_TO arrow count, attached requirement rects, vacuous case, determinism. Runner: `npm run test --workspace=server`.
