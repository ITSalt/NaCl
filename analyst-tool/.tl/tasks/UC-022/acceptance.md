# Acceptance — UC-022 Interface-model board

Given a project graph with Form/Screen nodes:
- A new `interface-model` board is discoverable (renderable), regenerable via `POST /skills/regenerate`, and listed in the web navigator.
- Each Form/Screen renders as a class-like card: header `«interface»/«form»/«screen» <id>`, member rows = FormFields (`name: field_type`).
- `FormField-[:MAPS_TO]->DomainAttribute/DomainEntity` renders as arrows to domain-entity cards.
- interface/validation Requirements anchored via `REALIZED_BY` to a Form/FormField/Screen render as attached «requirement» rectangles with arrows.

Edge cases: empty graph (no Form/Screen) → vacuous board; unchanged-graph re-render byte-identical.
Tests: server vitest (renderer) + e2e (navigator → regenerate → canvas shows form cards).
