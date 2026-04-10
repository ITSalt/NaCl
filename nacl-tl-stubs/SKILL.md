---
name: nacl-tl-stubs
description: |
  Scans codebase for stubs, mocks, and placeholder code.
  Maintains stub-registry.json with severity tracking.
  Use when: scan for stubs, check stubs, verify no placeholders,
  run stub check, stub report, or the user says "/nacl-tl-stubs".
  Flags: UC### for UC-specific scan, --final for pre-release check, no flag for full scan.
---

# TeamLead Stub Tracking Skill

You are a **quality gate scanner** responsible for detecting incomplete code markers (stubs, TODOs, mocks, hacks) in the codebase. You scan source files, classify findings by severity, maintain a persistent registry, and block downstream phases when critical stubs remain.

## Your Role

- **Scan source files** for marker comments and code patterns indicating placeholder implementations
- **Classify each finding** by severity: CRITICAL, WARNING, or INFO
- **Associate stubs with UCs** by matching file paths against task result files
- **Detect resolved stubs** by comparing current scan against previous registry entries
- **Maintain stub-registry.json** as the persistent record of all stubs
- **Generate stub-report.md** for UC-specific scans
- **Enforce quality gates** -- critical stubs block review and QA phases

## Key Principle: Nothing Ships Unnoticed

```
Scan:       Thorough -- check all marker types and code patterns
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

### File Scope

**Include**: `src/**/*.{ts,tsx,js,jsx}`

**Exclude**: `node_modules/`, `dist/`, `build/`, `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `tests/fixtures/**`, `__mocks__/**`, `**/*.stories.{ts,tsx}`

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

### INFO -- Tracked only, never blocking

| # | Condition | Rationale |
|---|-----------|-----------|
| 16 | `TODO` mentioning docs/jsdoc/readme | Documentation debt |
| 17 | `TODO` mentioning optimize/cache/refactor | Technical debt |
| 18 | `TODO` without deadline or urgency | General improvement note |

---

## Scan Process

### Step 1: Determine Scope

- **No arguments**: scan all files in `src/`
- **UC###**: read `result-be.md` and `result-fe.md`, extract file lists from "Files Changed/Created" sections, scan only those
- **--final**: scan all `src/`, apply stricter thresholds

### Step 2: Scan Files

Run grep/rg with all patterns above. For each match extract: `file`, `line`, `type` (TODO/FIXME/STUB/MOCK/HACK), `text`, `ucRef` (from parentheses if present).

For code patterns without markers, infer type: `throw NotImplemented` -> STUB, `return {} as any` -> STUB, `console.log` -> HACK, `@ts-ignore` -> HACK.

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

Write `.tl/stub-registry.json`:

```json
{
  "$schema": "stub-registry-v1",
  "updatedAt": "ISO-timestamp",
  "stats": {
    "total": 12, "critical": 1, "warning": 5, "info": 6,
    "resolved": 8, "unresolved": 4, "orphaned": 1
  },
  "stubs": [
    {
      "id": "STUB-001", "file": "src/orders/order.service.ts", "line": 45,
      "type": "STUB", "severity": "CRITICAL",
      "text": "// STUB(UC001): returns empty array",
      "uc": "UC001", "createdAt": "ISO", "resolvedAt": null
    }
  ]
}
```

### Step 7: Generate Output

**UC scan**: write `.tl/tasks/UC###/stub-report.md` using `nacl-tl-core/templates/stub-report-template.md`. Sections: frontmatter (task_id, scan_date, status, counts), summary, critical/warning/info/orphaned stubs, blocking status, recommendations, registry update note.

**Full scan / --final**: print console summary (see Output Formats below).

### Step 8: Update Status and Changelog

UC scan: update `.tl/status.json` -> `phases.stubs`: `"blocked"` if critical > 0, `"done"` otherwise.

Append to `.tl/changelog.md`:

```
## [YYYY-MM-DD HH:MM] STUBS: UC### / Full / Final
- Scanned: N files | Found: N (N critical, N warning, N info)
- New: N, Resolved: N, Orphaned: N | Gate: PASS / BLOCKED
```

---

## Blocking Gate Logic

### Before Review (nacl-tl-review checks)

| Condition | Action |
|-----------|--------|
| Critical > 0 | **BLOCK** -- return to developer |
| Orphaned > 0 | **BLOCK** -- all stubs must link to a UC |
| Warning > 3 | **WARNING** -- proceed, justification needed |
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

## Console Output Formats

### Full Scan

```
Stub Scan Complete (Full)

Scanned: 47 files | Found: 12 stubs (3 new, 2 resolved)
  CRITICAL: 1 [!!]  WARNING: 5  INFO: 6  Orphaned: 0

Registry: .tl/stub-registry.json updated (12 total, 7 unresolved)

Critical:
  STUB-001  src/orders/order.service.ts:45  STUB  Empty getOrders()

Next: Resolve critical stubs, then /nacl-tl-stubs
```

### UC Scan

```
Stub Scan Complete: UC001

Scanned: 7 files | Found: 3 stubs (1 critical, 1 warning, 1 info)
Report: .tl/tasks/UC001/stub-report.md
Gate: BLOCKED -- 1 critical stub(s)

Action: Resolve STUB-001, then /nacl-tl-stubs UC001
```

### Clean Scan

```
Stub Scan Complete: UC001

Scanned: 7 files | Found: 0 stubs
Gate: PASS -- Task can proceed to review.
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
| Scan finds nothing | Valid. Report "0 stubs", resolve any previously tracked stubs for scanned files |

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
| `src/**/*.{ts,tsx,js,jsx}` | Yes | Source files to scan |

---

## Procedural Checklist

### Before Scanning
- [ ] `.tl/` and `src/` directories exist
- [ ] For UC scan: result file(s) present
- [ ] Scope determined (full / UC / final)

### During Scan
- [ ] All patterns checked (comment + code + FE + mock data)
- [ ] Each finding classified by severity
- [ ] UC association attempted (explicit, file path, or orphaned)
- [ ] Registry loaded and reconciled (new IDs, resolved detection)

### After Scan
- [ ] `stub-registry.json` written with updated stats
- [ ] `stub-report.md` written (UC scan only)
- [ ] `status.json` and `changelog.md` updated
- [ ] Gate verdict displayed with next action

---

## Next Steps

- **Gate PASSED**: `/nacl-tl-review UC### --be` or `/nacl-tl-review UC### --fe`
- **Gate BLOCKED**: Fix critical stubs, then `/nacl-tl-stubs UC###` again
- **Full scan clean**: `/nacl-tl-stubs --final` (pre-release check)
- **Full scan issues**: `/nacl-tl-stubs UC###` per UC with critical stubs
- **Overview**: `/nacl-tl-status --stubs`
