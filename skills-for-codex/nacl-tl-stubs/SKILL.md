---
name: nacl-tl-stubs
description: |
  Scan NaCl code for stubs, mocks, placeholder code, debug leftovers, and
  empty or hollow test structures; maintain stub tracking and enforce TL
  quality gates. Use when checking placeholders, running a stub gate, preparing
  review or release, or for compatibility with `/nacl-tl-stubs`.
---

# NaCl TL Stub Tracking For Codex

Scan for incomplete implementation and test coverage debt. TL artifacts and
reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- codebase paths or UC-specific file lists;
- optional `.tl/stub-registry.json` prior state;
- `.tl/tasks/UC###/result-be.md` and `result-fe.md` for UC-specific scans;
- project source and test files.

Outputs produced:

- `.tl/stub-registry.json` when editing is available;
- `.tl/tasks/UC###/stub-report.md` for UC scans when editing is available;
- status and changelog updates when editing is available and justified;
- final scan report using the closed verification vocabulary.

Downstream consumers:

- code review gate;
- QA gate;
- release gate;
- conductor workflow.

## Workflow

### Step 1: Determine Scope

Use one of:

- full scan: production source plus test files;
- UC scan: files listed in UC backend and frontend result artifacts;
- final scan: full scan with stricter gate rules.

If `.tl/`, source files, or UC result files required for the selected scope are
missing, report `BLOCKED` with the missing input.

### Step 2: Sanity Check The Scanner

Before scanning, prove the selected search command can find a known temporary
marker in a temporary file. Delete the temporary file regardless of outcome.

If the marker is not found or the file cannot be cleaned up, report:

```text
Status: BLOCKED
Reason: stub scanner sanity check failed
```

### Step 3: Scan Production Code

Search production files for marker comments and placeholder patterns,
including TODO, FIXME, STUB, MOCK, HACK, unimplemented exceptions, unsafe type
bypasses, hardcoded fake credentials, debug logs, ignored type or lint checks,
and placeholder UI assets.

Exclude generated files, dependencies, build outputs, fixtures, mocks,
stories, and test files from the production pass.

### Step 4: Scan Test Files

Scan test files separately for empty test files and describe blocks with no
cases. A source scan with no production placeholders is not fully verified if
the scoped test files are absent or hollow.

Treat import-proxy test files as informational only when the file clearly
delegates to a sibling test module.

### Step 5: Classify Findings

Classify each finding by severity:

- CRITICAL: blocks review, QA, and release. Examples include placeholder
  business logic, authorization bypasses, unimplemented main flow, security
  FIXME, API placeholder, fake secrets, and critical unsafe casts.
- WARNING: blocks only in final scan unless project policy says otherwise.
  Examples include non-security FIXME, HACK, debug logs, ignored type checks,
  placeholder UI, and hollow tests.
- INFO: tracked debt that does not block by itself.

Associate findings with a UC by explicit marker, changed-file lists, or
`uc: null` when no association can be made.

### Step 6: Reconcile Registry

Load the prior registry when available. Match existing entries by file, type,
and nearby line. Preserve IDs, assign new IDs sequentially, and mark missing
prior findings as resolved. Never reuse IDs.

Write the registry only when editing is available. After writing, re-read it
and verify `updatedAt` and counts. If persistence cannot be verified, report
`BLOCKED`.

### Step 7: Gate And Report

Return:

- files scanned: production and tests;
- counts by severity;
- empty test file and empty describe counts;
- new, unresolved, resolved, and orphaned findings;
- registry and report files written or `NOT_RUN`;
- gate decision;
- final `Status: <VALUE>` using only the closed vocabulary.

Use `VERIFIED` only when the selected scan ran, persistence succeeded when
requested, no blocking findings remain, and test files in scope were actually
checked. Use `PARTIALLY_VERIFIED` for warnings or incomplete but useful scan
coverage. Use `FAILED` when blocking findings remain.

## Capabilities

### May Do

- Read source, test, result, status, changelog, and registry files.
- Write stub registry, UC stub reports, status, and changelog files when
  workspace permissions allow it.
- Run search commands when command execution is available.
- Enforce review, QA, and release gates based on scan evidence.

### Must Not Do

- Treat zero production findings as clean when no test files were scanned.
- Delete registry history or reuse stub IDs.
- Count generated, dependency, fixture, mock, story, or build-output files as
  production findings.
- Commit, push, or change tracker state without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File reads and writes require workspace access.
- Search execution requires an available command such as `rg` or an equivalent.
- Status and changelog updates require writable `.tl/` files.
- Gate enforcement in external systems requires available integration tools and
  confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required paths, scanner sanity checks, registry
  persistence, permissions, or tools fail.
- Use `NOT_RUN` when registry, report, or external gate updates are
  intentionally skipped.
- Use `PARTIALLY_VERIFIED` when the scan ran but coverage is incomplete or only
  nonblocking warnings remain.
- Use `UNVERIFIED` when scan scope or persistence evidence is ambiguous.
- Use `FAILED` when blocking stub findings remain.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-stubs/SKILL.md`

### Preserved Methodology

- Production and test-file scanning as separate passes.
- Severity classification and gate enforcement.
- Persistent registry with stable IDs and resolved entries.
- UC association and UC-specific reports.
- Scanner sanity check before trusting results.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Legacy scan headlines and status mappings outside the closed set.
- Active assumptions about downstream review and release runners.
- Over-specific console decorations as required output.

### Codex Replacement Behavior

- Use closed statuses with severity details in report fields.
- Treat external gates as conditional integrations.
- Report no-test-file scopes as partial or unverified, not clean.
- Verify registry writes before claiming persistence.
