---
name: nacl-sa-uc
description: |
  Create and detail NaCl use cases in the SA graph from BA automation scope:
  registry, activity steps, forms, form fields, mappings, and requirements.
  Use when creating UC stories, detailing a UC, listing UCs, or for
  compatibility with `/nacl-sa-uc`.
---

# NaCl SA UC For Codex

Create and detail use cases in the graph. The graph is the SA artifact; Russian
is the default language for user-facing SA descriptions unless the user
explicitly requests another supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Commands:

- `stories`: create a UC registry from BA `WorkflowStep` nodes marked for
  automation and not yet connected by `AUTOMATES_AS`.
- `detail <UC-ID>`: detail one use case with activity steps, forms, form
  fields, mappings, and requirements.
- `list`: read-only UC registry view with detail coverage.

`stories` flow:

1. Read uncovered automated workflow steps, existing modules, existing roles,
   and existing UC ranges.
2. Propose UC candidates, module placement, primary actor, priority, and
   BA-to-SA `AUTOMATES_AS` edges.
3. Stop for explicit confirmation.
4. Write `UseCase`, `CONTAINS_UC`, `AUTOMATES_AS`, and optional `ACTOR` edges.
5. Read back created UCs and report status.

`detail` flow:

1. Load UC, actor, module, BA workflow context, BA rules, related BA entities,
   realized domain entities, and existing detail counts.
2. If detail already exists, show counts and stop for confirmation before
   updating.
3. Propose activity steps, alternative flows, and form references. Stop before
   writing `ActivityStep` nodes and `HAS_STEP` edges.
4. Propose forms and fields. Every data-bearing `FormField` must map to a
   `DomainAttribute`; display and action fields must be categorized explicitly.
   Stop before writing `Form`, `FormField`, `USES_FORM`, `HAS_FIELD`, and
   `MAPS_TO`.
5. Propose requirements derived from BA rules, validation needs, and behavior.
   Stop before writing `Requirement`, `HAS_REQUIREMENT`, and `IMPLEMENTED_BY`.
6. **Runtime Contract phase (Phase 4.5).** Run the decision tree from
   `nacl-sa-uc/references/runtime-contract.cypher` § 7 against the UC. If the
   UC has queue / workflow / long-running / async-provider / recoverable
   characteristics, a `RuntimeContract` subgraph is MANDATORY. Stop before
   writing the contract. See the Runtime Contract section below for required
   fields, worked examples, and write templates.
7. Verify the full UC subgraph, including steps, forms, mapped data fields,
   requirements, actors, BA traceability, and (when present) the
   `RuntimeContract` subgraph.

Use SA id conventions from the graph or schema: `UC-NNN`, `{UC}-ASNN`,
`FORM-*`, `{FORM}-FNN`, and `RQ-NNN`.

## Graph Contract

`stories` must derive candidates from
`BusinessProcess -[:HAS_STEP]-> WorkflowStep` records where
`WorkflowStep.stereotype='Автоматизируется'` and no
`WorkflowStep -[:AUTOMATES_AS]-> UseCase` edge exists. Existing modules, UC
ranges, and roles must be read before proposing ids or actors.

`detail` must preserve the BA-to-SA chain:
`WorkflowStep -[:AUTOMATES_AS]-> UseCase -[:USES_FORM]-> Form -[:HAS_FIELD]-> FormField -[:MAPS_TO]-> DomainAttribute`.
BA rules become requirements through `BusinessRule -[:IMPLEMENTED_BY]-> Requirement`
and `UseCase -[:HAS_REQUIREMENT]-> Requirement`.

Canonical writes are `UseCase`, `ActivityStep`, `Form`, `FormField`,
`Requirement`, `RuntimeContract`, `RuntimeState`, `RuntimeTransition`,
`RuntimeEvent`, `RuntimeLock`, `IdempotencyKey`, `RecoveryProcedure`,
`CONTAINS_UC`, `AUTOMATES_AS`, `ACTOR`, `DEPENDS_ON`, `HAS_STEP`,
`USES_FORM`, `HAS_FIELD`, `MAPS_TO`, `HAS_REQUIREMENT`, `IMPLEMENTED_BY`,
`CONTAINS_RUNTIME_CONTRACT`, `HAS_STATE`, `HAS_INITIAL_STATE`,
`HAS_TERMINAL_STATE`, `HAS_TRANSITION`, `FROM_STATE`, `TO_STATE`,
`ACQUIRES_LOCK`, `EMITS_EVENT`, `RESOLVES_RACE_WITH`,
`USES_IDEMPOTENCY_KEY`, and `HAS_RECOVERY`. Before each write batch, show
the proposed ids, properties, source BA evidence, and relationship targets;
after writes, read back with `sa_uc_full_context`, form-domain mapping
checks, and (when present) the RuntimeContract read-back in
`nacl-sa-uc/references/runtime-contract.cypher` § 6.

## Runtime Contract (Phase 4.5)

Mandatory for any UC with queue / workflow / long-running / async-provider
/ recoverable characteristics. Captures the durable state machine,
transaction boundaries, locks, emitted events (pre-commit vs post-commit),
retry semantics, cancel-while-X race resolution, recovery procedure after
process crash, and idempotency key strategy.

Worked examples that drive this phase:

- **Project-Alpha UC-112 "restart-after-failed-with-running-tasks" silent
  no-op.** Pressing Restart on a failed task returned 200 but the task
  stayed `failed` because `INSERT … ON CONFLICT DO NOTHING` suppressed
  the re-enqueue silently. The UC spec was silent on the `failed → pending`
  transition's pre-condition (delete the previous `queue_items` row in
  the same transaction) and on the 409 `TASK_NOT_RESTARTABLE` branch.
- **Project-Beta UC-107 / UC-150 / UC-202 "cancel-while-failing race".**
  Worker commit TX missed a row-level `FOR UPDATE` lock; cancel and fail
  fired concurrently against the same row, terminal-state ordering was
  unspecified, both writes won non-deterministically.

### Decision tree (mandatory?)

A RuntimeContract is mandatory if any of:

1. The UC has a `System`-type ActivityStep referencing queue / worker /
   async / job / poll / schedule / cron / outbox / saga / restart / retry
   / cancel.
2. The UC produces or modifies a `BusinessEntity` with a `status` /
   `state` / `lifecycle` / `phase` attribute.
3. The UC calls an external provider marked async / long-running
   (provider linkage lands in W6; until then, ask the user explicitly).
4. The UC has a `behavioral`-type Requirement mentioning retry / restart
   / cancel / recover / resume / idempotent.
5. The UC has a `DEPENDS_ON` edge to a UC named worker / queue /
   dispatcher / scheduler.

Run the decision-tree query in
`nacl-sa-uc/references/runtime-contract.cypher` § 7, present the verdict,
and confirm with the user before BLOCKING.

### Required fields (all eight)

| # | Field | Where |
|---|---|---|
| 1 | State machine (states + transitions) | `RuntimeState`, `RuntimeTransition` |
| 2 | DB transaction boundary per transition | `RuntimeTransition.txn_boundary` ∈ single_tx / no_tx / saga / outbox |
| 3 | Lock acquisition strategy | `RuntimeTransition.lock_strategy` + `RuntimeLock` + `ACQUIRES_LOCK` |
| 4 | Emitted events with pre-commit / post-commit lifecycle | `RuntimeEvent.lifecycle` + `EMITS_EVENT` |
| 5 | Retry semantics per transition | `RuntimeTransition.retry_policy` + `retry_parameters` JSON |
| 6 | Cancel-while-X race resolution | `RuntimeTransition.cancel_race_note` + `RESOLVES_RACE_WITH` edges |
| 7 | Recovery procedure after process crash | `RecoveryProcedure` + `HAS_RECOVERY` |
| 8 | Idempotency key strategy | `IdempotencyKey` + `USES_IDEMPOTENCY_KEY` + per-transition `idempotency_key_ref` |

A contract that omits any of the eight is `BLOCKED — runtime_contract_incomplete`.

### Disambiguation — Requirement vs RuntimeContract

A `Requirement` is a statement ("the system must cancel running tasks");
a `RuntimeContract` is the operational machine that proves a class of
behavioral Requirements. The Requirement node stays; the contract holds
the actual `retry_policy`, lock strategy, cancel-race rule, etc. Link
related Requirement and RuntimeTransition with `IMPLEMENTED_BY` when the
relationship is direct.

### Authoring and read-back

Use the write templates in `nacl-sa-uc/references/runtime-contract.cypher`
§ 5.1 through § 5.6 (root, states, transitions, locks/events, race
edges, idempotency + recovery). ID convention: `{UC}-RC`, `{UC}-RC-S{NN}`,
`{UC}-RC-T{NN}`, `{UC}-RC-E{NN}`, `{UC}-RC-L{NN}`, `{UC}-RC-IK{NN}`,
`{UC}-RC-R{NN}`. Read back with § 6 before advancing. If any of the
eight required fields is missing, refuse to advance.

## Capabilities

### May Do

- Read BA automation scope, roles, entities, rules, and existing SA graph data.
- Propose UC registry entries and detailed UC subgraphs.
- Write UC, activity, form, field, mapping, requirement, actor, traceability,
  and `RuntimeContract` subgraph data after confirmation.
- Verify data-field `MAPS_TO` completeness for detailed UCs.
- Run the Runtime Contract decision tree and refuse to mark a queue / workflow
  / long-running / async-provider / recoverable UC as `detailed` until a
  complete `RuntimeContract` subgraph exists.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without confirmation.
- Create data-bearing fields without a domain attribute mapping unless the user
  explicitly marks them as non-input or defers the gap.
- Mark a UC as `detailed` when the Runtime Contract decision tree returns
  mandatory and no `RuntimeContract` subgraph exists, or exists but omits any
  of the eight required fields.
- Treat markdown files as the SA source of truth.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema and query inspection require readable project files.
- Detailing may be `BLOCKED` when the domain structure, role mapping needed
  for traceability, or required `RuntimeContract` subgraph is absent.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, UC identity, BA source data, domain
  attributes, role mappings, confirmation, or a required `RuntimeContract`
  subgraph (`runtime_contract_missing` / `runtime_contract_incomplete`) is
  missing.
- Use `PARTIALLY_VERIFIED` when the UC subgraph is written but only part of the
  traceability or RuntimeContract read-back runs.
- Use `UNVERIFIED` when UC completeness cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-uc/SKILL.md`

### Preserved Methodology

- `stories`, `detail`, and `list` commands.
- Russian SA artifact language by default.
- BA automation scope to UseCase registry.
- Activity, form, field, requirement, actor, and Runtime Contract subgraph
  detailing.
- Critical `FormField` to `DomainAttribute` traceability.
- Mandatory `RuntimeContract` for queue / workflow / long-running /
  async-provider / recoverable UCs (Phase 4.5; W8-runtime-fsm).

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Slash-command-only invocation wording.
- Source runtime assumptions as active instructions.

### Codex Replacement Behavior

- Make graph access conditional and explicit.
- Stop at each write boundary for confirmation.
- Use closed verification vocabulary for UC read-back.
- Keep graph data as source of truth.
