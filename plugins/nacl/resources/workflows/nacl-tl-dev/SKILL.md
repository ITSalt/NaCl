---
name: nacl-tl-dev
description: |
  Implement NaCl TL TECH and infrastructure work items using TDD when code is
  testable and command-based verification when the work changes tooling,
  configuration, database setup, CI, or runtime infrastructure. Use when
  developing a TECH item, continuing a rejected TECH item, or for compatibility
  with `/nacl-tl-dev TECH###`.
---

# NaCl TL TECH Development For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Implement TECH scope only. TL artifacts and reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- `.tl/tasks/TECH-###/task.md`
- optional `.tl/tasks/TECH-###/test-spec.md`
- optional `.tl/tasks/TECH-###/impl-brief.md`
- `.tl/tasks/TECH-###/status.json` when available
- configured test command or explicit infrastructure verification command

Outputs produced:

- TECH code, configuration, tests, or infrastructure files when editing is
  available;
- `.tl/tasks/TECH-###/result.md` when editing is available;
- tracking updates when editing is available and the transition is justified;
- final report using the closed verification vocabulary.

Downstream consumers:

- TECH review;
- conductor workflow;
- shipping or delivery workflow.

## Workflow

### Step 1: Read TECH Scope

Read the TECH work item files only. Do not re-plan from BA or SA artifacts when
the `.tl/tasks/TECH-###/` files are present.

Verify that the work item exists, is not blocked, and has completed
dependencies. If required scope files are missing, report:

```text
Status: BLOCKED
Reason: TECH work item files are unavailable
```

### Step 2: Choose The Path

Use the TDD path for testable code such as shared utilities, validation,
database helpers, auth middleware, or other behavior-bearing source.

Use the verification path for Docker, CI, deployment configuration, migrations,
networking, monitoring, linting setup, and other infrastructure where the
source contract names a concrete verification command.

### Step 3A: TDD Path

1. Discover the nearest configured test command; do not invent a runner.
2. Run the configured tests before editing and record the baseline failure set.
3. RED: add the minimal failing test from `test-spec.md` when editing is
   available, then verify it fails for the expected reason.
4. GREEN: implement the smallest change that satisfies the failing test.
5. REFACTOR: improve names, structure, and duplication only while tests keep
   passing.
6. Re-run the same command and compare failures to the baseline.

If no configured runner or test specification exists for testable code, stop
or ask for direction and report `BLOCKED` or `UNVERIFIED` honestly.

### Step 3B: Verification Path

1. Read the explicit verification command from `task.md`, `impl-brief.md`, or
   the project documentation.
2. Run it before editing when command execution is available and record the
   baseline state.
3. Implement the requested configuration or infrastructure change.
4. Re-run the same command and verify the expected services, resources, schema,
   or CI checks are present.
5. On a clean re-run, write and commit a durable verification record at
   `.tl/tasks/<TASK_ID>/verification.md` containing the exact command, the
   baseline output, the post-change output, and the list of resources
   confirmed. Console output alone is not evidence; without the committed
   record the item is not `VERIFIED`.

If no command is documented, report:

```text
Status: BLOCKED
Reason: infrastructure verification command is not documented
```

### Step 4: Continue After Review

When continuing a rejected TECH item, read the review findings, group them by
severity, and repair through the same spec-first fix discipline used by
`nacl-tl-fix`. Preserve RED, GREEN, REFACTOR evidence for testable fixes.
For infrastructure-only findings, preserve baseline and post-change command
evidence.

Do not promote the work item unless the repair report contains explicit
evidence. Silence is `UNVERIFIED`.

### Step 5: Report And Track

Create or return `result.md` with:

- work item ID and summary;
- path used: TDD or verification;
- files changed;
- command run and baseline comparison;
- RED, GREEN, REFACTOR evidence when applicable;
- a canonical line `Regression test: <repo-relative path>` (TDD path), or
  `Regression test: verification: <repo-relative path>` (verification path —
  the committed `.tl/tasks/<TASK_ID>/verification.md` record from Step 3B.5;
  the orchestrator derives `verify-GREEN:<path>` from it), or
  `Regression test: none — UNVERIFIED` / `Regression test: n/a — BLOCKED`;
  the orchestrator forwards this into `Task.verification_evidence`
  per `../references/verification-evidence.md`;
- final `Status: <VALUE>` using only the closed vocabulary.

Tracking may move forward only on `VERIFIED` or on `PARTIALLY_VERIFIED` with an
explicit accepted rationale. Otherwise keep the item in progress or report why
tracking was not changed.

## Capabilities

### May Do

- Read TECH `.tl/tasks/` files.
- Edit TECH-related source, test, configuration, and infrastructure files when
  workspace permissions allow it.
- Run configured test or verification commands when execution is available.
- Update TECH result and tracking files when edits are available and justified.

### Must Not Do

- Implement UC backend or frontend scope through this skill.
- Skip RED for testable code unless the user explicitly accepts a non-TDD
  blocked path.
- Treat an undocumented command as successful verification.
- Commit, push, deploy, or change branches without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File edits require writable workspace access.
- Test and verification commands require dependencies and configured runners.
- Git operations require explicit user request or a confirmed workflow gate.
- Delegation is conditional on supported tools being available in the current
  Codex environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when task files, dependencies, permissions, or required
  commands are unavailable.
- Use `NOT_RUN` when a path is intentionally skipped.
- Use `PARTIALLY_VERIFIED` when only part of the TECH contract was checked.
- Use `UNVERIFIED` when evidence is missing or ambiguous.
- Use `FAILED` when the command ran and the result violates the contract.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-dev/SKILL.md`

### Preserved Methodology

- TECH-only scope and Wave 0 infrastructure distinction.
- TDD for behavior-bearing code.
- Baseline comparison before and after changes.
- Verification-command path for infrastructure work.
- English TL result artifacts.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Mandatory external test-writer execution assumptions.
- Legacy headline/status values outside the closed vocabulary.
- Active commit instructions as automatic behavior.

### Codex Replacement Behavior

- Execute RED, GREEN, REFACTOR directly when tools are available.
- Treat delegation as optional and environment-dependent.
- Report command absence, runner absence, and missing evidence with closed
  statuses.
- Gate tracking and git actions on evidence and confirmation.
