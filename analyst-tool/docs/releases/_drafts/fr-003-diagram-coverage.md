# FR-003 — Diagram coverage: requirements, interface models, new-schema entities

The analyst-tool renderers now cover the current SA schema generation, not just the original four board types.

## New / changed boards
- **Activity diagrams now show requirements.** Functional/behavioral `Requirement` nodes render as «requirement» stereotyped cards; a `REALIZED_BY` arrow connects each card to the `ActivityStep` it realizes. Requirements with no anchor yet render as floating cards (arrows appear once the graph is anchored via the requirement-anchoring runbook).
- **New `interface-model` board.** Each `Form`/`Screen` renders as a UML-class-like card — fields as members, `MAPS_TO` arrows to domain-entity cards, and the interface/validation requirements it realizes attached as stereotyped rectangles. "Interface" = the UI surface (Form/Screen), mirroring where `interface`-type requirements anchor.
- **New `state-machine` board.** Renders `RuntimeContract`/`Screen` state machines — states as nodes, transitions as labelled arrows, initial/terminal states distinguished. One renderer covers both the `Runtime*` and `Screen*` label families.
- **New `code-contract` board.** `APIEndpoint` and `ExternalContract` as class cards with `CONSUMES`/`PRODUCES` arrows to domain entities.

All new boards are deterministic (byte-identical re-render), discoverable, and regenerable from the sidebar.

## Under the hood
- Spec graph: `FR-003` + `UC-021`/`UC-022`/`UC-023` + `DEC-001` in the tool's own Neo4j spec.
- Read-only schema-vs-renderer audit: `docs/diagrams/schema-coverage-audit.md`.
- Tests: server suite 212 → 271; web build green. Verified headlessly on the family-cinema demo graph.

## Follow-ups
- Deferred per audit: Slice / DomainError / Decision / CachePolicy / DegradationRule rendering (annotation vs. board — decide later).
- To see `REALIZED_BY` arrows on a pre-existing project's activity boards, run `docs/runbooks/requirement-anchoring-upgrade.md` on that project's graph.
