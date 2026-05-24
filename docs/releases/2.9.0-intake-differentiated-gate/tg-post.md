NaCl 2.9.0 — Intake Differentiated Confirmation Gate

`/nacl-tl-intake` no longer fires the same generic "Correct? [yes / adjust / skip]" prompt after every atom classification. The gate is now case-driven: clean HIGH-confidence graph-backed calls auto-route without prompting, and the cases that *do* warrant a prompt get a template that names the actual ambiguity instead of asking a question that hides it.

Trigger: an atom was classified BUG (L2) with HIGH+GRAPH evidence. Reasoning correctly surfaced a spec gap — *"UC-X does not currently specify the per-iteration naming/chronology convention the user is asking for"* — yet the prompt rendered as a generic confirmation. The real bug-vs-feature decision (was the requirement *implicit-but-missed* or *new scope*?) never reached the user as an answerable question.

What changed:

— New `SPEC_GAP` branch in Step 2b's decision tree. Under the existing `detail_status = detailed | approved` arm, three outcomes are now possible: matches existing spec → BUG, wants different existing behavior → FEATURE, or **SPEC_GAP** → BUG (L2) with `spec_gap: true` and a `POLICY_CALL` flag on the bug-vs-feature resolution. Four heuristics set `spec_gap: true`: per-X qualifier absent from the matched UC's name/description, refinement noun (naming, ordering, chronology, count, format detail) not in acceptance criteria, UI element / artifact type unreachable via `HAS_FORM → HAS_FIELD` or `PRODUCES`, or the reasoning naturally containing "spec gap also present" / "UC-X does not currently specify ...".

— Five prompt templates selected by a small case table in Step 2b:
  • **A** auto-route, no prompt — HIGH+GRAPH, no spec gap, L0/L1
  • **B** launch-sanity check — HIGH+GRAPH, no spec gap, L2/L3 (asks about launch readiness, not classification)
  • **C** SPEC_GAP policy-call prompt — HIGH+GRAPH, `spec_gap: true` (names the sub-aspect, offers BUG / FEATURE / SKIP with implicit-requirement vs. new-scope explanation)
  • **D** recommendation prompt — MEDIUM+GRAPH (leading option + alternatives + reasoning)
  • **E** open-disambiguation prompt — LOW / HEURISTIC (BUG / FEATURE / TASK / SKIP with equal weight, no forced recommendation)

— `--yes` flag scope tightened. Auto-confirm (Template A) fires ONLY when ALL of `confidence: HIGH`, `evidence: GRAPH`, `spec_gap: false`, and classification level L0/L1 hold. The flag does NOT bypass SPEC_GAP atoms (template C), L2/L3 atoms (template B), MEDIUM atoms (template D), or LOW/HEURISTIC atoms (template E). Two implications: clean L0/L1 HIGH+GRAPH atoms now auto-route *without* `--yes`, and L2/L3 HIGH+GRAPH atoms now prompt *with* `--yes` — because launch readiness and classification certainty are not the same question.

— Step 2d evidence block extended with explicit `Spec gap:` and `Level:` lines so the gate-template selection is auditable from the printed output.

— Final-summary headline rule added: `INTAKE TRIAGE APPLIED — REROUTED (spec-gap policy call: N atoms moved to /nacl-sa-feature)` when one or more atoms travelled through the SPEC_GAP gate to FEATURE. All other headline rules unchanged.

— Codex contract variant (`skills-for-codex/nacl-tl-intake`) gets one bullet under Source-Parity Requirements referencing the differentiated gate; decision tree and templates live in the main skill.

Migration impact: none for downstream projects. Inputs unchanged, downstream skill invocations unchanged, no `config.yaml` / Neo4j / YouGile schema changes. The `--yes` behavior shift is intentional and additive — more auto-route cases (L0/L1 clean), one new prompt case (L2/L3 launch-sanity).

Full release notes: docs/releases/2.9.0-intake-differentiated-gate/release-notes.md

https://github.com/ITSalt/NaCl
