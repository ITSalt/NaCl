# Stub Report Template

## File Name

`stub-report.md`

Located in: `.tl/tasks/{{task_id}}/stub-report.md`

Example: `.tl/tasks/UC001/stub-report.md`

## Purpose

Documents the results of scanning the codebase for stubs, TODOs, mocks, and other temporary implementations. Contains a classified inventory of all found markers with severity levels and a blocking verdict. This file provides the **evidence** that no critical stubs remain before the task proceeds to review.

## Created By

`tl-stubs` skill

## Read By

`tl-review` skill, `tl-full` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Stub Report: {{title}}"
scan_date: {{YYYY-MM-DDTHH:MM:SSZ}}
scope: {{task|project}}
status: {{clean|has_warnings|blocked}}
total_stubs: {{total_count}}
critical_count: {{critical_count}}
warning_count: {{warning_count}}
info_count: {{info_count}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
tags: [stub-report, {{module}}, {{task_id}}]
---

# Stub Report: {{task_id}}

## Summary

{{Brief description of the scan outcome.}}
{{Overall assessment: clean/has_warnings/blocked.}}

| Severity | Count |
|----------|-------|
| CRITICAL | {{N}} |
| WARNING | {{N}} |
| INFO | {{N}} |
| **Total** | **{{N}}** |

**Files Scanned:** {{N}}
**Scan Scope:** {{task — only files changed in this task / project — full codebase}}

## Critical Stubs

{{If no critical stubs: "No critical stubs found."}}

Critical stubs **must be resolved** before the task can proceed to review.

| ID | File | Line | Type | Text |
|----|------|------|------|------|
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |

### Critical Stub Details

#### {{STUB-NNN}}: {{Brief description}}

**File:** {{file_path}}:{{line_number}}
**Type:** {{TODO/FIXME/STUB/MOCK/HACK}}
**Why Critical:** {{Explanation — e.g., "Bypasses authorization check", "Throws NotImplementedError in main flow"}}

**Code:**
```{{language}}
{{code_snippet_with_stub}}
```

## Warning Stubs

{{If no warning stubs: "No warning stubs found."}}

Warning stubs **should be resolved** before review. Reviewer may accept with justification.

| ID | File | Line | Type | Text |
|----|------|------|------|------|
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |

## Info Stubs

{{If no info stubs: "No info stubs found."}}

Info stubs are **optional** to resolve. They are recorded for tracking purposes.

| ID | File | Line | Type | Text |
|----|------|------|------|------|
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |

## Orphaned Stubs

{{If no orphaned stubs: "No orphaned stubs found."}}

Orphaned stubs are markers **without a UC reference** (e.g., `// TODO: fix this` instead of `// TODO(UC001): fix this`). All stubs must be linked to a specific task.

| ID | File | Line | Type | Text |
|----|------|------|------|------|
| {{STUB-NNN}} | {{file_path}} | {{line_number}} | {{TODO/FIXME/STUB/MOCK/HACK}} | {{marker_text}} |

## Blocking Status

### Can Proceed to Review?

**{{YES / NO}}**

| Gate Condition | Value | Result |
|----------------|-------|--------|
| Critical stubs = 0 | {{N}} critical | {{PASS/BLOCK}} |
| Orphaned stubs = 0 | {{N}} orphaned | {{PASS/BLOCK}} |
| Warning stubs <= 3 | {{N}} warnings | {{PASS/WARNING}} |

{{If BLOCKED:}}
**BLOCKED** -- {{N}} critical stub(s) and/or {{N}} orphaned stub(s) found. Review is not possible until all critical and orphaned stubs are resolved.

{{If WARNING:}}
**PROCEED WITH CAUTION** -- No critical stubs, but {{N}} warning stubs found. Reviewer will assess whether they are acceptable.

{{If CLEAN:}}
**CLEAN** -- No blocking stubs found. Task can proceed to review.

## Recommendations

{{Ordered list of what to fix first, prioritized by severity and impact.}}

1. **{{STUB-NNN}}** (CRITICAL): {{What to do — e.g., "Replace empty getOrders() with actual database query"}}
2. **{{STUB-NNN}}** (CRITICAL): {{What to do — e.g., "Implement real authorization check in auth.guard.ts"}}
3. **{{STUB-NNN}}** (WARNING): {{What to do — e.g., "Add proper error handling in catch block"}}

## Scan Patterns Used

The following patterns were scanned:

| Pattern | Category |
|---------|----------|
| `// TODO:`, `// FIXME:`, `// STUB:`, `// MOCK:`, `// HACK:` | Comment Markers |
| `throw new Error('Not implemented')` | Unfinished Implementation |
| `throw new NotImplementedError()` | Unfinished Implementation |
| `return {} as any`, `return [] as any` | Type Bypass |
| Empty catch blocks | Swallowed Errors |
| Hardcoded placeholders (`Lorem ipsum`, `placeholder`, `fake`) | Mock Data |
| `return true` with auth/permission context | Authorization Bypass |
| `FAKE_TOKEN`, `MOCK_SECRET`, `TEST_KEY` | Hardcoded Secrets |

## Stub Registry Update

{{State whether stub-registry.json was updated.}}

- New entries added: {{N}}
- Entries resolved: {{N}}
- Total unresolved in registry: {{N}}
```

## Scope Reference

| Scope | Meaning | When Used |
|-------|---------|-----------|
| `task` | Scan only files changed in current task | Default for pre-review scan |
| `project` | Scan entire codebase | Used for `tl-stubs --final` before release |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `clean` | No critical or orphaned stubs, safe to proceed |
| `has_warnings` | No blockers, but warning stubs present |
| `blocked` | Critical or orphaned stubs found, cannot proceed |

## Stub Type Reference

| Type | Meaning | Example |
|------|---------|---------|
| `TODO` | Functionality planned but not implemented | `// TODO(UC001): add pagination` |
| `FIXME` | Known problem requiring a fix | `// FIXME(UC002): race condition` |
| `STUB` | Placeholder instead of real implementation | `// STUB(UC001): returns empty array` |
| `MOCK` | Hardcoded data instead of real source | `// MOCK(UC003): hardcoded user list` |
| `HACK` | Temporary workaround | `// HACK(UC004): reload instead of state update` |

## Severity Reference

| Severity | Symbol | Action | Examples |
|----------|--------|--------|----------|
| CRITICAL | -- | Must resolve before review | Auth bypass, `throw new Error('Not implemented')`, missing validation |
| WARNING | -- | Should resolve before review | Empty catch blocks, `return [] as any`, incomplete error handling |
| INFO | -- | Optional, tracked for future | JSDoc TODOs, caching TODOs, refactoring notes |

## Quality Checklist

Before committing a stub-report.md file, verify:

- [ ] Frontmatter complete (task_id, scan_date, scope, status, counts)
- [ ] Summary clearly states the scan outcome with counts
- [ ] Critical stubs section complete with details and code snippets
- [ ] Warning stubs listed in table format
- [ ] Info stubs listed in table format
- [ ] Orphaned stubs identified (if any)
- [ ] Blocking status clearly stated (YES/NO with gate conditions)
- [ ] Recommendations ordered by priority
- [ ] Stub registry update status noted
- [ ] All stub IDs match entries in stub-registry.json
