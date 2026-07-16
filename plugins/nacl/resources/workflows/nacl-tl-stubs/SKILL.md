---
name: nacl-tl-stubs
description: |
  Scan NaCl code for stubs, mocks, placeholder code, debug leftovers, and
  empty or hollow test structures; maintain stub tracking and enforce TL
  quality gates. Use when checking placeholders, running a stub gate, preparing
  review or release, or for compatibility with `/nacl-tl-stubs`.
---

# NaCl TL Stub Tracking For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Scan for incomplete implementation and test coverage debt. TL artifacts and
reports remain English.

Read `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/verification-evidence.md` before executing the workflow.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the
`stubs-cleanup:<MOD-ID>` alias after that deferred 2.10.1 alias is available.
Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

Codex itself must not claim that Anthropic `/goal` ran unless the runtime
exposes it and evidence exists. The alias check script is the deterministic
proof source once shipped; until then, report `Status: BLOCKED`,
`Status: NOT_RUN`, or `Status: UNVERIFIED` rather than treating the alias as a
2.10.0-ready path.

## Closure Criterion: Shape Validation (W10 binding)

This skill does NOT treat "absence of TODO marker" as evidence that a stub
is closed. **A stub is closed iff a sample of runtime data flowing through
the previously-stubbed code path matches the spec's required-field set
AND the spec's field types.**

Project-Alpha post-mortem § "Stub/mock leak" (commit `8522d1d` "fix(admin):
unstub WORKFLOW_STEPS + categories envelope + WSC dropdown paging")
shipped because the stub satisfied "no TODO" but held fake IDs that
downstream consumers read as load-bearing data. The scanner saw clean
markers and emitted COMPLETE; the next real call returned 422. W10
replaces marker-absence with shape-validation as the closure criterion.

### Validation procedure (per candidate-for-closure stub)

When the scanner finds that a tracked stub no longer matches its
file:line + pattern (and is therefore a candidate to mark `resolvedAt`):

1. **Load the spec.** Resolve the stub's UC. Read the UC's
   `FormField` set from the graph (or `.tl/tasks/<UC>/api-contract.md`
   for markdown projects). Extract:
   - the required-field set (graph `required: true`, contract
     `* required`);
   - the field types (graph `data_type`, contract Zod/TS type).

2. **Sample runtime data.** Find at least one runtime sample matching
   the stubbed shape. Acceptable sources in order:
   a. `wire-evidence:fixture:<path>` recorded by `nacl-tl-sync` on the
      UC's Task — read the captured response body.
   b. A contract / integration test asserting on each required field's
      presence AND its type.
   c. `wire-evidence:live-smoke:<timestamp>` recording.
   d. `qa-stage:provider-fixture:VERIFIED` or
      `qa-stage:wire-contract:VERIFIED` artifact recorded by
      `nacl-tl-qa`.

   If none of (a)-(d) is available, refuse closure. Report
   `Status: UNVERIFIED`, headline `STUBS APPLIED — UNVERIFIED
   (shape-unvalidated: <stub-id>)`. The stub remains unresolved.

3. **Compare.** For each required field: presence + type-match.
   Optional fields type-match if present.

4. **Record.** On success, write
   `stub-shape-validated:<spec-ref>` to the UC Task
   `verification_evidence` (see
   `../references/verification-evidence.md`). Set
   `resolvedAt`, `shape_validated: true`, `shape_evidence: <spec-ref>`
   on the registry entry.

5. **Mismatch.** Report `Status: UNVERIFIED`, headline
   `STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field:
   <name>, expected: <type>, observed: <type-or-missing>)`. Keep
   `resolvedAt: null`.

### Worked example — empty-test-file false-PASS

A developer removes a `// TODO: implement workflow steps catalog`
stub from `src/admin/workflow-steps.service.ts` and returns `[]`. The
test file exists with one `it('returns a value', () => { expect(
  svc.list()).toBeDefined(); });` call.

Pre-W10: no TODO marker, non-empty test file, no empty-describe. Scanner
emits `STUBS COMPLETE`. Wrong-shaped empty array ships.

Post-W10:
- Stub was tracked at `STUB-NNN`, `uc: UC-302`.
- Spec lookup: required fields `id` (uuid), `name` (string),
  `step_order` (int), `kind` (enum).
- Sample sources: existing test asserts only `toBeDefined()`. No
  wire-evidence fixture for UC-302. Sources (a)-(d) empty.
- Outcome: `Status: UNVERIFIED`, headline `STUBS APPLIED — UNVERIFIED
  (shape-unvalidated: STUB-NNN)`. Registry keeps `resolvedAt: null`.
- Operator path: write a contract assertion on the four required
  fields (or record a wire-evidence fixture). Rerun. Validation
  passes. Closure recorded as
  `stub-shape-validated:UC-302:FormField:workflow-step` on the UC
  Task's `verification_evidence`.

## Contract

Inputs consumed:

- codebase paths or UC-specific file lists;
- optional `.tl/stub-registry.json` prior state;
- `.tl/tasks/UC###/result-be.md` and `result-fe.md` for UC-specific scans;
- project source and test files.

Outputs produced:

- `.tl/stub-registry.json` when editing is available;
- `.tl/tasks/UC###/stub-report.md` for UC scans when editing is available;
- status and changelog updates when editing is available and justified;
- final scan report using the closed verification vocabulary.

Downstream consumers:

- code review gate;
- QA gate;
- release gate;
- conductor workflow.

## Workflow

### Step 1: Determine Scope

Use one of:

- full scan: production source plus test files;
- UC scan: files listed in UC backend and frontend result artifacts;
- final scan: full scan with stricter gate rules.

If `.tl/`, source files, or UC result files required for the selected scope are
missing, report `BLOCKED` with the missing input.

### Step 2: Sanity Check The Scanner

Before scanning, prove the selected search command can find a known temporary
marker in a temporary file. Delete the temporary file regardless of outcome.

If the marker is not found or the file cannot be cleaned up, report:

```text
Status: BLOCKED
Reason: stub scanner sanity check failed
```

### Step 3: Scan Production Code

Search production files for marker comments and placeholder patterns,
including TODO, FIXME, STUB, MOCK, HACK, unimplemented exceptions, unsafe type
bypasses, hardcoded fake credentials, debug logs, ignored type or lint checks,
and placeholder UI assets.

Exclude generated files, dependencies, build outputs, fixtures, mocks,
stories, and test files from the production pass.

### Step 4: Scan Test Files

Scan test files separately for empty test files and describe blocks with no
cases. A source scan with no production placeholders is not fully verified if
the scoped test files are absent or hollow.

Treat import-proxy test files as informational only when the file clearly
delegates to a sibling test module.

### Step 5: Classify Findings

Classify each finding by severity:

- CRITICAL: blocks review, QA, and release. Examples include placeholder
  business logic, authorization bypasses, unimplemented main flow, security
  FIXME, API placeholder, fake secrets, and critical unsafe casts.
- WARNING: blocks only in final scan unless project policy says otherwise.
  Examples include non-security FIXME, HACK, debug logs, ignored type checks,
  placeholder UI, and hollow tests.
- INFO: tracked debt that does not block by itself.

Associate findings with a UC by explicit marker, changed-file lists, or
`uc: null` when no association can be made.

### Step 6: Reconcile Registry

Load the prior registry when available. Match existing entries by file, type,
and nearby line. Preserve IDs and assign new IDs sequentially. Never reuse
IDs.

When a prior entry no longer matches its file:line + pattern, the stub is a
**candidate for closure** — but do NOT immediately mark `resolvedAt`. Run
the four-step shape-validation procedure (see "Closure Criterion: Shape
Validation" above). Only on a successful comparison set
`resolvedAt`, `shape_validated: true`, and `shape_evidence: <spec-ref>` on
the registry entry. On shape-unvalidated or shape-mismatch outcomes, keep
`resolvedAt: null` with the appropriate flag recorded.

Write the registry only when editing is available. After writing, re-read it
and verify `updatedAt` and counts. If persistence cannot be verified, report
`BLOCKED`.

### Step 7: Gate And Report

Return:

- files scanned: production and tests;
- counts by severity;
- empty test file and empty describe counts;
- new, unresolved, resolved, and orphaned findings;
- registry and report files written or `NOT_RUN`;
- gate decision;
- final `Status: <VALUE>` using only the closed vocabulary.

Use `VERIFIED` only when the selected scan ran, persistence succeeded when
requested, no blocking findings remain, test files in scope were actually
checked, **AND every candidate-for-closure stub passed shape-validation
(W10 binding) with a recorded `stub-shape-validated:<spec-ref>` entry on
the UC Task's `verification_evidence`**. Use `PARTIALLY_VERIFIED` for
warnings or incomplete but useful scan coverage. Use `UNVERIFIED` when a
candidate-for-closure stub had no available runtime data sample
(shape-unvalidated) or showed a required-field divergence
(shape-mismatch). Use `FAILED` when blocking findings remain.

## Capabilities

### May Do

- Read source, test, result, status, changelog, and registry files.
- Write stub registry, UC stub reports, status, and changelog files when
  workspace permissions allow it.
- Run search commands when command execution is available.
- Enforce review, QA, and release gates based on scan evidence.

### Must Not Do

- Treat zero production findings as clean when no test files were scanned.
- **Treat "no TODO marker" as evidence that a stub is closed (W10 binding).
  Closure requires shape-validation against the spec's required-field set.**
- Mark a candidate-for-closure stub `resolvedAt` without running the
  shape-validation procedure.
- Delete registry history or reuse stub IDs.
- Count generated, dependency, fixture, mock, story, or build-output files as
  production findings.
- Commit, push, or change tracker state without explicit user request or
  workflow confirmation.

### Conditional Tools And Actions

- File reads and writes require workspace access.
- Search execution requires an available command such as `rg` or an equivalent.
- Status and changelog updates require writable `.tl/` files.
- Gate enforcement in external systems requires available integration tools and
  confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required paths, scanner sanity checks, registry
  persistence, permissions, or tools fail.
- Use `NOT_RUN` when registry, report, or external gate updates are
  intentionally skipped.
- Use `PARTIALLY_VERIFIED` when the scan ran but coverage is incomplete or only
  nonblocking warnings remain.
- Use `UNVERIFIED` when scan scope or persistence evidence is ambiguous.
- Use `FAILED` when blocking stub findings remain.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-stubs/SKILL.md`

### Preserved Methodology

- Production and test-file scanning as separate passes.
- Severity classification and gate enforcement.
- Persistent registry with stable IDs and resolved entries.
- UC association and UC-specific reports.
- Scanner sanity check before trusting results.
- Shape-validation as the closure criterion (W10 binding): runtime data
  matches the spec's required-field set and types; `stub-shape-validated:
  <spec-ref>` recorded on the UC Task's `verification_evidence`.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Legacy scan headlines and status mappings outside the closed set.
- Active assumptions about downstream review and release runners.
- Over-specific console decorations as required output.

### Codex Replacement Behavior

- Use closed statuses with severity details in report fields.
- Treat external gates as conditional integrations.
- Report no-test-file scopes as partial or unverified, not clean.
- Verify registry writes before claiming persistence.
