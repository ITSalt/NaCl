---
id: TECH-AUDIT
type: tech
wave: 5
agent: nacl-tl-dev
priority: high
depends_on: []
blocks: [UC-023-BE]
---

# TECH-AUDIT — Schema-vs-renderer coverage audit (read-only)

## Goal
Produce a prioritized gap report between the **current Neo4j SA schema generation** and what the
analyst-tool renderers actually draw, to scope UC-023. **Read-only** — no graph writes, no renderer code.

## Output
`analyst-tool/docs/diagrams/schema-coverage-audit.md` containing, per node-label family:
- which labels/edges exist in live graphs (sample: `fc-neo4j`, `a Runtime*-family sample graph`),
- whether any current renderer draws them,
- a prioritized list of missing diagrams/elements.

## Inputs (live graphs — query read-only via `docker exec <container> cypher-shell -u neo4j -p neo4j_graph_dev`)
Containers: `fc-neo4j` (Screen* family), `a Runtime*-family sample graph` (Runtime* family + RuntimeContract/ExternalContract).
Current renderers (the baseline): `server/src/render/excalidraw/{domain-model,context-map,activity,ba-process}.ts`.

## Known gaps to confirm/quantify (from initial probe)
- `Requirement` drawn only in markdown, never on Excalidraw boards → covered by UC-021/UC-022.
- `Form`/`Screen` not drawn as interface cards → UC-022.
- `Runtime*` (RuntimeState/RuntimeTransition/RuntimeContract/RuntimeEvent/RuntimeLock, IdempotencyKey, RecoveryProcedure) — no renderer.
- `Screen*` (Screen/ScreenState/ScreenEvent/Transition/ScreenEffect/AnalyticsEvent) — no renderer.
- `APIEndpoint`, `ExternalContract`, `RuntimeContract` — no renderer.
- `Slice`, `DomainError`, `ErrorPresentation`, `Decision`, `CachePolicy`, `DegradationRule` — no renderer; decide which deserve a board vs. an annotation.

## Acceptance
- [ ] Audit doc lists every SA node label in fc + Sample B with a Drawn? (yes/no/partial) column and the renderer that draws it.
- [ ] Prioritized "missing diagrams" list with a recommended renderer per item.
- [ ] Explicit recommendation for UC-023 scope: which new boards to build now (state-machine, code-contract) vs. defer.
- [ ] No graph mutations; no renderer code changed.

## Verification
Re-run the label/edge probes from the audit and confirm the doc matches live counts.
