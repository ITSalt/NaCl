---
name: nacl-sa-finalize
description: |
  Finalize a NaCl SA specification from graph data: statistics, glossary,
  architecture decisions, traceability, and readiness. Use when finalizing a
  full specification, a module, progress stats, or says `/nacl-sa-finalize`.
---

# NaCl SA Finalize For Codex

Compute final SA summaries from the graph. This workflow is graph-only by
default: it reports results to the user and writes only graph decision records
after confirmation.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Use `full` for all finalization phases, `module` for one module, and
`stats-only` for a read-only progress snapshot.

1. Pre-flight: verify graph tooling, schema availability, `Module` nodes, and
   optional module scope.
2. Statistics: count modules, use cases, entities, attributes, enums, roles,
   forms, fields, components, requirements, decisions, and open questions.
3. Glossary and decisions: extract domain terms and compile architecture
   decisions from requirements or graph notes. Stop before writing any decision
   record.
4. Traceability matrix: report BA-to-SA coverage for workflow steps to use
   cases, business entities to domain entities, business roles to system roles,
   and business rules to requirements.
5. Readiness assessment: calculate per-module readiness from detailed UCs,
   forms, mapped fields, permissions, requirements, and open validation gaps.
6. Final report: return a concise markdown report with verification status,
   readiness, gaps, and next recommended NaCl skill.

`stats-only` must not write graph data. `module` scopes statistics and
readiness to the selected module while still noting cross-module dependencies
that affect readiness.

## Evidence Contract

Finalization is read-only unless the user explicitly confirms decision-record
writes. Run or emulate the named reads `sa_statistics_summary`,
`sa_glossary_extract`, `sa_readiness_assessment`, `sa_module_overview`, and the
handoff traceability and coverage queries when graph tooling is available.

Statistics and readiness must come from graph reads, not generated markdown. If
BA graph data is missing, report BA-to-SA traceability as
`PARTIALLY_VERIFIED`, `BLOCKED`, or `UNVERIFIED` according to the missing
evidence instead of marking readiness complete.

Architecture decisions are written as first-class graph-native `:Decision` nodes
(`level:'architecture'`, non-empty `rationale`, ≥1 `JUSTIFIES {role}` edge to the
module/entity/role the decision shaped) — never as standalone markdown. Show the
proposed decision text, rationale, affected artifacts, and source evidence before
writing, and read the records back before claiming persistence. Legacy ADRs stored
as `Requirement {type:'adr'}` (and any `docs/adr/*.md`) are backfilled into
`:Decision` nodes with `migrated_to` set on the old node (never deleted).
`nacl-sa-validate` L9 enforces non-empty rationale and the JUSTIFIES link.

Provenance gap-closure (FRs without a Decision, flagged by L9.1): write one honest
`:Decision` per FR, with `rationale` drawn from the project's own records in
priority order — FR `description`, else the FR markdown `## Feature Description` +
`Source:` line, else git history — and wire `(:FeatureRequest)-[:IMPLEMENTS]->(:Decision)`
plus `JUSTIFIES {role}` to each `INCLUDES_UC` target. Never invent rationale. When
none is recoverable, grandfather via `decision_exempt=true` (+ reason/since), which
L9.1 skips and L9.5 surfaces. Verify-before-bulk: backfill one FR and confirm scoped
L9 clears before batching. Full procedure: provenance-gap-closure runbook.

## Capabilities

### May Do

- Read graph statistics and traceability coverage.
- Produce readiness and finalization reports.
- Propose glossary entries and architecture decision records.
- Write decision records only after explicit user confirmation.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Read markdown docs as the finalization source of truth when graph data is
  available.
- Write files as part of finalization unless the user explicitly asks.
- Treat incomplete validation coverage as complete.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Aggregation requires graph read tooling.
- Decision record writes require graph write tooling and confirmation.
- Schema drift checks require graph introspection or readable schema files.
- Reports can still be drafted from user-provided data when graph access is not
  available, but must be labeled honestly.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, module scope, schema access, or confirmation
  is missing.
- Use `PARTIALLY_VERIFIED` when statistics are available but traceability or
  readiness checks cannot fully run.
- Use `UNVERIFIED` when final readiness cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-finalize/SKILL.md`

### Preserved Methodology

- Full, module, and stats-only finalization modes.
- Graph-derived statistics, glossary, decisions, traceability, and readiness.
- No file output by default.
- Traceability matrix across BA and SA artifacts.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Slash-command-only invocation wording.
- Source runtime assumptions as active instructions.

### Codex Replacement Behavior

- Run graph aggregation only when available.
- Gate decision writes with explicit confirmation.
- Use closed verification vocabulary for final readiness.
- Report unavailable checks as blocked or unverified rather than implied.
