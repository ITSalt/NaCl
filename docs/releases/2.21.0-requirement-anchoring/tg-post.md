NaCl 2.21.0 — requirement-anchoring

A reviewing agent flagged it bluntly: in the graph, requirements were connected only to their UseCase/Module (`HAS_REQUIREMENT`) and to nothing else. No edge to the step, field, or form that actually realizes them. A requirement floating at UC level can't be reached by change-propagation and can't be covered by a gate — for a *connected* spec graph, that's the one thing that mustn't be true.

The tell was one layer down: the **BA layer already does it right** — `nacl-ba-rules` binds every business rule to the workflow step that enforces it (`APPLIES_AT_STEP`), and `nacl-ba-validate` enforces it. The SA `Requirement` just never got the same discipline. So this release doesn't invent a pattern — it copies a proven one downward.

What's inside:

— **One edge.** `Requirement -[:REALIZED_BY]-> (ActivityStep | FormField | Form | Screen)`, keyed by class: behavioral/functional → step, validation → field, interface → form. One polymorphic edge (same shape as `Decision-JUSTIFIES`, `Slice-COVERS`), so the validator carries one anchor invariant, not three.

— **Almost no new authoring cost.** `nacl-sa-uc` Phase 4 already derived each requirement from a rule / field / step — it knew the anchor and discarded it. Now it captures it (a confirmable Anchor column) and writes the edge. We stopped throwing away information we already had.

— **A hard gate.** Validator L3.7 (CRITICAL): a functional/validation/behavioral/interface requirement with no anchor fails the spec. NFRs and reserved classes (nfr/adr/question) are exempt by design; the rare genuinely-unanchorable functional requirement carries a durable `anchor_exempt` flag — a hard gate that stays clearable without being disabled.

— **The tool moved too, not just the prose.** The deterministic gate classifier (`classify-findings.mjs`) re-applies the property exemptions; L3.7's `anchor_exempt` is registered there and test-pinned. Editing the prose alone would have left the flag dead in the verdict — the v2.19.0 lesson, applied.

— **It matches real data.** Checking real project snapshots, the requirement class most often lives in the overloaded `type:'functional'`, not the spelling the plan assumed. So the validator reads `coalesce(rq_type, req_type, type)` and filters the reserved `type` values explicitly — otherwise it would have silently missed real dangling requirements.

— **An upgrade path.** The gate is hard from day one, so existing graphs need anchoring. `docs/runbooks/requirement-anchoring-upgrade.md` is a self-contained, agent-runnable, idempotent per-project runbook: high-confidence anchors auto-written (and revertable by a `provenance:'backfill'` filter), ambiguous ones surfaced for a human — never silently guessed.

Scope is deliberately tight: SA requirements only (BA already anchored), additive to every consumer, legacy properties readable one more release.

Release notes: docs/releases/2.21.0-requirement-anchoring/release-notes.md
