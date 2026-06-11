# Release 2.20.0 — `type-aware-release-gate`

## Theme

A NaCl-built project (`family-cinema`) halted on *every* release: `/nacl-tl-release`
Step 2 refused the merge with `RELEASE HALTED — MISSING TASK NODE`, even though the work
was fixed via `/nacl-tl-fix` and shipped via `/nacl-tl-ship` exactly as designed. The
cause was a category error in the gate, not the user's workflow. The pre-merge gate —
hardened in 0.13.0 to be graph-only — ran one query for *every* PR
(`MATCH (t:Task) WHERE t.id IN [<UC list>]`) and halted if no Task node was found. But
that assumes every PR is a planned feature with UC-keyed Task nodes. The bug-fix path
deliberately records a fix as a **Decision** node (`DEC-NNN`), not a Task — and L0/L1
code-only fixes record no graph node at all. So a correctly-recorded fix could never pass
the gate. This release makes the gate **type-aware**: it verifies the artifact each PR
type actually produces.

## The gate now branches on PR type

Step 2 dispatches on the PR's conventional-commit prefix:

- **Feature PR** (`feat:`) → the Task-node check, **unchanged**: graph-only, `MISSING TASK
  NODE` halt on a truly absent Task, the same UNVERIFIED / blocked / REGRESSION branches.
- **Fix PR** (`fix:`) → a **Decision / level check**. A spec-changing fix
  (L2 / L3-spec-gap) must carry an accepted `Decision` node — the graph-native "why"
  `nacl-tl-fix` already authors. A code-only fix (L0 / L1) carries no Decision; its
  `Fix-level` marker is the proof.

A fix PR is **never** halted for lacking a Task node. The gate still HALTs on genuine
**unrecorded spec drift** — a behavior-changing fix with no accepted Decision behind it —
so the 0.13.0 "graph is the source of truth" guarantee is preserved, just verified against
the right node.

## The deterministic PR→graph link

`nacl-tl-fix` now stamps two trailer lines on the code-fix commit (and surfaces them in
its Step 8 report):

    Fix-level: L0 | L1 | L2 | L3-spec-gap
    Fix-decision: DEC-NNN[, DEC-NNN ...] | none

These are squash-safe (they live in the commit/PR body, not per-commit SHAs) and let the
release gate find a fix's Decision without guessing. Bundled PRs carry several — the
release gate verifies all of them; the strictest level governs. `nacl-tl-ship` propagates
the trailer when it authors a fix commit (`--auto-ship` / manual). PRs predating the
trailer fall back to a `Decision.source` SHA-match.

## The verdict is a tested tool, not prose

The per-PR verdict is computed by `nacl-core/scripts/classify-pr-merge.mjs` — a pure,
single-authority classifier (the `classify-findings.mjs` pattern: it never opens Neo4j;
the skill feeds it the graph rows + trailers), pinned by `classify-pr-merge.test.mjs` and
run in CI by `test-tools.yml`. Verdicts are `MERGE` / `USER_GATE` / `HALT` with a
graph-proof string that drives the merge-plan's new **"Graph proof"** column
(`Task done` · `Decision DEC-045 accepted` · `code-only (L1)`).

## Bounded status.json corroboration

For L0/L1 code-only fix PRs only — a calibrated exception to the 0.13.0 no-JSON-fallback
rule — the gate may read `.tl/status.json` `phases.spec.kind == "gapcheck-no-drift"` to
corroborate the "no spec drift" claim. Its absence is never a halt: the `Fix-level` trailer
is authoritative (`nacl-tl-fix` already enforced the 6.SF spec-first gate before the code
commit landed).

## Verification

A replay fixture (`tests/fixtures/release-fix-gate/`, materialized
`expected-outcome.json`) pins five PRs — including the real bundled `family-cinema` PR #55
(`fix(UC-032/033)…(DEC-045)`): a feature still MERGEs on its Task; a Decision-backed fix
MERGEs with **no** Task node (the exact case that halted); a code-only fix MERGEs on its
`Fix-level`; a fix claiming a missing Decision still HALTs as `UNRECORDED SPEC DRIFT`; a
bundled two-Decision fix MERGEs. `node --test` across all tools green (20 new + 38
existing); codex-sync gate VERIFIED; lint-skills (frontmatter / paths / branch-literals /
version-pins) clean; privacy canary on the full diff clean.

## Files

`nacl-tl-release/SKILL.md` (Step 2 type-aware gate + "Graph proof" merge plan + secondary
gate refs), `nacl-tl-fix/SKILL.md` (`Fix-level`/`Fix-decision` trailer + Step 8 report),
`nacl-tl-ship/SKILL.md` (trailer propagation), `nacl-core/scripts/classify-pr-merge.mjs`
(+ `.test.mjs`, new), `tests/fixtures/release-fix-gate/` (new),
`skills-for-codex/nacl-tl-fix/SKILL.md` (mirror), two sync-exemptions
(`nacl-tl-release`, `nacl-tl-ship`).
