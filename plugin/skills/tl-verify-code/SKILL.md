---
name: tl-verify-code
model: sonnet
effort: medium
description: |
  Static code analysis to verify implementation correctness.
  Traces data flow: DB → service → route → hook → component → UI.
  Returns PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
  / BLOCKED / REGRESSION / FAIL.
  Use when: verify implementation, check code correctness, verify fix,
  or the user says "/nacl:tl-verify-code".
---

## Contract

**Inputs this skill consumes:**
- Task spec (UC### or TECH###)
- Changed file paths (from git diff or task scope)
- Workspace `package.json` `scripts.test` (read to discover the test runner)

**Outputs this skill produces:**
- Result one of: PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN
  / BLOCKED / REGRESSION / FAIL
- Static-analysis report (data-flow trace, type checks, runtime concerns)
- Test-runner output snippet when the suite was actually executed
- Per-finding metadata (optional, backward-compatible): `kind`
  (`code-defect` | `spec-drift` | `coverage-gap` | `suggestion` | `info`),
  `routedTo` (downstream skill route, e.g. `/nacl:tl-reconcile`), and
  `note` (pre-flag suppression breadcrumb such as
  `pre-flagged in review-be.md:84`). Absence of these fields is
  equivalent to `kind: code-defect` for ISSUE status and
  `kind: suggestion` for SUGGESTION status.

**Downstream consumers of this output:**
- nacl-tl-verify (orchestrator that aggregates this skill's result with QA)
- nacl-tl-deliver (consumes via verify orchestrator)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

# TeamLead Code Verification Skill

## Your Role

You are a code verification specialist. You verify that a change is CORRECTLY implemented by tracing the full data flow, not just checking code style.

## Key Difference from /nacl:tl-review

- `/nacl:tl-review`: checks code QUALITY (style, patterns, security, TDD compliance)
- `/nacl:tl-verify-code`: checks code CORRECTNESS (does the data flow work end-to-end?)

## Invocation

```
/nacl:tl-verify-code UC028               # verify specific UC implementation
/nacl:tl-verify-code --task ELE-644      # verify by task code (if YouGile)
/nacl:tl-verify-code --files src/routes/analytics.ts  # verify specific files
```

## Result Vocabulary

| Result | Meaning |
|--------|---------|
| `PASS` | Static checks pass AND test suite ran AND at least one test covers the changed file(s) AND suite is clean |
| `PASS_NEEDS_E2E` | All checks pass, changes affect UI — need browser verification; tests ran and passed |
| `UNVERIFIED` | One of: (a) static checks pass but no test file imports the changed module(s) — coverage gap; (b) no baseline ref could be resolved (no `--base` flag, no saved baseline artifact, no `merge-base HEAD main`) — set arithmetic is undefined |
| `NO_INFRA` | `scripts.test` is missing from the workspace's `package.json` — cannot run tests |
| `RUNNER_BROKEN` | `scripts.test` exists but runner crashed (non-zero exit before any test ran, or zero tests collected and sanity check failed) |
| `BLOCKED` | Suite ran; test(s) pass for the verified change, but unrelated pre-existing failures remain |
| `REGRESSION` | Test suite reveals failures introduced by the change |
| `FAIL` | Static analysis found issues that would cause runtime errors or incorrect behavior |

**Static analysis alone never produces PASS.** At best, static analysis without a passing test suite produces `UNVERIFIED`.

## Workflow: 6 Steps

### Step 1: IDENTIFY CHANGE

- Read task description (from `.tl/tasks/` or YouGile)
- Identify changed files (`git diff` or explicit `--files`)
- Determine affected module(s)

#### 1.4 Load prior review flags (pre-flag suppression input)

Before tracing data flow, read every `.tl/tasks/<UC>/review-*.md` file for
the UC under verification (`review.md`, `review-be.md`, `review-fe.md`,
`review-tech.md` — whichever exist). These reviews may have already
catalogued issues as non-blocking and routed them downstream; Step 2.5
must not re-flag those same issues as fresh defects.

Parse the "issues" sections under both conventions:

1. **Template convention** (see `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/review-template.md`
   §"Issues Found"): headings `### 🔴 Blockers (Must Fix)`,
   `### 🟠 Critical Issues (Should Fix)`,
   `### 🟡 Major Issues (Should Fix)`,
   `### 🟢 Minor Issues (Nice to Have)`, with sub-issue IDs
   `B01` / `C01` / `M01` / `N01`.
2. **Ad-hoc convention** (seen in projects that diverged from the
   template before it was canonised): `## Critical Issues` /
   `## Minor Issues (carried forward, non-blocking)`, with lowercase
   IDs `m-1` / `m-2`. The fixture
   `tests/fixtures/verify-code-enum-drift-snapshot/.tl/tasks/UC-EXP-001/review-be.md`
   demonstrates this layout.

Build `prior_flagged` as a list of `{ tokens, kind, severity, source }`:

- `tokens`: a **set** of fingerprints extracted from the issue body —
  every CAPS sequence matching `[A-Z][A-Z0-9_]{2,}` plus every
  ``code span`` (back-tick-wrapped identifier). One real-world issue
  often catalogues a multi-token rename (e.g. `QUEUED/IN_PROGRESS/
  COMPLETED/FAILED` renamed to `PENDING/PROCESSING/DONE/ERROR`); the
  set captures all of them so a later Step 2.5.5 suppression match
  works on any one of the drifted tokens. Filter out the same common
  acronyms enumerated in Step 2.5.2 to avoid spurious matches on
  `HTTP`, `JSON`, etc.
- `kind`: heuristic from the issue text — `spec-drift` if the body
  mentions "spec ... drift", "vocabulary drift", "spec lags",
  "task-be.md uses ... vs actual", or "route to /nacl:tl-reconcile";
  `code-defect` otherwise.
- `severity`: `blocker` / `critical` / `major` / `minor` from the
  section heading or the symbol prefix.
- `source`: `review-<phase>.md:<line of issue heading>`.

This step is read-only. Do not write or modify any review file. If no
review-*.md files exist for the UC, `prior_flagged` is empty and Step 2.5
proceeds without suppression.

#### 1.5 Enumerate acceptance criteria (requirements traceability input)

Read `.tl/tasks/<UC>/acceptance.md` and build `acceptance: [{ id, text }]` —
one entry per acceptance criterion / REQ, **not** the category groups. This is
the requirements checklist Step 5.4 traces against: verification keyed on
code-presence alone passes a change that touches clean-tracing code while an
acceptance criterion is entirely unimplemented (the "missing-requirement"
defect class — e.g. an audit-log row the spec demands but no code writes).

For each `acceptance[i]`, during the Step 2 trace, mark whether it is
**implemented** (a changed-code path actually produces the required behaviour —
confirmed via the Step 2.6 cross-file trace, not a plausibly-named function)
and whether it is **covered** (a collected test exercises it). A criterion that
is neither implemented in the change nor covered by a test is a coverage gap,
handled in Step 5.4. If the UC has no `acceptance.md`, `acceptance` is empty
and this traceability check is skipped (record it, do not fail).

### Step 2: TRACE DATA FLOW

For each changed area, trace the FULL flow:

**Backend flow:**
```
DB schema/migration → Repository/query → Service → Route handler → Response DTO → API contract
```

**Frontend flow:**
```
API client → Hook/Store → Component props → Render → UI output
```

**Full-stack flow (for UC changes):**
```
DB → Repository → Service → Route → API → Client → Hook → Component → UI
```

Check at each step:
- Types match between layers?
- Field names consistent?
- Null/undefined handled?
- Error cases propagated?
- New fields reach the final consumer (UI)?

#### 2.6 Trace beyond the canonical chain (Mandatory)

The flows above are the canonical chain — but a defect often lives one hop off it, in a caller or a runtime the chain does not name. Do NOT stop at the template; trace the actual code graph:

- **Callees / runtime that produces the data:** for each external symbol the changed code calls (a client, a service, a util it depends on), open the file that defines it and confirm the changed code's assumptions hold — signature, return shape, and any **hardcoded value that silently overrides a parameter**. A field can be declared in the contract or config yet never set by the runtime (**dead config**) — so the feature reads as implemented while the runtime does something else. This is invisible if you only read the changed files.
- **Callers / consumers:** for each exported symbol the change *modifies* (renamed field, new return shape, changed enum), grep the same source roots Step 2.5.3 enumerates (`src/`, `api/`, `web/`, `worker/`, `packages/`, `apps/`, plus workspace-declared roots; exclude `.tl/`, `docs/`, `prisma/`, `node_modules/`, build folders) for `import`/`require` of the module and for call-sites of the symbol, then re-apply the per-step checks (types, field names, null handling, error propagation) at each consumer found.

Emit any cross-file mismatch as a normal finding (`status: ISSUE`, `kind: code-defect`) — it contributes to FAIL like any other static defect. Do not introduce a new status.

### Step 2.5: ENUM VOCABULARY CROSS-CHECK

**Goal:** distinguish three vocabulary-drift situations that look similar
in casual inspection but require very different routing:

| Class | Code | Spec | Action |
|---|---|---|---|
| `SPEC_DRIFT` | consistent canonical values | uses a stale value | non-blocking SUGGESTION routed to `/nacl:tl-reconcile` |
| `CODE_DRIFT` | inconsistent (some files stale) | (either way) | blocking ISSUE → FAIL |
| `UNUSED_ENUM_VALUE` | declares a value never used | n/a | informational SUGGESTION |

The verifier MUST run this structured check before classifying any
enum-named token as a defect. Reading a stale spec and reporting "spec
says X but code uses Y" without this procedure is the recurring false
positive this step is designed to prevent.

#### 2.5.1 Build `code_enums` (canonical set)

Read enum declarations from:

- `**/prisma/schema.prisma` — DB-level enums.
  Pattern: `enum <Name> {\n  VALUE\n  ...\n}`.
- `**/shared/**/enums.{ts,js,mjs,cjs}` — runtime-level enums exported
  from a shared package. Patterns:
  - `export enum <Name> { VALUE = "...", ... }`
  - `export const <Name> = { VALUE: "..." } as const`
- Optionally extend with `config.yaml → verify_code.runtime_enum_globs`
  when the workspace declares additional canonical sources.

Build `code_enums: [{ name, values, source }]` where `source` is
`<file>:<line of declaration>`.

#### 2.5.2 Build `spec_terms`

Grep `.tl/tasks/<UC>/task-*.md` for ALL-CAPS tokens matching
`[A-Z][A-Z0-9_]{2,}`. Strip common acronyms that never participate in
runtime enums: `HTTP`, `HTTPS`, `SQL`, `JSON`, `API`, `URL`, `UC`, `RQ`,
`BRQ`, `NFR`, `ADR`, `TDD`, `CRUD`, `JWT`, `CORS`, `DTO`, `MVP`, `SLA`,
`MIME`, `UUID`, `ASR`, `NULL`, `TRUE`, `FALSE`. Build `spec_terms` as a
set with `{ token, occurrences: [<file>:<line>, ...] }`.

#### 2.5.3 Build `code_usage`

For each `value` in every `code_enums[*].values`, grep all source roots
(`src/`, `api/`, `web/`, `worker/`, `packages/`, `apps/`, plus any
workspace-declared root) — but exclude `.tl/`, `docs/`, `prisma/`,
`node_modules/`, build/dist folders. Record where each canonical value
is used: `code_usage: Map<value, [<file>:<line>, ...]>`.

Also grep the same roots for `spec_terms` tokens that are NOT in any
`code_enums[*].values` — these are "alien tokens": present in spec, not
canonical. Record where each alien token appears in code:
`alien_code_usage: Map<token, [<file>:<line>, ...]>`.

#### 2.5.4 Classify per (enum, drift) pair

For every `code_enum` (call it `E`) and every alien token `T` whose name
is enum-shaped and plausibly belongs to `E`'s domain (heuristic: `T`
appears in `task-*.md` paragraphs that also mention `E.name` or any of
`E.values`), classify:

| Condition | Class | finding.status | finding.kind | finding.routedTo |
|---|---|---|---|---|
| `alien_code_usage[T]` is **empty** and `code_usage` for `E.values` is non-empty everywhere | `SPEC_DRIFT` | `SUGGESTION` | `spec-drift` | `/nacl:tl-reconcile` |
| `alien_code_usage[T]` is **non-empty** (T is used in code AND a canonical `E.values` member is also used elsewhere) | `CODE_DRIFT` | `ISSUE` | `code-defect` | (none) |
| `code_usage[v]` is empty for some `v ∈ E.values` (declared but unused) | `UNUSED_ENUM_VALUE` | `SUGGESTION` | `suggestion` | (none) |

`SPEC_DRIFT` and `UNUSED_ENUM_VALUE` are **never** by themselves grounds
for a `FAIL` result. They contribute findings only. `CODE_DRIFT` is.

#### 2.5.5 Apply pre-flag suppression

For each classified finding `F`, search `prior_flagged` (from Step 1.4)
for a matching entry `P`. A match exists when **any** of the following
holds (case-sensitive throughout):

1. `F.token ∈ P.tokens` — the exact alien/stale token the verifier
   re-flagged was already named in the prior issue.
2. `F.enum_name ∈ P.tokens` — the enum-name itself appears in the
   prior issue (less common, but handles bare-name flags).
3. **Umbrella match:** `(F.enum_canonical_values ∩ P.tokens) ≠ ∅` —
   at least one canonical value of the disputed enum is mentioned in
   the prior issue. This is the case when the catalogued review entry
   reads "spec uses A vs actual B" and B is a current canonical value
   of the same enum. The prior issue covers the entire rename family,
   not only the specific stale pair.

Severity ordering: `blocker > critical > major > minor`. Kind ordering:
`code-defect > spec-drift > suggestion > info`.

- If `F.severity ≤ P.severity` AND `F.kind ≤ P.kind` → **suppress**:
  set `F.status = INFO`, add `F.note = "pre-flagged in <P.source>"`.
- If `F.kind > P.kind` (e.g. current finding is `CODE_DRIFT` but prior
  flag was `SPEC_DRIFT`) → **escalate, do not suppress**: keep
  `F.status = ISSUE`, add
  `F.note = "escalated from prior <P.source> SPEC_DRIFT classification"`.
- If no match → no change.

This guarantees that a drift previously reviewed as non-blocking spec
drift but newly leaking into code (becoming code drift) still surfaces
as a real defect.

#### 2.5.6 Skip conditions

Skip Step 2.5 silently and emit no enum findings when **any** of:

- `.tl/tasks/<UC>/` directory does not exist (TECH task with no UC
  context).
- `code_enums` is empty (no Prisma schema, no shared enums file).
- No `task-*.md` exists for the UC.

A skipped Step 2.5 is not an error and does not affect the top-level
result.

### Step 3: DB VERIFICATION (if DB changes)

- Check migration exists and is correct
- Verify schema matches entity definition in docs.
  **Canonicality for runtime artefacts:** DB schema columns,
  language-level enums, runtime constants, and shared API DTOs are
  CANONICAL. Spec text that disagrees with code-that-compiles is
  `SPEC_DRIFT` (see Step 2.5), not a code defect — finding goes out as
  `SUGGESTION` routed to `/nacl:tl-reconcile`, NOT `FAIL`. Docs remain
  canonical for new-requirement *meaning* (the semantic intent of a new
  field or new entity), but never for the wire-level name of a token
  already present in compiled code.
- Check indexes for query performance
- Verify constraints (NOT NULL, UNIQUE, FK)
- Sample data query if possible (via MCP if available)

### Step 4: COMMON ISSUE CHECKS

- Missing fields after rename/refactor (field renamed in DB but not in service)
- Type mismatches (string in DB, number in TypeScript)
- Incomplete CODE rename — old name still used in some code files
  (`CODE_DRIFT` per Step 2.5 → ISSUE → contributes to `FAIL`)
- Spec lags code rename — code consistent on the new name, only the
  spec text still uses the old name (`SPEC_DRIFT` per Step 2.5 →
  SUGGESTION + `routedTo: /nacl:tl-reconcile`, never `FAIL`)
- Missing null checks on optional fields
- Missing error handling for new error codes
- Frontend displays field that backend doesn't send
- API contract says X, code returns Y

### Step 5: RUN TEST SUITE

**This step is mandatory. Static analysis alone cannot produce PASS.**

#### 5.1 Discover the test command

Locate the workspace owning the changed files (the nearest `package.json` walking up from a changed file). Read its `scripts.test`.

- If `scripts.test` is missing → record `NO_INFRA`; skip 5.2–5.4.
- If `scripts.test` exists → proceed to 5.2.

Do NOT invent a runner. Do NOT substitute `npx vitest`, `npx jest`, or any other command. The runner is exactly what the workspace declares.

#### 5.2 Run the suite twice — baseline then postfix

**Baseline ref discovery (mandatory).** This skill is invoked AFTER a change has landed; the working tree is already post-change. Running the suite once on the working tree is therefore not a baseline — it's a postfix-only measurement, and any "pre-existing" / "regression" claim from a single run is unprovable. Resolve a baseline ref in this priority order:

1. Explicit `--base <ref>` flag supplied by the caller (e.g. a tag, a commit SHA, or the name of an unmerged branch).
2. Saved pre-change baseline artifact at `.tl/tasks/{taskCode}/baseline-failures.json` (written by an upstream `nacl-tl-fix` / `nacl-tl-dev` invocation at its `CAPTURE BASELINE` step). If present, use the failure set verbatim and skip the baseline-suite run.
3. Default: `git merge-base HEAD main` (or the configured `git.main_branch`).

If none of the three resolves to a usable ref (e.g. shallow clone, no `main`, no saved artifact, no flag) → record the suite result as `UNVERIFIED` with reason `no baseline ref resolvable`. Do NOT classify as `BLOCKED` or `REGRESSION` — both require a baseline.

**Baseline run (unchanged code) via worktree.** Create a temporary worktree at the resolved baseline ref:

```
git worktree add <tempdir> <baseline_ref>
cd <tempdir> && <scripts.test>
git worktree remove -f <tempdir>
```

Capture:
- Exit code
- `tests_collected` (number of tests discovered by the runner)
- Set of failing test names → store as `baseline_failures`
- stderr output

The worktree is removed on every exit path (success, halt, error). Do NOT use `git stash` on the active branch — verifier callers may have uncommitted work the operator does not want disturbed.

**Postfix run (current working tree, change already applied):** run the same command on the working tree. Capture:
- Exit code
- `tests_collected`
- Set of failing test names → store as `postfix_failures`
- stderr output

If either run exits non-zero before any test runs, or if stderr is non-empty and stdout is empty → record `RUNNER_BROKEN`.

If `tests_collected == 0` on either run:
- Re-run against one known-good test file (e.g. the largest file in the workspace, or one referenced in `git log`).
- If at least one test runs → the original glob simply didn't match. Continue.
- If still zero tests → record `RUNNER_BROKEN`.

**Derived sets** (computed after both runs):
- `new_failures = postfix_failures − baseline_failures` (failures introduced by the change)
- `transitioned = baseline_failures − postfix_failures` (failures that went away after the change)

#### 5.3 Check test coverage for the changed file(s)

First, locate all test files (`*.test.{ts,tsx,js,jsx}`, `*.spec.{ts,tsx,js,jsx}`) in the workspace.

**Empty-file guard:** count the total number of `it(` / `test(` / `it.each(` / `test.each(` call sites across all test files.
- If test files exist but the total `it()` count is **zero**, the files are hollow stubs.
  Record `NO_INFRA` with reason `empty test files — N test files found, 0 it() calls`.
  Do NOT proceed to 5.4 with this workspace; treat it the same as a missing `scripts.test`.
  (Exception: if a test file contains only `import * from './someFile.tests'` proxy-imports, note
  `import-proxy pattern` as INFO and count the imported file's `it()` calls instead.)

Then grep test files for any `import` or `require` of the module name(s) being verified.

- If no test file imports the changed module → note `coverage_gap = true`.
- If at least one test file imports the changed module → note `coverage_gap = false`.

##### 5.3a Acceptance-criteria traceability gap

Cross the `acceptance` checklist from Step 1.5 against the trace results: for every criterion that is **neither implemented in the change (Step 2.6) nor covered by a collected test**, emit a finding `kind: coverage-gap` naming the criterion id, and set `coverage_gap = true`. This routes an unmet acceptance criterion through the existing coverage-gap → `UNVERIFIED` mapping below — a change cannot reach `PASS` while a required behaviour is unverified. (A criterion implemented but contradicted by the code is a `code-defect`/`ISSUE` → `FAIL`, not a coverage gap.)

#### 5.4 Classify suite result

**Precondition checked FIRST, before any exit-code logic:** `tests_collected > 0` must hold for the postfix run.
- If `tests_collected == 0` after the known-good-file re-run fallback → `RUNNER_BROKEN`. Do not proceed further.

| Condition | Suite result |
|-----------|-------------|
| `NO_INFRA` flag set (5.1 or 5.3 empty-file guard) | `NO_INFRA` |
| `RUNNER_BROKEN` flag set (5.2 or 5.4 precondition) | `RUNNER_BROKEN` |
| Baseline ref unresolvable (5.2 baseline-ref discovery) AND `postfix_failures.size > 0` | `UNVERIFIED (no baseline)` — list `postfix_failures` but do NOT classify them as pre-existing or new |
| `new_failures.size > 0` (baseline available) | `REGRESSION` — list the failing test names from `new_failures` |
| `new_failures.size == 0` AND `postfix_failures.size > 0` (baseline available) | `BLOCKED` — list the pre-existing failures from `postfix_failures` |
| `postfix_failures.size == 0` AND `coverage_gap = true` | `UNVERIFIED` |
| `postfix_failures.size == 0` AND `coverage_gap = false` AND no UI changes | `PASS` |
| `postfix_failures.size == 0` AND `coverage_gap = false` AND UI changes present | `PASS_NEEDS_E2E` |

Note: `BLOCKED` supersedes `UNVERIFIED` (coverage-gap variant) when pre-existing failures are present AND a baseline is available. Without a baseline, the result is `UNVERIFIED`, not `BLOCKED` — set arithmetic is undefined when one operand is missing (Cross-cutting principle P3).

**Authoritative classifier (determinism).** Do not re-derive the precedence by hand. Once the inputs are computed (Steps 2.5/5.1–5.3a), run the decision-table script and emit its token verbatim into `VERIFY_CODE_RESULT.result`:

```
node nacl-tl-verify-code/scripts/classify-status.mjs \
  '{"staticFail":<bool>,"scriptsTestMissing":<bool>,"emptyTestStubs":<bool>,"runnerCouldNotExecute":<bool>,"testsCollected":<int>,"baselineResolved":<bool>,"newFailures":<int>,"postfixFailures":<int>,"coverageGap":<bool>,"uiChanges":<bool>}'
```

`coverageGap` is `true` if no test imports the changed module **or** Step 5.3a found an unmet acceptance criterion. The script encodes the full precedence in one place (including the `FAIL` overlay, which the prose left without a defined order — a confirmed static defect blocks **regardless of tests**, so `FAIL` is highest). The table above documents the logic the script implements; the script is the tie-break authority. Equivalence and precedence are pinned by `scripts/classify-status.test.mjs` (`node --test nacl-tl-verify-code/scripts/classify-status.test.mjs`) — every row maps to the exact same one of the 8 canonical tokens, so this is a derivation change, **not** a contract change.

### Step 6: RETURN RESULT

Result format (structured):

```
VERIFY_CODE_RESULT:
  result: PASS | PASS_NEEDS_E2E | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | BLOCKED | REGRESSION | FAIL
  taskCode: UC028
  module: backend + frontend
  summary: "one-line summary"
  testRunner:
    command: "npm test"          # exact scripts.test command, or "none — NO_INFRA"
    collected: N                 # tests collected in postfix run
    passed: N
    failed: N
    coverageGap: true | false    # whether changed files have test coverage
    runnerOutput: "..."          # first 20 lines of stdout/stderr snippet
    baseline_failures:           # set of test names that failed BEFORE the change
      - "describe > test name"
    postfix_failures:            # set of test names that failed AFTER the change
      - "describe > test name"
    new_failures:                # postfix_failures − baseline_failures (change introduced these)
      - "describe > test name"
    transitioned:                # baseline_failures − postfix_failures (change fixed these)
      - "describe > test name"
  findings:
    - file: src/routes/analytics.ts
      line: 42
      status: OK | ISSUE | SUGGESTION | INFO
      kind: code-defect | spec-drift | coverage-gap | suggestion | info   # optional; default code-defect for ISSUE, suggestion for SUGGESTION
      detail: "description"
      suggestedFix: "what to change" (only for ISSUE)
      routedTo: "/nacl:tl-reconcile"     # optional; non-empty implies a downstream skill should pick this up
      note: "pre-flagged in review-be.md:84"   # optional; pre-flag suppression breadcrumb
  dbChecks:
    - query: "SELECT ..."
      expected: "column exists, type is varchar"
      actual: "confirmed"
      status: OK | FAIL
  recommendation: "PASS_NEEDS_E2E because new data reaches UI components"
```

**Decision logic summary:**
- **PASS**: Static checks pass AND `tests_collected > 0` AND `new_failures` is empty AND `postfix_failures` is empty AND `coverage_gap = false` AND no UI changes
- **PASS_NEEDS_E2E**: Same as PASS, but UI changes detected — browser verification still needed
- **UNVERIFIED**: Static checks pass, suite ran with `tests_collected > 0`, `postfix_failures` is empty, but `coverage_gap = true`
- **NO_INFRA**: `scripts.test` missing OR test files exist with zero `it()` calls (empty stubs) — `new_failures` and `postfix_failures` are meaningless
- **RUNNER_BROKEN**: `scripts.test` exists but runner could not execute, or `tests_collected == 0` even after known-good-file re-run — environment issue
- **BLOCKED**: `new_failures` is empty but `postfix_failures` is non-empty — pre-existing failures not introduced by this change; surfaces `postfix_failures` list
- **REGRESSION**: `new_failures` is non-empty — change introduced test failures; surfaces `new_failures` list
- **FAIL**: Static analysis found runtime errors or incorrect behavior (regardless of tests). CODE_DRIFT findings from Step 2.5 contribute here. SPEC_DRIFT findings do NOT. **Self-adversarial check:** before emitting a `FAIL` / CODE_DRIFT finding, re-read the cited code path once more and try to refute your own claim (a guard, a consumer that never hits it, a type that makes it safe); keep the finding unless that second read gives positive evidence it is a non-issue — never drop on uncertainty.
- **SPEC_DRIFT findings never affect the top-level result.** They surface as SUGGESTIONS with `kind: spec-drift` and `routedTo: /nacl:tl-reconcile`. The top-level result (PASS / PASS_NEEDS_E2E / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / BLOCKED / REGRESSION / FAIL) is determined solely by the test suite, the integrity gate, and CODE_DRIFT-class findings — never by spec drift.

## Output Language

- Result structure: English (consumed by `/nacl:tl-verify` orchestrator)
- Findings detail: English (technical descriptions)
- User-facing summary: user's language

## References

- `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/review-checklist.md` — for additional quality checks
- `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/sa-doc-update-matrix.md` — for understanding doc impact
