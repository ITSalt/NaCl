# Acceptance Criteria Template

## File Name

`acceptance.md`

Located in: `.tl/tasks/{{task_id}}/acceptance.md`

Example: `.tl/tasks/UC001/acceptance.md`

## Purpose

Defines the acceptance criteria that must be met for a task to be considered complete. The review agent uses this file to verify that implementation meets all requirements. Contains checkable criteria, verification steps, and expected outcomes.

## Created By

`tl-plan` skill

## Read By

`tl-review` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Acceptance Criteria: {{title}}"
source_uc: {{path_to_source_uc}}
status: pending
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
reviewed_by: {{reviewer_id}}
review_date: {{YYYY-MM-DD}}
tags: [acceptance, {{module}}, {{task_id}}]
---

# Acceptance Criteria: {{task_id}}

## Overview

{{Brief description of what acceptance means for this task.}}
{{Key outcomes that define success.}}

## Functional Criteria

### FC01. {{Criterion name}}

**Description:** {{What functional requirement must be met}}

**Verification:**
- [ ] {{Specific check 1}}
- [ ] {{Specific check 2}}
- [ ] {{Specific check 3}}

**Evidence:** {{How to demonstrate this is met}}

### FC02. {{Another functional criterion}}

**Description:** {{Requirement description}}

**Verification:**
- [ ] {{Check 1}}
- [ ] {{Check 2}}

**Evidence:** {{Demonstration method}}

### FC03. {{Data handling criterion}}

**Description:** {{Data processing requirement}}

**Verification:**
- [ ] Input data is validated according to specification
- [ ] Output data matches expected format
- [ ] {{Additional data check}}

**Evidence:** {{Evidence type}}

## Business Rules Criteria

### BR01. {{Business rule criterion}}

**Rule:** {{Business rule description}}

**Verification:**
- [ ] {{Rule verification step 1}}
- [ ] {{Rule verification step 2}}

**Test Case:** {{Reference to specific test that validates this rule}}

### BR02. {{Another business rule}}

**Rule:** {{Rule description}}

**Verification:**
- [ ] {{Verification step}}

**Test Case:** {{Test reference}}

## User Interface Criteria

### UI01. {{UI criterion}}

**Description:** {{UI requirement description}}

**Verification:**
- [ ] {{Visual check 1}}
- [ ] {{Interaction check 2}}
- [ ] {{Accessibility check}}

**Screenshot Required:** {{Yes/No}}

### UI02. {{Another UI criterion}}

**Description:** {{Requirement}}

**Verification:**
- [ ] {{Check}}

**Screenshot Required:** {{Yes/No}}

## Error Handling Criteria

### EH01. {{Error handling criterion}}

**Scenario:** {{Error condition}}

**Expected Behavior:**
- [ ] Error is caught appropriately
- [ ] User receives meaningful message: "{{expected_message}}"
- [ ] System remains in consistent state
- [ ] Error is logged with proper severity

### EH02. {{Another error scenario}}

**Scenario:** {{Condition}}

**Expected Behavior:**
- [ ] {{Expected handling}}

## Performance Criteria

### PC01. {{Performance criterion}}

**Metric:** {{What is being measured}}

**Threshold:** {{Maximum acceptable value}}

**Verification:**
- [ ] {{Operation}} completes within {{N}} seconds
- [ ] No memory leaks detected
- [ ] {{Additional performance check}}

### PC02. {{Another performance criterion}}

**Metric:** {{Metric name}}

**Threshold:** {{Value}}

**Verification:**
- [ ] {{Check}}

## Security Criteria

### SC01. {{Security criterion}}

**Requirement:** {{Security requirement description}}

**Verification:**
- [ ] {{Security check 1}}
- [ ] {{Security check 2}}
- [ ] {{Authorization check}}

### SC02. {{Another security criterion}}

**Requirement:** {{Requirement}}

**Verification:**
- [ ] {{Check}}

## Integration Criteria

### IC01. {{Integration criterion}}

**Components:** {{Component1}}, {{Component2}}

**Verification:**
- [ ] {{Integration check 1}}
- [ ] {{Data flows correctly between components}}
- [ ] {{No data loss or corruption}}

### IC02. {{Another integration criterion}}

**Components:** {{Components}}

**Verification:**
- [ ] {{Check}}

## Test Coverage Criteria

### TC01. All tests pass

**Verification:**
- [ ] All unit tests (UT*) pass
- [ ] All validation tests (VT*) pass
- [ ] All error tests (ET*) pass
- [ ] All integration tests (IT*) pass
- [ ] All edge case tests (EC*) pass

### TC02. Coverage meets requirements

**Verification:**
- [ ] Statement coverage >= {{N}}%
- [ ] Branch coverage >= {{N}}%
- [ ] Function coverage >= {{N}}%

## Documentation Criteria

### DC01. Code documentation

**Verification:**
- [ ] Public methods have JSDoc comments
- [ ] Complex logic has inline comments
- [ ] README updated (if applicable)

### DC02. API documentation

**Verification:**
- [ ] API endpoints documented
- [ ] Request/response examples provided
- [ ] Error codes documented

## Acceptance Checklist Summary

| Category | Criteria | Status |
|----------|----------|--------|
| Functional | FC01-FC{{N}} | {{Pending/Passed/Failed}} |
| Business Rules | BR01-BR{{N}} | {{Pending/Passed/Failed}} |
| User Interface | UI01-UI{{N}} | {{Pending/Passed/Failed}} |
| Error Handling | EH01-EH{{N}} | {{Pending/Passed/Failed}} |
| Performance | PC01-PC{{N}} | {{Pending/Passed/Failed}} |
| Security | SC01-SC{{N}} | {{Pending/Passed/Failed}} |
| Integration | IC01-IC{{N}} | {{Pending/Passed/Failed}} |
| Test Coverage | TC01-TC02 | {{Pending/Passed/Failed}} |
| Documentation | DC01-DC02 | {{Pending/Passed/Failed}} |

## Sign-off

**Overall Status:** {{Pending/Approved/Rejected}}

**Reviewer:** {{reviewer_name}}

**Date:** {{review_date}}

**Comments:**
{{Review comments and notes}}

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Requirements: {{path_to_requirements}}
- Form Specification: {{path_to_form}}
```

## Criteria ID Conventions

| Prefix | Type | Example |
|--------|------|---------|
| FC | Functional Criteria | FC01 |
| BR | Business Rule Criteria | BR01 |
| UI | User Interface Criteria | UI01 |
| EH | Error Handling Criteria | EH01 |
| PC | Performance Criteria | PC01 |
| SC | Security Criteria | SC01 |
| IC | Integration Criteria | IC01 |
| TC | Test Coverage Criteria | TC01 |
| DC | Documentation Criteria | DC01 |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Criteria defined, not yet verified |
| `in_review` | Review in progress |
| `approved` | All criteria met |
| `rejected` | One or more criteria failed |

## Sign-off Status Reference

| Status | Meaning |
|--------|---------|
| `Pending` | Awaiting review |
| `Approved` | All acceptance criteria passed |
| `Rejected` | One or more criteria failed, requires rework |

## Quality Checklist

Before committing an acceptance.md file, verify:

- [ ] Frontmatter complete (task_id, title, status)
- [ ] Functional criteria cover all main flow steps
- [ ] Business rules from task.md have corresponding criteria
- [ ] Error handling scenarios documented
- [ ] Performance thresholds specified (if applicable)
- [ ] Security requirements addressed (if applicable)
- [ ] Integration points verified (if applicable)
- [ ] Test coverage requirements specified
- [ ] Documentation requirements listed
- [ ] Summary checklist complete
- [ ] Sign-off section present
- [ ] NO external references for dev agent (SA refs for humans only)
