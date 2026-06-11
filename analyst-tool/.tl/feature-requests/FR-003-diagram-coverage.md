# Feature Request: FR-003 Diagram Coverage — requirements, interface models, new-schema entities

## Metadata
| Field | Value |
|-------|-------|
| Created | 2026-06-11 |
| Status | spec-complete |
| Source | /nacl-sa-feature "diagram coverage for analyst-tool renderers" |
| Impact method | Neo4j graph traversal (sa_impact_analysis) on nacl-analyst-tool-neo4j |

## Feature Description
Extend the analyst-tool deterministic renderers so boards reflect the current SA schema: (1) draw
requirements on activity diagrams as stereotyped cards arrowed to the `ActivityStep`s that realize them
(`REALIZED_BY`); (2) add a new `interface-model` board that draws each `Form`/`Screen` as a class-like
card with fields, `MAPS_TO` arrows to the domain model, and attached interface/validation requirements;
(3) broaden coverage of the newer schema generation — `Runtime*`/`Screen*` state machines and
`APIEndpoint`/`ExternalContract` code contracts — preceded by a read-only schema-vs-renderer audit.

## Impact Summary
| Area | Change | Details |
|------|--------|---------|
| Architecture | no change | extends M-RENDERERS, M-SKILL-RUNNER, M-WEB-UI |
| Domain | no change | renders existing graph node types |
| Use Cases | +3 NEW | UC-021, UC-022, UC-023 |
| Roles | no change | SR-ANALYST |
| UI: Boards | +2 new board kinds | interface-model, state-machine (+ optional code-contract) |

## Graph Impact Trace
- Modules affected: M-RENDERERS (primary), M-SKILL-RUNNER (regenerate dispatch), M-WEB-UI (navigator)
- UCs created: UC-021, UC-022, UC-023
- Impact query keywords: requirement interface render activity diagram board state machine form screen

## New UCs to Plan
- **UC-021** Render requirements on activity diagram — `Requirement-[:REALIZED_BY]->ActivityStep` cards + arrows; vacuous fallback.
- **UC-022** Render interface-model board — Form/Screen class cards, FormField members, MAPS_TO arrows, attached interface/validation requirements; new board kind registered end-to-end.
- **UC-023** Render state-machine and code-contract boards — Runtime*/Screen* state machines (both label families) + APIEndpoint/ExternalContract cards; preceded by a schema-coverage audit.

## New TECH Tasks (if any)
- Schema-vs-renderer coverage audit (read-only) → `docs/diagrams/schema-coverage-audit.md` (gates UC-023 scope).

## Dependencies
- UC-021, UC-022 depend on per-project graph upgrade (`docs/runbooks/requirement-anchoring-upgrade.md`) for verification data on family-cinema.
- UC-023 implementation depends on the schema-coverage audit task.

## SA Artifacts Created/Modified
- NEW UseCase: UC-021, UC-022, UC-023 (M-RENDERERS)
- NEW ActivityStep: AS-UC021-01..04, AS-UC022-01..05, AS-UC023-01..05
- NEW Requirement: REQ-UC021-01..04, REQ-UC022-01..05, REQ-UC023-01..05 (rq_type set; REALIZED_BY-anchored)

## Decisions
- DEC-001: Render the current SA schema generation (requirements via REALIZED_BY, Form/Screen interface models, Runtime*/Screen* state machines, contracts) in the deterministic renderer pipeline rather than approximating or hand-editing boards. Rationale: ADR-01 (deterministic-renderers-only) requires every board element to come from a graph transform; the renderers had drifted behind the v2.21.0 schema. (graph: (:FeatureRequest)-[:IMPLEMENTS]->(:Decision))

## Stale (to re-plan)
- None — UC-021/022/023 are new (no prior generated Tasks). Run `/nacl-tl-plan --feature FR-003` to generate tasks.

## Skills Invoked
- nacl-sa-feature (impact + spec), nacl-sa-uc (UC create ×3, inline)
