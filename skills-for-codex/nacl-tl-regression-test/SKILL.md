---
name: nacl-tl-regression-test
description: |
  Author a focused failing regression or feature test before implementation.
  Use when a bug fix needs a reproducing test, a feature task needs a test-first
  check, TDD setup is required, or when the user says
  `/nacl-tl-regression-test`.
---

# NaCl TL Regression Test Author For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

This skill writes tests before implementation. It does not fix code. Read
`../nacl-tl-core/SKILL.md` and the relevant task or bug evidence first.

## Workflow

1. Resolve mode: bug-fix regression test or feature-dev test.
2. Read the bug report, task spec, acceptance criteria, API contract, and
   existing test patterns.
3. Discover the project's test framework and the narrowest useful test location.
4. Write the smallest test that captures the expected behavior or reproduces the
   bug.
5. Run the focused test command to verify that the test is red before
   implementation.
6. Report the test file, command, observed result, and next implementation
   handoff.

## Source-Parity Requirements

- Preserve both source modes: bug-fix and feature-dev. The caller must provide
  enough context to identify the mode, expected behavior, unchanged behavior,
  target files, and command.
- The test author writes tests only. Do not edit production implementation or
  silently weaken assertions to make the test pass.
- Discover the test framework and configured runner from existing project
  files. Do not invent fallback runners.
- RED evidence is mandatory unless the workflow reports the absence honestly as
  `BLOCKED`, `PARTIALLY_VERIFIED`, or `UNVERIFIED`.
- Return a machine-readable result that callers can consume: test files,
  command, observed RED output, skipped evidence, and top-level `Status:`.
- Emit a canonical line `Regression test: <repo-relative path>` in the final
  report (one line per test file). Orchestrators
  (`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-dev-*`) parse this line
  verbatim and forward it into `Task.verification_evidence` per
  `../references/verification-evidence.md`.

## Capabilities

### May Do

- Add focused regression tests for bug fixes.
- Add feature-development tests from task specs and acceptance criteria.
- Reuse local test framework conventions.
- Run focused test commands to confirm the new test fails before implementation.
- Produce a handoff report for the implementation skill.

### Must Not Do

- Implement the production fix or feature behavior.
- Add broad snapshot or low-signal tests when a focused behavioral test is
  possible.
- Treat a test that already passes as a valid regression reproduction without
  explaining why.
- Run destructive, deploy, or release actions.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Test authoring requires writable workspace access.
- Test execution requires configured project commands and dependencies.
- Browser-based tests require available browser automation and running targets.
- Report writes require writable workspace access.
- Any broad or costly command requires user confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task evidence, writable access, test framework, commands,
  dependencies, targets, or confirmation are unavailable.
- Use `FAILED` when the new test cannot be written or the focused command cannot
  demonstrate the expected red state.
- Use `PARTIALLY_VERIFIED` when the test is written but only part of the red
  evidence can be checked.
- Use `NOT_RUN` when test execution is intentionally skipped.
- Use `UNVERIFIED` when the new test result cannot be established.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-regression-test/SKILL.md`

### Preserved Methodology

- Bug-fix and feature-dev modes.
- Test-first behavior before implementation.
- Framework discovery before authoring.
- Red-state verification and handoff reporting.

### Removed Claude Mechanics

- Source status labels outside the closed vocabulary.
- Runtime-specific call-site examples.
- Assumed external tool availability.
- Model routing fields.

### Codex Replacement Behavior

- Treat test framework, browser, and command execution as conditional.
- Keep implementation outside this skill.
- Require red-state evidence or report why it is unavailable.
- Report with the closed verification vocabulary.
