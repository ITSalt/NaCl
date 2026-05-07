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
  - `STUBS COMPLETE` — production stubs == 0 AND WARNING-empty-test-files == 0 AND tests scanned > 0
  - `STUBS APPLIED — UNVERIFIED (test files: 0)` — no test files were in scope
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
```

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
- **Previously tracked, not found**: set `resolvedAt` to now (stub was removed from code)

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
      "uc": "UC001", "createdAt": "ISO", "resolvedAt": null
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

UC scan: update `.tl/status.json` -> `phases.stubs`: `"blocked"` if critical > 0, `"done"` otherwise.

Append to `.tl/changelog.md`:

```
## [YYYY-MM-DD HH:MM] STUBS: UC### / Full / Final
- Scanned: N files (production) + M test files | Found: N (N critical, N warning, N info)
- Empty test files: N | Empty describe blocks: N
- New: N, Resolved: N, Orphaned: N | Gate: PASS / BLOCKED
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
| `STUBS COMPLETE` | ALL three conditions met: (1) production stubs == 0, AND (2) empty-test-file count (WARNING severity) == 0, AND (3) test files were actually scanned (test file count > 0) |
| `STUBS APPLIED — UNVERIFIED (test files: 0)` | Scan ran but scope had no test files at all; cannot assess test coverage debt |
| `STUBS HALTED — RUNNER_BROKEN` | Grep sanity-seed failed, filesystem read failed, or registry write failed; scan could not complete or could not be persisted |
| `STUBS APPLIED — REGRESSION (empty test files: N)` | Empty-test-file (WARNING) count exceeds threshold: > 10 files OR > 50% of scanned test files |
| `STUBS APPLIED — REGRESSION` | Prior stub count (from previous registry) was lower than current count (stubs grew), and the regression-empty-file threshold is not met |

**`STUBS COMPLETE` is reserved for zero-unresolved-stubs AND zero WARNING-empty-test-files AND at least one test file was scanned.** A result of "0 production stubs found" does NOT produce `STUBS COMPLETE` if empty test files were detected or if no test files were scanned at all.

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
| Scan finds nothing AND test files were scanned (tests > 0) AND no WARNING-empty-test-files | Valid clean result. Report "0 stubs". Headline: `STUBS COMPLETE` |
| Scan finds nothing AND test files == 0 | Headline: `STUBS APPLIED — UNVERIFIED (test files: 0)` — cannot assess coverage debt |
| Scan finds empty test files (WARNING) > 10 or > 50% of test files | Headline: `STUBS APPLIED — REGRESSION (empty test files: N)` |

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
- [ ] Headline status assigned per triple-condition: `STUBS COMPLETE` only when production == 0 AND WARNING-empty-test-files == 0 AND tests scanned > 0
- [ ] Gate verdict displayed with next action

---

## Next Steps

- **Gate PASSED**: `/nacl-tl-review UC### --be` or `/nacl-tl-review UC### --fe`
- **Gate BLOCKED**: Fix critical stubs, then `/nacl-tl-stubs UC###` again
- **Full scan clean**: `/nacl-tl-stubs --final` (pre-release check)
- **Full scan issues**: `/nacl-tl-stubs UC###` per UC with critical stubs
- **Overview**: `/nacl-tl-status --stubs`
