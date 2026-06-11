NaCl 2.20.0 — type-aware-release-gate

A NaCl-built project halted on every release. `/nacl-tl-release` refused the merge with `RELEASE HALTED — MISSING TASK NODE` — even though every fix went through `/nacl-tl-fix` and `/nacl-tl-ship` exactly as designed. The workflow was right; the gate had a category error. Hardened in 0.13.0 to be graph-only, the pre-merge gate ran one query for *every* PR — `MATCH (t:Task) WHERE t.id IN [...]` — and halted if no Task node existed. But that assumes every PR is a planned feature. The bug-fix path deliberately records a fix as a **Decision** node, not a Task — so a correctly-recorded fix could never pass. This release makes the gate type-aware.

What's inside:

— **The gate branches on PR type.** Feature PRs (`feat:`) keep the Task-node check, unchanged. Fix PRs (`fix:`) are verified by the **Decision** node `nacl-tl-fix` already authors (L2/L3-spec-gap) or a code-only `Fix-level` marker (L0/L1) — never a Task node. A fix is never halted for lacking a Task it was never supposed to have.

— **Drift is still caught.** The gate still HALTs on genuine unrecorded spec drift — a behavior-changing fix with no accepted Decision behind it. The 0.13.0 "graph is the source of truth" guarantee is preserved, just verified against the right node.

— **A deterministic PR→graph link.** `nacl-tl-fix` stamps `Fix-level:` / `Fix-decision:` trailers on the fix commit (squash-safe, in the commit body); the release gate reads them to find the Decision without guessing. Bundled PRs carry several — all are verified.

— **The verdict is a tested tool.** `nacl-core/scripts/classify-pr-merge.mjs` — pure, never opens Neo4j, pinned by tests, run in CI. Verdicts `MERGE` / `USER_GATE` / `HALT` with a graph-proof string feeding the merge plan's new "Graph proof" column.

Verified on a replay fixture built from the real bundled PR that was halting: a Decision-backed fix now merges with no Task node; a fix claiming a missing Decision still halts. All tool tests green; codex-sync and lint gates clean.

Release notes: docs/releases/2.20.0-type-aware-release-gate/release-notes.md
