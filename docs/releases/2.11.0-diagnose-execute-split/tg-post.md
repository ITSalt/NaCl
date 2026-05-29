NaCl 2.11.0 — diagnose-execute-split

`/nacl-tl-fix` was a monolith running entirely on Sonnet — because it ends in code generation and was routed wholesale to the developer agent. But its first five steps aren't code generation: graph impact traversal, gap-check, L0/L1/L2/L3 classification, correct-behavior definition, spec authoring. That's deep-reasoning work, and running it on Sonnet under-powered the single most important guardrail in the skill — the L3-feature classification.

What ships:

— New 7th agent, `diagnostician` (Opus, high effort). It runs the fix's diagnose-and-spec phase (Steps 1–5) as a sub-agent and returns a structured fix-plan. It authors specs/docs/graph nodes — never production code, never commits.

— `/nacl-tl-fix` is now a two-phase orchestrator: Phase A (diagnose & spec) on Opus via the diagnostician; the USER GATE presented between phases; Phase B (execute: baseline → RED-first regression test → apply → six-status → impact survey) inline on Sonnet. The seam falls after Step 5, so Sonnet receives a complete spec — restoring the developer-tier premise of "codegen from complete specifications."

— Phase B is the same honest-execution core that dev-be/fe --continue, reopened, and hotfix already delegate into — they're thin wrappers over it, not peers. A new `## Contract` section makes that dependency explicit.

— L1 spec-first gate fixed. The gate required a spec-update commit for "L1 or higher", but a pure L1 changes no docs and could never produce one — so every honest L1 was forced to BLOCK or file a signed exception. L1 now passes with a gap-check attestation (the diagnostician's "docs current, no drift" verdict, recorded to .tl/status.json before code). Anti-gaming preserved: no attestation → FAIL (the "jumped straight to code" case).

— Design Principle 1 sharpened: "thinkers don't write" → "thinkers don't write code." An Opus agent may write specs, not code, and must not commit. The firewall is spec author ≠ code author.

No breaking changes — the output contract and default behavior are preserved; the Codex variant stays monolithic (no sub-agents in that runtime).

Release notes: docs/releases/2.11.0-diagnose-execute-split/release-notes.md
