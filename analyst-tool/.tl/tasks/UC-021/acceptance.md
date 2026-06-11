# Acceptance — UC-021 Render requirements on activity diagram

Given a UC whose graph has `(:Requirement)-[:REALIZED_BY]->(:ActivityStep)` (functional/behavioral):
- The regenerated `activity-<UC-ID>` board shows a «requirement» stereotyped card per such requirement, header `«requirement» <rq_type> <rq.id>`, body = description, colour-coded by rq_type (legend documented).
- Each card has one arrow per realizing ActivityStep (N steps → N arrows), bound via boundElements.
- Cards carry `customData {nodeId, nodeType:'Requirement', stereotype}`.

Given a UC with functional/behavioral requirements but no `REALIZED_BY` edges (e.g. graph not yet anchored):
- Each such requirement still renders as a floating «requirement» card (no arrows to steps). Arrows appear once `REALIZED_BY` is added (e.g. after the requirement-anchoring runbook).

Given a UC with no functional/behavioral requirements at all:
- The board is byte-identical to the pre-feature output (vacuous, no regression).

Determinism: re-render of an unchanged graph is byte-identical.
Verified headlessly on family-cinema (UC-001): 26 «requirement» functional cards rendered; arrows pending graph anchoring.
Tests: `server/src/render/render.test.ts` (vitest, makeFakeDriver), all green; no regression in existing activity tests.
