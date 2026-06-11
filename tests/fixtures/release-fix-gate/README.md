# Fixture: release-fix-gate

Replay target for the `nacl-tl-release` Step 2 **type-aware pre-merge graph-proof gate**
(`nacl-core/scripts/classify-pr-merge.mjs`). Proves the gate verifies the artifact each PR
type actually produces — and, critically, that it no longer halts a `fix:` PR for lacking a
Task node, while STILL halting genuine unrecorded spec drift.

## Source episode

Family Cinema, every release: `/nacl-tl-release` halted at Step 2 with
`RELEASE HALTED — MISSING TASK NODE` for the bundled fix PR #55
(`fix(UC-032/033): roll session→error on memories pipeline failure (DEC-045)`). The fix was
recorded correctly — a `Decision` node `DEC-045`, `spec_version` bump, staleness stamps — but
the gate demanded a `Task` node, which the bug-fix path (`nacl-tl-fix` → `nacl-tl-ship`)
deliberately never creates. So a correct fix could never be released.

## The five candidate PRs (`prs.json`)

Each entry is the classifier input the gate assembles for one PR (graph rows + `Fix-*`
trailers). Underscore fields (`_pr`, `_title`, `_note`) are documentation; the classifier
ignores them.

| PR | Shape | Expected | Why |
|----|-------|----------|-----|
| **A** | feature, Task `done` | `MERGE` (Task done) | Feature path unchanged — regression guard. |
| **B** | the real #55: bundled `L2`+`L1`+`L1`, `DEC-045` accepted, **no Task node** | `MERGE` (Decision DEC-045 accepted) | The exact case the old gate halted. The spec-changing part is backed by its accepted Decision; the code-only parts add none. |
| **C** | code-only `L1`, `Fix-decision: none`, `gapcheck-no-drift` | `MERGE` (code-only (L1) …) | No spec drift → no Decision required; the `Fix-level` trailer is the proof, status.json corroborates. Never halts. |
| **D** | `L2` claiming `DEC-091`, **graph has no such accepted node** | `HALT — UNRECORDED_SPEC_DRIFT` | Safety property: a behavior-changing fix with no accepted Decision still halts. |
| **E** | bundled `L2`+`L2`, `DEC-092`+`DEC-093` both accepted | `MERGE` (Decision DEC-092, DEC-093 accepted) | Multi-Decision verification. Flip either DEC to missing → HALT (asserted inline in the unit test, case E). |

## Expected outcome (`expected-outcome.json`)

Materialized per-PR `{verdict, detail, proof}`. The replay assertion lives in
`nacl-core/scripts/classify-pr-merge.test.mjs` (`fixture replay: release-fix-gate …`), which
feeds `prs.json` through `classifyPrMerge` and asserts byte-equality with this file. Any drift
between the classifier and this artifact fails CI (`test-tools.yml`).

## What must hold

- **B and E MERGE** — Decision-backed fixes release despite having no Task node.
- **C MERGEs** — code-only fixes release on the `Fix-level` marker alone.
- **D HALTs** — genuine unrecorded drift is still caught (the 0.13.0 "graph is source of truth"
  guarantee is preserved for fixes, just verified against the right node).
- **A is untouched** — the feature Task-node gate (incl. its own `MISSING TASK NODE` halt on a
  truly missing Task) is unchanged.
