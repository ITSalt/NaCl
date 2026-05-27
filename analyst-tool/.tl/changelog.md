# Changelog

## [2026-05-27] nacl-tl-fix: ba-process renderer — empty step blocks + fc-neo4j down

- **Level:** L0 + L1
- **Status:** PASS
- **Spec-first verdict:** SKIPPED (L0 env fix) / PASS (L1: no prior code-fix commits)
- **Root cause (L0):** fc-neo4j container exited 2 days ago (port 7689); analyst-tool couldn't connect for Family Cinema regeneration
- **Root cause (L1):** PROCESS_QUERY used `ws.function_name` and `ws.step_number`; nacl-migrate-ba graphs store these in `ws.name` and `ws.step_order` respectively — causing empty step blocks
- **Affected:** process board renderers (Family Cinema + any project migrated with nacl-migrate-ba)
- **Docs updated:** none (L1, renderer behaviour spec unchanged)
- **Code changed:** `server/src/render/excalidraw/ba-process.ts`
- **Tests:** `server/src/render/render.test.ts` — TC-NULL-STEP-NAME added; RED→GREEN confirmed

## [2026-05-27] nacl-tl-fix: activity diagram duplicates step boxes for multi-actor UCs

- **Level:** L1
- **Status:** PASS
- **Spec-first verdict:** PASS (vacuous — source-of-truth spec `nacl-render/SKILL.md §1095` already correct via `collect(DISTINCT as_step)`; the port regressed from it. No in-repo doc described the buggy behavior → no doc update required.)
- **Root cause:** `ACTIVITY_QUERY` in `server/src/render/excalidraw/activity.ts` carried a dead `OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)` clause. The upstream query collapses all OPTIONAL MATCHes with `collect(DISTINCT …)`; this port dropped the `collect()` but kept the actor match, so Cypher fanned the result out to one row **per actor** (row cardinality is set by pattern matching, not the `RETURN` list). `fetchSteps` mapped one rectangle per row with no de-dup → each step rendered k times for k actors (A,A,B,B). `sr` was never used downstream (lanes derive from per-step `as_step.actor`).
- **Affected UC:** none (analyst-tool renderer infrastructure)
- **Docs updated:** none (L1)
- **Code changed:** `server/src/render/excalidraw/activity.ts` — removed the dead `OPTIONAL MATCH … ACTOR` clause (root cause); added `step_id` de-duplication in `fetchSteps` (defense-in-depth against duplicate graph edges / future query changes).
- **Tests:** new regression test `multi-actor UC does not duplicate step boxes (fan-out regression)` in `server/src/render/render.test.ts` — authored by an independent sub-agent, RED (4≠2) before fix, GREEN after. Feeds duplicate fan-out rows via the fake driver and asserts exactly N step rectangles.
- **Test counts:** render suite 33→34 pass/0 fail; full server suite 211 pass/0 fail.
- **Operational note:** board files already rendered with duplicates need one **Regen** to refresh; rendering is read-only/on-demand, so no graph data was affected.

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
