---
name: nacl-sa-full
description: |
  Coordinate complete NaCl SA graph specification through phased Codex
  orchestration with explicit handoff contracts and user confirmation gates.
  Use when creating a full SA specification from BA graph context or for
  compatibility with `/nacl-sa-full`.
---

# NaCl SA Full For Codex

Coordinate full SA graph specification work without assuming a separate isolated
runner. SA artifacts remain Russian where the NaCl methodology requires Russian.

Read `../references/orchestration-model.md`,
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
and `../nacl-core/SKILL.md` before executing this skill.

## Contract

Inputs consumed:

- confirmed BA graph context or user-provided system facts;
- existing SA graph records when graph access is available;
- SA graph schema and query references when file access is available;
- downstream phase reports using the closed verification vocabulary.

Outputs produced:

- phased SA progress report using only the closed vocabulary;
- graph change requests or graph updates when graph tooling is available and
  confirmed;
- reviewed downstream output summaries for each phase;
- TL handoff readiness report.

Downstream consumers:

- human user;
- TL planning workflow;
- publishing workflow;
- graph query or visualization workflows.

## Orchestration Rules

- Use the shared Codex orchestration procedure from
  `../references/orchestration-model.md`.
- Each phase handoff must state inputs consumed, expected graph output, allowed
  verification status, downstream consumer, and handling for `VERIFIED`,
  `FAILED`, `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`, and `UNVERIFIED`.
- Run, invoke, or simulate downstream procedures only when the current Codex
  environment supports the needed tools.
- Collect and inspect downstream output before changing progress state or
  opening the next phase gate.
- Stop after each phase and ask the user whether to proceed to the next phase.
- Do not write graph data, modify files, publish, start TL planning, or move to
  the next major phase without explicit user confirmation.

## Workflow

### Phase 0: Resume And Scope

Check `config.yaml`, schema availability, and graph tool availability when file
or graph access exists. Detect existing SA graph state for `Module`,
`DomainEntity`, `SystemRole`, `UseCase`, `Component`, `ValidationReport`, and
`FinalizationReport`.

Report detected state with closed vocabulary. Stop and ask the user to confirm
the starting phase.

### Phase 1: Architecture

Coordinate module decomposition, inter-module relationships, and non-functional
requirements.

Contract:

- Inputs: BA handoff when available, `ProcessGroup`, `BusinessProcess`,
  automated `WorkflowStep`, `BusinessEntity`, `BusinessRole`, `BusinessRule`,
  user facts, constraints, and current graph state.
- Expected output: `Module`, module relationship, and non-functional
  `Requirement` records, `SUGGESTS` handoff edges, or a graph-ready change plan.
- Downstream consumer: domain structure phase.
- Gate: review module decomposition and context map before Phase 2.

### Phase 2: Domain Structure

For each confirmed module, use the `nacl-sa-domain` procedure when available.
Process modules sequentially unless available tooling supports a safer scoped
handoff.

Contract:

- Inputs: confirmed module, BA entities when available, module scope, and
  business terminology.
- Expected output: `DomainEntity`, `DomainAttribute`, `Enumeration`,
  `EnumValue`, `REALIZED_AS`, `TYPED_AS`, and relationship records or a
  graph-ready change plan.
- Downstream consumer: roles, use cases, forms, and requirements.
- Gate: review each module's domain structure before the next module or Phase 3.

### Phase 3: Roles

Coordinate system roles, permissions, and BA role mapping when BA graph context
exists.

Contract:

- Inputs: confirmed modules, domain structure, BA roles, and user facts.
- Expected output: `SystemRole` records and permission or mapping relationships
  including `MAPPED_TO` and `HAS_PERMISSION {crud}`, or a graph-ready change
  plan.
- Downstream consumer: use case registry.
- Gate: review role and permission coverage before Phase 4.

### Phase 4: Use Case Stories

Coordinate use case registry creation with user stories, acceptance criteria,
priorities, modules, and actors.

Contract:

- Inputs: confirmed modules, roles, BA automation candidates, and user facts.
- Expected output: `UseCase` records and actor or module relationships or a
  graph-ready change plan. BA automation candidates are `WorkflowStep` records
  marked `stereotype='Автоматизируется'` and missing `AUTOMATES_AS`.
- Downstream consumer: use case detail phase.
- Gate: review use case registry and priority selection before Phase 5.

### Phase 5: Use Case Detail

For each primary use case, coordinate detailed activity flow, forms, field
mapping, requirements, and dependencies. Secondary use cases are detailed only
when the user confirms that scope.

Contract:

- Inputs: confirmed use case, `AUTOMATES_AS` BA context, role set, domain
  structure, BA rules, and acceptance criteria.
- Expected output: `ActivityStep`, `Form`, `FormField`, functional
  `Requirement`, `HAS_STEP`, `USES_FORM`, `HAS_FIELD`, `MAPS_TO`,
  `HAS_REQUIREMENT`, and `IMPLEMENTED_BY` records or a graph-ready change plan.
- Downstream consumer: UI and validation phases.
- Gate: review each detailed use case before continuing.

### Phase 6: UI

Coordinate UI structure, component reuse, form-domain mapping checks, and
navigation.

Contract:

- Inputs: confirmed forms, fields, domain attributes, roles, and use cases.
- Expected output: `Component` records, `USED_IN` relationships, navigation
  component properties, repaired `MAPS_TO` edges when confirmed, or a
  graph-ready change plan.
- Downstream consumer: validation and publication.
- Gate: review UI structure before Phase 7.

### Phase 7: Validation

Run available SA validation procedures against the graph or graph-ready plan.
Check module completeness, use case completeness, domain binding, role coverage,
requirement binding, disconnected records, and BA-to-SA cross-checks when BA
graph context exists.

Report each check with the closed vocabulary. Critical findings require a user
decision before fixes are applied or the workflow advances.

### Phase 8: Finalize

Coordinate statistics, architecture decisions, readiness assessment, and open
questions.

Contract:

- Inputs: validated SA graph or graph-ready plan.
- Expected output: `FinalizationReport`, decision records when needed, readiness
  summary, and open-question list.
- Downstream consumer: publishing or TL planning.
- Gate: review final readiness before optional Phase 9 or Phase 10.

### Phase 9: Publish Option

Publishing is optional. Run it only when publishing tools are available and the
user confirms.

If publishing is not executed, report `NOT_RUN` with reason. If publishing output
cannot be checked, report `UNVERIFIED`.

### Phase 10: TL Handoff Option

TL planning is optional. Before offering handoff, verify that validation evidence
exists, primary use cases are detailed, and core graph records are present. If
readiness cannot be checked, report `UNVERIFIED`.

Run TL planning only when the user confirms and the required procedure or tools
are available.

## Read-Back And Status Rules

After every phase that writes graph data, inspect the downstream output and read
back the relevant subgraph before opening the next phase gate. Use named queries
where relevant: `sa_module_overview`, `sa_domain_model`,
`sa_uc_full_context`, `sa_form_domain_mapping`, `sa_uc_dependencies`,
`sa_statistics_summary`, `sa_readiness_assessment`, `sa_feature_scope`, and
handoff coverage queries.

If a specialist phase returns `FAILED`, stop and report the failing contract. If
it returns `BLOCKED`, identify the missing input, tool, permission, or
confirmation. If it returns `PARTIALLY_VERIFIED` or `UNVERIFIED`, ask the user
whether to proceed with known risk before advancing. If a phase is intentionally
skipped, record `NOT_RUN` with a reason.

## Capabilities

### May Do

- Coordinate full SA graph specification through phase contracts and gates.
- Read workspace configuration, schemas, queries, and existing graph state when
  available.
- Use supported graph tools or downstream procedures when available.
- Review downstream output before advancing workflow state.

### Must Not Do

- Assume isolated delegation exists.
- Select or constrain the runtime.
- Modify source root skill folders.
- Write graph data, edit files, publish, start TL planning, or advance major
  phases without user confirmation.
- Use statuses outside the closed verification vocabulary.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling and confirmed scope.
- File reads require workspace access.
- File edits require writable workspace access and explicit user confirmation.
- Publishing and TL planning require configured tooling and explicit user
  confirmation.
- Delegation is conditional on Codex-supported mechanisms available in the
  current environment.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required inputs, tools, permissions, infrastructure, or
  confirmation are unavailable.
- Use `NOT_RUN` when a phase is intentionally not executed.
- Use `PARTIALLY_VERIFIED` when only some required checks ran.
- Use `UNVERIFIED` when downstream output or graph state cannot be checked.
- Use `FAILED` with a reason when a phase violates its contract.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-full/SKILL.md`

### Preserved Methodology

- Ten-phase SA workflow from architecture through optional publish and TL
  handoff.
- User facts and confirmed BA context as inputs.
- Graph-first specification and BA-to-SA traceability checks.
- Validation and final readiness review before handoff.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Assumed isolated phase execution.
- Source-specific execution commands for unsupported delegation.
- Open-ended status labels outside the closed vocabulary.

### Codex Replacement Behavior

- Coordinate phases with explicit contracts and inspected outputs.
- Treat graph, file, publishing, planning, and delegation actions as
  conditional.
- Preserve every major phase as a user-facing confirmation gate.
- Report blocked, incomplete, not-run, or unchecked outcomes with the closed
  vocabulary.
