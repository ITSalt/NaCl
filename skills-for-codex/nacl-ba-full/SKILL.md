---
name: nacl-ba-full
description: |
  Coordinate complete NaCl BA graph creation through phased Codex orchestration
  with explicit handoff contracts and user confirmation gates. Use when creating
  a full BA graph, complete business analysis, or compatibility with
  `/nacl-ba-full`.
---

# NaCl BA Full For Codex

Coordinate full BA graph creation without assuming a separate isolated runner.
BA artifacts remain Russian where the NaCl methodology requires Russian.

Read `../references/orchestration-model.md`,
`../references/migration-rules.md`, `../references/verification-vocabulary.md`,
`../references/ba-codex-contract.md`, and `../nacl-core/SKILL.md` before
executing this skill.

## Contract

Inputs consumed:

- user-provided business facts, goals, boundaries, constraints, and open
  questions;
- existing BA graph records when graph access is available;
- BA graph schema and query references when file access is available;
- downstream phase reports using the closed verification vocabulary.

Outputs produced:

- phased BA progress report using only the closed vocabulary;
- graph change requests or graph updates when graph tooling is available and
  confirmed;
- reviewed downstream output summaries for each phase;
- BA-to-SA handoff readiness report.

Downstream consumers:

- human user;
- SA workflow;
- publishing workflow;
- graph query or visualization workflows.

## Orchestration Rules

- Use the shared Codex orchestration procedure from
  `../references/orchestration-model.md`.
- Apply the BA orchestrator contract from `../references/ba-codex-contract.md`.
- Each phase handoff must state inputs consumed, expected graph output, allowed
  verification status, downstream consumer, and handling for `VERIFIED`,
  `FAILED`, `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`, and `UNVERIFIED`.
- Run, invoke, or simulate downstream procedures only when the current Codex
  environment supports the needed tools.
- Collect and inspect downstream output before changing progress state or
  opening the next phase gate.
- Stop after each phase and ask the user whether to proceed to the next phase.
- Do not write graph data, modify files, publish, or move to the next major
  phase without explicit user confirmation.
- Never mark a delegated phase complete until its output has been inspected and
  its graph or graph-ready evidence is compatible with the phase contract.

## Workflow

### Phase 0: Resume And Scope

Check `config.yaml`, schema availability, and graph tool availability when file
or graph access exists. Detect existing BA graph state for `SystemContext`,
`ProcessGroup`, `BusinessProcess`, `WorkflowStep`, `BusinessEntity`,
`BusinessRole`, `GlossaryTerm`, `BusinessRule`, `ValidationReport`, and
`HandoffPackage`.

Report detected state with closed vocabulary. Stop and ask the user to confirm
the starting phase.

If graph tools are unavailable, Phase 0 must still inspect file-based schema and
query references where possible, then report graph state as `BLOCKED` or
`UNVERIFIED` and continue only with a graph-ready plan approved by the user.

### Phase 1: Context

Use the `nacl-ba-context` procedure when the current environment can execute
that specialist contract; otherwise run the same phase locally and report the
missing mechanism as `BLOCKED` or `UNVERIFIED`.

Contract:

- Inputs: user facts, current graph state, BA schema.
- Expected output: `SystemContext`, `Stakeholder`, `ExternalEntity`, and
  `DataFlow` records or a graph-ready change plan.
- Downstream consumer: process discovery.
- Gate: review scope, stakeholders, external entities, and data flows with the
  user before Phase 2.

### Phase 2: Business Processes

Coordinate process group and business process creation.

Contract:

- Inputs: confirmed context, business goals, stakeholder interactions.
- Expected output: `ProcessGroup`, `BusinessProcess`, and process relationship
  records or a graph-ready change plan.
- Downstream consumer: workflow decomposition.
- Gate: review process map coverage before Phase 3.

### Phase 3: Workflows

For each decomposed business process, coordinate workflow creation sequentially.

Contract:

- Inputs: confirmed business process, actors, artifacts, decisions, and known
  automation candidates.
- Expected output: `WorkflowStep` records and workflow relationships or a
  graph-ready change plan.
- Downstream consumer: business entity and role catalogs.
- Gate: review each workflow before starting the next workflow or Phase 4.

### Phase 4: Business Entities

Coordinate business object cataloging from workflows and user facts.

Contract:

- Inputs: confirmed workflows and referenced artifacts.
- Expected output: `BusinessEntity`, `EntityAttribute`, `EntityState`, and
  entity-process relationship records or a graph-ready change plan.
- Downstream consumer: role, glossary, and rule phases.
- Gate: review entity catalog and matrix before Phase 5.

### Phase 5: Business Roles

Coordinate role discovery and role-process mapping.

Contract:

- Inputs: confirmed processes, workflows, actors, and responsibilities.
- Expected output: `BusinessRole` records and role relationship records or a
  graph-ready change plan.
- Downstream consumer: glossary, rules, and SA role mapping.
- Gate: review role registry and responsibility coverage before Phase 6.

### Phase 6: Glossary

Coordinate glossary construction and synonym resolution.

Contract:

- Inputs: confirmed BA graph terms, user terminology, and unresolved wording.
- Expected output: `GlossaryTerm` records and terminology relationships or a
  graph-ready change plan.
- Downstream consumer: validation and publication.
- Gate: review terms and definitions before Phase 7.

### Phase 7: Business Rules

Coordinate business rule extraction, classification, and binding.

Contract:

- Inputs: confirmed workflows, entities, roles, glossary, constraints, and
  calculations.
- Expected output: `BusinessRule` records and rule binding relationships or a
  graph-ready change plan.
- Downstream consumer: validation and BA-to-SA handoff.
- Gate: review rule catalog before Phase 8.

### Phase 8: Validation

Run available BA validation procedures against the graph or graph-ready plan.
Check process completeness, workflow completeness, actor binding, artifact
binding, entity-process coverage, role-process coverage, glossary coverage, and
business rule binding.

Report each check with the closed vocabulary. Critical findings require a user
decision before fixes are applied or the workflow advances.

Validation is read-only. Repairs must be routed back through the owning writer
skill and confirmed before any mutation.

### Phase 9: BA-To-SA Handoff

Coordinate traceability and SA readiness preparation.

Contract:

- Inputs: validated BA graph or graph-ready plan.
- Expected output: `HandoffPackage`, traceability relationships, automation
  scope, and proposed SA grouping.
- Downstream consumer: `nacl-sa-full`.
- Gate: review handoff readiness before optional publishing or completion.

### Phase 10: Publish Option

Publishing is optional. Run it only when publishing tools are available and the
user confirms.

If publishing is not executed, report `NOT_RUN` with reason. If publishing output
cannot be checked, report `UNVERIFIED`.

## Capabilities

### May Do

- Coordinate full BA graph creation through phase contracts and gates.
- Read workspace configuration, schemas, queries, and existing graph state when
  available.
- Use supported graph tools or downstream procedures only after checking that
  the current environment can execute them.
- Review downstream output before advancing workflow state.

### Must Not Do

- Assume isolated delegation exists.
- Select or constrain the runtime.
- Modify source root skill folders.
- Write graph data, edit files, publish, or advance major phases without user
  confirmation.
- Use statuses outside the closed verification vocabulary.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling and confirmed scope.
- File reads require workspace access.
- File edits require writable workspace access and explicit user confirmation.
- Publishing requires configured publishing tooling and explicit user
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

- Source Claude skill path: `../../nacl-ba-full/SKILL.md`

### Preserved Methodology

- Ten-phase BA graph workflow from context through handoff and optional publish.
- User facts as the authority and user confirmation after each phase.
- Graph-first BA artifacts and BA-to-SA traceability.
- Resume detection and validation before handoff.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Assumed isolated phase execution.
- Source-specific execution commands for unsupported delegation.
- Open-ended status labels outside the closed vocabulary.

### Codex Replacement Behavior

- Coordinate phases with explicit contracts and inspected outputs.
- Treat graph, file, publishing, and delegation actions as conditional.
- Preserve every major phase as a user-facing confirmation gate.
- Report blocked, incomplete, not-run, or unchecked outcomes with the closed
  vocabulary.
