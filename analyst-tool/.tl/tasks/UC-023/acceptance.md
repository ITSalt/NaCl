# Acceptance — UC-023 State-machine + code-contract boards

Prereq: `docs/diagrams/schema-coverage-audit.md` (TECH-AUDIT) exists and scopes the work.

State-machine board:
- Renders states (nodes) + transitions (labelled arrows `event [guard]`) for a `RuntimeContract` (Runtime* family) OR a `Screen` (Screen* family) — one renderer, both families.
- Initial state marked; terminal states double-bordered.

Code-contract board:
- `APIEndpoint` cards: header `«interface»`, `METHOD path`, request/response DTO rows; `CONSUMES`/`PRODUCES` arrows to DomainEntity cards.
- `ExternalContract` cards rendered.

Regression: existing domain-model/activity/context-map/ba-process renderers verified against current nesting (e.g. `RELATES_TO`→`ExternalContract`), no silent drops.
Edge cases: vacuous when source nodes absent; unchanged-graph re-render byte-identical.
Tests: server vitest (both families, initial/terminal styling, contract cards + arrows) + e2e navigator.
