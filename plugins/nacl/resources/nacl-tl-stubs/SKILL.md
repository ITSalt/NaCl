---
name: nacl-tl-stubs
model: sonnet
effort: medium
description: |
  Scans codebase for stubs, mocks, and placeholder code.
  Maintains stub-registry.json with severity tracking.
  Use when: scan for stubs, check stubs, verify no placeholders,
  run stub check, stub report, or the user says "/nacl-tl-stubs".
  Flags: UC### for UC-specific scan, --final for pre-release check, no flag for full scan.
---

## Contract

**Inputs this skill consumes:**
- Codebase paths (full repo or UC scope)
- Optional: stub-registry.json prior state

**Outputs this skill produces:**
- stub-registry.json with severity counts (CRITICAL / MAJOR / WARNING) and `files_scanned: { production: N, tests: M }`
- Headline one of:
  - `STUBS COMPLETE` — production stubs == 0 AND WARNING-empty-test-files == 0 AND tests scanned > 0 AND every candidate-for-closure stub passed shape-validation (W10 binding)
  - `STUBS APPLIED — UNVERIFIED (test files: 0)` — no test files were in scope
  - `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` — stub looked closed but no runtime data sample was available to compare against the spec
  - `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field: ...)` — runtime data diverged from the spec's required-field set or types
  - `STUBS HALTED — RUNNER_BROKEN` — grep seed failed, filesystem unreadable, or registry unwritable
  - `STUBS APPLIED — REGRESSION (empty test files: N)` — empty-test-file count exceeds threshold
  - `STUBS APPLIED — REGRESSION` — stub count grew vs. prior registry (and regression-empty threshold not met)

**Downstream consumers of this output:**
- nacl-tl-review (Stub Verification Gate)
- nacl-tl-release (final pre-release scan)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

## Use with /goal

**Wrap with:** `/nacl-goal stubs-cleanup:<MOD-ID>` (tier S) — alias ships in 2.10.1

This skill is a good fit for autonomous `/goal` loops because stub-cleanup progress is graph-verifiable: the stub registry count for severity >= medium is deterministic and the check script queries it directly. The wrapper composes a completion condition that the stub registry contains zero unresolved CRITICAL or MAJOR entries for the target module and no empty test files.

**Auto-retry behavior:** any existing retry inside this skill is preserved; `/goal` loops *between* retries, not inside them.

**Check script:** `nacl-goal/checks/stubs-cleanup.sh`
**Refusals:** see `nacl-goal/refusal-catalog.md` for the gates this wrapper guards.
**Background:** `docs/guides/goal-command.md`

---

# TeamLead Stub Tracking Skill

You are a **quality gate scanner** responsible for detecting incomplete code markers (stubs, TODOs, mocks, hacks) in the codebase. You scan source files, classify findings by severity, maintain a persistent registry, and block downstream phases when critical stubs remain.

## Your Role

- **Scan source files** for marker comments and code patterns indicating placeholder implementations
- **Scan test files** for empty or hollow test structures (the 44-stub scenario)
- **Classify each finding** by severity: CRITICAL, WARNING, or INFO
- **Associate stubs with UCs** by matching file paths against task result files
- **Detect resolved stubs** by comparing current scan against previous registry entries
- **Maintain stub-registry.json** as the persistent record of all stubs
- **Generate stub-report.md** for UC-specific scans
- **Enforce quality gates** -- critical stubs block review and QA phases

## Key Principle: Nothing Ships Unnoticed

```
Scan:       Thorough -- check all marker types, code patterns, AND empty test structures
Classify:   Strict -- security and data integrity stubs are always CRITICAL
Track:      Persistent -- stubs are never deleted, only resolved
Gate:       Enforced -- critical stubs block review, QA, and release
Closure:    Shape-validated -- runtime data matches the spec's field types and
            required-field set; absence of TODO is NOT sufficient
```

---

## Closure Criterion: Shape Validation (W10 binding)

**This skill no longer treats "absence of TODO marker" as evidence that a stub
is closed.** The W10 binding replaces "no TODO" with **shape-validation**:
a stub is closed iff a sample of runtime data flowing through the code path
that previously carried the stub matches the spec's field types AND covers
the spec's required-field set.

### Why this change

Project-Alpha post-mortem § "Stub/mock leak" row (commit `8522d1d`
"fix(admin): unstub WORKFLOW_STEPS + categories envelope + WSC dropdown
paging") shipped because the stub satisfied "no TODO" but held fake IDs
that downstream consumers (the WSC dropdown, the category filter) read
as load-bearing data. The scanner saw "STUB-EMPTY-TEST-FILE? no. TODO
markers? no. return-as-any? no." and emitted `STUBS COMPLETE`. The next
real call returned 422 — the shape was wrong, not just the marker.

The empty-test-file scenario (44-stub case in 0.11.0) added one form
of shape evidence — at least one `it(`/`test(` call site must exist.
W10 extends that to: at least one assertion against the spec's
required-field set must execute (and pass) for every stub the scanner
removed from the registry.

### Validation procedure (per closed stub)

When the scanner detects that a previously-tracked stub no longer
matches its file:line + pattern (and thus is a candidate for
`resolvedAt`), apply the shape-validation procedure BEFORE marking
the stub resolved:

1. **Load the spec.** Resolve the stub's `uc` field (or, for unattributed
   stubs, the UC associated with the stub's file via the path-to-UC
   mapping in `.tl/tasks/<UC>/result-{be,fe}.md`). Read the spec for
   that UC:
   - the `FormField` entries (graph-backed projects) or the API contract
     in `.tl/tasks/<UC>/api-contract.md` (markdown projects);
   - the required-field set (graph property `required: true` on
     `FormField`, or `* required` in the API contract);
   - the field types (graph `data_type` on `FormField` /
     `DomainAttribute`, or the TypeScript / Zod type in the contract).

2. **Sample runtime data.** Locate at least one runtime sample of the
   data shape the stub used to satisfy. Acceptable sources in order:
   a. A wire-evidence fixture written by `nacl-tl-sync` for the same
      UC (`wire-evidence:fixture:<path>` value on the UC's Task node).
      Read the captured response body.
   b. A unit/integration test asserting against the same shape — must
      include at least one assertion on each required field's presence
      AND its type.
   c. A live smoke recording (`wire-evidence:live-smoke:<timestamp>`).
   d. A captured `qa-stage:provider-fixture` or
      `qa-stage:wire-contract` artifact recorded by `nacl-tl-qa`.

   If NONE of (a)-(d) is available, the closure cannot be validated.
   Record headline `STUBS APPLIED — UNVERIFIED (shape-unvalidated:
   <stub-id>)` and refuse to set `resolvedAt`. The stub remains
   unresolved in the registry.

3. **Compare.** For each required-field entry in the spec:
   - presence: the sampled data MUST include the field;
   - type: the field's runtime type MUST match the spec type (string
     vs number vs object vs array; nullable iff spec says so).

   Optional fields (spec says not-required) are not blocking, but if
   present in the sample MUST type-match.

4. **Record the evidence.** On a successful comparison, write a
   `stub-shape-validated:<spec-ref>` entry into the UC's Task
   `verification_evidence` string (see
   `skills-for-codex/references/verification-evidence.md` for format).
   The stub's registry entry gets `resolvedAt` set AND a
   `shape_validated: true` field referencing the same `<spec-ref>`.

5. **On mismatch.** If any required field is missing or any type
   diverges, the stub is NOT closed. Emit headline `STUBS APPLIED —
   UNVERIFIED (shape-mismatch: <stub-id>, field: <name>, expected:
   <type>, observed: <type-or-missing>)`. The stub registry entry
   remains unresolved. The fix author must reopen the stub.

### Worked example — the empty-test-file false-PASS scenario

A historical pattern that this gate now catches:

A developer removes a `// TODO: implement workflow steps catalog`
stub from `src/admin/workflow-steps.service.ts` and ships a function
that returns `[]`. The test file `workflow-steps.test.ts` exists but
contains:

```typescript
describe('WorkflowStepsService', () => {
  it('returns a value', () => {
    expect(svc.list()).toBeDefined();
  });
});
```

Pre-W10 result: the scanner finds no TODO, no STUB marker, the test
file is non-empty (1 `it(` call), no empty-describe block. Headline:
`STUBS COMPLETE`. The fake-empty-array ships.

Post-W10 result:
- The stub was previously tracked at `STUB-NNN` with `uc: UC-302` (the
  WorkflowStepConfig UC).
- Spec lookup: `FormField`s under UC-302 require `id` (uuid), `name`
  (string), `step_order` (int), `kind` (enum).
- Sample runtime data: the existing test asserts only
  `toBeDefined()` — no required-field assertion exists. There is no
  wire-evidence fixture for UC-302. Sources (a)-(d) all empty.
- Validation outcome: refuse closure. Headline `STUBS APPLIED —
  UNVERIFIED (shape-unvalidated: STUB-NNN)`. Registry keeps
  `resolvedAt: null`.
- Operator path: write a contract assertion against the four required
  fields (or record a wire-evidence fixture), rerun. On the next
  scan, the assertion executes against real-shaped data, the
  shape-validation procedure compares to the spec, the stub closes
  with `stub-shape-validated:UC-302:FormField:workflow-step`.

---

## Command Syntax

```
/nacl-tl-stubs                 # Full scan of src/, update registry, print summary
/nacl-tl-stubs UC###           # UC-specific: scan files from result artifacts only
/nacl-tl-stubs --final         # Pre-release: stricter thresholds, warnings block too
```

| Flag | Scope | Threshold | Output |
|------|-------|-----------|--------|
| (none) | Full `src/` | critical blocks | Console summary + registry |
| `UC###` | Files from result-be/fe.md | critical blocks | `stub-report.md` + registry |
| `--final` | Full `src/` | critical + warning block | Detailed report + registry |

---

## Pre-Scan Checks

1. `.tl/` directory must exist (else: `Error: Run /nacl-tl-plan to initialize`)
2. `src/` directory must exist
3. For UC scan: `.tl/tasks/UC###/result-be.md` or `result-fe.md` must exist

---

## Scan Patterns

### Comment Markers (grep/rg)

```
//\s*(TODO|FIXME|STUB|MOCK|HACK)(\([A-Z]{2,}\d{3}\))?:\s*(.+)
```

### Code Patterns (no comment needed)

```
throw\s+new\s+Error\(\s*['"`](Not implemented|TODO|FIXME|not yet)['"`]\s*\)
throw\s+new\s+NotImplementedError\(
return\s+(\{\}|\[\]|null|undefined)\s+as\s+any
as\s+unknown\s+as\s+\w+
```

### FE-Specific Patterns

```
placeholder\s*=\s*['"`]Lorem ipsum
src\s*=\s*['"`][^'"]*placeholder
console\.log\(                     # production code only, not tests
//\s*eslint-disable
@ts-ignore
@ts-expect-error
```

### Mock Data Patterns

```
['"`](Lorem ipsum|placeholder|test@example|fake|dummy)['"`]
(FAKE_|MOCK_|TEST_|DUMMY_)(TOKEN|SECRET|KEY|PASSWORD)
return\s+true\s*;?\s*//.*?(stub|todo|hack|temporary|dev)
```

### Empty Test File Patterns (new in 0.11.0)

Applied to `**/*.test.{ts,tsx,js,jsx}` and `**/*.spec.{ts,tsx,js,jsx}` files only.

**Pattern A — Hollow test file:**
Count the number of `it(` and `test(` call sites in the file. If zero → flag as `STUB-EMPTY-TEST-FILE`.

This catches the "44-stub scenario": a project with 44 test files that each contain `describe('X', () => { /* nothing */ })` — the grep for comment markers finds nothing, but there are no test cases executing. The file looks like a test suite but provides zero coverage.

Example that triggers the check:
```typescript
// auth.test.ts
describe('AuthService', () => {
  // TODO: add tests
});
```
The above file has 0 `it(` and 0 `test(` calls → `STUB-EMPTY-TEST-FILE`.

**Pattern B — Describe block with no cases:**
Within non-empty test files (files that have at least one `it(` or `test(` call), detect `describe(` blocks that contain no `it(` or `test(` inside them. Heuristic: scan for `describe(` followed by `{` and look ahead for the matching `}` — if no `it(` or `test(` appears between them, flag as `STUB-EMPTY-DESCRIBE`.

This is a WARNING-severity check. It indicates test coverage debt where a block was set up but not populated.

Example:
```typescript
describe('PaymentService', () => {
  describe('processRefund', () => {
    // Planned but not implemented
  });
  it('creates a payment', () => { ... });
});
```
The inner `describe('processRefund', ...)` has no test cases → `STUB-EMPTY-DESCRIBE`.

### File Scope

**Production code include**: `src/**/*.{ts,tsx,js,jsx}`

**Production code exclude**: `node_modules/`, `dist/`, `build/`, `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `tests/fixtures/**`, `__mocks__/**`, `**/*.stories.{ts,tsx}`

**Test file scan (separate pass)**: `**/*.test.{ts,tsx,js,jsx}`, `**/*.spec.{ts,tsx,js,jsx}`

The test-file pass runs in addition to the production-code pass, not as a replacement. Test files are excluded from production-code stub markers (TODOs in test setup code are expected) but are included in the empty-structure scan.

---

## Severity Classification

Apply rules in order. First match wins.

### CRITICAL -- Blocks review and QA

| # | Condition | Rationale |
|---|-----------|-----------|
| 1 | `STUB`/`MOCK` in `*.service.ts` | Core business logic is placeholder |
| 2 | `return true` with auth/permission context | Authorization bypass |
| 3 | `throw new Error('Not implemented')` in main flow | Crash on invocation |
| 4 | `FIXME` mentioning injection/xss/security | Known security vulnerability |
| 5 | `return {} as any` in service/controller | Type safety bypassed in critical path |
| 6 | `FAKE_TOKEN`, `MOCK_SECRET`, etc. | Credential leak risk |
| 7 | `STUB`/`MOCK` in `*.controller.ts`, `*.resolver.ts` | API layer is placeholder |

### WARNING -- Flagged, blocking only in `--final`

| # | Condition | Rationale |
|---|-----------|-----------|
| 8 | `TODO` in catch block | Errors silently swallowed |
| 9 | `FIXME` without security context | Known problem, not security |
| 10 | `HACK` without security context | Temporary workaround |
| 11 | `return [] as any` in non-critical files | Type bypass, non-core |
| 12 | `@ts-ignore` or `@ts-expect-error` | TypeScript safety disabled |
| 13 | `console.log` in production code | Debug statement left behind |
| 14 | `// eslint-disable` | Linting bypassed |
| 15 | Placeholder images/text in components | UI not finalized |
| 16 | `STUB-EMPTY-TEST-FILE` (0 `it()`/`test()` in a test file) | Coverage debt: file exists but executes nothing |
| 17 | `STUB-EMPTY-DESCRIBE` (describe block with no test cases inside) | Coverage debt: test block exists but executes nothing |

### INFO -- Tracked only, never blocking

| # | Condition | Rationale |
|---|-----------|-----------|
| 18 | `TODO` mentioning docs/jsdoc/readme | Documentation debt |
| 19 | `TODO` mentioning optimize/cache/refactor | Technical debt |
| 20 | `TODO` without deadline or urgency | General improvement note |
| 21 | `STUB-EMPTY-TEST-FILE-IMPORT-PROXY` (0 `it()`/`test()`, but first 20 lines import a sibling `*.test(s).*` module) | Delegation pattern; likely intentional re-export |

---

## Scan Process

### Step 1: Determine Scope

- **No arguments**: scan all files in `src/`
- **UC###**: read `result-be.md` and `result-fe.md`, extract file lists from "Files Changed/Created" sections, scan only those
- **--final**: scan all `src/`, apply stricter thresholds

### Step 1b: Sanity-Seed Check (run before any grep)

Before scanning, write a known stub marker into a temporary file inside the workspace:

```
// STUB-SEED-CHECK do-not-remove
```

Run the exact grep/rg configuration (same flags, same pattern, same scope) against that temp file only.

- **If the marker IS found** → seed check passes; continue with Step 2. Delete the temp file.
- **If the marker is NOT found** → the runner is misconfigured. Emit `STUBS HALTED — RUNNER_BROKEN (grep sanity-seed failed)`. Delete the temp file. Halt.

The temp file must be deleted regardless of the outcome.

### Step 2: Scan Production Files

Run grep/rg with all production patterns above. For each match extract: `file`, `line`, `type` (TODO/FIXME/STUB/MOCK/HACK), `text`, `ucRef` (from parentheses if present).

For code patterns without markers, infer type: `throw NotImplemented` -> STUB, `return {} as any` -> STUB, `console.log` -> HACK, `@ts-ignore` -> HACK.

### Step 2b: Scan Test Files (separate pass)

For each `*.test.{ts,tsx,js,jsx}` and `*.spec.{ts,tsx,js,jsx}` file in scope:

1. Count `it(` and `test(` occurrences.
2. If count == 0:
   a. Check the first 20 lines for an import-proxy pattern: `import .* from ['"].*\.tests?['"]` (matches both `.test` and `.tests` extensions).
   b. If the import-proxy pattern IS found → flag as `STUB-EMPTY-TEST-FILE-IMPORT-PROXY` (INFO). The file delegates to a sibling test module; not a hollow stub.
   c. If the import-proxy pattern is NOT found → flag as `STUB-EMPTY-TEST-FILE` (WARNING).
3. If count > 0 → scan for `describe(` blocks with no `it(`/`test(` inside (Pattern B above). Each such block → flag as `STUB-EMPTY-DESCRIBE` (WARNING).

The test-file pass runs regardless of whether the production-code pass found anything. A clean production-code scan with empty test files is NOT `STUBS COMPLETE` — empty test files always escalate to a non-`STUBS COMPLETE` headline.

### Step 3: Classify Severity

Apply classification rules. First matching rule wins.

### Step 4: Associate with UC

1. **Explicit**: marker contains `(UC###)` -> use that UC
2. **File path**: check if file appears in any task's result-be/fe.md file list
3. **No match**: mark as `uc: null` (orphaned)

### Step 5: Reconcile with Registry

Load `.tl/stub-registry.json` (or initialize empty).

- **Existing match** (same file + type, line within +/-5): update line number, keep original ID and `createdAt`
- **New stub**: assign next sequential ID (`STUB-NNN`), set `createdAt` to now
- **Previously tracked, not found**: candidate for `resolvedAt` — but
  **closure now requires shape-validation per the W10 binding**. Run
  the four-step procedure in "Closure Criterion: Shape Validation"
  above. Only when the procedure returns success do you set
  `resolvedAt: now` AND `shape_validated: true` AND
  `shape_evidence: <spec-ref>` on the registry entry.

  - Shape-unvalidated candidates (no runtime data source available):
    keep `resolvedAt: null`. Add a flag
    `shape_validation_blocked: true` and a reason field. Headline
    downgrades to `STUBS APPLIED — UNVERIFIED (shape-unvalidated:
    <stub-id>)`.
  - Shape-mismatch candidates: keep `resolvedAt: null`. Add
    `shape_mismatch: { field, expected, observed }`. Headline
    `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>)`.

IDs are never reused. Entries are never deleted. Resolved stubs keep their ID permanently.

### Step 6: Write Registry

Write `.tl/stub-registry.json`. **After writing, verify the file is readable and its `updatedAt` field matches the timestamp just written.** If the write fails or the verification read fails, emit `STUBS HALTED — RUNNER_BROKEN (registry unwritable)` and halt — do not print the summary.

```json
{
  "$schema": "stub-registry-v1",
  "updatedAt": "ISO-timestamp",
  "files_scanned": { "production": 47, "tests": 12 },
  "stats": {
    "total": 12, "critical": 1, "warning": 5, "info": 6,
    "resolved": 8, "unresolved": 4, "orphaned": 1,
    "emptyTestFiles": 2, "emptyDescribeBlocks": 3
  },
  "stubs": [
    {
      "id": "STUB-001", "file": "src/orders/order.service.ts", "line": 45,
      "type": "STUB", "severity": "CRITICAL",
      "text": "// STUB(UC001): returns empty array",
      "uc": "UC001", "createdAt": "ISO", "resolvedAt": null,
      "shape_validated": false
    },
    {
      "id": "STUB-002", "file": "src/admin/workflow-steps.service.ts", "line": 12,
      "type": "STUB", "severity": "WARNING",
      "text": "// STUB: TODO removed in 8522d1d but never shape-validated",
      "uc": "UC302", "createdAt": "ISO", "resolvedAt": null,
      "shape_validated": false,
      "shape_validation_blocked": true,
      "shape_validation_reason": "no wire-evidence fixture, no contract test, no live-smoke for UC302"
    },
    {
      "id": "STUB-045", "file": "src/orders/order.test.ts", "line": 1,
      "type": "STUB-EMPTY-TEST-FILE", "severity": "WARNING",
      "text": "0 it()/test() calls in test file",
      "uc": "UC001", "createdAt": "ISO", "resolvedAt": null
    }
  ]
}
```

### Step 7: Generate Output

**UC scan**: write `.tl/tasks/UC###/stub-report.md` using `nacl-tl-core/templates/stub-report-template.md`. Sections: frontmatter (task_id, scan_date, status, counts), summary, critical/warning/info/orphaned stubs, empty-test-file count with file list, blocking status, recommendations, registry update note.

**Full scan / --final**: print console summary (see Output Formats below).

### Step 8: Update Status and Changelog

UC scan: update `.tl/status.json` -> `phases.stubs` using the headline-aligned
vocabulary below. The `phases.stubs` value is the authoritative classifier for
downstream skills (`nacl-tl-next`, `nacl-tl-status`); the headline is
decoration. `done` is reserved for `STUBS COMPLETE` only — empty test files
or runner failure NEVER produce `phases.stubs: done`.

| Headline                                              | `phases.stubs` value | Six-status equivalent |
|-------------------------------------------------------|----------------------|-----------------------|
| `STUBS COMPLETE`                                      | `done`               | `PASS`                |
| `STUBS APPLIED — UNVERIFIED` (warnings, no critical)  | `unverified`         | `UNVERIFIED`          |
| `STUBS APPLIED — REGRESSION (empty test files: N)`    | `regression`         | `REGRESSION`          |
| `STUBS BLOCKED` (critical > 0 OR orphaned > 0)        | `blocked`            | `BLOCKED`             |
| `STUBS HALTED — NO_INFRA` (no test files scanned)     | `unverified`         | `NO_INFRA`            |
| `STUBS HALTED — RUNNER_BROKEN` (sanity-seed failure / registry unwritable) | `blocked` | `RUNNER_BROKEN` |

Mapping rules (apply in order; first match wins):

1. Sanity-seed failure or registry-write failure ⇒ `phases.stubs: blocked`,
   headline `STUBS HALTED — RUNNER_BROKEN`.
2. Critical > 0 OR orphaned > 0 ⇒ `phases.stubs: blocked`, headline
   `STUBS BLOCKED`.
3. Empty test files exceed 50% threshold ⇒ `phases.stubs: regression`,
   headline `STUBS APPLIED — REGRESSION (empty test files: N)`.
4. No test files matched the runner's pattern (zero test files scanned) ⇒
   `phases.stubs: unverified`, headline `STUBS HALTED — NO_INFRA`.
5. Any candidate-for-closure stub had shape-validation BLOCKED (no runtime
   data source) ⇒ `phases.stubs: unverified`, headline
   `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)`.
6. Any candidate-for-closure stub failed shape-validation (mismatch) ⇒
   `phases.stubs: unverified`, headline
   `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>)`.
7. Warnings present (and quadruple-condition for COMPLETE not met) ⇒
   `phases.stubs: unverified`, headline `STUBS APPLIED — UNVERIFIED`.
8. Quadruple condition met (production stubs == 0 AND empty-test-files == 0
   AND test files actually scanned > 0 AND every candidate-for-closure
   stub has `shape_validated: true` with a recorded `<spec-ref>`) ⇒
   `phases.stubs: done`, headline `STUBS COMPLETE`. The accompanying
   `verification_evidence` write on the UC's Task node MUST include a
   `stub-shape-validated:<spec-ref>` entry per closed stub.

Append to `.tl/changelog.md`:

```
## [YYYY-MM-DD HH:MM] STUBS: UC### / Full / Final
- Scanned: N files (production) + M test files | Found: N (N critical, N warning, N info)
- Empty test files: N | Empty describe blocks: N
- New: N, Resolved: N, Orphaned: N | Gate: PASS / UNVERIFIED / REGRESSION / BLOCKED / NO_INFRA / RUNNER_BROKEN
- phases.stubs: done / unverified / regression / blocked
```

---

## Blocking Gate Logic

### Before Review (nacl-tl-review checks)

| Condition | Action |
|-----------|--------|
| Critical > 0 | **BLOCK** -- return to developer |
| Orphaned > 0 | **BLOCK** -- all stubs must link to a UC |
| Warning > 3 | **WARNING** -- proceed, justification needed (must reference a TASK ticket or backlog ID; free-text alone is insufficient) |
| Warning <= 3 or INFO only | **PASS** |

### Before QA (nacl-tl-qa checks)

| Condition | Action |
|-----------|--------|
| Critical > 0 | **BLOCK** |
| STUB/MOCK in UI components | **WARNING** |

### Pre-Release (`--final`)

| Condition | Action |
|-----------|--------|
| Any unresolved CRITICAL or WARNING | **BLOCK** |
| Only INFO with justification | **PASS** |

### Blocking Output

```
Stub Gate: BLOCKED

Stage: pre-review / pre-qa / pre-release
Task:  UC### [Title]

| ID       | File:Line                      | Severity | Description       |
|----------|--------------------------------|----------|-------------------|
| STUB-001 | src/orders/order.service.ts:45 | CRITICAL | Empty getOrders() |

Action: Resolve CRITICAL stubs, then /nacl-tl-stubs UC###
```

---

## Headline Status Vocabulary

The final headline of a stub scan run must use one of:

| Headline | Condition |
|----------|-----------|
| `STUBS COMPLETE` | ALL four conditions met: (1) production stubs == 0, AND (2) empty-test-file count (WARNING severity) == 0, AND (3) test files were actually scanned (test file count > 0), AND (4) every candidate-for-closure stub has `shape_validated: true` with a recorded `<spec-ref>` (W10 binding) |
| `STUBS APPLIED — UNVERIFIED (test files: 0)` | Scan ran but scope had no test files at all; cannot assess test coverage debt |
| `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` | Stub looked closed (TODO removed) but no runtime data sample (wire-evidence fixture / contract test / live-smoke / qa-stage fixture) is available to compare against the spec's required-field set |
| `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field: <name>, expected: <type>, observed: <type-or-missing>)` | Shape-validation procedure ran and found a required-field divergence between spec and sampled runtime data |
| `STUBS HALTED — RUNNER_BROKEN` | Grep sanity-seed failed, filesystem read failed, or registry write failed; scan could not complete or could not be persisted |
| `STUBS APPLIED — REGRESSION (empty test files: N)` | Empty-test-file (WARNING) count exceeds threshold: > 10 files OR > 50% of scanned test files |
| `STUBS APPLIED — REGRESSION` | Prior stub count (from previous registry) was lower than current count (stubs grew), and the regression-empty-file threshold is not met |

**`STUBS COMPLETE` is reserved for zero-unresolved-stubs AND zero WARNING-empty-test-files AND at least one test file was scanned AND shape-validated closure of every candidate stub.** A result of "0 production stubs found" does NOT produce `STUBS COMPLETE` if empty test files were detected, if no test files were scanned, or if any candidate-for-closure stub failed shape-validation (shape-unvalidated OR shape-mismatch).

The `files_scanned` field in the report must carry `{ production: N, tests: M }`. When `tests == 0`, the headline is downgraded to `STUBS APPLIED — UNVERIFIED (test files: 0)` regardless of production stub count.

---

## Console Output Formats

### Full Scan (with empty test file findings)

```
Stub Scan Complete (Full)

Scanned: 47 production files + 12 test files | Found: 14 stubs (3 new, 2 resolved)
  CRITICAL: 1 [!!]  WARNING: 7  INFO: 6  Orphaned: 0
  Empty test files: 2 (STUB-EMPTY-TEST-FILE)
  Empty describe blocks: 1 (STUB-EMPTY-DESCRIBE)

Registry: .tl/stub-registry.json updated (14 total, 9 unresolved)

Critical:
  STUB-001  src/orders/order.service.ts:45  STUB  Empty getOrders()

Empty test files (WARNING):
  STUB-045  src/orders/order.test.ts  STUB-EMPTY-TEST-FILE  0 test cases in file
  STUB-046  src/payments/payment.test.ts  STUB-EMPTY-TEST-FILE  0 test cases in file

Headline: STUBS APPLIED — REGRESSION (stub count grew from 11 to 14)
Next: Resolve critical stubs, then /nacl-tl-stubs
```

### Full Scan

```
Stub Scan Complete (Full)

Scanned: 47 production files + 12 test files | Found: 12 stubs (3 new, 2 resolved)
  CRITICAL: 1 [!!]  WARNING: 5  INFO: 6  Orphaned: 0
  Empty test files: 0

Registry: .tl/stub-registry.json updated (12 total, 7 unresolved)

Critical:
  STUB-001  src/orders/order.service.ts:45  STUB  Empty getOrders()

Headline: STUBS APPLIED — REGRESSION (stub count grew from 9 to 12)
Next: Resolve critical stubs, then /nacl-tl-stubs
```

### UC Scan

```
Stub Scan Complete: UC001

Scanned: 7 production files + 3 test files | Found: 3 stubs (1 critical, 1 warning, 1 info)
Empty test files: 1 (STUB-EMPTY-TEST-FILE — WARNING)
Report: .tl/tasks/UC001/stub-report.md
Gate: BLOCKED -- 1 critical stub(s)

Action: Resolve STUB-001, then /nacl-tl-stubs UC001
```

### Clean Scan

```
Stub Scan Complete: UC001

Scanned: 7 production files + 3 test files | Found: 0 stubs
Empty test files: 0
Gate: STUBS COMPLETE -- Task can proceed to review.
```

---

## Error Handling

| Situation | Response |
|-----------|----------|
| No `.tl/` directory | `Error: Run /nacl-tl-plan to initialize` |
| No source files in scope | `Error: No source files found in src/` |
| UC result files missing | `Error: No result files for UC###. Run /nacl-tl-dev-be or /nacl-tl-dev-fe first` |
| Registry corrupted | `Warning: Creating fresh registry. Previous history lost.` |
| Result files lack file lists | `Warning: Falling back to full src/ scan` |
| Filesystem read fails | Halt. Headline: `STUBS HALTED — RUNNER_BROKEN` |
| Registry write fails | Halt. Headline: `STUBS HALTED — RUNNER_BROKEN (registry unwritable)` |
| Grep sanity-seed not found | Halt. Headline: `STUBS HALTED — RUNNER_BROKEN (grep sanity-seed failed)` |
| Scan finds nothing AND test files were scanned (tests > 0) AND no WARNING-empty-test-files AND every candidate-for-closure stub passed shape-validation | Valid clean result. Report "0 stubs". Headline: `STUBS COMPLETE` |
| Scan finds nothing AND test files == 0 | Headline: `STUBS APPLIED — UNVERIFIED (test files: 0)` — cannot assess coverage debt |
| Scan finds empty test files (WARNING) > 10 or > 50% of test files | Headline: `STUBS APPLIED — REGRESSION (empty test files: N)` |
| Candidate-for-closure stub has no runtime data sample (no fixture / contract test / live-smoke / qa-stage fixture for the UC) | Headline: `STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)`. Keep `resolvedAt: null`. |
| Candidate-for-closure stub's sampled data diverges from the spec's required-field set or field types | Headline: `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field: ...)`. Keep `resolvedAt: null`. |

---

## Reference Documents

| Topic | Reference |
|-------|-----------|
| Stub tracking rules (full) | `nacl-tl-core/references/stub-tracking-rules.md` |
| Stub report template | `nacl-tl-core/templates/stub-report-template.md` |
| TL protocol | `nacl-tl-core/references/tl-protocol.md` |
| FE code patterns | `nacl-tl-core/references/fe-code-style.md` |

## Files Written

| File | When | Purpose |
|------|------|---------|
| `.tl/stub-registry.json` | Every scan | Persistent stub registry |
| `.tl/tasks/UC###/stub-report.md` | UC scan | Per-task report |
| `.tl/status.json` | UC scan | Update `phases.stubs` |
| `.tl/changelog.md` | Every scan | Append entry |

## Files Read

| File | Required | Purpose |
|------|----------|---------|
| `.tl/stub-registry.json` | No | Previous scan data |
| `.tl/tasks/UC###/result-be.md` | UC scan | BE file list |
| `.tl/tasks/UC###/result-fe.md` | UC scan | FE file list |
| `.tl/status.json` | No | Current phase status |
| `src/**/*.{ts,tsx,js,jsx}` | Yes | Source files to scan (production pass) |
| `**/*.test.{ts,tsx,js,jsx}` + `**/*.spec.{ts,tsx,js,jsx}` | Yes | Test files (empty-structure pass) |

---

## Procedural Checklist

### Before Scanning
- [ ] `.tl/` and `src/` directories exist
- [ ] For UC scan: result file(s) present
- [ ] Scope determined (full / UC / final)
- [ ] Sanity-seed check passed (grep finds `// STUB-SEED-CHECK do-not-remove` in temp file)

### During Scan
- [ ] All production patterns checked (comment + code + FE + mock data)
- [ ] Test files scanned for empty-structure patterns (STUB-EMPTY-TEST-FILE, STUB-EMPTY-TEST-FILE-IMPORT-PROXY, STUB-EMPTY-DESCRIBE)
- [ ] Import-proxy check applied to each zero-`it()`/`test()` file (first 20 lines, `import .* from ['"].*\.tests?['"]`)
- [ ] `files_scanned` counters tracked: production file count and test file count
- [ ] Each finding classified by severity
- [ ] UC association attempted (explicit, file path, or orphaned)
- [ ] Registry loaded and reconciled (new IDs, resolved detection)

### After Scan
- [ ] `stub-registry.json` written with updated stats (including emptyTestFiles, emptyDescribeBlocks, files_scanned)
- [ ] Registry write verified (re-read and confirm `updatedAt` matches); halt with `STUBS HALTED — RUNNER_BROKEN (registry unwritable)` if it fails
- [ ] `stub-report.md` written (UC scan only) with empty-test-file section
- [ ] `status.json` and `changelog.md` updated
- [ ] **Shape-validation procedure applied to every candidate-for-closure stub (W10 binding)**: spec loaded, runtime sample identified, required-field set + types compared. `shape_validated: true` + `shape_evidence: <spec-ref>` recorded on registry entry; `stub-shape-validated:<spec-ref>` written to UC Task `verification_evidence`.
- [ ] Headline status assigned per quadruple-condition: `STUBS COMPLETE` only when production == 0 AND WARNING-empty-test-files == 0 AND tests scanned > 0 AND every candidate-for-closure stub is shape-validated
- [ ] Gate verdict displayed with next action

---

## Next Steps

- **Gate PASSED**: `/nacl-tl-review UC### --be` or `/nacl-tl-review UC### --fe`
- **Gate BLOCKED**: Fix critical stubs, then `/nacl-tl-stubs UC###` again
- **Full scan clean**: `/nacl-tl-stubs --final` (pre-release check)
- **Full scan issues**: `/nacl-tl-stubs UC###` per UC with critical stubs
- **Overview**: `/nacl-tl-status --stubs`
