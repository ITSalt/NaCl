# Sync Report Template

## File Name

`sync-report.md`

Located in: `.tl/tasks/{{task_id}}/sync-report.md`

Example: `.tl/tasks/UC001/sync-report.md`

## Purpose

Documents the results of BE/FE synchronization verification performed against the API contract. Contains detailed checks for contract compliance, type consistency, error handling, mock remnants, and auth flow. This file provides **evidence** that BE and FE implementations are compatible and ready for review. If blockers are found, the report blocks the review phase until issues are resolved.

## Created By

`nacl-tl-sync` skill

## Read By

`nacl-tl-full` skill, `nacl-tl-review` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Sync Report: {{title}}"
api_contract_version: "{{semver}}"
be_commit: {{be_short_hash}}
fe_commit: {{fe_short_hash}}
generated_at: {{YYYY-MM-DDTHH:MM:SSZ}}
status: completed
verdict: {{PASS|FAIL|PASS_WITH_WARNINGS}}
stats:
  total_checks: {{N}}
  passed: {{N}}
  failed: {{N}}
  warnings: {{N}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
tags: [sync, {{module}}, {{task_id}}]
---

# Sync Report: {{task_id}} {{Title}}

## Summary

**Verdict**: {{PASS|FAIL|PASS_WITH_WARNINGS}}
**Contract version**: {{semver}}
**BE commit**: {{be_short_hash}}
**FE commit**: {{fe_short_hash}}
**Generated at**: {{YYYY-MM-DD HH:MM}}

| Metric | Count |
|--------|-------|
| Total checks | {{N}} |
| Passed | {{N}} |
| Failed | {{N}} |
| Warnings | {{N}} |

## Contract Compliance

Verifies that BE implements and FE consumes all endpoints defined in the API contract.

| # | Endpoint | BE Status | FE Status | Verdict |
|---|----------|-----------|-----------|---------|
| 1 | {{METHOD}} /api/{{path}} | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 2 | {{METHOD}} /api/{{path}} | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 3 | {{METHOD}} /api/{{path}} | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{FOUND / MISSING / MISMATCH}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |

## Type Consistency

Verifies that shared types from `src/shared/types/` are used by both BE and FE without duplication.

| # | Type Name | BE Match | FE Match | Issue |
|---|-----------|----------|----------|-------|
| 1 | {{TypeName}} | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{None / description of mismatch}} |
| 2 | {{TypeName}} | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{None / description of mismatch}} |
| 3 | {{TypeName}} | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{IMPORTED / DUPLICATED / MISSING}} ({{file}}) | {{None / description of mismatch}} |

## Error Handling

Verifies that FE handles all error codes that BE can return for each endpoint.

| # | Error Code | Endpoint | BE Returns | FE Handles | Verdict |
|---|------------|----------|------------|------------|---------|
| 1 | {{HTTP_CODE}} {{ERROR_CODE}} | {{METHOD}} /api/{{path}} | {{Yes}} ({{file}}:{{line}}) | {{Yes / No / Generic}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 2 | {{HTTP_CODE}} {{ERROR_CODE}} | {{METHOD}} /api/{{path}} | {{Yes}} ({{file}}:{{line}}) | {{Yes / No / Generic}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 3 | {{HTTP_CODE}} {{ERROR_CODE}} | {{METHOD}} /api/{{path}} | {{Yes}} ({{file}}:{{line}}) | {{Yes / No / Generic}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |

## Mock Remnants

Verifies that FE uses real API calls, not hardcoded data or mock implementations in production code.

| # | File | Line | Type | Severity |
|---|------|------|------|----------|
| 1 | {{file_path}} | {{line}} | {{MOCK_REMNANT / COMMENTED_API_CALL / FAKE_ASYNC / MOCK_SWITCH / MOCK_IMPORT}} | {{BLOCKER / WARNING}} |
| - | - | - | No mock remnants found | - |

**Search patterns applied:**
- Hardcoded data objects in `src/frontend/` (excluding `test/`, `__tests__/`, `*.test.ts`, `*.spec.ts`)
- Mock/fake file imports outside test directories
- Commented-out API calls with stubbed replacements
- `setTimeout` + `resolve` patterns simulating async API
- Conditional mock switches (`if (USE_MOCK)`, `if (process.env.MOCK)`)

## Auth Flow

Verifies that FE sends auth tokens and BE validates them for all protected endpoints.

| # | Endpoint | BE Middleware | FE Auth Header | Verdict |
|---|----------|-------------|----------------|---------|
| 1 | {{METHOD}} /api/{{path}} | {{auth('{{Role}}') / MISSING}} ({{file}}:{{line}}) | {{Bearer Token / MISSING}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 2 | {{METHOD}} /api/{{path}} | {{auth('{{Role}}') / MISSING}} ({{file}}:{{line}}) | {{Bearer Token / MISSING}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |
| 3 | {{METHOD}} /api/{{path}} | {{auth('{{Role}}') / MISSING}} ({{file}}:{{line}}) | {{Bearer Token / MISSING}} ({{file}}:{{line}}) | {{PASS / FAIL / WARNING}} |

**Additional auth checks:**
| Check | Status | Details |
|-------|--------|---------|
| FE sets Authorization header in API client | {{PASS / FAIL}} | {{file}}:{{line}} |
| FE handles 401 (redirect to login / refresh) | {{PASS / FAIL}} | {{file}}:{{line}} |
| FE handles 403 (access denied message) | {{PASS / FAIL}} | {{file}}:{{line}} |
| BE validates JWT token format | {{PASS / FAIL}} | {{file}}:{{line}} |
| BE checks role after authentication | {{PASS / FAIL}} | {{file}}:{{line}} |

## Issues

Detailed list of all found issues with severity classification.

### BLOCKER Issues

Issues that cause runtime errors and block the review phase.

#### B1. {{Issue title}}

**Category**: {{Contract Compliance / Type Consistency / Error Handling / Mock Remnants / Auth Flow}}
**Severity**: BLOCKER
**Location**: {{file}}:{{line}}
**Description**: {{Detailed description of the problem.}}
**Expected**: {{What the contract specifies or what should happen.}}
**Actual**: {{What was found in the code.}}
**Impact**: {{What runtime error or failure this causes.}}
**How to Fix**: {{Specific fix instructions.}}

#### B2. {{Issue title}}

**Category**: {{category}}
**Severity**: BLOCKER
**Location**: {{file}}:{{line}}
**Description**: {{description}}
**Expected**: {{expected}}
**Actual**: {{actual}}
**Impact**: {{impact}}
**How to Fix**: {{fix_instructions}}

### WARNING Issues

Issues that degrade user experience but do not cause runtime failures.

#### W1. {{Issue title}}

**Category**: {{category}}
**Severity**: WARNING
**Location**: {{file}}:{{line}}
**Description**: {{description}}
**Impact**: {{impact}}
**Recommendation**: {{recommendation}}

#### W2. {{Issue title}}

**Category**: {{category}}
**Severity**: WARNING
**Location**: {{file}}:{{line}}
**Description**: {{description}}
**Impact**: {{impact}}
**Recommendation**: {{recommendation}}

### INFO Issues

Informational observations that do not affect functionality.

#### I1. {{Issue title}}

**Category**: {{category}}
**Severity**: INFO
**Location**: {{file}}:{{line}}
**Description**: {{description}}
**Note**: {{note}}

### No Issues

{{If no issues found, state: "No synchronization issues found. BE and FE are fully aligned with the API contract."}}

## Recommendations

{{Ordered list of actionable recommendations based on findings.}}

1. **BLOCKER**: {{Fix description — must be resolved before review}}
2. **BLOCKER**: {{Fix description — must be resolved before review}}
3. **WARNING**: {{Fix description — recommended before review}}
4. **WARNING**: {{Fix description — recommended before review}}
5. **INFO**: {{Optional improvement}}

## Verdict Justification

**Final Verdict**: {{PASS|FAIL|PASS_WITH_WARNINGS}}

{{Explanation of why this verdict was assigned.}}

**Next Step**:
- PASS: Task proceeds to `nacl-tl-review`
- PASS_WITH_WARNINGS: Task proceeds to `nacl-tl-review` with warnings included in review checklist
- FAIL: Task returns to `nacl-tl-dev` for fixes. Sync iteration {{N}}/3.
```

## Verdict Values Reference

| Verdict | Meaning | Blocks Review | Next Step |
|---------|---------|---------------|-----------|
| `PASS` | All checks passed, no issues | No | Proceed to `nacl-tl-review` |
| `PASS_WITH_WARNINGS` | No blockers, but warnings exist | No | Proceed to `nacl-tl-review` (warnings in checklist) |
| `FAIL` | At least one BLOCKER found | Yes | Return to `nacl-tl-dev` for fixes |

## Severity Reference

| Severity | Blocks Review | Description | Examples |
|----------|--------------|-------------|----------|
| `BLOCKER` | Yes | Incompatibility causing runtime errors | Field name mismatch, missing auth middleware, mock in production code |
| `WARNING` | No | Potential problem, recommended fix | Unhandled error code, deprecated mock files, unused response fields |
| `INFO` | No | Informational, optional fix | Extra FE validation, extra BE fields, comment differences |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `completed` | Sync verification finished |
| `in_progress` | Sync verification running |
| `error` | Sync verification failed (tooling error) |

## Check Categories Reference

| Category | What Is Verified |
|----------|-----------------|
| Contract Compliance | Endpoints match api-contract.md (method, path, status codes) |
| Type Consistency | Shared types used by both BE and FE, no duplication |
| Error Handling | FE handles all error codes BE can return |
| Mock Remnants | No mock data or fake API calls in production FE code |
| Auth Flow | FE sends auth headers, BE validates them |

## Quality Checklist

Before committing a sync-report.md file, verify:

- [ ] Frontmatter complete (task_id, api_contract_version, be_commit, fe_commit, verdict)
- [ ] Summary includes verdict, contract version, and check counts
- [ ] Contract Compliance table covers all endpoints from api-contract.md
- [ ] Type Consistency table covers all shared types from api-contract.md
- [ ] Error Handling table covers all error codes for all endpoints
- [ ] Mock Remnants section includes search results (or explicitly states none found)
- [ ] Auth Flow table covers all protected endpoints
- [ ] Every BLOCKER issue has category, location, description, and fix instructions
- [ ] Every WARNING issue has category, location, description, and recommendation
- [ ] Recommendations ordered by severity (BLOCKER first, then WARNING, then INFO)
- [ ] Verdict matches findings (FAIL if any BLOCKER, PASS_WITH_WARNINGS if only warnings)
- [ ] Verdict justification explains the reasoning
- [ ] Next step clearly stated based on verdict
- [ ] NO external references for review agent (report is self-contained)
