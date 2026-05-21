**NaCl 0.18.0 released — verification-evidence writer contract**

0.13.0 added the "Evidence level" column to `/nacl-tl-release` and gated the pre-merge UC status query on `Task.verification_evidence`. The reader landed; the writer didn't. Until 0.18.0, no skill in the TL pipeline wrote that property. Every conductor run finished with a clean PASS table, and every release call immediately afterwards halted with "Verification gap: <task> has no verification_evidence in the graph". Not a release bug, not a conductor bug — a methodological gap. 0.18.0 closes it end-to-end.

The release threads three principles: (1) one canonical taxonomy for evidence, never restated; (2) writers are explicit and contractual — every skill that advances a Task to a terminal status writes evidence in the same Cypher block as `t.status`; (3) the orchestrator surfaces the gap, never the release — conductor's Phase 4 now checks the same property the release skill checks, and HALTs before Phase 5 if any terminal-state task is missing evidence.

Highlights:

— **Taxonomy in one place.** `nacl-core/SKILL.md` § Task.verification_evidence defines four allowed values: `test-GREEN:<repo-relative path>` (PASS + regression test went RED→GREEN), `test-UNVERIFIED` (UNVERIFIED / BLOCKED), `no-test` (explicit override at conductor or deliver), and NULL (only on `failed`, excluded from release scope). Codex pilot has a parallel reference at `skills-for-codex/references/verification-evidence.md`. The schema documentation `graph-infra/schema/tl-schema.cypher` now lists the property in the extended Task comment block.

— **Writers — conductor Phase 3.** PASS / UNVERIFIED / BLOCKED graph writes now SET `t.verification_evidence` in the same statement as `t.status`. `$evidence` is composed by parsing the sub-skill report's canonical `Regression test:` line. A PASS report without that line HALTs with `CONDUCTOR HALTED — UNVERIFIED (PASS report missing Regression test line: <taskId>)` rather than silently writing `done` with empty evidence.

— **Writers — tl-full, tl-deliver, tl-hotfix.** `nacl-tl-full` Step 8 collects regression-test paths from both BE and FE dev reports and composes `test-GREEN:<be_path>;<fe_path>`. The TECH-path Step 1.g gets the same treatment. `nacl-tl-deliver` under `--skip-verify` writes `'no-test'` alongside the existing `verification_skip_reason`. `nacl-tl-hotfix` gains a new Step 4.3 that writes `test-GREEN:<path>` to every affected Task node before the PR is opened. `nacl-tl-fix` is intentionally unchanged — it produces the report; orchestrators consume it and write the graph.

— **Leaf-side surfacing.** `nacl-tl-regression-test`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, and `nacl-tl-dev` now emit a canonical machine-readable `Regression test: <repo-relative path>` line in their final reports (or `Regression test: none — UNVERIFIED` / `Regression test: n/a — NO_INFRA` for the negative paths). One line per test file when multiple files were written. The path format is repo-relative, forward-slash, no leading `./`.

— **Conductor Phase 4 evidence-completeness gate.** A second graph-truth query runs after the existing in-progress check: any terminal-state task with NULL or empty `verification_evidence` HALTs the conductor before Phase 5 with an explicit writer-contract advisory. Data-integrity guard, not a routine warning — under correctly-working writers it never fires.

— **Conductor Phase 6 — Evidence column + footer.** The Development per-item table gains an Evidence column showing the same value the release skill will surface in its Evidence-level column. If any task carries `test-UNVERIFIED` or `no-test`, a `Verification gaps:` footer mirrors the release skill exactly, computed from a single Cypher query. The operator learns about gaps at conductor time, not after release has started. Silence is the positive signal — the footer is omitted entirely when there are no gaps.

— **Codex pilot mirror.** A new `skills-for-codex/references/verification-evidence.md` carries the taxonomy in Codex-pilot wording (closed VERIFIED/FAILED/PARTIALLY_VERIFIED/BLOCKED/NOT_RUN/UNVERIFIED vocabulary). Every codex skill that participates in terminal writes (conductor, tl-full, tl-deliver, tl-hotfix) and every leaf that surfaces a regression-test path (regression-test, dev, dev-be, dev-fe) references the new file.

No invocation changes. No graph property renamed or removed. Existing graphs work; legacy `done` tasks predating this release will be surfaced once by the release skill's gap footer, prompting reconciliation through `/nacl-tl-diagnose` or a small manual Cypher patch when the regression test path is known.

The writer was already promised in 0.13.0 release notes — present in the spec, absent in the code. 0.18.0 lands it exactly as the original methodology required, with the necessary HALT gates to keep the contract honest.

Full release notes: docs/releases/0.18.0-evidence-writer-contract/release-notes.md
