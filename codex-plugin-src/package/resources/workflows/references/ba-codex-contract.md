# BA Codex Contract

This reference is shared by Codex-adapted `nacl-ba-*` skills. It preserves the
graph-first BA methodology from the source skills while making every tool,
write, and verification step explicit for Codex.

## Closed Status Set

Top-level BA status must be exactly one of:

- `VERIFIED`
- `FAILED`
- `PARTIALLY_VERIFIED`
- `BLOCKED`
- `NOT_RUN`
- `UNVERIFIED`

Use reason and details fields for nuance. Do not invent local status labels.

## Canonical BA Graph Vocabulary

Read `graph-infra/schema/ba-schema.cypher` and
`graph-infra/queries/ba-queries.cypher` before graph-aware work when file access
is available.

Node labels:

- `SystemContext`, `Stakeholder`, `ExternalEntity`, `DataFlow`
- `ProcessGroup`, `BusinessProcess`, `WorkflowStep`
- `BusinessEntity`, `EntityAttribute`, `EntityState`
- `BusinessRole`, `BusinessRule`, `GlossaryTerm`

BA relationships:

- `HAS_STAKEHOLDER`, `HAS_EXTERNAL_ENTITY`, `HAS_FLOW`
- `CONTAINS`, `HAS_STEP`, `TRIGGERS`, `CALLS_SUB`, `NEXT_STEP`
- `PERFORMED_BY`, `OWNS`, `PARTICIPATES_IN`
- `READS`, `PRODUCES`, `MODIFIES`
- `HAS_ATTRIBUTE`, `HAS_STATE`, `TRANSITIONS_TO`, `RELATES_TO`
- `CONSTRAINS`, `APPLIES_IN`, `AFFECTS`, `APPLIES_AT_STEP`
- `DEFINES`, `ALIAS_OF`

BA to SA handoff relationships:

- `AUTOMATES_AS`, `REALIZED_AS`, `MAPPED_TO`, `IMPLEMENTED_BY`, `SUGGESTS`

Named query expectations include:

- `ba_all_processes`, `ba_workflow_steps`, `ba_entity_with_attributes`
- `ba_entity_lifecycle`, `ba_role_participation`, `ba_rules_for_entity`
- `ba_automation_scope`, `ba_system_context`, `ba_process_map`
- `ba_entity_crud_matrix`, `ba_role_process_matrix`
- `ba_glossary_coverage`, `ba_rules_catalog`
- `ba_all_entities`, `ba_all_roles`, `ba_all_glossary_terms`
- `handoff_traceability_matrix`, `handoff_uncovered_ba_steps`
- `handoff_uncovered_entities`, `handoff_coverage_stats`

## Graph Writer Contract

Every BA skill that writes graph data must execute this sequence in order:

1. Resolve project configuration from `config.yaml` when available.
2. Read BA schema and relevant named-query files when available.
3. Check graph read and write tool availability. If required graph tools are
   unavailable, report `BLOCKED` and provide a graph-ready change plan instead
   of pretending persistence happened.
4. Load prerequisites and existing target records. If required graph data is
   missing, report `BLOCKED` and name the missing prerequisite.
5. Build a candidate change set with labels, IDs, properties, relationships,
   and source evidence.
6. Show the candidate change set to the user and stop for explicit confirmation.
7. After confirmation, write only the confirmed graph changes.
8. Run read-back verification by ID, relationship type, and expected counts.
9. Report observed write counts, read-back evidence, skipped items, failures,
   and final closed-vocabulary status.

Confirmation to collect facts is not confirmation to write. A new session or
lost context invalidates a pending confirmation gate.

## Read-Only Contract

Validation and analysis skills must not write graph data. If they inspect graph
state, they use read access only and report graph unavailability as `BLOCKED`,
`PARTIALLY_VERIFIED`, or `NOT_RUN` according to the requested scope.

## Board Lifecycle Contract

Board-aware BA skills must:

- resolve `graph.boards_dir` from `config.yaml`, falling back to
  `graph-infra/boards`;
- parse Excalidraw JSON structurally, including `elements`, deleted flags,
  bound text, arrow bindings, and `customData`;
- preserve `customData.nodeId`, `customData.nodeType`,
  `customData.confidence`, `customData.synced`, `sourceDoc`, and `sourcePage`
  when present;
- keep snapshots under `<boards_dir>/.snapshots/`;
- keep reports under `<boards_dir>/.reports/` only when the user requests file
  output;
- update `<board>.meta.json` only according to the board sync contract;
- never claim sync unless graph write and read-back verification succeeded.

## Orchestrator Contract

Orchestrator skills coordinate specialist skills. They must:

- perform Phase 0 resume, active-board, or graph-state detection before asking
  which phase to run;
- state each phase contract: inputs, expected graph or board output, downstream
  consumer, allowed status values, and gate condition;
- inspect delegated output before advancing;
- stop after each major phase for user confirmation;
- never write graph data directly when a specialist skill owns that write.

## Final Report Contract

BA skills must report:

- inputs and evidence used;
- graph or board prerequisites checked;
- candidate changes shown and confirmation status;
- writes performed or `NOT_RUN`;
- read-back or structural verification evidence;
- skipped checks and blockers;
- final status from the closed status set.
