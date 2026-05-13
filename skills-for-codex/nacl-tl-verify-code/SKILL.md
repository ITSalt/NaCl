---
name: nacl-tl-verify-code
description: |
  Verify NaCl TL code correctness by tracing data flow, checking contracts,
  running configured tests, comparing failures, and reporting evidence.
  Use when verifying changed code for a UC or TECH item, checking data flow
  after a fix, or for compatibility with `/nacl-tl-verify-code`.
---

# NaCl TL Code Verification For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Verify correctness, not style alone. TL artifacts and reports remain English.

Read `../references/migration-rules.md` and
`../references/verification-vocabulary.md` before executing the workflow.

## Contract

Inputs consumed:

- UC or TECH specification;
- changed file paths from git diff, result files, or explicit user scope;
- API contracts, database migrations, shared types, and relevant tests;
- configured test command.

Outputs produced:

- data-flow and contract verification report;
- test-runner evidence when execution is available;
- coverage-gap notes;
- final report using the closed verification vocabulary.

Downstream consumers:

- verification orchestrator;
- delivery and shipping workflows;
- reopened workflow when correctness fails.

## Workflow

### Step 1: Identify Change

Read the work item description and changed files. Determine affected modules,
entry points, data owners, API boundaries, and final consumers.

If changed files or scope cannot be resolved, report:

```text
Status: BLOCKED
Reason: changed code scope is unavailable
```

### Step 2: Trace Data Flow

Trace data end to end across relevant layers:

- UI input or API request;
- validation and transformation;
- service or domain logic;
- persistence, external calls, or state updates;
- response mapping;
- UI display or final consumer.

Check field names, types, nullable values, error propagation, renamed fields,
and contract compatibility between layers.

### Step 3: Verify Storage And Contracts

For database or persistence changes, inspect migrations, constraints, indexes,
default values, and code assumptions. For API changes, compare request and
response types to the contract and frontend usage.

Use database or graph tools only when available. Otherwise report the missing
runtime check as `NOT_RUN` or `PARTIALLY_VERIFIED`.

### Step 4: Check Common Correctness Risks

Look for incomplete renames, stale imports, unhandled optional values, missing
error handling, frontend fields absent from backend responses, backend fields
unused by frontend consumers, and tests that assert implementation details
instead of behavior.

### Step 5: Run Tests And Compare

Discover the configured test command from the affected workspace. Do not
invent a runner.

When execution is available:

1. Run the relevant suite or scoped tests.
2. Record collected tests and failures.
3. If the runner collects zero tests, retry against a known relevant test file
   when one exists.
4. Compare failures with any available baseline from the implementation result
   or a pre-change run.
5. Check whether test files import or exercise the changed modules.

If no configured runner exists, report `BLOCKED`. If tests run but coverage is
missing, report `PARTIALLY_VERIFIED` or `UNVERIFIED` based on the strength of
the static evidence.

## Source-Parity Requirements

- Preserve the source distinction from review: verify execution path,
  persistence, contracts, and tests rather than only judging code style.
- For DB or durable-state changes, trace write and read paths and verify
  recovery or transaction behavior when applicable.
- Discover the configured runner from nearest `package.json` `scripts.test`.
  Do not invent fallback commands.
- Treat absent baseline evidence as weaker verification. Without baseline,
  successful test output is at most `PARTIALLY_VERIFIED` unless the task is
  explicitly code-inspection-only.
- New postfix failures compared with baseline are `Status: FAILED`.

### Step 6: Return Result

Return:

- changed files verified;
- data-flow trace;
- contract mismatches or confirmation;
- database or persistence checks;
- test command and result;
- coverage gaps;
- final `Status: <VALUE>` using only the closed vocabulary;
- recommended next action.

Use `VERIFIED` only when static correctness checks and required tests support
the contract. Use `FAILED` for confirmed behavior or contract defects.

## Capabilities

### May Do

- Read code, tests, specs, contracts, migrations, and result files.
- Run configured tests, typechecks, or static checks when available.
- Use available runtime inspection tools for database or API checks.
- Produce verification reports for downstream TL workflows.

### Must Not Do

- Modify production code as part of verification unless the user explicitly
  changes the request to repair.
- Treat style-only review as correctness verification.
- Claim end-to-end correctness without tracing the changed data path.
- Invent test commands, contracts, or runtime evidence.

### Conditional Tools And Actions

- File reads require workspace access.
- Test, typecheck, and static analysis execution require configured commands
  and dependencies.
- Runtime database, browser, or API checks require available tools and
  environment access.
- Writing verification artifacts requires writable `.tl/` files.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when scope, contracts, files, runners, permissions, or required
  tools are unavailable.
- Use `NOT_RUN` when a check is intentionally skipped.
- Use `PARTIALLY_VERIFIED` when static checks pass but runtime, coverage, or
  end-to-end evidence is incomplete.
- Use `UNVERIFIED` when correctness cannot be established.
- Use `FAILED` when data-flow, contract, or test evidence violates the work
  item.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-verify-code/SKILL.md`

### Preserved Methodology

- Correctness verification distinct from code-quality review.
- End-to-end data-flow tracing.
- Database, API contract, and type consistency checks.
- Test command discovery, execution, and coverage-gap analysis.
- Evidence-first downstream report.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Legacy verification result values outside the closed vocabulary.
- Assumptions about a specific database inspection integration.
- Output headers that implied verification without checked evidence.

### Codex Replacement Behavior

- Use closed statuses for all verification outcomes.
- Treat runtime, database, and browser checks as conditional.
- Report coverage gaps separately from behavior failures.
- Keep verification read-focused unless the user requests repair.
