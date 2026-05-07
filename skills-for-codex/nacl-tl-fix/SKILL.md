---
name: nacl-tl-fix
description: |
  Repair NaCl TL defects with spec-first analysis, strict TDD for testable
  bugs, documentation updates when behavior contracts changed, validation, and
  honest reporting. Use when fixing a bug, repairing review findings, handling
  a reopened issue, or for compatibility with `/nacl-tl-fix`.
---

# NaCl TL Spec-First Fix For Codex

Fix defects without widening scope. TL artifacts and reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- bug description, review finding, reopened issue, or explicit file scope;
- relevant `.tl/tasks/` artifacts when available;
- current code and tests;
- applicable BA, SA, API, or TL documentation when the defect changes expected
  behavior.

Outputs produced:

- repaired code, tests, and documentation when editing is available;
- changelog or result updates when editing is available and justified;
- final report using the closed verification vocabulary.

Downstream consumers:

- review;
- hotfix;
- reopened workflow;
- conductor and shipping workflows.

## Workflow

### Step 1: Triage

Classify the fix level:

- L0: test-only or verification-only correction.
- L1: code fix with existing docs still correct.
- L2: code fix plus updates to existing docs or contracts.
- L3: missing behavior contract; create the smallest necessary docs before
  coding.

Identify current behavior, expected behavior, unchanged behavior, affected
files, and likely verification path.

### Step 2: Load Context

Read only the scope needed to prove the defect and prevent collateral damage:
task files, API contracts, relevant code, tests, and existing docs.

If required context is unavailable, report `BLOCKED` with the missing input.

### Step 3: Gap Check

Decide whether the issue is code drift, spec drift, missing tests, missing
docs, environment configuration, or ambiguous acceptance criteria.

Ask the user for confirmation before creating or changing behavior contracts
for L2 or L3 fixes.

### Step 4: Define Correct Behavior

Write a short behavior definition before editing code:

- Current Behavior: what fails now.
- Expected Behavior: what must happen after the fix.
- Unchanged Behavior: paths that must keep working.
- Verification: exact test or command evidence required.

### Step 5: Update Docs For L2 Or L3

For L2, update existing docs or contracts that no longer match the intended
behavior. For L3, create the smallest missing contract needed to make the fix
testable and reviewable.

Stop at the user gate before proceeding if docs or contracts are changed.

### Step 6: Apply Fix With TDD

For testable bugs:

1. Discover the configured test command.
2. Run a baseline before editing and capture existing failures.
3. RED: add or update a regression test that fails for the defect.
4. GREEN: make the minimal code change that passes the regression test.
5. REFACTOR: clean up only after tests pass.
6. Re-run the same command and compare failures to the baseline.

For infrastructure-only bugs, use the documented verification command with the
same baseline and post-change comparison discipline.

### Step 7: Validate

Verify:

- no new failures appeared compared with the baseline;
- the regression test or verification command covers the reported defect;
- unchanged behavior has not been broken;
- docs still describe the implemented behavior for L2 and L3;
- adjacent UCs, shared types, endpoints, and components are not obviously
  broken.

### Step 8: Report

Return a report with:

- problem and root cause;
- fix level;
- behavior definition;
- files changed;
- tests or commands run;
- baseline versus post-change comparison;
- docs changed or not changed with rationale;
- final `Status: <VALUE>` using only the closed vocabulary;
- next action based on that status.

## Capabilities

### May Do

- Read bug, review, reopened, task, code, test, and contract context.
- Edit code, tests, docs, and TL result files when workspace permissions allow.
- Run configured test or verification commands when available.
- Produce repair reports and changelog entries when justified.

### Must Not Do

- Apply a code fix before defining expected and unchanged behavior.
- Skip a failing regression test for testable bugs unless the user accepts a
  blocked TDD path.
- Widen the fix into unrelated refactoring or feature work.
- Commit, push, deploy, or change branches without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Test and verification commands require dependencies and configured runners.
- Documentation changes that alter behavior require a user gate.
- Delegation is conditional on supported tools being available in the current
  Codex environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when context, permissions, confirmation, dependencies, or
  configured commands are missing.
- Use `NOT_RUN` when a check is intentionally skipped.
- Use `PARTIALLY_VERIFIED` when the defect is fixed but some required evidence
  is missing.
- Use `UNVERIFIED` when coverage or behavior evidence is ambiguous.
- Use `FAILED` when tests, static checks, or behavior checks run and violate
  the fix contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-fix/SKILL.md`

### Preserved Methodology

- Spec-first bug repair.
- L0 through L3 fix classification.
- RED, GREEN, REFACTOR discipline for testable bugs.
- Documentation gates for changed behavior contracts.
- Baseline comparison and final repair report.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Mandatory external regression-test execution assumptions.
- Legacy status and headline vocabulary outside the closed set.
- Automatic shipping behavior as active fix behavior.

### Codex Replacement Behavior

- Execute the repair workflow directly when tools are available.
- Treat external help as optional and environment-dependent.
- Use closed statuses with reason fields for runner, infra, and evidence gaps.
- Keep shipping and git actions behind explicit confirmation.
