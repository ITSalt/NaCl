# NaCl 0.18.0 — Verification-Evidence Writer Contract

0.13.0 introduced an "Evidence level" column in `/nacl-tl-release`'s
report and gated the pre-merge UC status query on
`Task.verification_evidence`. Everything on the reader side shipped; the
writer side did not. From that release until this one, **no skill in the
TL pipeline wrote `Task.verification_evidence` to the graph**. Every
release call therefore saw `NULL`, classified the field as `unknown`, and
printed a "Verification gap" footer — regardless of how thoroughly the
conductor had verified the work.

The symptom seen in the field: `/nacl-tl-conductor` would declare
`CONDUCTOR COMPLETE` with a clean `1 PASS, tests N/N green, status=done in
graph` summary, the operator would immediately run `/nacl-tl-release`, and
release would halt with:

> Verification gap: <task-id> has no verification_evidence in the graph.
> Task is marked done but no RED→GREEN test artifact recorded.

This is not a conductor bug, not a release bug, and not a graph bug — it is
a methodological gap. The contract for `verification_evidence` was
under-specified: the property had a single reader (release) and no defined
writer. 0.18.0 closes the gap end-to-end.

The release threads three principles:

1. **One canonical taxonomy.** `Task.verification_evidence` has exactly
   four allowed shapes, lives in a single source-of-truth document, and is
   never restated in individual skill bodies.
2. **Writers are explicit and contractual.** Every skill that advances a
   `Task` to a terminal status now writes evidence in the same Cypher
   statement that writes `t.status`. Skills that aggregate child statuses
   (conductor, tl-full) refuse to declare `done` without parseable
   regression-test evidence.
3. **The orchestrator surfaces the gap, never the release.** Conductor's
   Phase 4 quality gate now checks the same property the release skill
   checks. If any terminal-state task in the intake has empty evidence,
   conductor HALTs before Phase 5 — the operator learns about the gap at
   orchestration time, not after the release has already started.

No invocation syntax changed. No existing graph property was renamed or
removed. Existing graphs continue to work; legacy `done` tasks that
predate this release retain `NULL` evidence and will be surfaced once by
the release skill's verification-gap footer, prompting reconciliation.

---

## Taxonomy — `Task.verification_evidence`

A new section in `nacl-core/SKILL.md` (§ Task.verification_evidence) is the
canonical reference. Codex pilot has a parallel reference at
`skills-for-codex/references/verification-evidence.md`. Both define the
same four values:

| Value | When written |
|---|---|
| `test-GREEN:<repo-relative path>` | Status `PASS` + regression test transitioned RED→GREEN. `<repo-relative path>` is forward-slash, no leading `./` or `/`. Two paths joined by `;` when both BE and FE regression tests exist for one UC. |
| `test-UNVERIFIED` | Status `UNVERIFIED` or `BLOCKED` — change applied, but RED→GREEN not confirmed. |
| `no-test` | Status `PASS` under explicit user override (`--no-test` on conductor, `--skip-verify` on deliver). |
| (unset / NULL) | Status `failed` only — task is excluded from the release scope, so no evidence string is required. |

The reader contract is unchanged: prefix `test-GREEN:` →
`Evidence level = test-GREEN`; literal `test-UNVERIFIED` /
`no-test` → mapped 1:1; anything else (including NULL) →
`Evidence level = unknown`, surfaced as a "Verification gap" footer.

The schema documentation `graph-infra/schema/tl-schema.cypher` now lists
`verification_evidence` in the extended `Task` properties comment.

---

## Writers

Every skill that advances a `Task` to a terminal status sets
`verification_evidence` in the **same** Cypher write that sets `t.status`.
No skill writes the field separately; no skill leaves it NULL on a
non-`failed` task.

### `nacl-tl-conductor` Phase 3 (the canary case)

The PASS / UNVERIFIED / BLOCKED graph writes are extended:

```cypher
// PASS — task verified and committed
MATCH (t:Task {id: $taskId})
SET t.status = 'done',
    t.commit = $commitHash,
    t.completed_at = datetime(),
    t.verification_evidence = $evidence  // 'test-GREEN:<path>' or 'no-test'
```

`$evidence` is composed by parsing the sub-skill (`nacl-tl-full` /
`nacl-tl-fix`) report for the canonical `Regression test:` line:

| Sub-skill `Status:` | `Regression test:` value | `$evidence` |
|---|---|---|
| PASS | `<path>` | `'test-GREEN:' + <path>` |
| PASS | `covered by existing test: <path>` | `'test-GREEN:' + <path>` |
| PASS | `none — UNVERIFIED` | **HALT** — `CONDUCTOR HALTED — UNVERIFIED (PASS report missing Regression test line: <taskId>)`. Conductor refuses to write `done` without evidence. |
| PASS + `--no-test` override | any | `'no-test'` |
| UNVERIFIED | any | `'test-UNVERIFIED'` |
| BLOCKED | any | `'test-UNVERIFIED'` |

The `failed` write is unchanged: `verification_evidence` is intentionally
NOT set, because the release skill excludes failed tasks from the merge
plan and the evidence column would be misleading.

### `nacl-tl-full` Step 8

When `nacl-tl-full` is invoked outside the conductor (single-task path,
direct invocation), it is the terminal writer. Step 8 (Documentation) now
collects regression-test paths from both BE and FE dev sub-skill reports
and composes:

- BE PASS + FE PASS with paths → `test-GREEN:<be_path>;<fe_path>`
- Only one side has a path → `test-GREEN:<path>`
- Any phase UNVERIFIED / BLOCKED → `test-UNVERIFIED`
- `--no-test` was passed → `no-test`

If aggregated status is `done` but no regression test path was parseable
from either side, tl-full HALTs the wave the same way conductor HALTs the
batch — no silent empty-evidence write.

The Wave 0 TECH path gains the same treatment: PASS without a parseable
`Regression test:` line halts with
`FULL HALTED — UNVERIFIED (TECH-###: PASS without Regression test path)`.

### `nacl-tl-deliver` under `--skip-verify`

The `--skip-verify` branch already wrote `verification_skip_reason` to
every Task in scope. It now also writes
`verification_evidence = 'no-test'` in the same Cypher statement. The
operator's explicit decision to skip verification is recorded as a
positive evidence value, not left to the release skill to infer as
`unknown`.

### `nacl-tl-hotfix` Step 4.3 (new)

A new sub-step between baseline validation (Step 4.2) and commit (Step 5)
writes evidence to every affected Task node:

```cypher
UNWIND $affectedTaskIds AS taskId
MATCH (t:Task {id: taskId})
SET t.verification_evidence = $evidence,
    t.updated = datetime()
```

`$affectedTaskIds` are collected from `/nacl-tl-fix`'s Step 8 triage
report (the "Affected UCs" list). `$evidence` is `'test-GREEN:' +
regression_test_path` when Step 4.2 returned PASS; the BLOCKED /
NO_INFRA / RUNNER_BROKEN paths defer evidence to the Step 6 user
override. If `IMPACT_UNVERIFIED` was set, the write is skipped with a
logged warning — the PR is still opened, the release skill will surface
the gap, and `/nacl-tl-reconcile` is recommended.

### `nacl-tl-fix` (intentionally unchanged)

`nacl-tl-fix` does not write to the graph itself. It produces the
canonical `Regression test:` line in its Step 8 report, and upstream
orchestrators (`conductor`, `tl-full`, `hotfix`, `reopened`) consume that
line. This division of responsibility is preserved: writers own graph
writes; the fix skill owns the report contract.

---

## Leaf-side surfacing of the regression-test path

For orchestrators to write `test-GREEN:<path>` they need the path. The
leaf skills now emit a canonical machine-readable line in their final
reports:

```
Regression test: <repo-relative path>
```

(Or `Regression test: none — UNVERIFIED` / `Regression test: n/a — NO_INFRA`
for the non-positive paths.)

Skills updated:

- `nacl-tl-regression-test` — both `REGRESSION TEST WRITTEN` (bug-fix mode)
  and `FEATURE-TEST WRITTEN` (feature-dev mode) report blocks gain the
  canonical line; one line per test file when multiple files were
  written in one invocation.
- `nacl-tl-dev-be` and `nacl-tl-dev-fe` — the `Tests:` block in the
  primary `DEV-BE COMPLETE` / `DEV-FE COMPLETE` (and APPLIED — *) report
  template gains the `Regression test:` row. The `--continue` variant
  already captured a `Regression-test seam` block from `/nacl-tl-fix`;
  that remains unchanged.
- `nacl-tl-dev` (TECH path) — the `Verification:` block gains the same
  row.
- `nacl-tl-fix` — already had a `Regression test:` row in its Step 8
  report (since 0.15.0). This release does not change the format, only
  promotes that row from "useful debug context" to "machine-readable
  contract that orchestrators parse."

The path format is repo-relative, forward-slash, no leading `./`. When the
test artifact lives in `.tl/tasks/<TASK_ID>/regression-test.md` rather
than a source-tree test file, that path is used instead.

---

## Conductor quality gate (Phase 4)

Conductor's Phase 4 already had a graph-truth gate that HALTed if any
task remained in `pending` / `in_progress` after development. A second
graph-truth gate is added — the evidence-completeness check:

```cypher
MATCH (t:Task)
WHERE t.intake_id = $intakeId
  AND t.status IN ['done', 'verified-pending', 'blocked']
  AND (t.verification_evidence IS NULL OR t.verification_evidence = '')
RETURN t.id AS taskId, t.status AS currentStatus
```

If this query returns any rows, conductor HALTs before Phase 5 with an
explicit writer-contract advisory:

```
HALT — verification_evidence missing on terminal tasks.

The following tasks reached a terminal status but have no evidence
string in Neo4j. `nacl-tl-release` would surface this as a
"Verification gap" — that is a contract violation, not normal output.

  <taskId>  graph status: <currentStatus>  evidence: NULL

This is a writer bug: every Phase 3 graph write (PASS / UNVERIFIED /
BLOCKED) must set `t.verification_evidence` per the taxonomy in
`nacl-core/SKILL.md`. Resolution options:

  [1] Re-run /nacl-tl-full <taskId> — replay the task; the writer
      should populate evidence on the second pass.
  [2] Run /nacl-tl-diagnose to inspect the graph state.
  [3] Abort this conductor run and patch the writer that left
      evidence NULL.

Do NOT manually set evidence to bypass this gate — that masks the
underlying writer regression.
```

This is a data-integrity guard, not a routine warning. Under
correctly-working writers it never fires.

---

## Conductor Phase 6 — Evidence column + Verification gaps footer

The Phase 6 final report gains visibility into the evidence the conductor
just wrote, so the operator sees the same information `/nacl-tl-release`
will see — at conductor time, not after release has started.

The Development section's per-item table now includes an Evidence column:

```
Development:
  TECH-001: Shared types setup    (commit abc1234)  -- DONE        [PASS]        Evidence: test-GREEN (backend/src/__tests__/shared-types.spec.ts)
  UC028: Image format selection   (commit def5678)  -- DONE        [PASS]        Evidence: test-GREEN (frontend/src/components/__tests__/format-selector.spec.tsx)
  UC029: Scene prompt display     (no commit)       -- UNVERIFIED  [UNVERIFIED]  Evidence: test-UNVERIFIED
  BUG-003: Share button on mobile (commit 789abcd)  -- DONE        [PASS]        Evidence: test-GREEN (frontend/src/__tests__/share-button.spec.tsx)
```

If any terminal-state task carries `test-UNVERIFIED` or `no-test`
evidence, a footer mirrors the release skill exactly:

```
Verification gaps: UC029 (test-UNVERIFIED) — release will surface this.
```

Computed from a single Cypher query (same filter as the release skill).
If the result is empty, the footer is omitted entirely — silence is the
positive signal.

---

## Codex pilot mirror

`skills-for-codex/references/verification-evidence.md` is new and carries
the taxonomy in Codex-pilot wording (using the closed `VERIFIED` /
`FAILED` / `PARTIALLY_VERIFIED` / `BLOCKED` / `NOT_RUN` / `UNVERIFIED`
status vocabulary instead of the Claude six-status vocabulary).

The reference is linked from the codex copies of:

- `nacl-core` — added to the Core Rules list.
- `nacl-tl-conductor` — Phase 4 evidence-completeness gate, Phase 5
  Evidence column note, Verification gaps footer.
- `nacl-tl-full` — Orchestration Rules: terminal status writes carry
  evidence.
- `nacl-tl-deliver` — `--skip-verify` writes `no-test`.
- `nacl-tl-hotfix` — Step 5 writes `test-GREEN:<path>` when VERIFIED.
- `nacl-tl-regression-test` — canonical `Regression test: <path>` line in
  the source-parity requirements.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` — the result report
  contract gains the `Regression test:` row.

---

## Files touched

Source-of-truth and schema:

- `nacl-core/SKILL.md` — new § Task.verification_evidence
- `graph-infra/schema/tl-schema.cypher` — extended Task property comment

Writers:

- `nacl-tl-conductor/SKILL.md` — Phase 3 writers, Phase 4 evidence gate,
  Phase 6 evidence column + footer
- `nacl-tl-full/SKILL.md` — Step 8 aggregator, TECH-path graph write
- `nacl-tl-deliver/SKILL.md` — `--skip-verify` evidence write
- `nacl-tl-hotfix/SKILL.md` — new Step 4.3

Leaf surface:

- `nacl-tl-regression-test/SKILL.md`
- `nacl-tl-dev-be/SKILL.md`
- `nacl-tl-dev-fe/SKILL.md`
- `nacl-tl-dev/SKILL.md`

Codex pilot mirror:

- `skills-for-codex/references/verification-evidence.md` (new)
- `skills-for-codex/nacl-core/SKILL.md`
- `skills-for-codex/nacl-tl-conductor/SKILL.md`
- `skills-for-codex/nacl-tl-full/SKILL.md`
- `skills-for-codex/nacl-tl-deliver/SKILL.md`
- `skills-for-codex/nacl-tl-hotfix/SKILL.md`
- `skills-for-codex/nacl-tl-regression-test/SKILL.md`
- `skills-for-codex/nacl-tl-dev-be/SKILL.md`
- `skills-for-codex/nacl-tl-dev-fe/SKILL.md`
- `skills-for-codex/nacl-tl-dev/SKILL.md`

---

## Verification

The release was verified against the taxonomy by re-reading the writer
sites and checking each writes evidence in the same Cypher block as
`t.status`. Operationally, end-to-end verification requires a small
canary run:

1. Run `/nacl-tl-conductor` on a single-UC feature. Confirm via
   `MATCH (t:Task) WHERE t.intake_id = $intake RETURN t.id, t.status,
   t.verification_evidence` that every done task has a non-NULL evidence
   string.
2. Inspect the conductor's Phase 6 report — the Development table must
   show an Evidence column with `test-GREEN (<path>)` for each PASS task.
3. Run `/nacl-tl-release` immediately afterwards. Confirm no
   "Verification gap" footer appears.
4. Negative path: manually `SET t.verification_evidence = NULL` on one
   done task and re-run conductor Phase 4. The evidence-completeness
   gate must HALT before Phase 5 with the writer-contract advisory.
5. UNVERIFIED path: run with a UC that has no test-spec. Conductor must
   write `'test-UNVERIFIED'` and surface a `Verification gaps:` footer in
   Phase 6.

---

## Upgrade notes

- **No invocation changes.** Existing `/nacl-tl-conductor`,
  `/nacl-tl-full`, `/nacl-tl-deliver`, `/nacl-tl-hotfix` invocations work
  unchanged.
- **Legacy tasks.** Tasks marked `done` before 0.18.0 carry
  `verification_evidence = NULL`. The next release call surfaces them
  once as `unknown` in the Evidence column with the standard
  "Verification gap" footer. Reconcile with `/nacl-tl-diagnose` or
  re-stamp via a small Cypher patch if the regression test path is
  known.
- **Writer HALTs are intentional.** A PASS report without a parseable
  `Regression test:` line is treated as a contract violation. If a
  legitimate `--no-test` workflow exists, pass the override flag
  explicitly; do not patch evidence values manually around the gate.

---

## Why this is a single-cycle bug fix, not a methodology change

The methodology already promised the property in 0.13.0 release notes
("Release report gains per-UC columns (`UC status`, `Evidence level`)
drawn from `t.verification_evidence`"). The writer was the missing
implementation — present in the spec, absent in the code. 0.18.0 lands
the writers exactly as the original methodology required, with the
necessary HALT gates to keep the contract honest.
