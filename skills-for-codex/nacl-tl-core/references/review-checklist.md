# Code Review Checklist for Node.js/TypeScript

## Overview

This checklist provides a systematic approach to code review for Node.js and TypeScript projects. Consistent code reviews improve code quality, share knowledge across the team, and catch defects early.

**Review Philosophy**: Be kind, be specific, be constructive.

```
🎯 Goal:        Improve code quality, not criticize the author
📖 Focus:       Correctness, maintainability, security
⏱️ Timing:      Small, frequent reviews > large, infrequent ones
🤝 Approach:    Collaborative discussion, not gatekeeping
```

---

## Quick Review Checklist

Use this abbreviated checklist for quick reviews or self-review before submitting:

### Essential Checks

- [ ] Code compiles and all tests pass
- [ ] No `console.log` or debugging statements
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Error handling is present and appropriate
- [ ] Code follows project naming conventions
- [ ] TypeScript strict mode issues resolved
- [ ] Changes are covered by tests

---

## Detailed Review Checklist

### 1. Code Correctness

| Check | Question to Ask |
|-------|-----------------|
| Logic | Does the code do what it's supposed to do? |
| Edge cases | Are boundary conditions handled? |
| Null safety | Are null/undefined cases handled properly? |
| Error paths | What happens when things go wrong? |
| Concurrency | Are async operations handled correctly? |

#### Checklist

- [ ] Logic correctly implements the requirements
- [ ] Edge cases are handled (empty arrays, null values, zero)
- [ ] Boundary conditions are tested (min/max values)
- [ ] Error cases throw appropriate exceptions
- [ ] Async/await patterns are used correctly
- [ ] No race conditions in concurrent code
- [ ] No unhandled promise rejections

---

### 2. Code Quality

#### Naming

- [ ] Variable names are descriptive and meaningful
- [ ] Function names describe what they do (verb + noun)
- [ ] Boolean names read as questions (is/has/can/should)
- [ ] Constants use UPPER_SNAKE_CASE
- [ ] Classes/interfaces use PascalCase
- [ ] Files use kebab-case

#### Structure

- [ ] Functions are small and do one thing
- [ ] Functions have 3 or fewer parameters
- [ ] No deeply nested code (max 3 levels)
- [ ] No duplicated code (DRY principle)
- [ ] Related code is grouped together
- [ ] Imports are organized and minimal

#### TypeScript

- [ ] No `any` types (or justified with comment)
- [ ] Proper type definitions (no `object` or `{}`)
- [ ] Interfaces/types for data structures
- [ ] Strict null checks are satisfied
- [ ] Generic types used appropriately
- [ ] Union types used instead of enums (when appropriate)

#### Examples

```typescript
// ❌ Poor naming
const d = new Date();
const arr = items.filter(i => i.x > 0);
function proc(o) { }

// ✅ Good naming
const orderDate = new Date();
const positiveItems = items.filter(item => item.quantity > 0);
function processOrder(order: Order): ProcessedOrder { }
```

---

### 3. Error Handling

#### Checklist

- [ ] Errors are not silently swallowed
- [ ] Empty catch blocks are avoided
- [ ] Custom error types used for domain errors
- [ ] Error messages are helpful and actionable
- [ ] Errors are logged with appropriate context
- [ ] Errors bubble up with stack traces preserved
- [ ] User-facing errors are sanitized (no internal details)

#### Anti-patterns

```typescript
// ❌ Silent error swallowing
try {
  await riskyOperation();
} catch (error) {
  // nothing here
}

// ❌ Logging without handling
try {
  await riskyOperation();
} catch (error) {
  console.log(error);  // Then what?
}

// ✅ Proper error handling
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new OperationError('Failed to complete operation', { cause: error });
}
```

---

### 4. Testing

#### Coverage

- [ ] New code has corresponding tests
- [ ] Happy path is tested
- [ ] Error cases are tested
- [ ] Edge cases are tested
- [ ] Tests are independent (no shared state)
- [ ] Test names describe the expected behavior

#### Quality

- [ ] Tests follow AAA pattern (Arrange-Act-Assert)
- [ ] One assertion concept per test
- [ ] No testing implementation details
- [ ] Mocks are used appropriately
- [ ] No flaky tests (deterministic results)
- [ ] Test data is meaningful, not random strings

#### Example Test Structure

```typescript
describe('OrderService', () => {
  describe('createOrder', () => {
    it('should create order with valid items', async () => {
      // Arrange
      const input = createValidOrderInput();

      // Act
      const order = await orderService.createOrder(input);

      // Assert
      expect(order.id).toBeDefined();
      expect(order.items).toHaveLength(input.items.length);
    });

    it('should throw ValidationError when items are empty', async () => {
      // Arrange
      const input = { ...createValidOrderInput(), items: [] };

      // Act & Assert
      await expect(orderService.createOrder(input))
        .rejects.toThrow(ValidationError);
    });
  });
});
```

---

### 5. Security

#### Checklist

- [ ] No hardcoded secrets, passwords, or API keys
- [ ] User input is validated and sanitized
- [ ] SQL/NoSQL injection prevented (parameterized queries)
- [ ] XSS prevention in user-facing output
- [ ] Authentication/authorization checks in place
- [ ] Sensitive data not logged
- [ ] Dependencies are from trusted sources
- [ ] No vulnerable dependency versions

#### Common Vulnerabilities

| Vulnerability | Check For |
|---------------|-----------|
| Injection | Unsanitized user input in queries |
| Broken Auth | Missing or weak authentication |
| Sensitive Data | Logging passwords, tokens, PII |
| XXE | Unvalidated XML parsing |
| Broken Access | Missing authorization checks |
| Misconfiguration | Debug mode in production |

---

### 6. Performance

#### Checklist

- [ ] No N+1 query problems
- [ ] Database queries are optimized (indexes used)
- [ ] Large datasets are paginated
- [ ] Expensive operations are cached where appropriate
- [ ] No synchronous operations blocking event loop
- [ ] Memory leaks avoided (event listeners cleaned up)
- [ ] No unnecessary re-renders (React/frontend)

#### Common Issues

```typescript
// ❌ N+1 problem
for (const order of orders) {
  const customer = await customerRepo.findById(order.customerId);
  // Database call for each order!
}

// ✅ Batch loading
const customerIds = orders.map(o => o.customerId);
const customers = await customerRepo.findByIds(customerIds);
const customerMap = new Map(customers.map(c => [c.id, c]));
```

---

### 7. Documentation

#### Checklist

- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has explanatory comments
- [ ] Comments explain WHY, not WHAT
- [ ] README updated if needed
- [ ] API documentation updated
- [ ] No TODO/FIXME without ticket reference
- [ ] No commented-out code

#### Comment Guidelines

```typescript
// ❌ Obvious comment
// Increment counter by one
counter++;

// ❌ Comment explaining WHAT
// Loop through users and filter active ones
const activeUsers = users.filter(u => u.isActive);

// ✅ Comment explaining WHY
// Filter inactive users to prevent sending emails to deactivated accounts
// per compliance requirement GDPR-2023-42
const activeUsers = users.filter(u => u.isActive);
```

---

### 8. Git & Commits

#### Commit Message

- [ ] Commit message is descriptive
- [ ] Commit message follows conventional format
- [ ] No unrelated changes in single commit
- [ ] Large changes are split into logical commits
- [ ] No merge commits when rebase is preferred

#### Pull Request

- [ ] PR description explains the change
- [ ] PR is reasonably sized (< 400 lines preferred)
- [ ] Related issue/ticket is linked
- [ ] Screenshots for UI changes
- [ ] Breaking changes are documented
- [ ] Migration steps documented if needed

---

## Review Process

### Before Reviewing

```
1. Understand the context (read ticket/issue)
2. Check if tests pass in CI
3. Review the PR description
4. Check file changes overview
```

### During Review

```
1. Read through code changes
2. Run the code locally if complex
3. Check tests cover the changes
4. Note any concerns or questions
5. Provide constructive feedback
```

### Feedback Guidelines

| Type | Example |
|------|---------|
| Must fix | 🔴 "This will cause a null pointer exception when..." |
| Should fix | 🟡 "Consider using `const` here for immutability" |
| Suggestion | 🟢 "Nice! You could also try X for slightly better perf" |
| Question | ❓ "I'm not sure I understand this part. Could you explain?" |
| Praise | 👍 "Great use of discriminated unions here!" |

### Constructive Feedback Examples

```
❌ "This is wrong"
✅ "This might throw an error when `user` is null. Consider adding a null check"

❌ "Bad naming"
✅ "Consider renaming `d` to `orderDate` for clarity"

❌ "Fix this"
✅ "The test is checking implementation details. Consider testing the
    behavior instead - for example, verifying the return value"
```

---

## Severity Levels

Use severity levels to prioritize review feedback:

| Level | Action | Examples |
|-------|--------|----------|
| 🔴 **Blocker** | Must fix before merge | Security vulnerability, data loss, crashes |
| 🟠 **Critical** | Should fix before merge | Logic errors, missing error handling |
| 🟡 **Major** | Should fix, can follow up | Code smells, missing tests |
| 🟢 **Minor** | Nice to have | Style preferences, suggestions |
| 💭 **Discussion** | Needs conversation | Architecture decisions |

---

## Review Checklist by File Type

### Service Files (*.service.ts)

- [ ] Single responsibility principle followed
- [ ] Dependencies injected via constructor
- [ ] Business logic is testable
- [ ] Transactions handled correctly
- [ ] Error handling is consistent

### Controller Files (*.controller.ts)

- [ ] Input validation present
- [ ] Authorization checks in place
- [ ] Consistent response format
- [ ] HTTP status codes are correct
- [ ] No business logic (delegates to service)

### Repository Files (*.repository.ts)

- [ ] Queries are parameterized
- [ ] Proper error handling for DB errors
- [ ] No N+1 queries
- [ ] Transactions used when needed

### Test Files (*.test.ts)

- [ ] Tests are focused and independent
- [ ] Setup/teardown is clean
- [ ] Assertions are meaningful
- [ ] Edge cases covered
- [ ] No hardcoded timeouts

---

## Self-Review Checklist

Before requesting review, verify:

```markdown
## Pre-submission Checklist

- [ ] I have tested my changes locally
- [ ] All tests pass
- [ ] I have added tests for new functionality
- [ ] I have updated documentation if needed
- [ ] I have removed debugging code
- [ ] I have reviewed my own code for obvious issues
- [ ] The PR description explains the change
- [ ] The commit history is clean
```

---

## Quick Reference

### Common Review Comments

| Issue | Comment Template |
|-------|------------------|
| Missing null check | "Consider adding a null check here to handle the case when X is undefined" |
| No error handling | "What happens if this operation fails? Consider adding try/catch" |
| Magic number | "Consider extracting this number into a named constant for clarity" |
| Missing test | "Could you add a test for the error case?" |
| Unclear name | "Consider renaming to better reflect the purpose" |

### Review Shortcuts

| Action | Purpose |
|--------|---------|
| LGTM | Looks Good To Me - approve |
| NIT | Minor suggestion, not blocking |
| RFC | Request For Comment - needs discussion |
| WIP | Work In Progress - don't merge yet |
