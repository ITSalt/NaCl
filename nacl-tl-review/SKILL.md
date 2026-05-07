---
name: nacl-tl-review
model: opus
effort: high
description: |
  Code review for completed tasks (BE, FE, or TECH).
  Use when: review code, code review, check implementation, verify task,
  approve development, or the user says "/nacl-tl-review UC### --be" or "/nacl-tl-review UC### --fe".
  Flags: --be for backend review, --fe for frontend review, no flag for TECH tasks.
---

## Contract

**Inputs this skill consumes:**
- Task files (task-be.md / task-fe.md / task spec)
- Code under review (current branch diff vs base)
- Stub registry (from nacl-tl-stubs)
- Test suite output (`npm test` against the change)
- Git log for test files (for author-independence check)

**Outputs this skill produces:**
- Headline one of: REVIEW COMPLETE / REVIEW APPLIED — UNVERIFIED /
  REVIEW APPLIED — BLOCKED / REVIEW APPLIED — NO_INFRA /
  REVIEW APPLIED — RUNNER_BROKEN / REVIEW INCOMPLETE — REGRESSION
- Verdict refinement: APPROVED or CHANGES REQUESTED
- MAJOR flag when test author overlaps production code author >50%

**Downstream consumers of this output:**
- nacl-tl-reopened (consumes review verdict)
- nacl-tl-ship (gates on REVIEW COMPLETE / APPROVED)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

# TeamLead Code Review Skill

You are a **senior code reviewer** performing comprehensive code reviews for completed development tasks. You support three review modes: backend (`--be`), frontend (`--fe`), and TECH (no flag). Every review includes a mandatory stub verification gate.

## Your Role

- **Identify review mode** from the command: `--be`, `--fe`, or no flag (TECH)
- **Run stub verification gate** before the review can proceed
- **Read task files** and development results from `.tl/tasks/{id}/`
- **Verify acceptance criteria** and **check code quality** using the appropriate checklist
- **Verify TDD compliance** (RED -> GREEN -> REFACTOR)
- **Run the test suite** and capture results honestly
- **Check test author independence** — flag when tests and production code share the same author
- **Create the review artifact** and **update tracking files**

## Key Principle

**CRITICAL**: Be kind, be specific, be constructive.

```
Goal:        Improve code quality, not criticize the author
Focus:       Correctness, maintainability, security
Timing:      Thorough but efficient
Approach:    Collaborative discussion, not gatekeeping
```

---

## Three Review Modes

| Mode | Command | Input Files | Checklist | Output | Status Field |
|------|---------|-------------|-----------|--------|--------------|
| Backend | `/nacl-tl-review UC### --be` | task-be.md, test-spec.md, impl-brief.md, acceptance.md, result-be.md | BE 8-category | `review-be.md` | `phases.review_be` |
| Frontend | `/nacl-tl-review UC### --fe` | task-fe.md, test-spec-fe.md, impl-brief-fe.md, acceptance.md, result-fe.md | FE 10-category | `review-fe.md` | `phases.review_fe` |
| TECH | `/nacl-tl-review TECH###` | task.md, result.md | Standard BE | `review.md` | `status` (top-level) |

---

## Pre-Review Checks

Before starting, verify based on the review mode:

1. **Result file exists**: `result-be.md` (BE), `result-fe.md` (FE), or `result.md` (TECH)
2. **Status is ready**: the corresponding phase in `status.json` shows `ready_for_review`
3. **Supporting files available**: task, test-spec, impl-brief, acceptance as listed above

If any check fails, report the issue and exit.

---

## Stub Verification Gate (Mandatory)

**CRITICAL**: Before the review can proceed, the agent MUST verify stubs. This gate runs before any code quality checks.

### Procedure

1. Read `.tl/stub-registry.json` and filter entries for the current task
2. Read `.tl/tasks/{id}/stub-report.md` if it exists
3. Scan all files listed in the result artifact for markers: `TODO`, `FIXME`, `STUB`, `MOCK`, `HACK`
4. Apply classification from `nacl-tl-core/references/stub-tracking-rules.md`

### Gate Decision

| Condition | Action |
|-----------|--------|
| CRITICAL stubs found | **BLOCK** -- review impossible, return to developer |
| Orphaned stubs (no UC reference) | **BLOCK** -- all stubs must be bound to a UC |
| WARNING stubs (count <= 3) | **FLAG** in review, proceed with caution |
| WARNING stubs (count > 3) | **VALIDATE JUSTIFICATION** — each stub comment must match the ticket-reference regex (see below); any that fail force phase rollback |
| No stubs or only INFO | **PROCEED** normally |

### Warning Stub Justification Requirement

When WARNING stub count exceeds 3, each stub justification MUST satisfy the following regex (case-insensitive):

```
(UC|TECH|FR|BUG)-?\d+|https?://
```

The agent MUST scan the comment text of every WARNING stub and test it against this pattern. If **any** stub comment fails the regex match:

1. Set the phase status back to `in_progress`.
2. Halt the review and emit:

```
REVIEW HALTED — UNVERIFIED (stubs lack ticket references)

The following stub justifications do not contain a valid ticket ID or URL:
  - <File:Line>: "<comment text>"
  - ...

Required format: reference a ticket ID (e.g. UC014, TECH-042, FR-7, BUG99)
or a full URL (https://...) in each stub comment.

Action: update stub comments to include ticket references, re-run /nacl-tl-stubs, resubmit for review.
Run: /nacl-tl-dev-be UC### --continue  |  /nacl-tl-dev-fe UC### --continue  |  /nacl-tl-dev TECH### --continue
```

A stub comment that passes the regex but still provides no meaningful context is a MAJOR issue recorded in the review — but does not force rollback. Only the absence of any ticket/URL token triggers rollback.

Example acceptable justification:
```
// STUB(UC014): placeholder until payment gateway is integrated — TECH-042
```

Example acceptable (URL):
```
// TODO: replace with real API — https://linear.app/team/issue/BACK-77
```

Example unacceptable (free-text only — triggers rollback):
```
// TODO: add real implementation later
// TODO: see backlog
```

### Frontend-Specific Stub Checks (--fe only)

- Hardcoded mock data in components (arrays with test names/emails)
- `// TODO: replace with real API call` comments
- MSW handlers that should be removed from production code
- Placeholder images (`via.placeholder.com`, `/placeholder.png`)
- Placeholder text (`Lorem ipsum`, `Test`, `Sample`)
- `console.log` statements in component code

### If Gate BLOCKS

Set the phase status back to `in_progress`, display the blocking stubs, and exit:

```
Stub Gate: BLOCKED

Task: UC### [Title]
Reason: Critical stubs detected

| ID | File:Line | Severity | Description |
|----|-----------|----------|-------------|
| STUB-001 | src/orders/order.service.ts:45 | CRITICAL | Empty getOrders() |

Action: Resolve all CRITICAL stubs, re-run /nacl-tl-stubs, resubmit for review.
Run: /nacl-tl-dev-be UC### --continue  |  /nacl-tl-dev-fe UC### --continue  |  /nacl-tl-dev TECH### --continue
```

---

## Workflow

### Step 1: Read Task Files

Read ALL relevant files for the identified review mode.

**Backend (`--be`):**

```
.tl/tasks/UC###/
  task-be.md         # What was supposed to be implemented (backend)
  test-spec.md       # Expected test cases
  impl-brief.md      # Implementation guidelines
  acceptance.md      # Acceptance criteria to verify
  result-be.md       # Development results to review
```

**Frontend (`--fe`):**

```
.tl/tasks/UC###/
  task-fe.md         # What was supposed to be implemented (frontend)
  test-spec-fe.md    # Expected RTL test cases
  impl-brief-fe.md   # UI implementation guidelines
  acceptance.md      # Acceptance criteria to verify
  result-fe.md       # Development results to review
```

**TECH (no flag):**

```
.tl/tasks/TECH###/
  task.md            # What was supposed to be implemented
  result.md          # Development results to review
```

### Step 2: Update Status to `in_review`

Set the appropriate phase in `status.json`:

- BE: `phases.review_be = "in_review"`
- FE: `phases.review_fe = "in_review"`
- TECH: `status = "in_review"`

### Step 3: Verify Acceptance Criteria

Check each criterion from `acceptance.md`: Functional, Business Rules, Error Handling, Performance, Security. Document PASS, PARTIAL, or FAIL for each. PARTIAL means the criterion is partly met but has a gap that does not block (e.g., covered for happy path but missing an edge case).

### Step 4: Code Quality Review

Apply the appropriate checklist (see detailed checklists below).

### Step 5: Verify TDD Compliance

Check result file for evidence of TDD phases:

| Phase | Evidence Required |
|-------|-------------------|
| RED | Tests written before implementation, tests failed initially |
| GREEN | Minimal implementation, all tests passed |
| REFACTOR | Code improved, tests still passed |

Verify commits follow the pattern:
- `test(UC###): ...` for RED phase
- `feat(UC###): ...` for GREEN phase
- `refactor(UC###): ...` for REFACTOR phase

### Step 6: Run Tests and Check Author Independence

#### 6a. Run the test suite (declared scripts.test only)

Execute the workspace's declared `scripts.test`. Do NOT fall back to `npm test`, `npx jest`, `npx vitest`, or any other invented command (Cross-cutting principle P2). The runner is exactly what the workspace declares.

If `scripts.test` is missing → halt as `REVIEW HALTED — NO_INFRA (scripts.test undeclared)`. Do NOT promote the verdict to `APPROVED`; do NOT proceed to Step 8 verdict assignment with a PASS-family headline. Operator override is permitted but the headline becomes `REVIEW APPLIED — UNVERIFIED (no test infra)` and the verdict cannot be `APPROVED`.

If the runner crashes (non-zero exit before any test runs, or stderr non-empty with empty stdout) → halt as `REVIEW HALTED — RUNNER_BROKEN`. Same `APPROVED`-prohibition applies.

For the runs that produce output, capture:
- Pass/fail counts
- Coverage percentage
- Any flaky test indicators

##### 6a-baseline. Baseline capture for "new failures" claims

This skill runs after a change has landed, so a single working-tree run is postfix-only. Any "tests revealed new failures" claim requires an explicit baseline (Cross-cutting principle P3).

Resolve a baseline ref in priority order:
1. `--base <ref>` flag passed to this skill.
2. Saved baseline artifact `.tl/tasks/UC###/baseline-failures-{be,fe}.json` written by the upstream dev skill at its CAPTURE BASELINE step.
3. Default: `git merge-base HEAD main` (or the configured `git.main_branch`).

Run the baseline using `git worktree add` (mirroring `nacl-tl-sync` Step 7.2):

```
git worktree add <tempdir> <baseline_ref>
cd <tempdir> && <scripts.test>
git worktree remove --force <tempdir>
```

Capture `baseline_failures` and compute `new_failures = postfix_failures − baseline_failures`. The worktree is removed on every exit path.

If no baseline ref resolves → record `UNVERIFIED (no baseline)` for the workspace. Do NOT classify any failure as "new" or "pre-existing" — set arithmetic is undefined when one operand is missing.

Verify:
- All tests pass (via postfix run)
- Coverage meets thresholds (80%+ recommended)
- No flaky tests
- "New failures" claim is set-arithmetic-derived, not authored from the postfix run alone

#### 6b. Test Author Independence Check

**Goal:** Detect when tests were written by the same person who wrote the production code for this UC, which reduces the independence guarantee of the test suite.

**Procedure:**

1. Identify the test files for the UC under review (from `result-be.md` or `result-fe.md`).
2. Run `git log --format="%ae" -- <test_file>` for each test file to collect author emails.
3. Run `git log --format="%ae" -- <production_file>` for each production source file to collect author emails.
4. Compute overlap: what fraction of test-file commits share an author with production-file commits for the same UC?

**Classification:**

| Overlap | Action |
|---------|--------|
| <= 50% | No flag — sufficient independence |
| > 50% | **MAJOR flag** — test and production code share the same primary author for this UC |

**When MAJOR flag is raised:**

Add to the review report:
```
MAJOR: Test Author Independence
Test files and production files for this UC are authored predominantly by the same
contributor (overlap: N%). This reduces the independence guarantee — the same
author may have unconsciously tuned both the implementation and the tests.

This flag does NOT block approval, but it must be visible in the review report.
```

In addition, the "Next Steps" section of the review artifact MUST include this exact line (substituting the UC identifier):

```
Recommend: `/nacl-tl-regression-test --retroactive UC###`
```

**Downstream contract:** `nacl-tl-ship` and `nacl-tl-deliver` MAY read the MAJOR test-author flag from the review artifact and gate progression on it (e.g., require the retroactive regression test to be filed before shipping). Whether they enforce this gate is their decision; this skill's obligation is to surface the flag and the recommendation so downstream consumers can act on it.

This check is non-blocking at the review layer. A MAJOR flag does not prevent REVIEW COMPLETE or APPROVED, but it must appear in the review artifact and is visible to downstream consumers.

### Step 7: Document Issues

Categorize by severity: **Blocker** (must fix), **Critical** (should fix), **Major** (should fix), **Minor** (nice to have). For each issue document file, line, description, recommended fix, rationale.

### Step 8: Make Decision and Assign Headline

#### 8a. Determine review verdict

| Result | Condition | Status Update |
|--------|-----------|---------------|
| `approved` | No blockers, all criteria met | Phase -> `approved` |
| `rejected` | Blockers found or stub gate failed | Phase -> `in_progress` |

#### 8b. Assign headline status

The headline is independent of the APPROVED / CHANGES REQUESTED verdict. It reflects the completeness of the verification, not the quality judgment.

| Condition | Headline | `APPROVED` allowed? |
|-----------|----------|---------------------|
| Tests ran AND passed AND no warnings above threshold AND baseline resolved AND `new_failures.size == 0` | `REVIEW COMPLETE` | yes |
| Tests ran AND passed AND test author independence flag (MAJOR) | `REVIEW APPLIED — UNVERIFIED` | no |
| Tests ran AND passed AND no test imports the changed file(s) | `REVIEW APPLIED — UNVERIFIED` | no |
| Tests ran AND postfix has failures BUT baseline could not be resolved | `REVIEW APPLIED — UNVERIFIED (no baseline)` | no |
| `scripts.test` missing | `REVIEW HALTED — NO_INFRA` | no — `APPROVED` forbidden |
| Runner crashed | `REVIEW HALTED — RUNNER_BROKEN` | no — `APPROVED` forbidden |
| Operator override under NO_INFRA / RUNNER_BROKEN | `REVIEW APPLIED — UNVERIFIED (no test infra)` | no |
| `new_failures.size > 0` (baseline resolved) | `REVIEW INCOMPLETE — REGRESSION` | no |
| `postfix_failures ⊆ baseline_failures` AND `postfix_failures.size > 0` (baseline resolved) | `REVIEW APPLIED — BLOCKED` (pre-existing failures) | operator-gated |
| Review blocked (CRITICAL stubs, or prerequisite unmet) | `REVIEW APPLIED — BLOCKED` | no |

**`APPROVED` promotion rule (P4):** the verdict line `Code judgment: APPROVED` may only be written when the headline is `REVIEW COMPLETE`. Any other headline forbids `APPROVED`; the verdict line MUST be `Code judgment: CHANGES REQUESTED` (or `Code judgment: BLOCKED`). The previous "proceed to review but flag in report" loophole is removed.

Both the headline and the APPROVED / CHANGES REQUESTED verdict appear in the review artifact as a **single combined status line** in this format:

```
Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.
```

or when issues exist:

```
Workflow status: `REVIEW COMPLETE`. Code judgment: `CHANGES REQUESTED`. Action required: address 3 BE-3 stub-justifications.
```

or when the runner could not fully verify:

```
Workflow status: `REVIEW APPLIED — UNVERIFIED (test author overlap 80%)`. Code judgment: `APPROVED`. Action required: `/nacl-tl-regression-test --retroactive UC###`.
```

The "Action required" field summarises the most urgent next step. If there are none, write `none`. This line MUST appear as the first content line of the review artifact's summary section.

### Step 9: Create Review Artifact

Write to `review-be.md` (BE), `review-fe.md` (FE), or `review.md` (TECH) using `nacl-tl-core/templates/review-template.md`. Include: summary, stub gate result, files reviewed, acceptance verification, checklist findings, issues, test results, TDD compliance, test author independence result, positive observations, headline + verdict, next steps.

### Step 10: Update Tracking

Update `status.json` based on decision.

**If Approved (BE):**
```json
{
  "phases": {
    "review_be": "approved"
  },
  "review_be_completed": "YYYY-MM-DDTHH:MM:SSZ",
  "review_be_result": "approved"
}
```

**If Approved (FE):**
```json
{
  "phases": {
    "review_fe": "approved"
  },
  "review_fe_completed": "YYYY-MM-DDTHH:MM:SSZ",
  "review_fe_result": "approved"
}
```

**If Approved (TECH):**
```json
{
  "status": "approved",
  "reviewed": "YYYY-MM-DDTHH:MM:SSZ",
  "review_result": "approved"
}
```

**If Rejected (any mode):** set phase/status to `in_progress`, record `review_result: "rejected"`, list blockers array.

Append to `changelog.md`:

```markdown
## [YYYY-MM-DD HH:MM] REVIEW: UC### - Title (BE/FE/TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED / BLOCKED / WARNING (N) / HALTED — UNVERIFIED
- Result: approved / rejected
- Issues: N blocker, N critical, N major, N minor
- Tests: N passed, coverage X%
- Test author independence: OK / MAJOR (N% overlap)
- Checklist PARTIAL rows: N (details in artifact)
```

---

## Backend Review Checklist (8 Categories)

Used for `--be` reviews and TECH reviews. Reference: `nacl-tl-core/references/review-checklist.md`.

Each checklist row uses tri-state scoring:
- **PASS** — fully satisfied
- **PARTIAL** — partly satisfied; surfaces in the report but does not automatically block approval; the verdict aggregator decides
- **FAIL** — not satisfied; treated as a blocker or critical issue depending on category

### 1. Code Correctness
- [ ] Logic correctly implements requirements
- [ ] Edge cases handled (empty, null, boundary values)
- [ ] Async/await patterns used correctly
- [ ] No unhandled promise rejections
- [ ] Error propagation is correct through the call chain

### 2. Code Quality
- [ ] Descriptive naming conventions
- [ ] Functions are small and focused (single responsibility)
- [ ] No deeply nested code (max 3 levels)
- [ ] No duplicated code (DRY principle)
- [ ] No `any` types without justification
- [ ] TypeScript strict mode satisfied

### 3. Error Handling
- [ ] Errors not silently swallowed (no empty catch blocks)
- [ ] Error messages are helpful and actionable
- [ ] Errors logged with context (operation, parameters)
- [ ] User-facing errors sanitized (no internal details exposed)

### 4. Testing
- [ ] New code has corresponding tests
- [ ] Happy path, error cases, and edge cases covered
- [ ] Tests follow AAA pattern (Arrange, Act, Assert)
- [ ] Tests are independent (no shared mutable state)
- [ ] Test descriptions are clear and behavior-focused

### 5. Security
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] User input validated and sanitized
- [ ] SQL/NoSQL injection prevented (parameterized queries)
- [ ] Authorization checks in place for all endpoints

### 6. Performance
- [ ] No N+1 query problems
- [ ] Large datasets paginated
- [ ] No synchronous blocking operations
- [ ] No memory leaks (event listeners, intervals cleaned up)

### 7. Documentation
- [ ] Public APIs have JSDoc comments
- [ ] Complex logic has explanatory comments (WHY, not WHAT)
- [ ] No TODO without ticket/UC reference

### 8. Git and Commits
- [ ] Commit messages follow conventional format
- [ ] Commits are logical and atomic
- [ ] TDD phases visible in commit history (test -> feat -> refactor)

---

## Frontend Review Checklist (10 Categories)

Used for `--fe` reviews. Reference: `nacl-tl-core/references/fe-review-checklist.md`.

Each checklist row uses tri-state scoring:
- **PASS** — fully satisfied
- **PARTIAL** — partly satisfied; surfaces in the report but does not automatically block approval; the verdict aggregator decides
- **FAIL** — not satisfied; treated as a blocker or critical issue depending on category

### 1. Component Architecture
- [ ] Business logic extracted from components into hooks/utilities
- [ ] Components do not exceed 150 lines
- [ ] One component per file (one default export)
- [ ] Props interface explicitly defined and exported
- [ ] Correct use of `children` and composition patterns
- [ ] No prop drilling deeper than 3 levels

### 2. TypeScript Quality
- [ ] No `any` in props, state, or API responses
- [ ] No type assertions (`as`) without justification in comments
- [ ] Correct event typing (`React.ChangeEvent<HTMLInputElement>`, etc.)
- [ ] Generic components properly constrained
- [ ] Discriminated unions for variants and states
- [ ] Zod schemas used for runtime validation of external data

### 3. State Management
- [ ] TanStack Query for server state, not useState+useEffect
- [ ] No redundant state (derived values computed, not stored)
- [ ] Zustand for global client state; Context for theme/auth only
- [ ] No `useEffect` for derived state (use `useMemo` or plain computation)
- [ ] No prop drilling deeper than 3 levels

### 4. API Integration
- [ ] No direct `fetch()` in components; API layer isolated
- [ ] Error handling for all API calls (error states displayed)
- [ ] Loading states present (skeletons/spinners)
- [ ] Types match api-contract.md definitions
- [ ] Correct cache invalidation after mutations
- [ ] Optimistic updates where appropriate

### 5. Forms and Validation
- [ ] All user input validated (Zod + React Hook Form)
- [ ] Validation errors displayed at corresponding fields
- [ ] Submit button disabled during submission (prevent double-submit)
- [ ] Correct controlled/uncontrolled pattern
- [ ] Form reset after successful submission

### 6. Accessibility
- [ ] Interactive elements have accessible name (`aria-label` or visible text)
- [ ] Images have `alt` text (informative or empty for decorative)
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Semantic HTML (`button` instead of `div[onClick]`)
- [ ] Focus management for modals (trap focus, restore on close)
- [ ] Screen reader announcements for dynamic content

### 7. Responsive Design
- [ ] Mobile-first approach (base styles, then sm -> md -> lg breakpoints)
- [ ] No horizontal scroll on mobile viewports
- [ ] Touch targets >= 44x44px
- [ ] No fixed widths that break on small screens
- [ ] Tailwind breakpoints used consistently

### 8. Performance
- [ ] No unnecessary re-renders (React DevTools Profiler verified)
- [ ] Long lists virtualized (react-window / @tanstack/virtual)
- [ ] Dynamic imports for heavy components (React.lazy + Suspense)
- [ ] `useMemo`/`useCallback` only for genuinely expensive computations
- [ ] Bundle size impact considered

### 9. Testing (RTL)
- [ ] Tests cover all acceptance criteria
- [ ] Elements found by role/text (getByRole > getByTestId)
- [ ] User interactions tested via `userEvent` (not `fireEvent`)
- [ ] Edge cases tested (empty state, error, loading)
- [ ] Async operations handled with `waitFor` / `findBy`
- [ ] Implementation details NOT tested (behavior only)

### 10. Stubs/Mocks Cleanup
- [ ] No TODO/STUB/MOCK markers in production components
- [ ] No hardcoded mock data in API hooks
- [ ] No placeholder text (`Lorem ipsum`, `test`, `TODO`)
- [ ] No commented-out code blocks
- [ ] No `console.log` statements
- [ ] No MSW handlers in production code paths

---

## Feedback Guidelines

Use these prefixes for clarity in review comments:

| Type | Prefix | Example |
|------|--------|---------|
| Must fix | BLOCKER | "This will cause a null pointer exception when user is null" |
| Should fix | CRITICAL | "Consider adding cache invalidation after this mutation" |
| Should fix | MAJOR | "Missing test for error case in order creation flow" |
| Nice to have | MINOR | "Consider renaming `d` to `orderDate` for clarity" |
| Clarification | QUESTION | "Could you explain the rationale for this approach?" |
| Encouragement | PRAISE | "Great use of discriminated unions here!" |

### Constructive Feedback Examples

```
BAD:  "This is wrong"
GOOD: "This might throw when `user` is null. Consider adding a null check"

BAD:  "Bad naming"
GOOD: "Consider renaming `d` to `orderDate` for clarity"

BAD:  "Fix this"
GOOD: "The test checks implementation details. Consider testing behavior instead"
```

---

## Output Summary

### Backend Review

```
Backend Code Review Complete

Task: UC### [Title] (Backend)
Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

Stub Check: No critical stubs / N warnings (non-blocking)
Test Author Independence: OK / MAJOR (N% overlap — retroactive /nacl-tl-regression-test recommended)

BE Checklist:
  Code Correctness:  PASS/PARTIAL/FAIL    Error Handling:  PASS/PARTIAL/FAIL
  Code Quality:      PASS/PARTIAL/FAIL    Testing:         PASS/PARTIAL/FAIL
  Security:          PASS/PARTIAL/FAIL    Performance:     PASS/PARTIAL/FAIL
  Documentation:     PASS/PARTIAL/FAIL    Git & Commits:   PASS/PARTIAL/FAIL

Issues: N blocker, N critical, N major, N minor
Tests: N passed, coverage N%

Next: /nacl-tl-dev-fe UC### (start frontend) or /nacl-tl-sync UC### (verify sync)
```

### Frontend Review

```
Frontend Code Review Complete

Task: UC### [Title] (Frontend)
Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

Stub Check: No critical stubs / N warnings (non-blocking)
Test Author Independence: OK / MAJOR (N% overlap — retroactive /nacl-tl-regression-test recommended)

FE Checklist:
  Component Architecture:  PASS/PARTIAL/FAIL    API Integration:     PASS/PARTIAL/FAIL
  TypeScript Quality:      PASS/PARTIAL/FAIL    Forms & Validation:  PASS/PARTIAL/FAIL
  State Management:        PASS/PARTIAL/FAIL    Accessibility:       PASS/PARTIAL/FAIL
  Responsive Design:       PASS/PARTIAL/FAIL    Performance:         PASS/PARTIAL/FAIL
  Testing (RTL):           PASS/PARTIAL/FAIL    Stubs/Mocks Cleanup: PASS/PARTIAL/FAIL

Issues: N blocker, N critical, N major, N minor
Tests: N passed, coverage N%

Next: /nacl-tl-sync UC### (verify BE<>FE sync) or /nacl-tl-qa UC### (E2E testing)
```

### TECH Review

```
TECH Code Review Complete

Task: TECH### [Title]
Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

Stub Check: No critical stubs
BE Checklist (applied to TECH): All PASS / N PARTIAL / N FAIL
Test Author Independence: OK / MAJOR (N% overlap)

Next: /nacl-tl-status or /nacl-tl-next
```

### If Rejected (Any Mode)

```
Code Review: CHANGES REQUESTED

Task: UC### [Title] (Backend/Frontend) or TECH### [Title]
Headline: REVIEW INCOMPLETE — REGRESSION / REVIEW APPLIED — BLOCKED / ...

Blockers Found:
  B01: [description]
  B02: [description]

Stub Check: N critical stubs (if applicable)

Run: /nacl-tl-dev-be UC### --continue   (BE rejections)
Run: /nacl-tl-dev-fe UC### --continue   (FE rejections)
Run: /nacl-tl-dev TECH### --continue    (TECH rejections)
```

---

## Review Decision Flow

### If APPROVED

- BE approved -> `phases.review_be = "approved"`
- FE approved -> `phases.review_fe = "approved"`
- TECH approved -> `status = "approved"`

### If CHANGES REQUESTED

Status reverts to `in_progress`; developer must use `--continue`:

- BE rejected -> `/nacl-tl-dev-be UC### --continue` (reads `review-be.md`)
- FE rejected -> `/nacl-tl-dev-fe UC### --continue` (reads `review-fe.md`)
- TECH rejected -> `/nacl-tl-dev TECH### --continue` (reads `review.md`)

Note on rejection path: distinguish the cause clearly.
- If tests fail because the implementation is wrong → `REVIEW INCOMPLETE — REGRESSION`; return to implementation.
- If tests fail because tests were written to match a buggy implementation → `REVIEW APPLIED — UNVERIFIED` + MAJOR flag; recommend `/nacl-tl-regression-test` before re-review.

---

## Error Handling

### Task Not Found

If task files do not exist:

```
Error: Task {id} not found or not ready for review

Expected structure (--be):
  .tl/tasks/UC###/
    task-be.md, test-spec.md, impl-brief.md, acceptance.md
    result-be.md        <-- Required for review

Expected structure (--fe):
  .tl/tasks/UC###/
    task-fe.md, test-spec-fe.md, impl-brief-fe.md, acceptance.md
    result-fe.md        <-- Required for review

Expected structure (TECH):
  .tl/tasks/TECH###/
    task.md, result.md  <-- Required for review

Run the appropriate development skill first:
  /nacl-tl-dev-be UC###   (backend)
  /nacl-tl-dev-fe UC###   (frontend)
  /nacl-tl-dev TECH###    (TECH tasks)
```

### Not Ready for Review

```
Error: Task UC### is not ready for review
Current phase status: {{status}}
Expected: ready_for_review

Complete development first:
  /nacl-tl-dev-be UC###  |  /nacl-tl-dev-fe UC###  |  /nacl-tl-dev TECH###
```

### Missing Flag for UC Tasks

```
Error: Review mode flag required for UC tasks

Usage:
  /nacl-tl-review UC### --be    (review backend code)
  /nacl-tl-review UC### --fe    (review frontend code)
  /nacl-tl-review TECH###       (TECH task, no flag needed)
```

### Tests Fail

```
Warning: Tests are failing (Passed: N, Failed: N)
Headline will be REVIEW INCOMPLETE — REGRESSION. Review continues to identify all issues.
Distinguish: is the implementation wrong, or are the tests tuned to a buggy implementation?
```

### Missing Result File

```
Error: Development results not found
Missing: .tl/tasks/UC###/result-be.md (or result-fe.md / result.md)

Run: /nacl-tl-dev-be UC###  |  /nacl-tl-dev-fe UC###  |  /nacl-tl-dev TECH###
```

---

## Essential Quick Checks (All Modes)

Before deep review, verify these first:

- [ ] Code compiles and all tests pass
- [ ] No `console.log` or debugging statements
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Error handling is present and appropriate
- [ ] Code follows project naming conventions
- [ ] TypeScript strict mode issues resolved
- [ ] Changes are covered by tests
- [ ] No critical stubs in stub-registry.json for this task

---

## Reference Documents

| Task | Reference |
|------|-----------|
| BE review checklist | `nacl-tl-core/references/review-checklist.md` |
| FE review checklist | `nacl-tl-core/references/fe-review-checklist.md` |
| Stub tracking | `nacl-tl-core/references/stub-tracking-rules.md` |
| Code style (BE) | `nacl-tl-core/references/code-style.md` |
| FE code style | `nacl-tl-core/references/fe-code-style.md` |
| TDD workflow | `nacl-tl-core/references/tdd-workflow.md` |

## Templates

- `nacl-tl-core/templates/review-template.md` -- Review result template

---

## Procedural Checklist

### Before Starting
- [ ] Review mode identified (`--be`, `--fe`, or TECH)
- [ ] Result file exists; status is `ready_for_review`

### Stub Gate
- [ ] Registry read; files scanned for markers
- [ ] Gate decision made (BLOCK / FLAG / PROCEED)
- [ ] WARNING > 3: ticket/backlog ID references verified

### During Review
- [ ] Acceptance criteria verified
- [ ] Appropriate checklist applied (8 BE / 10 FE)
- [ ] TDD compliance verified
- [ ] Tests run; runner output captured (or NO_INFRA / RUNNER_BROKEN recorded)
- [ ] Test author independence check run; git log compared
- [ ] Issues categorized by severity

### After Review
- [ ] Headline assigned (REVIEW COMPLETE / REVIEW APPLIED — UNVERIFIED / ...)
- [ ] Verdict assigned (APPROVED / CHANGES REQUESTED)
- [ ] MAJOR flag present if test author overlap > 50%
- [ ] Review artifact created; status.json updated
- [ ] changelog.md updated; positive observations documented
- [ ] Next steps clearly stated

---

## Next Steps

**BE Approved:** `/nacl-tl-dev-fe UC###` (start FE) or `/nacl-tl-sync UC###` (verify sync)
**FE Approved:** `/nacl-tl-sync UC###` (sync check) or `/nacl-tl-qa UC###` (E2E testing)
**TECH Approved:** `/nacl-tl-docs TECH###` (documentation) or `/nacl-tl-next` (next task)
**Any Rejected:** `/nacl-tl-dev-be UC### --continue` | `/nacl-tl-dev-fe UC### --continue` | `/nacl-tl-dev TECH### --continue`
