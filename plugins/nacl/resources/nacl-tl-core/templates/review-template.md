# Review Result Template

## File Name

`review.md`

Located in: `.tl/tasks/{{task_id}}/review.md`

Example: `.tl/tasks/UC001/review.md`

## Purpose

Documents the code review results after the development phase. Contains comprehensive review findings, checklist verification, identified issues, and final approval/rejection status. This file provides the **review evidence** for the documentation phase and project records.

## Created By

`nacl-tl-review` skill

## Read By

`nacl-tl-docs` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Code Review: {{title}}"
reviewer: nacl-tl-review
review_started: {{YYYY-MM-DDTHH:MM:SSZ}}
review_completed: {{YYYY-MM-DDTHH:MM:SSZ}}
duration_minutes: {{duration}}
result: {{approved|rejected|needs_rework}}
issues_found: {{total_issues}}
blockers: {{blocker_count}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
tags: [review, {{module}}, {{task_id}}]
---

# Code Review: {{task_id}}

## Summary

{{Brief summary of the review outcome.}}
{{Overall assessment: approved/rejected/needs_rework.}}
{{Key highlights or concerns.}}

## Review Scope

### Files Reviewed

| File | Lines Changed | Review Status |
|------|---------------|---------------|
| {{file_path}} | +{{added}}/-{{removed}} | {{✅/⚠️/❌}} |
| {{file_path}} | +{{added}}/-{{removed}} | {{✅/⚠️/❌}} |
| {{file_path}} | +{{added}}/-{{removed}} | {{✅/⚠️/❌}} |

### Review Coverage

| Metric | Value |
|--------|-------|
| Files Reviewed | {{N}} |
| Lines Reviewed | {{N}} |
| Commits Reviewed | {{N}} |
| Test Files Reviewed | {{N}} |

## Acceptance Criteria Verification

### Functional Criteria

| Criteria ID | Description | Status | Notes |
|-------------|-------------|--------|-------|
| FC01 | {{Criterion description}} | {{✅/❌}} | {{Notes}} |
| FC02 | {{Criterion description}} | {{✅/❌}} | {{Notes}} |
| FC03 | {{Criterion description}} | {{✅/❌}} | {{Notes}} |

### Business Rules Criteria

| Criteria ID | Description | Status | Notes |
|-------------|-------------|--------|-------|
| BR01 | {{Business rule}} | {{✅/❌}} | {{Notes}} |
| BR02 | {{Business rule}} | {{✅/❌}} | {{Notes}} |

### Error Handling Criteria

| Criteria ID | Scenario | Status | Notes |
|-------------|----------|--------|-------|
| EH01 | {{Error scenario}} | {{✅/❌}} | {{Notes}} |
| EH02 | {{Error scenario}} | {{✅/❌}} | {{Notes}} |

### Performance Criteria

| Criteria ID | Metric | Threshold | Measured | Status |
|-------------|--------|-----------|----------|--------|
| PC01 | {{Metric}} | <{{N}}ms | {{N}}ms | {{✅/❌}} |
| PC02 | {{Metric}} | <{{N}}ms | {{N}}ms | {{✅/❌}} |

### Security Criteria

| Criteria ID | Requirement | Status | Notes |
|-------------|-------------|--------|-------|
| SC01 | {{Security requirement}} | {{✅/❌}} | {{Notes}} |
| SC02 | {{Security requirement}} | {{✅/❌}} | {{Notes}} |

### Criteria Summary

| Category | Total | Passed | Failed |
|----------|-------|--------|--------|
| Functional | {{N}} | {{N}} | {{N}} |
| Business Rules | {{N}} | {{N}} | {{N}} |
| Error Handling | {{N}} | {{N}} | {{N}} |
| Performance | {{N}} | {{N}} | {{N}} |
| Security | {{N}} | {{N}} | {{N}} |
| **Total** | **{{N}}** | **{{N}}** | **{{N}}** |

## Code Quality Review

### 1. Code Correctness

- [ ] Logic correctly implements requirements
- [ ] Edge cases are handled
- [ ] Null/undefined cases handled properly
- [ ] Async/await patterns used correctly
- [ ] No unhandled promise rejections

**Findings:**
{{Findings for code correctness, or "No issues found."}}

### 2. Code Quality

**Naming:**
- [ ] Variables have descriptive names
- [ ] Functions describe what they do
- [ ] Consistent naming conventions

**Structure:**
- [ ] Functions are small and focused
- [ ] No deeply nested code
- [ ] No duplicated code

**TypeScript:**
- [ ] No `any` types without justification
- [ ] Proper type definitions
- [ ] Strict null checks satisfied

**Findings:**
{{Findings for code quality, or "No issues found."}}

### 3. Error Handling

- [ ] Errors are not silently swallowed
- [ ] Error messages are helpful
- [ ] Errors are logged with context
- [ ] User-facing errors are sanitized

**Findings:**
{{Findings for error handling, or "No issues found."}}

### 4. Testing

**Coverage:**
- [ ] New code has corresponding tests
- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested

**Quality:**
- [ ] Tests follow AAA pattern
- [ ] Tests are independent
- [ ] No flaky tests

**Findings:**
{{Findings for testing, or "No issues found."}}

### 5. Security

- [ ] No hardcoded secrets
- [ ] User input validated and sanitized
- [ ] SQL/NoSQL injection prevented
- [ ] Authorization checks in place
- [ ] Sensitive data not logged

**Findings:**
{{Findings for security, or "No issues found."}}

### 6. Performance

- [ ] No N+1 query problems
- [ ] Large datasets paginated
- [ ] No synchronous blocking operations
- [ ] No memory leaks

**Findings:**
{{Findings for performance, or "No issues found."}}

### 7. Documentation

- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has comments
- [ ] Comments explain WHY, not WHAT
- [ ] No TODO without ticket reference
- [ ] No commented-out code

**Findings:**
{{Findings for documentation, or "No issues found."}}

### 8. Git & Commits

- [ ] Commit messages are descriptive
- [ ] Follows conventional commit format
- [ ] No unrelated changes in commits
- [ ] Commits are logical and atomic

**Findings:**
{{Findings for git/commits, or "No issues found."}}

## Issues Found

### 🔴 Blockers (Must Fix)

{{If no blockers: "No blockers found."}}

#### Issue B01: {{Issue title}}

**Severity:** 🔴 Blocker
**File:** {{file_path}}
**Line:** {{line_number}}

**Description:**
{{Detailed description of the issue}}

**Code:**
```{{language}}
{{problematic_code}}
```

**Recommended Fix:**
```{{language}}
{{suggested_fix}}
```

**Rationale:**
{{Why this is a blocker and must be fixed}}

### 🟠 Critical Issues (Should Fix)

{{If no critical issues: "No critical issues found."}}

#### Issue C01: {{Issue title}}

**Severity:** 🟠 Critical
**File:** {{file_path}}
**Line:** {{line_number}}

**Description:**
{{Issue description}}

**Recommended Fix:**
{{Suggested fix}}

### 🟡 Major Issues (Should Fix)

{{If no major issues: "No major issues found."}}

#### Issue M01: {{Issue title}}

**Severity:** 🟡 Major
**File:** {{file_path}}
**Line:** {{line_number}}

**Description:**
{{Issue description}}

**Recommended Fix:**
{{Suggested fix}}

### 🟢 Minor Issues (Nice to Have)

{{If no minor issues: "No minor issues found."}}

#### Issue N01: {{Issue title}}

**Severity:** 🟢 Minor
**File:** {{file_path}}
**Line:** {{line_number}}

**Description:**
{{Issue description}}

**Suggestion:**
{{Suggested improvement}}

## Issue Summary

| Severity | Count | Must Fix |
|----------|-------|----------|
| 🔴 Blocker | {{N}} | Yes |
| 🟠 Critical | {{N}} | Yes |
| 🟡 Major | {{N}} | Recommended |
| 🟢 Minor | {{N}} | Optional |
| **Total** | **{{N}}** | {{N}} required |

## Test Verification

### Test Run Results

```
{{test_run_output}}
```

### Test Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites | {{N}} passed, {{N}} total | All pass | {{✅/❌}} |
| Tests | {{N}} passed, {{N}} total | All pass | {{✅/❌}} |
| Statement Coverage | {{N}}% | ≥{{target}}% | {{✅/❌}} |
| Branch Coverage | {{N}}% | ≥{{target}}% | {{✅/❌}} |
| Function Coverage | {{N}}% | ≥{{target}}% | {{✅/❌}} |
| Line Coverage | {{N}}% | ≥{{target}}% | {{✅/❌}} |

## TDD Compliance

### Phase Verification

| Phase | Evidence Found | Status |
|-------|----------------|--------|
| 🔴 RED | Tests written before implementation | {{✅/❌}} |
| 🟢 GREEN | Minimal implementation to pass tests | {{✅/❌}} |
| 🔵 REFACTOR | Code improved with tests passing | {{✅/❌}} |

### TDD Notes

{{Notes on TDD compliance. Were all phases followed? Any concerns?}}

## Positive Observations

{{Document good practices, clever solutions, or commendable patterns found during review.}}

### 👍 What's Done Well

1. **{{Positive aspect 1}}**: {{Description}}
2. **{{Positive aspect 2}}**: {{Description}}
3. **{{Positive aspect 3}}**: {{Description}}

## Recommendations

### Immediate (This PR)

{{Recommendations that should be addressed in this review cycle.}}

1. {{Recommendation 1}}
2. {{Recommendation 2}}

### Future Improvements

{{Suggestions for future iterations, not blocking current approval.}}

1. {{Future recommendation 1}}
2. {{Future recommendation 2}}

## Final Decision

### Review Result: {{APPROVED/REJECTED/NEEDS_REWORK}}

**Confidence Level:** {{High/Medium/Low}}

### Approval Conditions

{{For APPROVED: Any conditions or notes for the approval.}}
{{For REJECTED: What must be fixed before resubmission.}}
{{For NEEDS_REWORK: Specific changes required.}}

### Decision Rationale

{{Explanation of why this decision was made.}}

### Next Steps

{{For APPROVED:}}
- [ ] Proceed to `nacl-tl-docs` for documentation update
- [ ] Update status.json to `reviewed`
- [ ] Add changelog entry

{{For REJECTED:}}
- [ ] Address blocker issues B01-B{{N}}
- [ ] Address critical issues C01-C{{N}}
- [ ] Re-run tests after fixes
- [ ] Resubmit for review via `nacl-tl-dev --continue`

{{For NEEDS_REWORK:}}
- [ ] Review and address listed issues
- [ ] Consider recommendations
- [ ] Resubmit for review

## Review Metadata

### Review Session

| Attribute | Value |
|-----------|-------|
| Reviewer | nacl-tl-review |
| Review Type | {{full/incremental}} |
| Review Started | {{YYYY-MM-DD HH:MM}} |
| Review Completed | {{YYYY-MM-DD HH:MM}} |
| Duration | {{N}} minutes |
| Result Files Read | result.md, acceptance.md |

### Files Referenced

| File | Purpose |
|------|---------|
| `.tl/tasks/{{task_id}}/result.md` | Development evidence |
| `.tl/tasks/{{task_id}}/acceptance.md` | Acceptance criteria |
| `.tl/tasks/{{task_id}}/task.md` | Task description |
| `.tl/tasks/{{task_id}}/test-spec.md` | Test specification |

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Requirements: {{path_to_requirements}}
- Form Specification: {{path_to_form}}
```

## Review Result Reference

| Result | Meaning | Next Action |
|--------|---------|-------------|
| `approved` | All criteria met, no blockers | Proceed to nacl-tl-docs |
| `rejected` | Blocker issues found | Must fix and re-review |
| `needs_rework` | Non-blocker issues found | Should fix before docs |

## Issue Severity Reference

| Severity | Symbol | Action Required | Examples |
|----------|--------|-----------------|----------|
| Blocker | 🔴 | Must fix before approval | Security vulnerability, data loss, crashes |
| Critical | 🟠 | Should fix before approval | Logic errors, missing error handling |
| Major | 🟡 | Should fix, can follow up | Code smells, missing tests |
| Minor | 🟢 | Nice to have | Style preferences, suggestions |

## Confidence Level Reference

| Level | Meaning |
|-------|---------|
| `High` | Confident the review is thorough and complete |
| `Medium` | Review is adequate but some areas may need attention |
| `Low` | Limited confidence, recommend additional review |

## Quality Checklist

Before committing a review.md file, verify:

- [ ] Frontmatter complete (task_id, title, reviewer, result)
- [ ] Summary clearly states the review outcome
- [ ] All acceptance criteria verified with status
- [ ] Code quality review completed for all 8 categories
- [ ] Issues documented with severity levels
- [ ] Test verification included with coverage
- [ ] TDD compliance verified
- [ ] Positive observations documented
- [ ] Final decision clearly stated with rationale
- [ ] Next steps listed based on decision
- [ ] NO external references for docs agent (SA refs for humans only)
