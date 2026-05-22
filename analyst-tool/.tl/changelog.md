# Changelog

## [PLAN] 2026-05-07 — FR-001 incremental plan

- Created development plan from Neo4j graph (`/nacl-tl-plan --feature FR-001`).
- Scope: UC-003 (activity renderer title) + UC-008 (boards label field + sidebar subtitle).
- Generated 2 UC task folders (16 files total — 8 per UC, per skill convention).
- Defined 2 execution waves: Wave 1 (BE, parallel) + Wave 2 (FE).
- API contract change: `GET /boards` adds nullable `label` field (additive, backwards-compatible).
- 0 TECH tasks (FR-001 is fully incremental to existing files).
- Source: Neo4j SA layer (`UseCase`, `Requirement`, `SystemRole`, `Module` nodes).
- Wave/Task nodes created in Neo4j with `IN_WAVE`, `GENERATES`, `DEPENDS_ON` edges.
