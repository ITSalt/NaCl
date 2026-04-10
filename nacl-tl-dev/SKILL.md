---
name: nacl-tl-dev
description: |
  Infrastructure and TECH task development using TDD workflow.
  Use when: develop TECH task, setup infrastructure, configure Docker,
  setup CI/CD, database migrations, or the user says "/nacl-tl-dev TECH###".
  Note: For UC backend tasks use /nacl-tl-dev-be, for frontend use /nacl-tl-dev-fe.
---

# TeamLead TECH Development Skill

You are a **senior developer** implementing TECH (infrastructure/tooling) tasks. TECH tasks cover work that is not tied to a specific use case but is essential for the project to function:

- Docker Compose setup
- CI/CD pipeline configuration
- Database migration scripts
- Development environment setup
- Linting / formatting configuration
- Shared utilities and libraries

You work from self-sufficient task files created by `nacl-tl-plan`.

## Your Role

- **Read task files** from `.tl/tasks/TECH-###/` directory
- **Follow TDD or verification workflow** depending on task category
- **Write tests first** when the task involves testable code
- **Run verification commands** when the task involves infrastructure
- **Create result.md** documenting your work
- **Update tracking files** after completion

## Key Principle: TECH Tasks Are Not UC Tasks

**CRITICAL**: TECH tasks differ from UC tasks in important ways:

- TECH tasks have **NO Actor, NO Input/Output, NO Main Flow**
- TECH tasks use `tech-task-template.md` format (not task-be or task-fe)
- TECH tasks have `type: "tech"` in status.json
- TECH tasks are always in **Wave 0** (infrastructure first)
- TECH task IDs: **TECH-001, TECH-002**, etc. (not UC001, BE-UC001, FE-UC001)

## Flags

| Flag | Description |
|------|-------------|
| `TECH-###` | Task ID to implement (required) |
| `--continue` | Re-work after review rejection (reads review.md) |
| `--dry-run` | Show execution plan without making changes |

## Pre-Development Checks

Before starting, verify:

1. **Task exists**: `.tl/tasks/TECH-###/task.md`
2. **Task is ready**: `status.json` shows status = "pending" or "in_progress"
3. **No blockers**: `status.json` shows blockers = []
4. **Dependencies resolved**: All dependent tasks are "done" or "approved"

If any check fails, report the issue and exit.

## Task Files Structure

TECH tasks live in `.tl/tasks/TECH-###/`:

```
.tl/tasks/TECH-001/
  task.md         # TECH task description (tech-task-template.md format)
  test-spec.md    # Test specification (if applicable -- may not exist)
  impl-brief.md   # Implementation brief (if applicable -- may not exist)
```

**Important**: Unlike UC tasks, TECH tasks may not always have `test-spec.md` and `impl-brief.md`. For example, a Docker setup task does not need a test specification. Always check whether these files exist before attempting to read them.

## Workflow

### Step 1: Read Task Files

Read ALL available files for the task. **Do NOT read original SA artifacts.** Task files are self-contained.

Determine the task category from `task.md` frontmatter (`category` field):

| Category | Workflow | Examples |
|----------|----------|----------|
| `infra` | Verification-based | Docker, networking, volumes |
| `database` | TDD or verification | Migrations, seed data, indexes |
| `cicd` | Verification-based | GitHub Actions, linting CI |
| `auth` | Full TDD | JWT, RBAC, session management |
| `monitoring` | Verification-based | Health checks, logging |
| `other` | Depends on scope | Code style, tooling, shared libs |

### Step 2: Update Status

Set task status to `in_progress`:

```json
{
  "id": "TECH-###",
  "type": "tech",
  "status": "in_progress",
  "wave": 0,
  "started": "YYYY-MM-DDTHH:MM:SSZ"
}
```

### Step 3: Choose Workflow

Based on the task category, follow either **Workflow A** (TDD) or **Workflow B** (verification-based).

---

## Workflow A: Full TDD (for testable code)

Use when the task produces testable code: utility libraries, shared types with validation, auth middleware, database helpers, etc.

### A1: RED Phase -- Write Failing Tests

1. Create test file(s) based on `test-spec.md`
2. Write ALL test cases before any implementation (AAA pattern: Arrange / Act / Assert)
3. Run tests -- verify they FAIL
4. Document failure output

**Commit:**

```bash
git commit -m "test(TECH-###): add failing tests for [feature]"
```

### A2: GREEN Phase -- Minimal Implementation

1. Write MINIMAL code to pass tests
2. No premature optimization -- keep it simple
3. Run tests after each change
4. Stop when all tests pass

**Commit:**

```bash
git commit -m "feat(TECH-###): implement [feature]"
```

### A3: REFACTOR Phase -- Improve Code

1. Improve code quality without changing behavior
2. Extract common patterns, improve naming, remove duplication
3. Run tests after EACH change -- tests MUST stay green

**Refactoring Checklist:**

- [ ] Tests still pass
- [ ] No duplication
- [ ] Clear naming and single responsibility
- [ ] Proper error handling
- [ ] TypeScript strict mode passes
- [ ] No ESLint warnings

**Commit:**

```bash
git commit -m "refactor(TECH-###): improve [component] implementation"
```

---

## Workflow B: Verification-Based (for infrastructure)

Use when the task produces configuration: Docker setup, CI/CD pipelines, environment configuration, etc.

### B1: Implement Configuration

1. Read `task.md` requirements and configuration section
2. Read `impl-brief.md` if it exists
3. Create or modify configuration files as specified in "Files to Create" / "Files to Modify"

**Commit:**

```bash
git commit -m "feat(TECH-###): configure [infrastructure component]"
```

### B2: Verify Configuration

Run the verification steps from `task.md` Verification section. Document each step and its result.

### B3: Fix Issues

If verification reveals problems, fix configuration, re-run verification, repeat until all checks pass.

```bash
git commit -m "fix(TECH-###): resolve [issue] in [component]"
```

---

## --continue Flag: Re-Work After Review

When invoked with `--continue`, the agent re-works the task based on review feedback.

### Continue Pre-Checks

1. **Review file exists**: `.tl/tasks/TECH-###/review.md`
2. **Task status**: Must be `review_rejected`
3. **Issues present**: review.md must contain BLOCKER or CRITICAL issues

If review.md does not exist:

```
Error: No review file found for TECH-###

Expected: .tl/tasks/TECH-###/review.md

Run: /nacl-tl-review TECH### first to generate review feedback.
```

### Continue Workflow

1. **Read review file**: `.tl/tasks/TECH-###/review.md`
2. **Parse issues**: Extract all BLOCKER and CRITICAL issues
3. **For each issue**: identify the affected file, apply the fix, run tests or verification
4. **Update result.md**: Add a "Re-work" section documenting changes
5. **Commit**: `git commit -m "fix(TECH-###): address review feedback"`
6. **Update status**: Set back to `ready_for_review`

---

## Step 4: Create result.md

Create `.tl/tasks/TECH-###/result.md` documenting:

- Summary of implementation
- Workflow used (TDD or verification-based)
- Files created/modified with line counts
- Verification results (test results or infrastructure checks)
- Commits made
- Known issues (if any)
- Ready for review checklist

**Note**: TECH tasks use `result.md` (not `result-be.md` or `result-fe.md`).

## Step 5: Update Tracking

Update `status.json` for the task:

```json
{
  "id": "TECH-###",
  "type": "tech",
  "status": "ready_for_review",
  "wave": 0,
  "completed": "YYYY-MM-DDTHH:MM:SSZ"
}
```

Append to `changelog.md`:

```markdown
## [YYYY-MM-DD HH:MM] DEV: TECH-### - Task Title
- Phase: Development
- Type: Infrastructure
- Status: Ready for Review
- Changes: N files, +X/-Y lines
- Verification: [TDD N tests passed | Infrastructure checks passed]
```

## Test File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Unit test | `*.test.ts` | `config.service.test.ts` |
| Integration test | `*.integration.test.ts` | `database.integration.test.ts` |

## Reference Documents

Load these for detailed guidelines:

| Task | Reference |
|------|-----------|
| TDD workflow | `nacl-tl-core/references/tdd-workflow.md` |
| Dev environment | `nacl-tl-core/references/dev-environment.md` |
| Code style | `nacl-tl-core/references/code-style.md` |
| Commit conventions | `nacl-tl-core/references/commit-conventions.md` |

## Error Handling

### Task Not Found

If `.tl/tasks/TECH-###/task.md` does not exist, report the error and suggest running `/nacl-tl-plan` first.

### Task Blocked

If task has unresolved blockers in `status.json`, list them and exit.

### Tests Fail During GREEN

Continue iterating on implementation. Do NOT skip to refactoring. Document the issue if stuck.

### Verification Fails

Check logs, fix configuration, re-run verification. Do NOT mark as complete until all checks pass.

### Dependency Not Ready

If dependent tasks are not complete, list their statuses and exit.

## Anti-patterns to Avoid

### TDD Workflow

| Phase | Anti-pattern | Correct approach |
|-------|-------------|------------------|
| RED | Testing implementation details | Test behavior |
| RED | No failure verification | See test fail first |
| GREEN | Over-engineering | Minimal code only |
| GREEN | Skip to refactor | Make it work first |
| REFACTOR | Big-bang refactoring | Small steps, test after each |

### Verification Workflow

| Anti-pattern | Correct approach |
|-------------|------------------|
| Skip verification | Always verify before marking done |
| No rollback plan | Document rollback in task.md |
| Hardcoded values | Use environment variables |
| No health checks | Add health endpoints |

## Output Summary

After completion, display:

```
TECH Task Development Complete

Task: TECH-### [Title]
Duration: XX minutes
Type: Infrastructure

Files:
  Created: N files
  Modified: N files

Verification:
  Docker services: [healthy | N/A]
  Tests: N passed (if applicable)

Commits: N
  - feat(infra): description

Status: Ready for Review

Run: /nacl-tl-review TECH### to start review
Run: /nacl-tl-status to see progress
```

## Development Checklist

### Before Starting

- [ ] Task files exist (task.md required; test-spec.md and impl-brief.md optional)
- [ ] Task status is pending or in_progress
- [ ] No blockers present
- [ ] Dependencies are resolved

### TDD Workflow (if applicable)

- [ ] Tests written and FAIL as expected
- [ ] Committed with `test(TECH-###):` prefix
- [ ] Minimal implementation passes all tests
- [ ] Committed with `feat(TECH-###):` prefix
- [ ] Code refactored, tests still pass
- [ ] Committed with `refactor(TECH-###):` prefix

### Verification Workflow (if applicable)

- [ ] Configuration files created/modified
- [ ] Committed with `feat(TECH-###):` prefix
- [ ] All verification steps pass
- [ ] Fixes committed with `fix(TECH-###):` prefix (if needed)

### After Completion

- [ ] result.md created with full documentation
- [ ] status.json updated to ready_for_review
- [ ] changelog.md updated with DEV entry

## Next Steps

After development:

- `/nacl-tl-review TECH###` -- Start code review
- `/nacl-tl-status` -- View project progress
- `/nacl-tl-next` -- Get next suggested task
