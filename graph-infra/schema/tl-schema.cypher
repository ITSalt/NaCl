// =============================================================================
// TL Layer Schema — Neo4j 5.x
// =============================================================================
// File: graph-infra/schema/tl-schema.cypher
// Task: TECH-006
// Description: Constraints, indexes, and documentation for the TL (Tech Lead)
//              layer of the project graph, plus SA->TL handoff edges.
//
// Node Labels: Task, Wave, APIEndpoint
//
// Execute each statement separately — Neo4j requires one DDL per transaction.
// =============================================================================


// ---------------------------------------------------------------------------
// 1. UNIQUE CONSTRAINTS on id for every TL node label
// ---------------------------------------------------------------------------

CREATE CONSTRAINT constraint_task_id IF NOT EXISTS  FOR (n:Task) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_wave_id IF NOT EXISTS  FOR (n:Wave) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_apiendpoint_id IF NOT EXISTS  FOR (n:APIEndpoint) REQUIRE n.id IS UNIQUE;


// ---------------------------------------------------------------------------
// 2. INDEXES
// ---------------------------------------------------------------------------

// Task.status — filter "all incomplete tasks"
CREATE INDEX index_task_status IF NOT EXISTS  FOR (n:Task) ON (n.status);

// Task.wave — filter tasks by wave number
CREATE INDEX index_task_wave IF NOT EXISTS  FOR (n:Task) ON (n.wave);

// Task.title — lookup by name
CREATE INDEX index_task_title IF NOT EXISTS  FOR (n:Task) ON (n.title);

// Wave.number — lookup by wave number
CREATE INDEX index_wave_number IF NOT EXISTS  FOR (n:Wave) ON (n.number);

// APIEndpoint.path — lookup by path
CREATE INDEX index_apiendpoint_path IF NOT EXISTS  FOR (n:APIEndpoint) ON (n.path);


// ---------------------------------------------------------------------------
// 3. TL-INTERNAL RELATIONSHIP TYPES (documentation)
// ---------------------------------------------------------------------------
//
// (:Task)-[:IN_WAVE]->(:Wave)
//   Task is assigned to a development wave.
//
// (:Task)-[:DEPENDS_ON]->(:Task)
//   Task depends on another task (must be completed first).
//
// (:Task)-[:IMPLEMENTS]->(:APIEndpoint)
//   Task implements an API endpoint.
//
// --- Extended Task properties (phase-level tracking) ---
// Task {
//   ...existing properties...,
//   phase_be: String,         // "pending"|"in_progress"|"ready_for_review"|"approved"|"done"
//   phase_fe: String,
//   phase_sync: String,
//   phase_review_be: String,
//   phase_review_fe: String,
//   phase_qa: String,
//   priority: String,         // "critical"|"high"|"medium"|"low"
//   created: DateTime,
//   updated: DateTime,
//   verification_evidence: String, // "test-GREEN:<path>" | "test-UNVERIFIED" | "no-test"
//                                  // — see nacl-core/SKILL.md § Task.verification_evidence
//   planned_from_version: Int,    // the UseCase.spec_version this task's files were
//                                  // generated from. nacl-tl-plan compares
//                                  // coalesce(uc.spec_version,0) > coalesce(t.planned_from_version,-1)
//                                  // to detect tasks whose baked-in snapshot is stale.
//   review_status: String,        // 'current' | 'stale' (default 'current'); see
//                                  // sa-schema.cypher § Staleness properties. A Task is
//                                  // stamped 'stale' when its source UC changed, and
//                                  // cleared on successful re-plan. Read with
//                                  // coalesce(t.review_status,'current').
//   stale_reason: String,         // human-readable cause
//   stale_since: DateTime,        // when stamped
//   stale_origin: String          // id of the node whose change caused it (UC/FR)
// }
//


// ---------------------------------------------------------------------------
// 4. SA -> TL HANDOFF RELATIONSHIP TYPES (cross-layer edges)
// ---------------------------------------------------------------------------
//
// (:UseCase)-[:GENERATES]->(:Task)
//   An SA use case generates one or more TL tasks.
//
// (:APIEndpoint)-[:CONSUMES]->(:DomainEntity)
//   An API endpoint consumes (reads) a domain entity from the SA layer.
//
// (:APIEndpoint)-[:PRODUCES]->(:DomainEntity)
//   An API endpoint produces (writes/creates) a domain entity from the SA layer.
//
