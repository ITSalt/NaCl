---
task_id: UC001
title: "Code Review: UC001 (be) — Orders read/delete API"
reviewer: nacl-tl-review
review_started: 2026-05-29T14:54:26Z
review_completed: 2026-05-29T14:54:26Z
duration_minutes: 0
result: rejected
issues_found: 12
blockers: 1
created: 2026-05-29
updated: 2026-05-29
tags: [review, orders, UC001]
---

# Code Review: UC001

## Summary

Workflow status: `REVIEW COMPLETE`. Code judgment: `CHANGES REQUESTED`. Action required: address 1 blocker, 1 critical issue.

UC001 (be) implements the Orders read/delete API: `OrderService` (`getOrderById`, `listOrders`, `deleteOrder`, `computeTotal`) paired with `OrdersController` exposing `GET /orders/:id` and `DELETE /orders/:id`, with `@UseGuards(AuthGuard)` applied controller-wide. Unit tests cover single-order retrieval, the default 50-item list limit, and line-item total computation.

The change is **rejected**. `getOrderById` builds its query by raw string interpolation (`WHERE id = '${id}'`) on the unsanitized request path parameter, an exploitable SQL injection that directly violates acceptance criterion SC02 — even though `listOrders` and `deleteOrder` correctly parameterize. A missing-order read returns HTTP 200 with a null body instead of a 404, breaking REST semantics. Both findings, plus the object-level authorization (IDOR) gap and the testing/coverage gaps, must be resolved before this can ship.

## Review Scope

### Files Reviewed

| File | Lines Changed | Review Status |
|------|---------------|---------------|
| src/orders/order.service.ts | +42/-0 | ❌ |
| src/orders/orders.controller.ts | +24/-0 | ❌ |
| src/orders/order.service.spec.ts | +29/-0 | ⚠️ |

### Review Coverage

| Metric | Value |
|--------|-------|
| Files Reviewed | 3 |
| Lines Reviewed | 95 |
| Commits Reviewed | 2 |
| Test Files Reviewed | 1 |

## Acceptance Criteria Verification

### Functional Criteria

| Criteria ID | Description | Status | Notes |
|-------------|-------------|--------|-------|
| FC01 | `GET /orders/:id` returns the matching order | ✅ | `getOrderById` returns `rows[0]`; tested |
| FC02 | `GET /orders/:id` returns `null` when no order matches | ⚠️ | Service returns `null`, but controller surfaces it as 200-with-null body (see C01); not tested |
| FC03 | `GET /orders` returns orders ordered by `created_at` descending | ✅ | `ORDER BY created_at DESC` |
| FC04 | `GET /orders` applies a default limit of 50 | ✅ | `opts.limit ?? 50`; tested |
| FC05 | `DELETE /orders/:id` removes the order | ✅ | Parameterized `DELETE`; no-row case untested (N01) |
| FC06 | `computeTotal` returns sum of `price * qty` (0 for empty) | ✅ | Correct; empty/default case untested |

### Business Rules Criteria

| Criteria ID | Description | Status | Notes |
|-------------|-------------|--------|-------|
| BR01 | n/a | ✅ | No additional business rules in scope |

### Error Handling Criteria

| Criteria ID | Scenario | Status | Notes |
|-------------|----------|--------|-------|
| EH01 | Missing order id yields `null`, not an exception | ⚠️ | Service yields `null`, but the read path returns 200-with-null (REST semantics broken; see C01) |

### Performance Criteria

| Criteria ID | Metric | Threshold | Measured | Status |
|-------------|--------|-----------|----------|--------|
| PC01 | List query bounded | LIMIT applied | LIMIT $1 (default 50) | ✅ |

### Security Criteria

| Criteria ID | Requirement | Status | Notes |
|-------------|-------------|--------|-------|
| SC01 | Every route requires an authenticated caller (`AuthGuard`) | ✅ | `@UseGuards(AuthGuard)` controller-wide; object-level authz still missing (see M03) |
| SC02 | All DB access uses parameterized queries — no interpolation | ❌ | `getOrderById` interpolates `id` into SQL (BLOCKER B01); `listOrders`/`deleteOrder` are correct |

### Criteria Summary

| Category | Total | Passed | Failed |
|----------|-------|--------|--------|
| Functional | 6 | 5 | 1 |
| Business Rules | 0 | 0 | 0 |
| Error Handling | 1 | 0 | 1 |
| Performance | 1 | 1 | 0 |
| Security | 2 | 1 | 1 |
| **Total** | **10** | **7** | **3** |

## Code Quality Review

### 1. Code Correctness

- [x] Logic correctly implements requirements
- [ ] Edge cases are handled
- [ ] Null/undefined cases handled properly
- [x] Async/await patterns used correctly
- [x] No unhandled promise rejections

**Status: PARTIAL**

**Findings:**
A missing order returns HTTP 200 with a null body instead of a 404 (C01) — the controller returns the service's `null` directly, so `GET /orders/:id` for a non-existent order reports success. `deleteOrder` silently succeeds for a non-existent id (N01) — the affected-row count is never inspected. The not-found path is therefore unhandled on both the read and delete routes.

### 2. Code Quality

**Naming:**
- [x] Variables have descriptive names
- [x] Functions describe what they do
- [x] Consistent naming conventions

**Structure:**
- [x] Functions are small and focused
- [x] No deeply nested code
- [x] No duplicated code

**TypeScript:**
- [ ] No `any` types without justification
- [x] Proper type definitions
- [x] Strict null checks satisfied

**Status: PARTIAL**

**Findings:**
The test DB mock is passed via `new OrderService(db as any)` with an uncommented `any` cast (N02), bypassing constructor-parameter type checking. Type the mock against the real `Db` (e.g. `Pick<Db, 'query'>` or `jest.Mocked<Db>`) instead, or add a justifying comment.

### 3. Error Handling

- [ ] Errors are not silently swallowed
- [ ] Error messages are helpful
- [x] Errors are logged with context
- [x] User-facing errors are sanitized

**Status: FAIL**

**Findings:**
Missing-resource error conditions are not surfaced. The read path returns 200-with-null instead of throwing `NotFoundException` (C01); the delete path returns a misleading success when zero rows are deleted (N01). Map both not-found cases to a sanitized 404 so callers can distinguish "missing" from "empty success".

### 4. Testing

**Coverage:**
- [x] New code has corresponding tests
- [x] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested

**Quality:**
- [x] Tests follow AAA pattern
- [ ] Tests are independent
- [x] No flaky tests

**Status: PARTIAL**

**Findings:**
`deleteOrder` and both controller routes have no tests, so route wiring and the `@UseGuards(AuthGuard)` enforcement are never exercised (M01). Only happy paths are tested: the `getOrderById` not-found branch, `computeTotal`'s empty/default-argument case, and error-propagation are all unverified (M02). The db mock and service are created once at describe scope with no `beforeEach`/`mockClear`, so tests share never-reset state and are order-dependent (N03).

### 5. Security

- [x] No hardcoded secrets
- [ ] User input validated and sanitized
- [ ] SQL/NoSQL injection prevented
- [ ] Authorization checks in place
- [x] Sensitive data not logged

**Status: FAIL**

**Findings:**
**BLOCKER (B01):** `getOrderById` builds SQL by template-literal interpolation (`SELECT * FROM orders WHERE id = '${id}'`) on the unsanitized request path parameter — a reachable, exploitable SQL injection that violates SC02. The sibling methods already prove the parameterized pattern works.
**MAJOR (M03):** `AuthGuard` enforces authentication but not object-level authorization. Both `GET` and `DELETE` pass the caller-supplied id to the service with no ownership/permission check, so any authenticated user can read or delete any order by enumerating ids (IDOR / Broken Access Control).

### 6. Performance

- [x] No N+1 query problems
- [ ] Large datasets paginated
- [x] No synchronous blocking operations
- [x] No memory leaks

**Status: PARTIAL**

**Findings:**
`getOrderById` and `listOrders` use `SELECT *` rather than an explicit projection (N04), transferring more data than the API serves and defeating covering-index plans. `listOrders` bounds results with `LIMIT` (the primary concern is handled) but exposes no offset/cursor, so callers can only ever retrieve the first page (N05); add keyset pagination.

### 7. Documentation

- [ ] Public APIs have JSDoc comments
- [x] Complex logic has comments
- [ ] Comments explain WHY, not WHAT
- [x] No TODO without ticket reference
- [x] No commented-out code

**Status: PARTIAL**

**Findings:**
None of `OrderService`'s four public methods carry JSDoc (N06), so the nullable return of `getOrderById` and the default-limit semantics of `listOrders` are undocumented. The comment `// Look the order up by id.` restates WHAT the code does rather than WHY (N07) — remove it or replace it with a contract-documenting JSDoc block.

### 8. Git & Commits

- [x] Commit messages are descriptive
- [x] Follows conventional commit format
- [x] No unrelated changes in commits
- [x] Commits are logical and atomic

**Status: PASS**

**Findings:**
No issues found. RED/GREEN commits are present and conventionally formatted, and the three changed files are all in scope for UC001.

## Issues Found

### 🔴 Blockers (Must Fix)

#### Issue B01: SQL injection via string interpolation in getOrderById

**Severity:** 🔴 Blocker
**File:** src/orders/order.service.ts
**Line:** 31

**Description:**
`getOrderById` builds the query with raw template-literal interpolation: `SELECT * FROM orders WHERE id = '${id}'`. The `id` value originates from the unsanitized request path parameter (`orders.controller.ts` line 69: `getOne(@Param('id') id: string)`) and flows directly into the SQL string with no escaping or parameterization. An attacker can supply a crafted id such as `o1' OR '1'='1` (or `'; DROP TABLE orders; --` depending on the driver) to read or destroy arbitrary rows. This is a reachable, exploitable injection on an authenticated-but-untrusted input.

**Code:**
```ts
const rows = await this.db.query(
  `SELECT * FROM orders WHERE id = '${id}'`,
);
```

**Recommended Fix:**
```ts
const rows = await this.db.query(
  'SELECT * FROM orders WHERE id = $1',
  [id],
);
```

**Rationale:**
Checklist item 'SQL/NoSQL injection prevented (parameterized queries)' (review-checklist.md:200) and the project SC02 requirement. The fact that `listOrders` and `deleteOrder` are parameterized while `getOrderById` is not makes this an inconsistent, easily-fixed defect with no downside to correcting.

### 🟠 Critical Issues (Should Fix)

#### Issue C01: Missing order returns HTTP 200 with null body instead of 404

**Severity:** 🟠 Critical
**File:** src/orders/order.service.ts
**Line:** 28-34 (getOrderById service); orders.controller.ts:68-71 (getOne controller)

**Description:**
`getOrderById` resolves to `rows[0] ?? null` when no row matches, and `OrdersController.getOne` returns that value directly. In NestJS, returning `null` from a GET handler produces a 200 OK with an empty/null body rather than a 404 Not Found. A `GET /orders/:id` for a non-existent or already-deleted order therefore reports success with a null body, breaking REST semantics: the 'resource does not exist' path is not handled as an error at all, so callers cannot distinguish 'order missing' from a malformed/empty success and may treat absent data as a valid empty order.

**Recommended Fix:**
Map the not-found case to a 404. In `getOne` (or the service), throw NestJS's `NotFoundException` when the lookup yields nothing, e.g.: `const order = await this.orders.getOrderById(id); if (!order) throw new NotFoundException(`Order ${id} not found`); return order;` Keep the service returning `Order | null`, let the controller translate `null` into `NotFoundException`, and keep the message free of internal/SQL details so the framework maps it to an actionable, sanitized 404.

### 🟡 Major Issues (Should Fix)

#### Issue M01: deleteOrder and the controller routes have no tests

**Severity:** 🟡 Major
**File:** src/orders/order.service.spec.ts
**Line:** 86-111

**Description:**
The diff adds four service methods (`getOrderById`, `listOrders`, `deleteOrder`, `computeTotal`) and a controller with GET/:id and DELETE/:id routes, but the only spec file covers `getOrderById`, `listOrders`, and `computeTotal`. `OrderService.deleteOrder` (order.service.ts:44-46) is entirely untested — there is no assertion that it issues the parameterized DELETE with the right id. `OrdersController` (orders.controller.ts) has zero tests, so the route wiring and the `@UseGuards(AuthGuard)` authorization that the controller comment claims to enforce are never exercised.

**Recommended Fix:**
Add a test for `deleteOrder` asserting `db.query` is called with `'DELETE FROM orders WHERE id = $1'` and `[id]`. Add a controller spec (or e2e) that verifies `getOne`/`remove` delegate to the service and that routes are guarded by `AuthGuard`.

#### Issue M02: Only happy paths tested; error/not-found and empty-input edge cases missing

**Severity:** 🟡 Major
**File:** src/orders/order.service.spec.ts
**Line:** 91-111

**Description:**
All three tests cover the success path only. `getOrderById` has an explicit not-found branch (`rows[0] ?? null` at order.service.ts:33) that is never tested — the shared mock always returns a populated row, so the `null` return is never asserted. `computeTotal` declares a default empty array (`items: LineItem[] = []` at order.service.ts:48) and the reduce-from-zero behavior, but is only tested with two populated items; neither the empty-array nor the default-argument edge case is covered. No error-propagation case (e.g. `db.query` rejecting) is tested for any method.

**Recommended Fix:**
Add: `getOrderById` returns `null` when `db.query` resolves to `[]`; `computeTotal` returns 0 for `[]` and for no argument; optionally a test that a rejected `db.query` rejects the service call.

#### Issue M03: Missing object-level authorization (IDOR) on order read and delete

**Severity:** 🟡 Major
**File:** src/orders/orders.controller.ts
**Line:** 68-76

**Description:**
`AuthGuard` at the controller level (line 64) enforces authentication but not authorization scoped to the resource. Both `GET /orders/:id` and `DELETE /orders/:id` pass the caller-supplied id straight to the service with no check that the authenticated principal owns or is permitted to access that specific order. Any authenticated user can read or delete any other user's order by guessing/enumerating ids (Broken Access Control / IDOR).

**Recommended Fix:**
Add an ownership/permission check before returning or deleting: derive the caller from the request (e.g. injected user) and verify the order belongs to them (or that the role grants cross-tenant access) before performing `getOrderById`/`deleteOrder`. Reject with 403/404 otherwise.

### 🟢 Minor Issues (Nice to Have)

#### Issue N01: deleteOrder silently succeeds for a non-existent id

**Severity:** 🟢 Minor
**File:** src/orders/order.service.ts
**Line:** 44-46 (deleteOrder service); orders.controller.ts:73-76 (remove controller)

**Description:**
`deleteOrder` issues `DELETE FROM orders WHERE id = $1` and returns `void` without inspecting the affected-row count, and the controller's `remove` returns that promise directly. `DELETE /orders/:id` for an id that does not exist resolves as a success (200) even though nothing was deleted, so the caller cannot distinguish 'deleted an existing order' from 'no such order' and gets no feedback that the delete was a no-op (e.g. typo'd/stale id). This is the same missing not-found error path as `getOrderById`, on the delete route. There is no test covering this boundary case.

**Suggestion:**
Inspect the driver's affected-row count (e.g. `result.rowCount`) and throw `NotFoundException(`Order ${id} not found`)` when zero rows were deleted, so a delete against a missing resource produces an actionable 404 rather than a misleading success. If idempotent-delete semantics are intentional, document that decision explicitly near the method. Add a unit test for the no-rows-deleted path.

#### Issue N02: Unjustified `any` cast on test DB mock

**Severity:** 🟢 Minor
**File:** src/orders/order.service.spec.ts
**Line:** 89

**Description:**
The mock DB is passed to the service via `new OrderService(db as any)`. The checklist's TypeScript rules call for no `any` types unless justified with a comment. Here the `any` cast is uncommented. While it is a conventional pattern for narrow test doubles, it silently bypasses constructor-parameter type checking, so if the real `Db` contract changes the test will not catch the drift.

**Suggestion:**
Type the mock against the real dependency instead of casting to `any`, e.g. `const db: Pick<Db, 'query'> = { query: jest.fn().mockResolvedValue(rows) };` and pass `db as Db`, or define a typed `jest.Mocked<Db>`. If an `any` is genuinely necessary, add a short justifying comment.

#### Issue N03: Shared mock state across tests with no reset between cases

**Severity:** 🟢 Minor
**File:** src/orders/order.service.spec.ts
**Line:** 87-89

**Description:**
The db mock and service instance are created once at describe scope (`const db = { query: jest.fn().mockResolvedValue(rows) }; const svc = new OrderService(db as any)`) and reused by every test, with no `beforeEach`/`afterEach` calling `mockClear`/`mockReset`. `jest.fn()` accumulates call history across tests, so the `listOrders` test's `toHaveBeenCalledWith` assertion runs against a mock already invoked by the `getOrderById` test, and the fixed `mockResolvedValue(rows)` forces every method to see the same canned rows. This couples the tests to execution order and blocks adding call-count assertions or per-test return values.

**Suggestion:**
Recreate the mock/service in a `beforeEach`, or call `db.query.mockClear()` (and set per-test return values via `mockResolvedValueOnce`) so each test is independent.

#### Issue N04: SELECT * fetches all columns instead of an explicit projection

**Severity:** 🟢 Minor
**File:** src/orders/order.service.ts
**Line:** 31, 39

**Description:**
Both `getOrderById` (line 31) and `listOrders` (line 39) issue `SELECT * FROM orders`. Selecting every column transfers more data than the API needs and prevents index-only / covering-index optimizations. For `listOrders` this is amplified across up to the default 50 rows per call.

**Suggestion:**
Replace `SELECT *` with an explicit column list matching the `Order` interface, e.g. `SELECT id, created_at FROM orders ...`, returning only fields the API actually serves.

#### Issue N05: listOrders caps at LIMIT only with no cursor/offset for further pages

**Severity:** 🟢 Minor
**File:** src/orders/order.service.ts
**Line:** 36-42

**Description:**
`listOrders` applies `ORDER BY created_at DESC LIMIT $1` (default 50), which correctly bounds the result set and prevents an unbounded scan — the primary performance concern is handled. However it exposes no offset or keyset/cursor parameter, so callers can only ever retrieve the first page; there is no paginated path to records beyond the first 50.

**Suggestion:**
Add keyset pagination (e.g. a `cursor`/`before` param translating to `WHERE created_at < $cursor`) or an offset to `ListOpts`, keeping the LIMIT default. Keyset is preferred over OFFSET for deep pages.

#### Issue N06: Public OrderService methods lack JSDoc comments

**Severity:** 🟢 Minor
**File:** src/orders/order.service.ts
**Line:** 28, 36, 44, 48

**Description:**
`OrderService` is a public, injectable service whose four methods (`getOrderById`, `listOrders`, `deleteOrder`, `computeTotal`) form the public API consumed by `OrdersController` and any future callers. None of them carry JSDoc. Consumers get no documented contract for the nullable return of `getOrderById` (`Promise<Order | null>`), the default limit semantics of `listOrders`, or the units/expectations of `computeTotal`.

**Suggestion:**
Add JSDoc to each public method, e.g.: `/** Fetches a single order by id. @returns the order, or null if no row matches. */` above `getOrderById`; document the `opts.limit` default (50) on `listOrders`; and document that `computeTotal` sums `price*qty` across line items and returns 0 for an empty list.

#### Issue N07: Comment restates WHAT the code does instead of WHY

**Severity:** 🟢 Minor
**File:** src/orders/order.service.ts
**Line:** 29

**Description:**
The comment `// Look the order up by id.` on `getOrderById` merely paraphrases the method name and the SELECT statement immediately below it. It adds no information a reader cannot get from the code itself.

**Suggestion:**
Remove the redundant comment, or replace it with a JSDoc block that documents the contract (nullable return on no match). Reserve inline comments for explaining non-obvious WHY.

## Issue Summary

| Severity | Count | Must Fix |
|----------|-------|----------|
| 🔴 Blocker | 1 | Yes |
| 🟠 Critical | 1 | Yes |
| 🟡 Major | 3 | Recommended |
| 🟢 Minor | 7 | Optional |
| **Total** | **12** | 2 required |

## Test Verification

### Test Run Results

```
PASS src/orders/order.service.spec.ts
  OrderService
    ✓ returns an order by id
    ✓ lists orders with a default limit
    ✓ computes the total of line items

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Coverage:    88% statements
```

### Test Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites | 1 passed, 1 total | All pass | ✅ |
| Tests | 3 passed, 3 total | All pass | ✅ |
| Statement Coverage | 88% | ≥80% | ✅ |
| Branch Coverage | n/a | ≥80% | ⚠️ |
| Function Coverage | n/a | ≥80% | ⚠️ |
| Line Coverage | n/a | ≥80% | ⚠️ |

Note: tests pass, but coverage masks untested behavior — `deleteOrder`, the controller routes, the `getOrderById` not-found branch, and `computeTotal`'s empty-input case are not exercised (see M01, M02, N01). Gate evidence: repoChecks GREEN, navActions EXEMPT, stubs PROCEED, newFailures 0.

## TDD Compliance

### Phase Verification

| Phase | Evidence Found | Status |
|-------|----------------|--------|
| 🔴 RED | `test(UC001): order service read/list/total` — 3 specs, initially failing | ✅ |
| 🟢 GREEN | `feat(UC001): implement OrderService + OrdersController` | ✅ |
| 🔵 REFACTOR | None required (per dev result) | ✅ |

### TDD Notes

The RED→GREEN sequence is documented in result-be.md and the three RED specs were authored before implementation. However, the RED set only captured happy paths; the security defect (B01) and the not-found / no-op-delete error paths (C01, N01) had no failing test to drive them, so TDD did not surface them. Adding the missing error/edge tests (M01, M02) would have caught these during development.

## Positive Observations

### 👍 What's Done Well

1. **Correct parameterization in two of three queries**: `listOrders` and `deleteOrder` use parameterized placeholders (`$1`), demonstrating the team knows the safe pattern — which makes the `getOrderById` interpolation an isolated, low-cost fix rather than a systemic problem.
2. **Controller-wide authentication**: `@UseGuards(AuthGuard)` is applied once at the controller level rather than repeated per-route, cleanly satisfying SC01 (authentication) without duplication.
3. **Sensible defaults and bounded list query**: `listOrders` defaults `limit` to 50 and `computeTotal` defaults `items` to `[]`, so an empty cart yields 0 and the list query is bounded (no unbounded scan) by construction.

## Recommendations

### Immediate (This PR)

1. Fix B01: replace the interpolated `getOrderById` query with the parameterized form already used by the sibling methods.
2. Fix C01: translate the not-found `null` into a sanitized `NotFoundException` (404) in the read path.
3. Add object-level authorization (M03) and the missing `deleteOrder`/controller and error/edge tests (M01, M02).

### Future Improvements

1. Replace `SELECT *` with explicit projections and add keyset pagination to `listOrders` (N04, N05).
2. Add JSDoc to the public `OrderService` methods and remove the redundant WHAT-comment (N06, N07); type the test mock against `Db` instead of `any` and reset mock state per test (N02, N03); inspect the affected-row count in `deleteOrder` (N01).

## Final Decision

### Review Result: REJECTED

**Confidence Level:** High

### Approval Conditions

Before resubmission, the following must be fixed:
- **B01 (Blocker):** Parameterize the `getOrderById` query to close the SQL injection and satisfy SC02.
- **C01 (Critical):** Return a 404 (`NotFoundException`) for a missing order instead of 200-with-null.

Strongly recommended in the same cycle: object-level authorization (M03) and the missing tests (M01, M02), since they guard the exact paths most likely to regress.

### Decision Rationale

A reachable, exploitable SQL injection on an authenticated-but-untrusted path parameter is a hard blocker and a direct SC02 violation, regardless of the passing test suite. Compounding it, the read endpoint hides a genuine not-found condition behind a 200 response, breaking REST semantics. The change cannot ship until at least the blocker and the critical issue are resolved; the major and minor findings shape the rework but are not individually blocking.

### Next Steps

- [ ] Address blocker issue B01
- [ ] Address critical issue C01
- [ ] Re-run tests after fixes
- [ ] Resubmit for review via `nacl-tl-dev --continue`

## Review Metadata

### Review Session

| Attribute | Value |
|-----------|-------|
| Reviewer | nacl-tl-review |
| Review Type | full |
| Review Started | 2026-05-29 14:54 |
| Review Completed | 2026-05-29 14:54 |
| Duration | 0 minutes |
| Result Files Read | result-be.md, acceptance.md |

### Files Referenced

| File | Purpose |
|------|---------|
| `.tl/tasks/UC001/result-be.md` | Development evidence |
| `.tl/tasks/UC001/acceptance.md` | Acceptance criteria |
| `.tl/tasks/UC001/task-be.md` | Task description |
| `.tl/tasks/UC001/diff.patch` | Code under review |

## SA References (For Human Review Only)

- Use Case: UC001 — Orders read/delete API
- Requirements: SC01 (authentication), SC02 (parameterized queries), FC01–FC06, EH01
- Form Specification: n/a (backend-only task)
