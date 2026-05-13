---
name: nacl-ba-validate
description: |
  Validate NaCl BA graph consistency with internal BA checks and cross-layer
  BA-to-SA checks. Use when checking BA completeness, graph consistency,
  handoff readiness, or for compatibility with `/nacl-ba-validate`.
---

# NaCl BA Validate For Codex

Run read-only validation of BA graph data and optional BA-to-SA coverage.
Validation reports remain Russian by default unless the user explicitly requests
another supported output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Read-Only Contract

This skill is strictly read-only. Resolve configuration, inspect BA schema/query
references, check graph read tooling, and verify BA graph data before running
checks. If graph read tooling or BA data is unavailable, report `BLOCKED`.

For `cross` and `full`, check whether SA graph data exists before cross-layer
checks. Missing SA data is not success: report cross checks as `NOT_RUN` or the
overall result as `PARTIALLY_VERIFIED` when internal checks ran.

## Scope

| Scope | Checks |
|---|---|
| `internal` | L1-L8 BA-internal checks. |
| `cross` | XL1-XL5 BA-to-SA checks. |
| `full` | Internal checks plus cross checks when SA graph data exists. |

## Validation Levels

### Internal

- L1: business processes have required trigger, result, owner, ID, and name.
- L2: decomposed processes have workflow steps and no orphaned empty steps.
- L3: workflow steps have valid performers.
- L4: entities have attributes and mandatory properties.
- L5: entity-process usage is consistent.
- L6: role-process relationships are complete and consistent.
- L7: glossary coverage exists for key BA artifacts.
- L8: business rules have required properties and traceability.

### Cross-Layer

- XL1: automatable workflow steps are covered by use cases.
- XL2: business objects are covered by domain entities.
- XL3: business rules have SA traceability where applicable.
- XL4: business roles map to system roles.
- XL5: glossary terms align with SA terminology where graph evidence exists.

## Workflow

1. Verify BA graph data exists.
2. For `cross` or `full`, verify SA graph data exists.
3. Run read-only checks for the requested scope.
4. Classify findings by severity while keeping final status in the closed
   verification vocabulary.
5. Output a report with counts, issues, affected IDs, recommendations, skipped
   checks, and final verification status.

This skill must not write to the graph or filesystem.

Severity remains separate from final status: critical or warning findings can
drive `FAILED`, while skipped checks use `NOT_RUN`; the top-level status must
come from the closed vocabulary.

## Capabilities

### May Do

- Query graph schema and graph data with read-only tools.
- Run BA internal and BA-to-SA cross checks.
- Report issue counts and affected graph IDs.
- Recommend which BA or SA skill should address each finding.
- Mark skipped checks with `NOT_RUN` when scope or missing data requires it.

### Must Not Do

- Write graph data.
- Modify project files.
- Repair validation findings.
- Use non-closed final statuses.
- Treat absent SA data as verified cross-layer coverage.

### Conditional Tools And Actions

- All validation requires graph read tools.
- Cross-layer checks require SA graph data.
- Query library reads are optional; embedded check logic may be used when files
  are unavailable.
- Scope selection controls which checks are intentionally `NOT_RUN`.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph read tooling or BA graph data is unavailable.
- Use `NOT_RUN` for checks outside the requested scope or skipped due to absent
  SA graph data.
- Use `PARTIALLY_VERIFIED` when some requested checks run and others cannot.
- Use `UNVERIFIED` when findings cannot be checked against graph state.
- Use `FAILED` with a reason when checks run and detect contract violations.
- Use `VERIFIED` only when all requested checks run and no contract violation is
  detected.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-validate/SKILL.md`

### Preserved Methodology

- Read-only validation.
- L1-L8 BA checks and XL1-XL5 cross-layer checks.
- Pre-flight checks for BA and SA graph data.
- Finding report with affected IDs and recommendations.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Non-closed final status wording.

### Codex Replacement Behavior

- Keep validation strictly read-only.
- Use only closed verification statuses for final outcomes and skipped checks.
- Treat absent SA data as `NOT_RUN` or `PARTIALLY_VERIFIED` depending on scope.
- Keep slash command text as compatibility trigger text.
