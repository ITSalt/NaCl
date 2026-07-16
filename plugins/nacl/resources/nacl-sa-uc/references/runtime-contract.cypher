// =============================================================================
// RuntimeContract — Neo4j Graph Schema (SA Layer, sa-uc owner)
// =============================================================================
// File: nacl-sa-uc/references/runtime-contract.cypher
// Wave: W8-runtime-fsm
// Description: Cypher template for the RuntimeContract subgraph attached to a
//              UseCase. A RuntimeContract captures the durable-state machine,
//              transaction boundaries, lock acquisition strategy, emitted
//              events (with pre-commit / post-commit lifecycle), retry
//              semantics, cancel-race resolution, recovery procedure, and
//              idempotency keys for any UC with queue / workflow /
//              long-running / async-provider / recoverable characteristics.
//
// Worked examples (see SKILL.md body):
//   - Project-Alpha UC-112 "restart-after-failed-with-running-tasks" silent no-op
//     (queue_items ON CONFLICT DO NOTHING; missing delete-before-reenqueue
//     transition; missing 409 TASK_NOT_RESTARTABLE branch).
//   - Project-Beta UC-107 / UC-150 / UC-202 "cancel-while-failing race"
//     (missing row-level FOR UPDATE lock during worker commit TX; terminal
//     state ordering between cancel and fail unspecified).
//
// SCOPE: this file is a template / schema reference. It is consumed by sa-uc
// `detail` Phase 4.5 (Runtime Contract). It is NOT a validator — that is the
// owner of nacl-sa-validate and out of scope for W8.
// =============================================================================


// ---------------------------------------------------------------------------
// 1. NODE LABELS
// ---------------------------------------------------------------------------
//
//   RuntimeContract       — root node attached to a UseCase, one per UC at most.
//   RuntimeState          — a state in the UC's durable FSM.
//   RuntimeTransition     — an edge between two RuntimeStates with policy.
//   RuntimeEvent          — an event emitted at a transition (pre/post-commit).
//   RuntimeLock           — a lock acquired during a transition.
//   IdempotencyKey        — an idempotency key strategy used by the UC.
//   RecoveryProcedure     — a recovery procedure after a process crash.
//
// All node IDs follow the SA-layer convention from nacl-sa-uc/SKILL.md.
//
//   RuntimeContract.id     = {UC}-RC                e.g. UC-112-RC
//   RuntimeState.id        = {UC}-RC-S{NN}          e.g. UC-112-RC-S01
//   RuntimeTransition.id   = {UC}-RC-T{NN}          e.g. UC-112-RC-T01
//   RuntimeEvent.id        = {UC}-RC-E{NN}          e.g. UC-112-RC-E01
//   RuntimeLock.id         = {UC}-RC-L{NN}          e.g. UC-112-RC-L01
//   IdempotencyKey.id      = {UC}-RC-IK{NN}         e.g. UC-112-RC-IK01
//   RecoveryProcedure.id   = {UC}-RC-R{NN}          e.g. UC-112-RC-R01


// ---------------------------------------------------------------------------
// 2. CONSTRAINTS (apply once per project; the actual constraint creation
// happens in graph-infra/schema/sa-schema.cypher — these are documentation
// of the unique-id contract this template assumes)
// ---------------------------------------------------------------------------

// CREATE CONSTRAINT constraint_runtimecontract_id
//   FOR (n:RuntimeContract) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_runtimestate_id
//   FOR (n:RuntimeState) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_runtimetransition_id
//   FOR (n:RuntimeTransition) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_runtimeevent_id
//   FOR (n:RuntimeEvent) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_runtimelock_id
//   FOR (n:RuntimeLock) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_idempotencykey_id
//   FOR (n:IdempotencyKey) REQUIRE n.id IS UNIQUE;
// CREATE CONSTRAINT constraint_recoveryprocedure_id
//   FOR (n:RecoveryProcedure) REQUIRE n.id IS UNIQUE;


// ---------------------------------------------------------------------------
// 3. EDGE TYPES
// ---------------------------------------------------------------------------
//
//   UseCase            -[:CONTAINS_RUNTIME_CONTRACT]->  RuntimeContract
//   RuntimeContract    -[:HAS_STATE]->                  RuntimeState
//   RuntimeContract    -[:HAS_INITIAL_STATE]->          RuntimeState
//   RuntimeContract    -[:HAS_TERMINAL_STATE]->         RuntimeState
//   RuntimeContract    -[:HAS_TRANSITION]->             RuntimeTransition
//   RuntimeContract    -[:USES_IDEMPOTENCY_KEY]->       IdempotencyKey
//   RuntimeContract    -[:HAS_RECOVERY]->               RecoveryProcedure
//
//   RuntimeTransition  -[:FROM_STATE]->                 RuntimeState
//   RuntimeTransition  -[:TO_STATE]->                   RuntimeState
//   RuntimeTransition  -[:ACQUIRES_LOCK]->              RuntimeLock
//   RuntimeTransition  -[:EMITS_EVENT]->                RuntimeEvent
//   RuntimeTransition  -[:RESOLVES_RACE_WITH]->         RuntimeTransition
//
// `RESOLVES_RACE_WITH` is the cancel-while-X edge: when transition A and
// transition B can fire concurrently against the same row, exactly one
// `RESOLVES_RACE_WITH` edge must exist between them describing the winner
// rule (lock_order, terminal_state_priority, last_writer_wins=false).


// ---------------------------------------------------------------------------
// 4. PROPERTY KEYS
// ---------------------------------------------------------------------------

// RuntimeContract:
//   id                  STRING        // "{UC}-RC"
//   uc_id               STRING        // back-reference to UseCase.id
//   mandatory_reason    STRING        // one of: queue, workflow, long_running,
//                                     // async_provider, recoverable
//   created             DATETIME
//   updated             DATETIME

// RuntimeState:
//   id                  STRING        // "{UC}-RC-S{NN}"
//   name                STRING        // e.g. "pending", "running", "failed",
//                                     // "succeeded", "cancelled"
//   is_initial          BOOLEAN
//   is_terminal         BOOLEAN
//   description         STRING

// RuntimeTransition:
//   id                  STRING        // "{UC}-RC-T{NN}"
//   name                STRING        // e.g. "enqueue", "claim", "complete",
//                                     // "fail", "cancel", "restart"
//   trigger             STRING        // one of: user, system, scheduler,
//                                     // worker, provider_callback, timeout
//   txn_boundary        STRING        // one of: single_tx, no_tx, saga,
//                                     // outbox (one DB transaction per
//                                     // transition is the default; saga and
//                                     // outbox must be declared explicitly)
//   lock_strategy       STRING        // one of: row_for_update, row_skip_locked,
//                                     // advisory_lock, no_lock
//   retry_policy        STRING        // one of: no_retry, fixed, exponential,
//                                     // bounded_n (with parameters in
//                                     // retry_parameters)
//   retry_parameters    STRING        // JSON-encoded parameters
//                                     // e.g. {"max":3,"backoff_ms":1000}
//   idempotency_key_ref STRING        // IdempotencyKey.id if applicable
//   cancel_race_note    STRING        // free text describing how this
//                                     // transition resolves cancel-while-X
//                                     // (or empty if cancel cannot race)

// RuntimeEvent:
//   id                  STRING        // "{UC}-RC-E{NN}"
//   name                STRING        // e.g. "task.completed"
//   lifecycle           STRING        // one of: pre_commit, post_commit
//                                     // (post_commit is the default safe
//                                     // choice; pre_commit must be justified
//                                     // explicitly because it can fire
//                                     // before the DB row is durable)
//   transport           STRING        // one of: sse, ws, queue, webhook,
//                                     // outbox_table

// RuntimeLock:
//   id                  STRING        // "{UC}-RC-L{NN}"
//   resource            STRING        // e.g. "tasks.id"
//   mode                STRING        // one of: shared, exclusive, advisory
//   timeout_ms          INTEGER

// IdempotencyKey:
//   id                  STRING        // "{UC}-RC-IK{NN}"
//   source              STRING        // one of: client_supplied,
//                                     // derived_from_payload, server_assigned
//   scope               STRING        // one of: per_request, per_user,
//                                     // per_resource, global
//   ttl_seconds         INTEGER

// RecoveryProcedure:
//   id                  STRING        // "{UC}-RC-R{NN}"
//   trigger             STRING        // e.g. "process_crash", "node_restart"
//   action              STRING        // e.g. "requeue_running_to_pending",
//                                     // "mark_orphaned_as_failed_with_reason"
//   description         STRING


// ---------------------------------------------------------------------------
// 5. WRITE TEMPLATE — create a RuntimeContract for a UC
// ---------------------------------------------------------------------------

// 5.1 Create the RuntimeContract root and attach it to the UC.
//
//   MATCH (uc:UseCase {id: $ucId})
//   MERGE (rc:RuntimeContract {id: uc.id + '-RC'})
//   SET rc.uc_id = uc.id,
//       rc.mandatory_reason = $mandatoryReason,
//       rc.updated = datetime(),
//       rc.created = coalesce(rc.created, datetime())
//   MERGE (uc)-[:CONTAINS_RUNTIME_CONTRACT]->(rc)
//   RETURN rc.id AS contract_id;

// 5.2 Create states.
//
//   UNWIND $states AS s
//     MATCH (rc:RuntimeContract {id: $rcId})
//     MERGE (st:RuntimeState {id: s.id})
//     SET st.name = s.name,
//         st.is_initial = s.is_initial,
//         st.is_terminal = s.is_terminal,
//         st.description = s.description
//     MERGE (rc)-[:HAS_STATE]->(st)
//   WITH rc
//   MATCH (init:RuntimeState {id: $initialStateId})
//   MERGE (rc)-[:HAS_INITIAL_STATE]->(init)
//   WITH rc
//   UNWIND $terminalStateIds AS termId
//     MATCH (term:RuntimeState {id: termId})
//     MERGE (rc)-[:HAS_TERMINAL_STATE]->(term)
//   RETURN rc.id AS contract_id;

// 5.3 Create transitions with lock + retry + event + idempotency wiring.
//
//   UNWIND $transitions AS t
//     MATCH (rc:RuntimeContract {id: $rcId})
//     MATCH (from:RuntimeState {id: t.from_state_id})
//     MATCH (to:RuntimeState   {id: t.to_state_id})
//     MERGE (tr:RuntimeTransition {id: t.id})
//     SET tr.name = t.name,
//         tr.trigger = t.trigger,
//         tr.txn_boundary = t.txn_boundary,
//         tr.lock_strategy = t.lock_strategy,
//         tr.retry_policy = t.retry_policy,
//         tr.retry_parameters = t.retry_parameters,
//         tr.idempotency_key_ref = t.idempotency_key_ref,
//         tr.cancel_race_note = t.cancel_race_note
//     MERGE (rc)-[:HAS_TRANSITION]->(tr)
//     MERGE (tr)-[:FROM_STATE]->(from)
//     MERGE (tr)-[:TO_STATE]->(to)
//   RETURN count(*) AS transitions_written;

// 5.4 Create locks and EMITS_EVENT / ACQUIRES_LOCK edges.
//
//   UNWIND $locks AS l
//     MATCH (rc:RuntimeContract {id: $rcId})
//     MERGE (lk:RuntimeLock {id: l.id})
//     SET lk.resource = l.resource, lk.mode = l.mode, lk.timeout_ms = l.timeout_ms
//   WITH rc
//   UNWIND $events AS e
//     MERGE (ev:RuntimeEvent {id: e.id})
//     SET ev.name = e.name, ev.lifecycle = e.lifecycle, ev.transport = e.transport
//   WITH rc
//   UNWIND $transitionWiring AS w
//     MATCH (tr:RuntimeTransition {id: w.transition_id})
//     FOREACH (lockId IN w.lock_ids |
//       MATCH (lk:RuntimeLock {id: lockId}) MERGE (tr)-[:ACQUIRES_LOCK]->(lk)
//     )
//     FOREACH (eventId IN w.event_ids |
//       MATCH (ev:RuntimeEvent {id: eventId}) MERGE (tr)-[:EMITS_EVENT]->(ev)
//     )
//   RETURN $rcId AS contract_id;

// 5.5 Create cancel-race resolution edges between transitions.
//
//   UNWIND $races AS r
//     MATCH (a:RuntimeTransition {id: r.from_transition_id})
//     MATCH (b:RuntimeTransition {id: r.to_transition_id})
//     MERGE (a)-[res:RESOLVES_RACE_WITH]->(b)
//     SET res.rule = r.rule,
//         res.winner = r.winner,
//         res.note = r.note
//   RETURN count(*) AS races_written;

// 5.6 Create idempotency key + recovery procedure.
//
//   MATCH (rc:RuntimeContract {id: $rcId})
//   MERGE (ik:IdempotencyKey {id: $ikId})
//   SET ik.source = $ikSource, ik.scope = $ikScope, ik.ttl_seconds = $ikTtl
//   MERGE (rc)-[:USES_IDEMPOTENCY_KEY]->(ik)
//   WITH rc
//   MERGE (rp:RecoveryProcedure {id: $rpId})
//   SET rp.trigger = $rpTrigger, rp.action = $rpAction, rp.description = $rpDescription
//   MERGE (rc)-[:HAS_RECOVERY]->(rp)
//   RETURN rc.id AS contract_id;


// ---------------------------------------------------------------------------
// 6. READ-BACK QUERY — full RuntimeContract subgraph for a UC
// ---------------------------------------------------------------------------
//
// Used by sa-uc Phase 5 verification (and later, by sa-validate). Returns
// the full contract subgraph so sa-uc can show it to the user before
// finalising the UC detail.
//
//   MATCH (uc:UseCase {id: $ucId})-[:CONTAINS_RUNTIME_CONTRACT]->(rc:RuntimeContract)
//   OPTIONAL MATCH (rc)-[:HAS_STATE]->(st:RuntimeState)
//   OPTIONAL MATCH (rc)-[:HAS_TRANSITION]->(tr:RuntimeTransition)
//   OPTIONAL MATCH (tr)-[:FROM_STATE]->(fs:RuntimeState)
//   OPTIONAL MATCH (tr)-[:TO_STATE]->(ts:RuntimeState)
//   OPTIONAL MATCH (tr)-[:ACQUIRES_LOCK]->(lk:RuntimeLock)
//   OPTIONAL MATCH (tr)-[:EMITS_EVENT]->(ev:RuntimeEvent)
//   OPTIONAL MATCH (tr)-[r:RESOLVES_RACE_WITH]->(tr2:RuntimeTransition)
//   OPTIONAL MATCH (rc)-[:USES_IDEMPOTENCY_KEY]->(ik:IdempotencyKey)
//   OPTIONAL MATCH (rc)-[:HAS_RECOVERY]->(rp:RecoveryProcedure)
//   RETURN rc,
//          collect(DISTINCT st) AS states,
//          collect(DISTINCT {transition: tr, from: fs, to: ts,
//                            locks: collect(DISTINCT lk),
//                            events: collect(DISTINCT ev)}) AS transitions,
//          collect(DISTINCT {from_id: tr.id, to_id: tr2.id, rule: r.rule,
//                            winner: r.winner, note: r.note}) AS races,
//          collect(DISTINCT ik) AS idempotency_keys,
//          collect(DISTINCT rp) AS recovery_procedures;


// ---------------------------------------------------------------------------
// 7. DECISION-TREE QUERY — "Is a RuntimeContract MANDATORY for this UC?"
// ---------------------------------------------------------------------------
//
// A RuntimeContract is mandatory if ANY of the following is true:
//
//   (Q1) The UC has at least one ActivityStep whose actor is "System" AND
//        whose description references queue / worker / async / job / poll
//        / schedule / cron / outbox / saga / restart / retry / cancel
//        keywords (heuristic — confirm with user in Phase 4.5).
//
//   (Q2) The UC produces or modifies a BusinessEntity that has a state /
//        status / lifecycle attribute (state machine on the domain side).
//
//   (Q3) The UC calls an external provider (HAS_REQUIREMENT to a requirement
//        sourced from an external-contracts.md provider) AND that provider
//        is marked async / long-running (sync_vs_async = "async").
//        NOTE: external-contracts.md provider linkage lands in W6; until
//        then, this clause degrades to a free-text question to the user.
//
//   (Q4) The UC has a Requirement of rq_type = "behavioral" whose text
//        contains "retry", "restart", "cancel", "recover", "resume",
//        "idempotent", or equivalents.
//
//   (Q5) The UC has a DEPENDS_ON edge to another UC whose name or
//        description includes worker / queue / dispatcher / scheduler.
//
// The query below returns one row per UC with a `mandatory` boolean and a
// `reason` string. It is heuristic — the human-in-the-loop owner (sa-uc
// agent) must confirm the verdict with the user before stopping detail
// with BLOCKED.
//
//   MATCH (uc:UseCase {id: $ucId})
//   OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
//     WHERE as_step.actor = 'System'
//       AND (
//         toLower(as_step.description) CONTAINS 'queue' OR
//         toLower(as_step.description) CONTAINS 'worker' OR
//         toLower(as_step.description) CONTAINS 'async' OR
//         toLower(as_step.description) CONTAINS 'job' OR
//         toLower(as_step.description) CONTAINS 'poll' OR
//         toLower(as_step.description) CONTAINS 'schedule' OR
//         toLower(as_step.description) CONTAINS 'cron' OR
//         toLower(as_step.description) CONTAINS 'outbox' OR
//         toLower(as_step.description) CONTAINS 'saga' OR
//         toLower(as_step.description) CONTAINS 'restart' OR
//         toLower(as_step.description) CONTAINS 'retry' OR
//         toLower(as_step.description) CONTAINS 'cancel'
//       )
//   WITH uc, collect(DISTINCT as_step.id) AS async_steps
//   OPTIONAL MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc)
//   OPTIONAL MATCH (ws)-[:PRODUCES|MODIFIES]->(be:BusinessEntity)-[:HAS_ATTRIBUTE]->(ea:EntityAttribute)
//     WHERE toLower(ea.name) IN ['status', 'state', 'lifecycle', 'phase']
//   WITH uc, async_steps, collect(DISTINCT be.id) AS lifecycle_entities
//   OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
//     WHERE rq.rq_type = 'behavioral'
//       AND (
//         toLower(rq.description) CONTAINS 'retry' OR
//         toLower(rq.description) CONTAINS 'restart' OR
//         toLower(rq.description) CONTAINS 'cancel' OR
//         toLower(rq.description) CONTAINS 'recover' OR
//         toLower(rq.description) CONTAINS 'resume' OR
//         toLower(rq.description) CONTAINS 'idempot'
//       )
//   WITH uc, async_steps, lifecycle_entities, collect(DISTINCT rq.id) AS behavioral_rqs
//   OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(uc2:UseCase)
//     WHERE toLower(uc2.name) CONTAINS 'queue' OR
//           toLower(uc2.name) CONTAINS 'worker' OR
//           toLower(uc2.name) CONTAINS 'dispatcher' OR
//           toLower(uc2.name) CONTAINS 'scheduler'
//   WITH uc, async_steps, lifecycle_entities, behavioral_rqs,
//        collect(DISTINCT uc2.id) AS async_deps
//   RETURN uc.id AS uc_id,
//          (size(async_steps) > 0 OR
//           size(lifecycle_entities) > 0 OR
//           size(behavioral_rqs) > 0 OR
//           size(async_deps) > 0) AS mandatory,
//          {async_steps: async_steps,
//           lifecycle_entities: lifecycle_entities,
//           behavioral_requirements: behavioral_rqs,
//           async_dependencies: async_deps} AS reason;


// ---------------------------------------------------------------------------
// 8. EXAMPLE — Project-Alpha UC-112 "restart" (worked example, illustrative)
// ---------------------------------------------------------------------------
//
// The bug: pressing "Restart" on a failed task returned 200 but the task
// stayed `failed`. enqueue() used `ON CONFLICT DO NOTHING`; the previous
// `failed` queue_item still existed, so the insert was suppressed
// silently. A correct RuntimeContract for UC-112 must (a) declare the
// `failed -> pending` transition with an explicit `DELETE FROM queue_items`
// step inside the same DB transaction, and (b) declare a 409
// TASK_NOT_RESTARTABLE branch as a separate transition for tasks not in a
// restartable terminal state.
//
//   // RuntimeContract root
//   MERGE (rc:RuntimeContract {id: 'UC-112-RC'})
//   SET rc.uc_id = 'UC-112', rc.mandatory_reason = 'workflow',
//       rc.created = datetime(), rc.updated = datetime();
//   MATCH (uc:UseCase {id: 'UC-112'}), (rc:RuntimeContract {id: 'UC-112-RC'})
//   MERGE (uc)-[:CONTAINS_RUNTIME_CONTRACT]->(rc);
//
//   // States
//   MERGE (s_pending:RuntimeState {id: 'UC-112-RC-S01'})
//     SET s_pending.name = 'pending', s_pending.is_initial = true,
//         s_pending.is_terminal = false;
//   MERGE (s_running:RuntimeState {id: 'UC-112-RC-S02'})
//     SET s_running.name = 'running', s_running.is_initial = false,
//         s_running.is_terminal = false;
//   MERGE (s_failed:RuntimeState {id: 'UC-112-RC-S03'})
//     SET s_failed.name = 'failed', s_failed.is_initial = false,
//         s_failed.is_terminal = true;
//   MERGE (s_succeeded:RuntimeState {id: 'UC-112-RC-S04'})
//     SET s_succeeded.name = 'succeeded', s_succeeded.is_initial = false,
//         s_succeeded.is_terminal = true;
//
//   // The bug-fix transition: failed -> pending requires queue_items DELETE
//   // inside the same single_tx. Without this, ON CONFLICT DO NOTHING
//   // silently no-ops.
//   MERGE (t_restart:RuntimeTransition {id: 'UC-112-RC-T05'})
//     SET t_restart.name = 'restart',
//         t_restart.trigger = 'user',
//         t_restart.txn_boundary = 'single_tx',
//         t_restart.lock_strategy = 'row_for_update',
//         t_restart.retry_policy = 'no_retry',
//         t_restart.idempotency_key_ref = 'UC-112-RC-IK01',
//         t_restart.cancel_race_note =
//           'restart and cancel both target failed tasks; cancel wins because '
//           + 'cancel is terminal once committed; restart on cancelled returns '
//           + '409 TASK_NOT_RESTARTABLE';
//   MERGE (t_restart)-[:FROM_STATE]->(s_failed)
//   MERGE (t_restart)-[:TO_STATE]->(s_pending);
//
//   // The 409 branch: restart from non-failed -> reject
//   MERGE (t_reject:RuntimeTransition {id: 'UC-112-RC-T06'})
//     SET t_reject.name = 'restart_reject',
//         t_reject.trigger = 'user',
//         t_reject.txn_boundary = 'single_tx',
//         t_reject.lock_strategy = 'row_for_update',
//         t_reject.retry_policy = 'no_retry',
//         t_reject.cancel_race_note = '';
//   // (no FROM_STATE / TO_STATE because this is a guard, not a state change;
//   //  emits a 409 RuntimeEvent and rolls back.)
//
//   // The idempotency key for restart (server-assigned per request)
//   MERGE (ik:IdempotencyKey {id: 'UC-112-RC-IK01'})
//     SET ik.source = 'client_supplied',
//         ik.scope = 'per_resource',
//         ik.ttl_seconds = 300;
//   MERGE (rc)-[:USES_IDEMPOTENCY_KEY]->(ik);
//
//   // The recovery procedure for crash-while-restarting
//   MERGE (rp:RecoveryProcedure {id: 'UC-112-RC-R01'})
//     SET rp.trigger = 'process_crash',
//         rp.action = 'requeue_running_to_pending',
//         rp.description =
//           'On worker boot, scan tasks WHERE status=running AND '
//           + 'last_heartbeat_at < now() - $stale_threshold; transition '
//           + 'them to pending via single_tx with row_for_update lock; '
//           + 'emit post_commit task.recovered event';
//   MERGE (rc)-[:HAS_RECOVERY]->(rp);


// ---------------------------------------------------------------------------
// 9. EXAMPLE — Project-Beta UC-107 "cancel-while-failing" race (illustrative)
// ---------------------------------------------------------------------------
//
// The bug: worker commit TX missed a row-level FOR UPDATE lock; cancel and
// fail could fire concurrently against the same row, terminal state
// ordering was unspecified, both writes won non-deterministically.
//
//   MERGE (t_fail:RuntimeTransition {id: 'UC-107-RC-T03'})
//     SET t_fail.name = 'fail',
//         t_fail.trigger = 'worker',
//         t_fail.txn_boundary = 'single_tx',
//         t_fail.lock_strategy = 'row_for_update',
//         t_fail.retry_policy = 'no_retry';
//   MERGE (t_cancel:RuntimeTransition {id: 'UC-107-RC-T04'})
//     SET t_cancel.name = 'cancel',
//         t_cancel.trigger = 'user',
//         t_cancel.txn_boundary = 'single_tx',
//         t_cancel.lock_strategy = 'row_for_update',
//         t_cancel.retry_policy = 'no_retry';
//   // The race resolution: cancel wins because cancel is initiated by the
//   // user and is terminal-priority; fail-on-cancelled becomes a no-op.
//   MERGE (t_fail)-[res:RESOLVES_RACE_WITH]->(t_cancel)
//     SET res.rule = 'lock_order',
//         res.winner = 'cancel',
//         res.note =
//           'Cancel takes row_for_update first; fail observes status=cancelled '
//           + 'after reacquiring the lock and exits without state change.';


// =============================================================================
// END OF TEMPLATE
// =============================================================================
