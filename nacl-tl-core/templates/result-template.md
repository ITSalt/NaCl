# Development Result Template

## File Name

`result.md`

Located in: `.tl/tasks/{{task_id}}/result.md`

Example: `.tl/tasks/UC001/result.md`

## Purpose

Documents the development work completed after the TDD cycle. Contains detailed information about files changed, tests written, TDD phases completed, and commits made. This file provides the **evidence** of completed work for the review phase.

## Created By

`nacl-tl-dev` skill

## Read By

`nacl-tl-review` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Development Result: {{title}}"
developer: nacl-tl-dev
started: {{YYYY-MM-DDTHH:MM:SSZ}}
completed: {{YYYY-MM-DDTHH:MM:SSZ}}
duration_minutes: {{duration}}
tdd_phases: [{{RED|GREEN|REFACTOR}}]
status: ready_for_review
tests_passed: {{total_tests}}
tests_failed: {{0}}
coverage: {{coverage_percent}}%
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
tags: [result, {{module}}, {{task_id}}]
---

# Development Result: {{task_id}}

## Summary

{{Brief description of what was implemented.}}
{{Overall outcome: success/partial/blocked.}}
{{Key highlights of the implementation.}}

## TDD Phases Completed

### 🔴 RED Phase

**Started:** {{YYYY-MM-DD HH:MM}}
**Completed:** {{YYYY-MM-DD HH:MM}}

**Activities:**
- Created test file: {{test_file_path}}
- Defined {{N}} unit tests
- Defined {{N}} integration tests
- All tests initially FAILING (expected)

**Test Cases Written:**

| Test ID | Description | Type |
|---------|-------------|------|
| {{TC001}} | {{Test description}} | {{unit/integration}} |
| {{TC002}} | {{Test description}} | {{unit/integration}} |
| {{TC003}} | {{Test description}} | {{unit/integration}} |

**RED Phase Verification:**
```
{{test_run_output_showing_failures}}
```

### 🟢 GREEN Phase

**Started:** {{YYYY-MM-DD HH:MM}}
**Completed:** {{YYYY-MM-DD HH:MM}}

**Activities:**
- Implemented {{main_component_name}}
- Created {{repository/service/controller}} components
- Added API endpoint {{method}} {{endpoint}}
- All tests PASSING

**Implementation Summary:**

| Component | Purpose |
|-----------|---------|
| {{ComponentName}} | {{Brief purpose}} |
| {{AnotherComponent}} | {{Brief purpose}} |

**GREEN Phase Verification:**
```
{{test_run_output_showing_passes}}
```

### 🔵 REFACTOR Phase

**Started:** {{YYYY-MM-DD HH:MM}}
**Completed:** {{YYYY-MM-DD HH:MM}}

**Refactoring Applied:**
- {{Refactoring 1: e.g., "Extracted order number generation to separate method"}}
- {{Refactoring 2: e.g., "Added input validation DTO"}}
- {{Refactoring 3: e.g., "Improved error messages"}}

**Code Quality Improvements:**
- [ ] Removed code duplication
- [ ] Improved naming
- [ ] Added proper typing
- [ ] Simplified complex logic
- [ ] Enhanced error handling

**REFACTOR Phase Verification:**
```
{{test_run_output_confirming_tests_still_pass}}
```

## Files Changed

### Files Created

| File | Purpose | Lines |
|------|---------|-------|
| {{file_path}} | {{Purpose description}} | +{{lines}} |
| {{file_path}} | {{Purpose description}} | +{{lines}} |
| {{file_path}} | {{Purpose description}} | +{{lines}} |

### Files Modified

| File | Changes | Lines |
|------|---------|-------|
| {{file_path}} | {{Change description}} | +{{added}}/-{{removed}} |
| {{file_path}} | {{Change description}} | +{{added}}/-{{removed}} |

### Summary

| Metric | Value |
|--------|-------|
| Files Created | {{N}} |
| Files Modified | {{N}} |
| Lines Added | +{{total_added}} |
| Lines Removed | -{{total_removed}} |
| Net Change | {{net_lines}} |

## Test Results

### Test Run Output

```
{{full_test_output}}
```

### Coverage Report

```
{{coverage_report}}
```

### Test Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites | {{N}} passed, {{N}} total | All pass | {{✅/❌}} |
| Tests | {{N}} passed, {{N}} total | All pass | {{✅/❌}} |
| Statement Coverage | {{N}}% | {{target}}% | {{✅/❌}} |
| Branch Coverage | {{N}}% | {{target}}% | {{✅/❌}} |
| Function Coverage | {{N}}% | {{target}}% | {{✅/❌}} |
| Line Coverage | {{N}}% | {{target}}% | {{✅/❌}} |

## Commits Made

### Commit History

| # | Hash | Type | Message | Phase |
|---|------|------|---------|-------|
| 1 | {{short_hash}} | test | {{commit_message}} | RED |
| 2 | {{short_hash}} | feat | {{commit_message}} | GREEN |
| 3 | {{short_hash}} | refactor | {{commit_message}} | REFACTOR |

### Commit Details

**Commit 1 (RED):**
```
{{full_commit_message}}
```

**Commit 2 (GREEN):**
```
{{full_commit_message}}
```

**Commit 3 (REFACTOR):**
```
{{full_commit_message}}
```

## Dependencies Used

### New Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| {{package_name}} | {{version}} | {{Purpose}} |

### Existing Dependencies Utilized

- {{dependency_name}}: {{how_used}}
- {{dependency_name}}: {{how_used}}

## Implementation Notes

### Technical Decisions

{{Key technical decisions made during implementation and rationale.}}

1. **{{Decision 1}}**: {{Rationale}}
2. **{{Decision 2}}**: {{Rationale}}

### Patterns Applied

- {{Pattern 1: e.g., "Repository pattern for database access"}}
- {{Pattern 2: e.g., "DTO validation with class-validator"}}
- {{Pattern 3: e.g., "Transaction wrapper for atomicity"}}

### Deviations from impl-brief.md

| Planned | Actual | Reason |
|---------|--------|--------|
| {{planned_approach}} | {{actual_approach}} | {{reason}} |

## Known Issues

{{Document any known issues, limitations, or technical debt introduced.}}

### Issue 1: {{Issue title}}

**Description:** {{Issue description}}
**Severity:** {{Low/Medium/High}}
**Workaround:** {{Workaround if any}}
**Future Fix:** {{Planned resolution}}

### No Issues

{{If no issues, state: "No known issues."}}

## Blockers Encountered

### Blocker 1: {{Blocker title}}

**Description:** {{What blocked progress}}
**Resolution:** {{How it was resolved}}
**Time Lost:** {{Duration}}

### No Blockers

{{If no blockers, state: "No blockers encountered."}}

## Performance Observations

| Operation | Measured | Target | Status |
|-----------|----------|--------|--------|
| {{operation_name}} | {{N}}ms | <{{N}}ms | {{✅/❌}} |
| {{operation_name}} | {{N}}ms | <{{N}}ms | {{✅/❌}} |

## Ready for Review Checklist

### Code Quality

- [ ] All tests pass
- [ ] Code coverage meets target ({{actual}}% >= {{target}}%)
- [ ] No console.log/debugging statements
- [ ] Proper error handling implemented
- [ ] Follows project coding standards
- [ ] TypeScript strict mode passes
- [ ] No ESLint warnings/errors

### Documentation

- [ ] Code comments for complex logic
- [ ] JSDoc for public methods
- [ ] README updated (if applicable)

### TDD Compliance

- [ ] RED phase completed (tests written first)
- [ ] GREEN phase completed (minimal implementation)
- [ ] REFACTOR phase completed (code improved)
- [ ] All commits follow conventional format

### Security

- [ ] Input validation implemented
- [ ] No sensitive data exposed
- [ ] Authorization checks in place (if applicable)

### Integration

- [ ] API contracts match specification
- [ ] Database schema changes applied
- [ ] No breaking changes to existing functionality

## Final Status

**Status:** {{ready_for_review/needs_rework/blocked}}

**Confidence Level:** {{High/Medium/Low}}

**Review Readiness:**
- [x] Implementation complete
- [x] All tests pass
- [x] Documentation updated
- [x] Self-review completed
- [ ] Ready for nacl-tl-review

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Entity: {{path_to_entity}}
- Requirements: {{path_to_requirements}}
```

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `ready_for_review` | Development complete, awaiting review |
| `needs_rework` | Issues found during self-review |
| `blocked` | Cannot complete due to external dependency |

## TDD Phase Reference

| Phase | Symbol | Purpose | Expected Outcome |
|-------|--------|---------|------------------|
| RED | 🔴 | Write failing tests | All tests fail |
| GREEN | 🟢 | Write minimal implementation | All tests pass |
| REFACTOR | 🔵 | Improve code quality | Tests still pass |

## Confidence Level Reference

| Level | Meaning |
|-------|---------|
| `High` | Confident implementation is complete and correct |
| `Medium` | Implementation works but some uncertainty exists |
| `Low` | Implementation may need significant rework |

## Quality Checklist

Before committing a result.md file, verify:

- [ ] Frontmatter complete (task_id, title, developer, timestamps, status)
- [ ] Summary clearly describes what was implemented
- [ ] All three TDD phases documented (RED, GREEN, REFACTOR)
- [ ] Files changed section complete with line counts
- [ ] Test results included with actual output
- [ ] Coverage report included
- [ ] Commits listed with conventional commit format
- [ ] Known issues documented (or explicitly stated "None")
- [ ] Ready for review checklist completed
- [ ] Final status clearly stated
- [ ] NO external references for review agent (SA refs for humans only)
