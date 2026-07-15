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

**Enumerate acceptance criteria.** Read the work item's acceptance criteria and
build a per-criterion checklist — one entry per criterion, not the category
groups. This is the requirements-traceability checklist Step 5 traces against:
verification keyed on code-presence alone passes a change that touches
clean-tracing code while an acceptance criterion is entirely unimplemented (the
"missing-requirement" defect class — e.g. an audit-log row the spec demands but
no code writes). For each criterion, during the Step 2 trace mark whether it is
**implemented** (a changed-code path actually produces the behaviour, confirmed
via the cross-file trace, not a plausibly-named function or dead config) and
whether it is **covered** (a test exercises it). If no acceptance criteria are
available, record that the traceability check was skipped; do not fail on its
absence.

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

The layers above are the canonical chain, but a defect often lives one hop off
it — in a caller or a runtime the chain does not name. Do not stop at the
template; trace the actual code graph. For each external symbol the changed
code calls (a client, service, or util), open the file that defines it and
confirm the assumptions hold: signature, return shape, and any hardcoded value
that silently overrides a parameter. A field can be declared in the contract or
config yet never be set by the runtime (dead config), so the feature reads as
implemented while the runtime does something else — invisible if you read only
the changed files. For each exported symbol the change modifies (renamed field,
new return shape, changed enum), grep the source roots for imports and
call-sites of the symbol, then re-apply the per-layer checks at each consumer
found. Report any cross-file mismatch as a normal correctness finding; it
contributes to `FAILED` like any other defect.

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

**Acceptance-criteria traceability gap.** Cross the per-criterion checklist
from Step 1 against the trace and test results: any criterion that is neither
implemented in the change (Step 2) nor covered by a collected test is a
coverage gap — route it through the same coverage-gap mapping above and report
`Status: UNVERIFIED`. A change cannot reach a passing status while a required
behaviour is unverified. (A criterion implemented but contradicted by the code
is a behaviour defect → `Status: FAILED`, not a coverage gap.)

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
**Self-adversarial check before emitting `FAILED`:** re-read the cited code
path once more and try to refute your own finding (a guard, a consumer that
never hits it, a type that makes it safe); keep the finding — and the `FAILED`
status — unless that second read gives positive evidence it is a non-issue.
Never drop the finding on uncertainty.

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
