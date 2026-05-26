# Changelog

## [PLAN] 2026-05-26 — FR-002 development plan

- Created development plan from the Neo4j graph (`/nacl-tl-plan --feature FR-002`, bolt 3608 — tool spec graph).
- Scope: UC-020 (NEW) paired BE+FE; UC-002 contract delta (`REQ-UC002-03`) folded into UC-020-BE. No TECH tasks.
- Generated 1 UC task folder (`.tl/tasks/UC-020/`, 8 files) + Wave/Task nodes (WAVE-3, WAVE-4; UC-020-BE, UC-020-FE) in Neo4j with `IN_WAVE`, `GENERATES`, `DEPENDS_ON` edges.
- Waves: Wave 3 (BE — WS/PUT origin contract, regression-first) → Wave 4 (FE — consent banner + sidebar + originId).
- `originId` transport decision: PUT body field (not header); recorded as an open question in master-plan.
- Reconciled stale FR-001 task statuses in `status.json` to `done` (matches graph + conductor-state).

## [SPEC] 2026-05-26 — FR-002 live-update on external edits

- Specified `FR-002` via `/nacl-sa-feature` (impact analysis by **code inspection**). **Graph-persisted 2026-05-26**: the tool's SA graph was initially unreachable (Neo4j host-port collision routed the MCP to the EVCharge client graph); after re-porting the tool graph to `bolt://localhost:3608`, `FeatureRequest FR-002` + `UC-020` (REQ-UC020-01..06, 6 ActivitySteps) + the `UC-002` contract delta (`REQ-UC002-03`) were written. Board-save UC reconciled to **UC-002**.
- Root cause (confirmed in code): server-side `markSelfWrite` is global per-board, so any out-of-band `PUT /boards/:name` suppresses the `board.changed` broadcast for all subscribers → open clients keep a stale scene (#4 symptom).
- Resolved design (client experience + system load): notify-only WS ping → explicit consent banner → fetch full scene only on consent; per-origin (`originId`) suppression replacing the global marker; open-board banner + sidebar "changed" indicator; push-based (no polling); never discard unsaved edits without consent.
- Scope: +1 NEW UC-020 (REQ-UC020-01..06), ~1 MODIFIED board-save UC (PUT gains `originId`), +1 NEW component (consent banner), ~2 MODIFIED (CanvasHost, Sidebar). 0 TECH tasks (incremental to existing files).
- Classification: L2 (cross-module contract: server WS/PUT ↔ web store/UI). Regression anchor recorded for `/nacl-tl-regression-test`.

## [PLAN] 2026-05-07 — FR-001 incremental plan

- Created development plan from Neo4j graph (`/nacl-tl-plan --feature FR-001`).
- Scope: UC-003 (activity renderer title) + UC-008 (boards label field + sidebar subtitle).
- Generated 2 UC task folders (16 files total — 8 per UC, per skill convention).
- Defined 2 execution waves: Wave 1 (BE, parallel) + Wave 2 (FE).
- API contract change: `GET /boards` adds nullable `label` field (additive, backwards-compatible).
- 0 TECH tasks (FR-001 is fully incremental to existing files).
- Source: Neo4j SA layer (`UseCase`, `Requirement`, `SystemRole`, `Module` nodes).
- Wave/Task nodes created in Neo4j with `IN_WAVE`, `GENERATES`, `DEPENDS_ON` edges.
