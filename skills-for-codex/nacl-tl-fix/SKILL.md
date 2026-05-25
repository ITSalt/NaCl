---
name: nacl-tl-fix
description: |
  Repair NaCl TL defects with spec-first analysis, strict RED-first regression
  testing, documentation synchronization before code when behavior contracts
  changed, graph-aware UC discovery, validation, changelog evidence, and honest
  reporting. Use when fixing a bug, repairing review findings, handling a
  reopened issue, or for compatibility with `/nacl-tl-fix`.
---

# NaCl TL Spec-First Fix For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Fix defects without widening scope. TL artifacts and reports remain English.

Read these references before executing:

- `../references/migration-rules.md`
- `../references/verification-vocabulary.md`
- `../nacl-core/SKILL.md`
- `../nacl-tl-core/SKILL.md`
- `../nacl-tl-core/references/fix-classification-rules.md`
- `../nacl-tl-core/references/sa-doc-update-matrix.md`
- `../nacl-tl-core/references/tdd-workflow.md`

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the
`fix:<BUG-NNN>` alias. Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

Codex itself must not claim that Anthropic `/goal` ran unless the runtime
exposes it and evidence exists. The deterministic proof source is
`../../nacl-goal/checks/fix.sh <BUG-NNN>`. Preserve non-hotfix scope:
emergency L0/L1 production issues route to the refusal or interactive hotfix
path, not this goal loop. GOAL_PROOF is transcript evidence for the evaluator,
not a replacement for local verification.

## Critical Rule: Execute All 8 Steps

Execute every step in order and announce it before acting:

```text
Step 1: TRIAGE
Step 2: CONTEXT LOAD
Step 3: GAP-CHECK
Step 4: DEFINE CORRECT BEHAVIOR
Step 5: FIX DOCS
Step 6: APPLY FIX
Step 7: VALIDATE
Step 8: REPORT
```

Do not jump straight to code. Do not skip triage, graph-aware UC discovery,
context loading, gap-check, documentation synchronization, baseline capture,
RED-first evidence, validation, or the final report. If a step cannot run,
report it with a Codex status and continue only when the workflow allows it.

## Invocation

The user can describe the bug in natural language. They do not need to provide a
UC or TECH id.

Supported flags:

- `--dry-run`: execute Steps 1-4 only; do not edit files.
- `--l1`: force code-only classification only after Step 3 confirms docs are
  current.
- `--uc UC###`: pin the affected UC, but still run graph/file context checks.
- `--from-review`: metadata-only marker. Add `Invocation source: review` to the
  report and changelog; do not relax gates.
- `--auto-ship`: after a fully verified fix, invoke `nacl-tl-ship` only with
  explicit user confirmation available in the current session. Never hotfix
  implicitly.

## Fix Levels

Use `../nacl-tl-core/references/fix-classification-rules.md` as the source of
truth.

| Level | Condition | Docs action |
|---|---|---|
| L0 | Environment or infrastructure issue, not a code/docs defect. | No docs unless deploy/dev docs are stale. |
| L1 | Docs are current; code does not match them. | Do not edit docs. |
| L2 | Docs exist but describe outdated or incorrect behavior. | Update docs before code. |
| L3 | No docs exist for the affected area. | Create the smallest missing contract before code. |

Missing `scripts.test` is not L0. It is a verification outcome
`Fix outcome: NO_INFRA`.

## Spec-First Prerequisite (Strict-Only) — W10 binding

**L1+ blocked without preceding spec-update commit; override via signed exception only.**

For any fix classified L1 or higher (L1, L2, L3 — L0 environment fixes are
exempt), this skill refuses to enter Step 6 (APPLY FIX) unless the fix
chain already contains at least one **spec-update commit** that precedes
the first code-fix commit.

A **spec-update commit** is any commit that mutates one of the following:

1. **Graph state** — creates or modifies a node with one of these Neo4j
   labels: `DomainEntity`, `DomainAttribute`, `Enumeration`, `UseCase`,
   `FormField`, `Module`, `Requirement`, `FeatureRequest`,
   `BusinessRule`, `Activity`. Detection uses the W5 reconciliation
   primitives (live graph reads only; no `.cypher` export fallback).
2. **`.tl/*` schema artifact** — `.tl/tasks/<TASK_ID>/task-{be,fe}.md`,
   `.tl/tasks/<TASK_ID>/api-contract.md`,
   `.tl/tasks/<TASK_ID>/spec.md`,
   `.tl/feature-requests/<FR-ID>.md`,
   `.tl/specs/<UC>.md`, fixtures under `.tl/fixtures/`.
3. **SA-layer docs** — `docs/12-domain/**`, `docs/14-usecases/**`,
   `docs/15-interfaces/**`, `docs/16-requirements/**`.

A commit that touches only code under `src/`, `backend/`, `frontend/`,
`packages/`, or `tests/` (other than fixture files) is a **code-fix
commit**, regardless of its message subject.

### Why this gate exists

Project-Alpha DIAGNOSTIC-REPORT.md (2026-05-18) measured 39% of fixes never
updated docs. The canonical episode: `a7eb747` "docs(SA): UC-105/UC-106/
UC-107 post-commit emit timing (L2)" landed AFTER the FIX-B code wave
(`01f2fcb`, `135b14b`, `6ed12ac`, `3acb2fd`) — docs caught up to code
instead of leading it. Every undocumented fix made the next post-mortem
less trustworthy. This gate makes the pattern impossible to repeat
without an audited signed exception.

### Detection logic (uses W5 reconciliation primitives)

Run at Step 6 entry, after Step 5 has resolved:

1. **Define the fix chain.** Commits between `<merge-base of HEAD with
   main>..HEAD`. For direct-strategy projects, commits between the last
   tag and `HEAD`.

2. **Classify each commit.** Read its file list (`git diff-tree
   --no-commit-id --name-only -r <sha>`). Match against the spec-update
   detector lists above. Code-touch-only commits are code-fix commits.

3. **Detect graph mutation per commit.** Graph writes live outside the
   tree. Resolve in this order:

   a. If `graph-infra/exports/<commit>.cypher` exists, diff the commit's
      export against its parent's export. Any added/modified node with
      one of the listed labels is a graph mutation.
   b. Else if `.tl/changelog.md` addition in the commit references
      `/nacl-sa-*` skill invocation, treat as a graph-mutation commit;
      record `graph-mutation-by-changelog` in the report.
   c. Else report `Status: BLOCKED` with workflow detail
      `graph-delta-unobservable`. The only override is a signed
      exception against gate `spec-first-prerequisite`.

4. **Apply the invariant.** PASS iff there exists at least one
   spec-update commit whose index in the chain is strictly less than
   the index of the first code-fix commit. FAIL otherwise.

5. **Secondary signals from W5 source-of-truth set.**
   - `.tl/status.json` with `phases.docs: done` or `phases.spec: done`
     timestamped before the first code-fix commit →
     `spec-update-by-status-json` signal recorded.
   - `.tl/changelog.md` entry timestamped before the first code-fix
     commit and describing an L2/L3 doc update →
     `spec-update-by-changelog` signal recorded.
   Either signal also satisfies the gate.

### Step 6 entry gate

| # | Condition | Action |
|---|---|---|
| 1 | classification is `L0` | SKIP. Proceed to Step 6 sub-flow. |
| 2 | `--dry-run` is set | SKIP. Record in report; no code is written. |
| 3 | verdict is PASS | Proceed. Record satisfying spec-update commit SHA. |
| 4 | verdict is FAIL AND valid signed exception against `spec-first-prerequisite` exists per W4 schema | Proceed. Header: `FIX APPLIED — UNVERIFIED (spec-first-bypassed-by-signed-exception)`. Record `exception_id`, `expiry`, `followup_task`. |
| 5 | verdict is FAIL AND no signed exception | REFUSE. `Status: BLOCKED`, workflow detail `spec-first-prerequisite-missing`. Print refusal advisory. Exit. |
| 6 | detection emitted `graph-delta-unobservable` AND no signed exception | REFUSE. Workflow detail `graph-delta-unobservable`. |

### Refusal advisory (rule 5)

```text
FIX HALTED — SPEC-FIRST PREREQUISITE MISSING

Classification: L<n>
Fix chain commits: <N>
Spec-update commits: none (or list)
Code-fix commits: <list>
First code-fix commit: <SHA>

The W10 Spec-First prerequisite requires that every L1+ fix be
preceded by a graph mutation or a .tl/* schema artifact change in
the same fix chain. Project-Alpha 2026-05-18 DIAGNOSTIC-REPORT measured
39% of fixes never updated docs; this gate refuses to ship into
that pattern.

Three legitimate paths forward:
  [1] Commit the spec update first (Step 5). Re-invoke.
  [2] Re-classify in Step 3 if L2/L3 was incorrectly downgraded.
  [3] File a signed exception against gate
      `spec-first-prerequisite` per W4 schema:
        affected_gates: [spec-first-prerequisite]
        reason: <concrete justification + why no spec update>
        expiry: <= 24h
        followup_task: <UC or TECH that audits the gap>

Status: BLOCKED
Workflow detail: spec-first-prerequisite-missing
```

### Worked example — the Project-Alpha 39% pattern

Fix chain on `main` between Wave 4 close and the FIX-B audit:

```
01f2fcb  fix(UC-105/UC-106/UC-107): wire post-commit task events    [code-fix]
c83e84f  fix(tests): valid UUID fixtures                            [code-fix]
92da5c7  fix(tests): schema namespace in task.cancel.sse.test       [code-fix]
135b14b  fix(UC-107/UC-150/UC-202): gate post-commit emits           [code-fix]
6ed12ac  fix(UC-107/UC-150/UC-202): cancel/fail race correctness    [code-fix]
3acb2fd  fix(UC-107/UC-202): lock tasks row FOR UPDATE              [code-fix]
a7eb747  docs(SA): UC-105/UC-106/UC-107 post-commit emit timing     [spec-update]
```

The single spec-update commit lands LAST. W10 verdict: FAIL. First
code-fix is `01f2fcb` at index 0; no spec-update commit precedes it.
Rule 5 fires. `Status: BLOCKED`, workflow detail
`spec-first-prerequisite-missing`. Operator paths: (1) reorder by
committing the SA update first and rebasing, or (2) sign an exception
if emergency closure is genuine. Path (1) is what would keep the next
post-mortem readable.

## Workflow

### Step 1: TRIAGE

Goal: identify the defect area, affected UC/docs/tasks, and likely verification
path.

1. If the user provided failing command output, test names, stack traces, or
   error text, inspect that evidence before reading implementation code.
2. Read `config.yaml` when available.
3. If `config.yaml` has a `graph` section, attempt graph-enhanced UC discovery
   before file grep. Use available graph tools only; do not claim graph access
   if tools are unavailable.

   Query pattern:

   ```cypher
   MATCH (uc:UseCase)
   WHERE toLower(uc.name) CONTAINS toLower($keyword)
      OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keyword)
   RETURN uc.id AS id, uc.name AS name, uc.detail_status AS status
   ORDER BY uc.id
   ```

   Extract 2-3 meaningful keywords from the bug description. If graph tools are
   unavailable, report `Status: BLOCKED` for graph triage with the reason, then
   fall back to file search.
4. File fallback: search code, `.tl/tasks/`, `docs/14-usecases/`,
   `docs/12-domain/`, `docs/15-interfaces/`, API contracts, and recent
   changelog/status files.
5. Identify affected code files, UCs, docs, `.tl/tasks/`, and test workspace.
6. For DB/env/migration/deploy errors, inspect config and migration/deploy files
   before treating it as code drift.

Triage output must include: problem, affected UC(s), affected docs, affected
tasks, affected code files, graph triage status, and initial verification path.

### Step 2: CONTEXT LOAD

Read only the scope needed to prove the defect and prevent collateral damage.

Preferred order:

1. Affected UC specs from `docs/14-usecases/`.
2. Relevant domain entities/enums from `docs/12-domain/`.
3. Screen specs from `docs/15-interfaces/screens/` for UI bugs.
4. `.tl/tasks/*/api-contract.md`, task files, review findings, and result files.
5. Affected source and test files.
6. `.tl/status.json` and `.tl/changelog.md`.

For L0 environment issues, read only relevant config, migration, deploy, CI, and
runtime evidence. If required context is missing, report `Status: BLOCKED` and
name the missing input.

### Step 3: GAP-CHECK

Compare documentation, graph/task contracts, and code before editing.

For each affected area:

- docs/graph contract: what behavior is specified;
- code behavior: what the implementation does;
- observed bug: what fails;
- discrepancy: code drift, spec drift, missing docs, missing tests,
  environment issue, or ambiguous acceptance criteria;
- fix level: L0/L1/L2/L3.

For L2/L3, prepare the documentation change plan and stop at the user gate
before mutating docs or code. For `--dry-run`, stop after Step 4 with
`Status: NOT_RUN` for mutation steps.

### Step 4: DEFINE CORRECT BEHAVIOR

Write the behavior contract before editing:

```markdown
## Correct Behavior Definition

### Current Behavior
- What happens now.

### Expected Behavior
- What must happen after the fix.

### Unchanged Behavior
- Paths, UCs, endpoints, states, and components that must keep working.

### Verification
- Exact test command or verification command required.
```

For L0, define the required environment/config action. For L1, tie expected
behavior to existing docs. For L2/L3, tie expected behavior to the docs that
will be updated or created in Step 5.

### Step 5: FIX DOCS

For L0/L1, explicitly report `Docs updated: none` with rationale and proceed.

For L2/L3, update docs before production code. Use
`../nacl-tl-core/references/sa-doc-update-matrix.md`:

- enum/status or state transition: domain/enumeration docs, normally via the
  `nacl-sa-domain` procedure when available;
- endpoint contract: `.tl/tasks/*/api-contract.md` and affected UC spec;
- new endpoint or UC flow change: affected UC spec, normally via `nacl-sa-uc`
  procedure when available;
- screen/UI behavior: `docs/15-interfaces/screens/`;
- DB schema behavior: domain entity docs;
- deploy/CI behavior: deploy/development docs;
- no docs for the area: create the smallest L3 contract needed for this bug,
  not a full new feature specification.

Present changed/created docs and the code-fix plan. Do not proceed to Step 6 for
L2/L3 until the user explicitly confirms the behavior contract and docs change.

### Step 6: APPLY FIX

For L0, apply only the environment/config/migration repair and skip the code TDD
sub-flow. Verification still happens in Step 7.

For L1/L2/L3 code changes, first run the **Spec-First Prerequisite Check**
(see the "Spec-First Prerequisite (Strict-Only)" section above). The gate
must return PASS — or rule 4 must apply via a valid signed exception against
`spec-first-prerequisite` — before any production code is touched.

Then follow this order:

1. Restate Current/Expected/Unchanged behavior from Step 4.
2. Discover the owning workspace by walking up from affected files to the
   nearest `package.json`. Read `scripts.test`. Do not invent fallback runners.
3. Capture baseline by running exactly that test command. Record collected
   tests, failing tests, and whether the runner started cleanly. Missing
   `scripts.test` flags `Fix outcome: NO_INFRA`; runner startup/collection
   failure flags `Fix outcome: RUNNER_BROKEN`.
4. Pick path:
   - Path B if an existing test imports or covers the target module.
   - Path A if no useful existing test covers the target.
5. Path A only: run the `nacl-tl-regression-test` procedure before production
   code changes. It must write only the regression test and verify the focused
   test is RED. If Codex subagents are not explicitly available for this turn,
   perform it as a separate local phase and do not edit production code until
   RED evidence exists.
6. Apply the minimal production fix. No opportunistic refactors.
7. Re-run the same full test command from the baseline. Record postfix failures
   and RED-to-GREEN evidence.

### Step 7: VALIDATE

Determine the workflow-specific fix outcome from the captured evidence:

| Condition | Fix outcome | Codex status |
|---|---|---|
| Step 6 entry gate refused: spec-first-prerequisite-missing (no signed exception). | `SPEC_FIRST_MISSING` | `BLOCKED` |
| Step 6 entry gate refused: graph-delta-unobservable (no signed exception). | `GRAPH_DELTA_UNOBSERVABLE` | `BLOCKED` |
| `scripts.test` missing. | `NO_INFRA` | `BLOCKED` |
| Runner failed before tests or zero-test sanity check confirms misconfiguration. | `RUNNER_BROKEN` | `BLOCKED` |
| New failures appeared compared with baseline. | `REGRESSION` | `FAILED` |
| Path A regression test did not turn RED to GREEN. | `REGRESSION` | `FAILED` |
| A regression or existing failing test turned RED to GREEN and postfix suite has no failures. | `PASS` | `VERIFIED` |
| A target test turned RED to GREEN but unrelated baseline failures remain. | `BLOCKED` | `PARTIALLY_VERIFIED` |
| No test evidence exercises the change. | `UNVERIFIED` | `UNVERIFIED` |
| Step 6 entry gate bypassed by valid signed exception against `spec-first-prerequisite`. | the test-derived outcome above applies, but headline carries `(spec-first-bypassed-by-signed-exception)` | the test-derived Codex status applies, capped at `UNVERIFIED` |

Validation must also include:

- L2/L3 mini SA validation: docs now describe implemented behavior.
- Impact check: adjacent UCs, shared endpoints, shared types, shared state,
  shared components, and consumers.
- Changelog update in `.tl/changelog.md` when editing is available:

  ```markdown
  ### [YYYY-MM-DD] nacl-tl-fix: <brief description>
  - **Level:** L0/L1/L2/L3
  - **Fix outcome:** PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION / SPEC_FIRST_MISSING / GRAPH_DELTA_UNOBSERVABLE
  - **Status:** VERIFIED / FAILED / PARTIALLY_VERIFIED / BLOCKED / NOT_RUN / UNVERIFIED
  - **Spec-first verdict:** PASS / FAIL (bypassed-by-EXC-...) / SKIPPED (L0 | --dry-run)
  - **Spec-update commit (if PASS):** <SHA> (<message>)
  - **Root cause:** ...
  - **Affected UC:** UC-### or infrastructure
  - **Docs updated:** ...
  - **Code changed:** ...
  - **Tests:** ...
  - **Pre-existing failures:** ...
  - **Invocation source:** review
  ```

  Include the invocation source line only for `--from-review`.

### Step 8: REPORT

Never skip the final report. Use the user's language unless TL artifacts require
English.

Report template:

```text
<FIX COMPLETE | FIX APPLIED - UNVERIFIED | FIX INCOMPLETE>

Problem: ...
Invocation source: review (--from-review)  # only when applicable
Root cause: ...
Level: L0/L1/L2/L3
Fix outcome: PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION
Status: VERIFIED | FAILED | PARTIALLY_VERIFIED | BLOCKED | NOT_RUN | UNVERIFIED

Graph triage:
  Status: ...
  Evidence: ...

Docs updated:
  ...

Changes applied:
  ...

Tests:
  Runner: ...
  Baseline: ...
  Regression test: ...
  RED-to-GREEN: ...
  Postfix: ...
  New failures: ...
  Pre-existing failures: ...

Impact check:
  ...

Remaining discrepancies docs/code:
  ...

Next step:
  ...
```

Header mapping:

- `PASS` -> `FIX COMPLETE`
- `REGRESSION` -> `FIX INCOMPLETE`
- `BLOCKED`, `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN` -> `FIX APPLIED -
  UNVERIFIED`
- `SPEC_FIRST_MISSING` -> `FIX HALTED - SPEC-FIRST PREREQUISITE MISSING`
- `GRAPH_DELTA_UNOBSERVABLE` -> `FIX HALTED - SPEC-FIRST GRAPH DELTA UNOBSERVABLE`
- Spec-first bypass via valid signed exception against
  `spec-first-prerequisite` -> appended suffix
  `(spec-first-bypassed-by-signed-exception)` on the otherwise-derived
  header; status capped at `UNVERIFIED`.

For `--auto-ship`, only continue to `nacl-tl-ship` when `Fix outcome: PASS` and
the user has explicitly confirmed shipping. Never invoke `nacl-tl-hotfix`
automatically.

## Capabilities

### May Do

- Read bug, review, reopened, task, code, test, graph, and contract context.
- Query graph tools when available and configured.
- Edit code, tests, docs, and TL changelog/result files when workspace
  permissions and gates allow.
- Run configured test or verification commands.
- Produce repair reports with both fix outcome and Codex verification status.

### Must Not Do

- Apply a code fix before triage, context load, gap-check, behavior definition,
  and required docs updates.
- Skip graph-aware UC discovery when `config.yaml` has graph configuration.
- Skip a RED regression test for testable bugs unless the workflow reports the
  blocked/unverified path honestly.
- Invent fallback runners when `scripts.test` is missing or broken.
- Widen the fix into unrelated refactoring or feature work.
- Commit, push, deploy, or change branches without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Graph reads require configured graph tooling; otherwise report graph triage as
  `BLOCKED` and use file fallback.
- Test execution requires dependencies and configured workspace commands.
- Documentation changes that alter behavior require a user gate.
- Separate test-authoring workflow is required for Path A; Codex subagents are
  used only when explicitly available and permitted.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when context, permissions, confirmation, dependencies,
  graph tooling, or configured commands are missing.
- Use `NOT_RUN` when a check is intentionally skipped, including dry-run
  mutation steps.
- Use `PARTIALLY_VERIFIED` when the target fix has evidence but unrelated
  baseline failures remain.
- Use `UNVERIFIED` when no evidence exercises the change.
- Use `FAILED` when tests, static checks, or behavior checks run and violate the
  fix contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-fix/SKILL.md`

### Preserved Methodology

- Mandatory 8-step spec-first bug repair workflow.
- Graph-enhanced UC discovery before grep fallback.
- L0/L1/L2/L3 fix classification.
- Documentation synchronization before code for L2/L3.
- RED-first regression test discipline and baseline/postfix comparison.
- Changelog evidence, impact check, and final status-aware report.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Claude-only subagent assumptions as mandatory execution mechanics.
- Non-Codex outcome words as top-level verification statuses.
- Automatic shipping without Codex confirmation.

### Codex Replacement Behavior

- Execute the same workflow directly when tools are available.
- Preserve `PASS`, `NO_INFRA`, `RUNNER_BROKEN`, and related fix outcomes as
  report details.
- Map final top-level status to the Codex closed verification vocabulary.
- Treat graph, browser, test, and delegation tools as conditional and report
  gaps honestly.
