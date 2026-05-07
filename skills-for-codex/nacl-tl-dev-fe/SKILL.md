---
name: nacl-tl-dev-fe
description: |
  Implement NaCl TL frontend UC work using strict TDD, React Testing Library
  style tests, API contract alignment, UI implementation, and result reporting.
  Use when developing frontend code for a UC, continuing rejected frontend work,
  or for compatibility with `/nacl-tl-dev-fe UC###`.
---

# NaCl TL Frontend Development For Codex

Implement frontend task scope only. TL artifacts and reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- `.tl/tasks/UC###/task-fe.md`
- `.tl/tasks/UC###/test-spec-fe.md`
- `.tl/tasks/UC###/impl-brief-fe.md`
- `.tl/tasks/UC###/acceptance.md`
- `.tl/tasks/UC###/api-contract.md`
- backend result or shared types when needed for contract alignment

Outputs produced:

- frontend code and tests when editing is available;
- `.tl/tasks/UC###/result-fe.md` when editing is available;
- frontend phase tracking when editing is available and justified;
- final report using the closed verification vocabulary.

Downstream consumers:

- frontend review;
- BE/FE sync verification;
- conductor and shipping workflows.

## Workflow

### Step 1: Read Frontend Scope

Read frontend task files and the API contract. Treat backend task files as
reference only when needed for shared types or endpoint behavior.

If required frontend files or the API contract are missing, report:

```text
Status: BLOCKED
Reason: required frontend task or API contract files are unavailable
```

### Step 2: Discover Runner And Baseline

Find the frontend workspace and its configured test command. Prefer the
project's existing package scripts and framework conventions.

Run the configured frontend tests before editing when execution is available.
Record the exact baseline failure set, collected tests, and runner errors.

### Step 3: RED

Write the minimal failing frontend tests from `test-spec-fe.md` before
production code. Use local testing conventions for queries, fixtures, request
handlers, and component setup.

Verify the new tests fail for the expected reason. If they pass before
implementation or fail for an unrelated reason, stop and report `FAILED` or
`UNVERIFIED` with details.

### Step 4: GREEN

Implement only the frontend behavior required by `task-fe.md` and
`api-contract.md`.

Keep UI work aligned with the existing application structure, routes,
components, state management, validation, and API client patterns. Verify type
compatibility with shared backend contracts when available.

### Step 5: REFACTOR

Refactor only after the tests pass. Keep behavior unchanged and re-run the
relevant tests after refactoring.

### Step 6: Continue After Review

When continuing rejected frontend work, read the review findings and repair
through spec-first fix discipline. Add or update a failing test before changing
production code when the issue is testable. Preserve explicit evidence for
review issues resolved, issues deferred, and any remaining verification gap.

### Step 7: Report And Track

Create or return `result-fe.md` with:

- UC ID and frontend summary;
- components, pages, hooks, and API client changes;
- tests added or updated;
- baseline versus post-change comparison;
- RED, GREEN, REFACTOR evidence;
- API contract alignment notes;
- final `Status: <VALUE>` using only the closed vocabulary.

Tracking may move forward only on `VERIFIED` or on `PARTIALLY_VERIFIED` with an
explicit accepted rationale. Otherwise keep the item in progress or report why
tracking was not changed.

## Capabilities

### May Do

- Read frontend UC task files and API contracts.
- Edit frontend source and tests when workspace permissions allow it.
- Run configured frontend test, typecheck, lint, or build commands when
  available.
- Produce `result-fe.md` and frontend tracking updates when justified.

### Must Not Do

- Implement backend scope through this skill.
- Write production code before a failing frontend test unless the user accepts
  a blocked TDD path.
- Invent API fields that are absent from the contract.
- Commit, push, deploy, or change branches without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Browser, test, typecheck, lint, and build verification require configured
  tools and dependencies.
- Git operations require explicit user request or a confirmed workflow gate.
- Delegation is conditional on supported tools being available in the current
  Codex environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task files, API contracts, permissions, dependencies, or
  runners are unavailable.
- Use `NOT_RUN` when a check is intentionally skipped.
- Use `PARTIALLY_VERIFIED` when tests run but browser, type, or contract
  evidence is incomplete.
- Use `UNVERIFIED` when frontend behavior cannot be checked.
- Use `FAILED` when tests or contract checks run and violate the task.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-dev-fe/SKILL.md`

### Preserved Methodology

- Frontend-only scope boundary.
- Strict RED, GREEN, REFACTOR sequence.
- API contract and shared-type alignment.
- Result file and tracking discipline.
- Review repair workflow with explicit evidence.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Mandatory external test-writer execution assumptions.
- Legacy headline/status values outside the closed vocabulary.
- Automatic commit instructions as active behavior.

### Codex Replacement Behavior

- Execute frontend TDD directly when tools are available.
- Use supported delegation only when actually available.
- Report missing browser or runner evidence with closed statuses.
- Keep git and tracking transitions gated by confirmation and evidence.
