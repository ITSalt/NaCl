---
name: nacl-sa-uc
description: |
  Create and detail NaCl use cases in the SA graph from BA automation scope:
  registry, activity steps, forms, form fields, mappings, requirements,
  behavior slices (graph-native Given/When/Then acceptance scenarios), and
  domain errors (transport-independent error taxonomy).
  Use when creating UC stories, detailing a UC, authoring behavior slices,
  authoring domain errors, listing UCs, or for compatibility with `/nacl-sa-uc`.
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
- `slices <UC-ID>`: author or modify the behavior slices of one UC —
  graph-native acceptance scenarios (Given/When/Then) anchored to the screen
  state machine and endpoints, verified by tasks.
- `errors <UC-ID>`: author or modify the domain errors observable through one
  UC's API surface — a transport-independent, module-scoped taxonomy
  (`DomainError` + `MAY_RAISE`), with screen handling (`HANDLES`) and
  user-facing presentations (`PRESENTED_AS` / `SHOWS`).
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

`slices` flow:

1. Load UC context: `has_ui`, `acceptance_criteria`, screen machine
   (`sa_screen_machine`), `EXPOSES` endpoints, `GENERATES` tasks, existing
   slices (`sa_uc_slices`). Guards: a UI UC without a Screen → STOP and
   require `/nacl-sa-ui state-machine` first (slices must not float);
   `has_ui=false` → CALLS-only anchoring.
2. Propose slices from acceptance_criteria (when present) → activity steps +
   requirements → the machine → the RuntimeContract. Treat placeholder
   ActivitySteps (`"--"`, no order) as absent. Backend-only priority:
   RuntimeContract transitions → Requirements → ActivitySteps; if the UC looks
   queue/async but has no RuntimeContract subgraph, warn (recommend `detail`
   Phase 4.5) and author from Requirements — never invent the contract.
   Canonical decompositions: data-loading screen → HappyPath / EmptyResult /
   LoadFailureRetry; process screen → HappyPath / FailureRetry (+ per-stage
   edge slices); backend-only UC → one slice per observable API behavior,
   with one provisional endpoint per distinct backend operation (trigger vs
   status are separate; slices share endpoints — never one endpoint per
   slice). Backend-resilience kinds: recovery/degradation → `alternate`,
   observed failure → `error`, idempotency/race/boundary → `edge`.
   Stop for confirmation.
3. Write `Slice` nodes (MERGE on `SLC-{NNN}-{PascalName}`; latin PascalName,
   non-blank `then`) with `HAS_SLICE`, `COVERS -> ScreenState|Transition`
   (own UC's screen only), `(sl:Slice)-[:CALLS]-> APIEndpoint` (provisional
   endpoint + `EXPOSES` anchor when none exists), and `VERIFIED_BY -> Task`
   — default rule: all of the UC's `GENERATES` tasks; refine to BE/FE tasks
   only when task ids carry the canonical `-BE`/`-FE` suffixes. Every slice
   must have at least one anchor (COVERS and/or CALLS) — no exemption.
4. Bump `spec_version`; stamp staleness DIRECTED (same contract as
   `nacl-sa-feature` 3g: the UC's tasks + tasks of transitive
   `DEPENDS_ON*1..5` dependents + the UC itself; `stale_origin` = the UC id;
   report `count(DISTINCT ...)`) — never via the broad `sa_impact_closure`.
5. Run scoped L11 checks (anchor on the UC; for L11.0/11.1 filter
   `sl.id STARTS WITH 'SLC-NNN-'`); fix CRITICAL findings before completing;
   report slices, anchors, machine coverage, stamp counts.

`errors` flow:

1. Load UC context: module (`CONTAINS_UC`), `EXPOSES` endpoints, screen
   machine, slices (`sa_uc_slices` — error-kind slices are candidates),
   requirements (real graphs carry explicit codes like `404 PROMO_NOT_FOUND`
   in requirement text), the module's existing error catalog, and the
   RuntimeContract in BOTH formats — current `CONTAINS_RUNTIME_CONTRACT`
   subgraph AND legacy `HAS_RUNTIME_CONTRACT` flat string properties (hints
   only; never anchor to RC nodes, never invent contract structure).
   Guards: UC without a Module → STOP (the catalog is module-owned — wire
   `CONTAINS_UC` first); `has_ui=false` → MAY_RAISE-only mode (no handling,
   no presentations — the envelope IS the presentation); UI UC without a
   Screen → WARN and proceed taxonomy-only (the endpoint anchor exists
   regardless; L12.7 self-signals the handling gap once the machine exists).
2. Propose errors from requirements → error-kind slices → RC hints → the
   machine's error states. One `DomainError` per code the API envelope can
   distinguish; field-level validation is ONE `VALIDATION_FAILED`. Codes are
   domain-prefixed UPPER_SNAKE latin (`PROMO_NOT_FOUND`, never `NOT_FOUND`).
   error_kind ∈ validation|not_found|conflict|permission|rate_limit|external|
   internal (transport-independent; http_status is only a hint). For each
   UI-handled error propose ≥1 presentation: user-language message (never the
   internal code), kind ∈ toast|banner|inline|modal|fullscreen|silent
   (deliberate silence = a silent-kind presentation whose message documents
   the observable absence). Stop for confirmation.
3. Write `DomainError` (MERGE on `ERR-{UPPER_SNAKE_CODE}` — shared errors are
   never duplicated, foreign-module errors never re-parented) with
   `(:Module)-[:HAS_ERROR]->`; `(api)-[:MAY_RAISE]->(err)` per raising
   endpoint (provisional endpoint + `EXPOSES` anchor when none exists; one
   endpoint per distinct backend operation); `(st:ScreenState)-[:HANDLES]->`
   only where the channel rule holds (the state's screen has a
   ScreenEffect-CALLS to a raising endpoint); `ErrorPresentation`
   (`ERRP-{CODE}-{PascalName}`, non-blank message) with `PRESENTED_AS` and
   `SHOWS` only from handling states (triangle closure). Collect every
   written err id. MODIFY deletions by explicit id only; never delete an
   error other UCs still raise — remove only your own MAY_RAISE edges.
4. Bump `spec_version`; stamp staleness DIRECTED (same contract as
   `nacl-sa-feature` 3g; `stale_origin` = the UC id). If the run MODIFIED
   properties of a shared error (raised by other UCs' endpoints), also stamp
   with the same two-statement 3g shape, `stale_origin` = the error id:
   first the tasks of raisers + their `DEPENDS_ON*1..5` dependents, then
   ONLY the raiser UC nodes themselves (dependent UCs get their tasks
   stamped, never the UC node) — computed directionally via
   `(err)<-[:MAY_RAISE]-(api)<-[:EXPOSES]-(raiser)`, never the broad closure.
5. Run scoped L12 checks (`WHERE err.id IN $errIds` — errors are NOT
   UC-scoped, there is no id-infix recipe); fix CRITICAL findings before
   completing; report errors, anchors, handling, presentations, stamp counts.

Use SA id conventions from the graph or schema: `UC-NNN`, `{UC}-ASNN`,
`FORM-*`, `{FORM}-FNN`, `RQ-NNN`, `SLC-{NNN}-{PascalName}`,
`ERR-{UPPER_SNAKE_CODE}`, and `ERRP-{CODE}-{PascalName}`.

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
`Slice`, `DomainError`, `ErrorPresentation` (plus provisional `APIEndpoint`
from the slices/errors commands),
`CONTAINS_UC`, `AUTOMATES_AS`, `ACTOR`, `DEPENDS_ON`, `HAS_STEP`,
`USES_FORM`, `HAS_FIELD`, `MAPS_TO`, `HAS_REQUIREMENT`, `IMPLEMENTED_BY`,
`CONTAINS_RUNTIME_CONTRACT`, `HAS_STATE`, `HAS_INITIAL_STATE`,
`HAS_TERMINAL_STATE`, `HAS_TRANSITION`, `FROM_STATE`, `TO_STATE`,
`ACQUIRES_LOCK`, `EMITS_EVENT`, `RESOLVES_RACE_WITH`,
`USES_IDEMPOTENCY_KEY`, `HAS_RECOVERY`, `HAS_SLICE`, `COVERS`, `CALLS`
(label-qualify the source — the name is shared with
`ScreenEffect -> APIEndpoint`), `VERIFIED_BY`, `EXPOSES`
(provisional-endpoint path only), `HAS_ERROR`, `MAY_RAISE`, `HANDLES`,
`PRESENTED_AS`, and `SHOWS` (all five error-taxonomy names unshared). Before each write batch, show
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
- Author behavior slices anchored to the screen machine / endpoints and link
  them to verifying tasks after confirmation.
- Author module-scoped domain errors with raising endpoints, screen handling,
  and user-facing presentations after confirmation.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without confirmation.
- Create data-bearing fields without a domain attribute mapping unless the user
  explicitly marks them as non-input or defers the gap.
- Mark a UC as `detailed` when the Runtime Contract decision tree returns
  mandatory and no `RuntimeContract` subgraph exists, or exists but omits any
  of the eight required fields.
- Write a Slice with no behavioral anchor (no COVERS and no CALLS) or with a
  blank `then` — anchorless behavior text belongs in `acceptance_criteria`.
- Author slices for a UI UC that has no Screen (state machine first).
- Write a DomainError with no raising endpoint (MAY_RAISE), a blank `code`, or
  for a UC that has no Module; duplicate a shared error instead of MERGE by
  id; delete an error other UCs still raise; write HANDLES without the call
  channel or SHOWS without HANDLES; put the internal code into a
  presentation `message`.
- Stamp staleness via the broad undirected `sa_impact_closure` traversal.
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

- `stories`, `detail`, `slices`, and `list` commands.
- Behavior slices: anchor invariant (COVERS/CALLS), VERIFIED_BY task rule,
  directed 3g staleness stamp, scoped L11 validation.
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
