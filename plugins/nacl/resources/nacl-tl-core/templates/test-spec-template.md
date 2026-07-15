# Test Specification Template

## File Name

`test-spec.md`

Located in: `.tl/tasks/{{task_id}}/test-spec.md`

Example: `.tl/tasks/UC001/test-spec.md`

## Purpose

Defines all test cases for the task. The development agent uses this file during the RED phase of TDD to write failing tests BEFORE implementation. Contains test scenarios, expected behaviors, and edge cases.

## Created By

`nacl-tl-plan` skill

## Read By

`nacl-tl-dev` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Test Specification: {{title}}"
source_uc: {{path_to_source_uc}}
status: pending
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
test_framework: {{jest|vitest|mocha}}
tags: [tests, {{module}}, {{task_id}}]
---

# Test Specification: {{task_id}}

## Overview

{{Brief description of what these tests verify.}}

## Test Environment

### Dependencies

- {{Test framework}}: {{version}}
- {{Mock library}}: {{version}}
- {{Additional test dependencies}}

### Setup Requirements

```typescript
// Test setup code
{{Setup code snippet}}
```

## Unit Tests

### UT01. {{Test group name}}

**Component:** `{{ClassName/FunctionName}}`

#### UT01.1. {{Test case name}}

**Description:** {{What behavior is being tested}}

**Preconditions:**
- {{Required state before test}}
- {{Mock configuration}}

**Input:**
```typescript
const input = {{test_input_object}};
```

**Expected Result:**
```typescript
expect(result).{{matcher}}({{expected_value}});
```

**AAA Pattern:**
```typescript
it('should {{expected behavior}}', async () => {
  // Arrange
  {{Setup test data and mocks}}

  // Act
  const result = {{method_call}};

  // Assert
  expect(result).{{assertion}};
});
```

#### UT01.2. {{Another test case}}

**Description:** {{Description}}

**Input:**
```typescript
const input = {{test_input}};
```

**Expected Result:**
```typescript
expect(result).{{matcher}}({{expected}});
```

### UT02. {{Another test group}}

**Component:** `{{ClassName}}`

#### UT02.1. {{Test case}}

**Description:** {{Description}}

**Preconditions:**
- {{Precondition}}

**Input:**
```typescript
{{input}}
```

**Expected Result:**
```typescript
{{expected}}
```

## Error Handling Tests

### ET01. {{Error scenario name}}

**Description:** {{What error condition is being tested}}

**Trigger:** {{What causes the error}}

**Expected Error:**
- Type: `{{ErrorClassName}}`
- Message: `{{Error message pattern}}`
- Code: `{{error_code}}`

**Test:**
```typescript
it('should throw {{ErrorType}} when {{condition}}', async () => {
  // Arrange
  {{Setup for error condition}}

  // Act & Assert
  await expect({{method_call}})
    .rejects
    .toThrow({{ErrorType}});
});
```

### ET02. {{Another error scenario}}

**Trigger:** {{Condition}}

**Expected Error:**
- Type: `{{ErrorType}}`
- Message: `{{message}}`

## Validation Tests

### VT01. {{Validation rule name}}

**Field:** `{{field_name}}`

**Rule:** {{Validation rule description}}

| Input | Valid | Expected |
|-------|-------|----------|
| `{{valid_input}}` | Yes | {{result}} |
| `{{invalid_input}}` | No | `{{ErrorType}}` |
| `{{edge_case}}` | {{Yes/No}} | {{result}} |

### VT02. {{Another validation}}

**Field:** `{{field_name}}`

**Rule:** {{Rule description}}

| Input | Valid | Expected |
|-------|-------|----------|
| `{{input1}}` | {{Yes/No}} | {{result}} |
| `{{input2}}` | {{Yes/No}} | {{result}} |

## Integration Tests

### IT01. {{Integration scenario name}}

**Components:** `{{Component1}}`, `{{Component2}}`

**Description:** {{What integration is being tested}}

**Preconditions:**
- {{Database state}}
- {{External service availability}}

**Test Flow:**
1. {{Step 1}}
2. {{Step 2}}
3. {{Verification}}

**Expected Outcome:**
- {{Outcome 1}}
- {{Outcome 2}}

### IT02. {{Another integration test}}

**Components:** {{Components}}

**Description:** {{Description}}

**Test Flow:**
1. {{Step}}

**Expected Outcome:**
- {{Outcome}}

## Edge Cases

### EC01. {{Edge case name}}

**Scenario:** {{Description of edge case}}

**Input:** {{Edge case input}}

**Expected Behavior:** {{How system should handle it}}

### EC02. {{Another edge case}}

**Scenario:** {{Description}}

**Input:** {{Input}}

**Expected Behavior:** {{Behavior}}

### EC03. {{Boundary condition}}

**Scenario:** {{Description}}

**Input:** {{Boundary value}}

**Expected Behavior:** {{Behavior}}

## Mock Definitions

### Mock: {{MockName}}

**Original:** `{{OriginalClassName}}`

**Purpose:** {{Why this mock is needed}}

```typescript
const mock{{Name}} = {
  {{method}}: jest.fn().mockResolvedValue({{default_value}}),
  {{another_method}}: jest.fn().mockResolvedValue({{value}})
};
```

### Mock: {{AnotherMock}}

**Original:** `{{ClassName}}`

```typescript
const mock{{Name}} = {{mock_definition}};
```

## Test Data Fixtures

### Fixture: {{FixtureName}}

**Purpose:** {{What this fixture represents}}

```typescript
const {{fixtureName}} = {
  {{field1}}: {{value1}},
  {{field2}}: {{value2}},
  {{field3}}: {{value3}}
};
```

### Fixture: {{AnotherFixture}}

```typescript
const {{name}} = {{fixture_definition}};
```

## Coverage Requirements

| Metric | Minimum | Target |
|--------|---------|--------|
| Statements | {{N}}% | {{M}}% |
| Branches | {{N}}% | {{M}}% |
| Functions | {{N}}% | {{M}}% |
| Lines | {{N}}% | {{M}}% |

## Test Execution Order

1. Unit Tests (UT*) - Run first, fastest
2. Validation Tests (VT*) - Input validation
3. Error Handling Tests (ET*) - Error scenarios
4. Integration Tests (IT*) - Cross-component
5. Edge Cases (EC*) - Boundary conditions

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Requirements: {{path_to_requirements}}
- Entity: {{path_to_entity}}
```

## Test ID Conventions

| Prefix | Type | Example |
|--------|------|---------|
| UT | Unit Test | UT01.1 |
| IT | Integration Test | IT01 |
| ET | Error Test | ET01 |
| VT | Validation Test | VT01 |
| EC | Edge Case | EC01 |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Tests not written |
| `red` | Tests written, failing |
| `green` | Tests passing |
| `complete` | All tests verified |

## Quality Checklist

Before committing a test-spec.md file, verify:

- [ ] Frontmatter complete (task_id, title, status)
- [ ] All acceptance criteria have corresponding tests
- [ ] Error handling tests included
- [ ] Validation tests cover all input fields
- [ ] Edge cases identified and documented
- [ ] Mock definitions provided for external dependencies
- [ ] Test fixtures defined for reusable data
- [ ] Coverage requirements specified
- [ ] AAA pattern used in test examples
- [ ] NO external references for dev agent (SA refs for humans only)
