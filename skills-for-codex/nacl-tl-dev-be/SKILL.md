---
name: nacl-tl-dev-be
description: |
  Implement backend NaCl TL tasks using strict TDD from task specifications and
  API contracts. Use when developing backend code for a UC or TECH task,
  writing backend tests first, verifying backend implementation, or
  compatibility with `/nacl-tl-dev-be`.
---

# NaCl TL Backend Development For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Implement backend task scope only. TL artifacts and reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- `.tl/tasks/<TASK_ID>/task-be.md`
- `.tl/tasks/<TASK_ID>/test-spec.md`
- `.tl/tasks/<TASK_ID>/impl-brief.md`
- `.tl/tasks/<TASK_ID>/acceptance.md`
- `.tl/tasks/<TASK_ID>/api-contract.md`

Outputs produced:

- backend code and tests when file editing is available;
- `.tl/tasks/<TASK_ID>/result-be.md` when file editing is available;
- final verification report using the closed vocabulary.

Downstream consumers:

- backend review;
- BE/FE sync verification;
- shipping or conductor workflow.

## TDD Workflow

### Step 1: Read Task Scope

Read only backend task files. Do not read frontend task files as implementation
scope.

### Step 2: Discover Test Runner

Find the backend workspace and its configured test command. If no runner is
available, report:

```text
Status: BLOCKED
Reason: backend test runner is not configured or unavailable
```

### Step 3: Capture Baseline

Run the configured backend tests before editing code when test execution is
available. Record existing failures. If tests cannot run, stop or continue only
after explicit user direction and report the result honestly.

### Step 4: RED

Write the minimal failing backend test for the task when file editing is
available. Verify that the new test fails for the expected reason.

### Step 5: GREEN

Implement the minimal backend code needed to pass the new test while preserving
the API contract.

### Step 6: Verify And Compare

Run the same configured backend test command. Compare post-change failures with
the baseline. If new failures appear, report:

```text
Status: FAILED
Reason: regression detected in backend test suite
```

### Step 7: Report

Create or return a backend result report with changed files, test command,
baseline comparison, and closed-vocabulary status.

Include a canonical line `Regression test: <repo-relative path>` (or
`Regression test: none — UNVERIFIED` / `Regression test: n/a — BLOCKED`)
so the orchestrator can forward it into `Task.verification_evidence`
per `../references/verification-evidence.md`.

## Capabilities

### May Do

- Read backend TL task files.
- Edit backend source and test files when file editing is available.
- Run the configured backend test command when test execution is available.
- Produce a backend result report.

### Must Not Do

- Implement frontend scope.
- Write production code before a failing test unless the user explicitly accepts
  a blocked TDD path.
- Substitute an invented test command for the configured project runner.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Test execution requires dependencies and a configured runner.
- Commits or branch operations require explicit user request or workflow
  confirmation.
- Subagent/tool use is allowed only when supported by the current Codex
  environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task files, edit permissions, dependencies, or the test
  runner are unavailable.
- Use `PARTIALLY_VERIFIED` when some tests run but required coverage is missing.
- Use `UNVERIFIED` when implementation cannot be checked against the task
  contract.
- Use `FAILED` with a reason when tests run and violate the contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-dev-be/SKILL.md`

### Preserved Methodology

- Backend-only scope boundary.
- Strict RED, GREEN, verify, and report flow.
- API contract discipline.
- Baseline comparison before claiming success.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Mandatory delegation to a specific source test-author agent.
- Source status names outside the closed pilot vocabulary.

### Codex Replacement Behavior

- Execute TDD steps directly when tools are available.
- Use supported delegation only when actually available.
- Represent infrastructure absence as `BLOCKED` with reason.
- Treat regression as a `FAILED` reason, not a status.
