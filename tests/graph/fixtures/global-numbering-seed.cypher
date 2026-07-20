// tests/graph/fixtures/global-numbering-seed.cypher
// Anonymized real-shape fixture: a project whose modules carry uc_range_start
// (100/200/300) but whose UCs are numbered GLOBALLY (UC-001..UC-013 straight
// through all modules) — the range mechanism exists in the graph yet is unused.
// This is the shape under which a module-scoped "max + 1" allocator collides
// with a sibling module's UC.
//
// Also seeds the task-state matrix for the Step 2.4 MERGE regression:
//   UC009-BE — stale + done (shipped: commit + verification evidence present)
//   UC010-BE — stale + in_progress (active dev)
//   UC-013   — has no task yet (fresh-create case)

CREATE (mcore:Module {id: 'mod-core',   name: 'Core',   uc_range_start: 100});
CREATE (meng:Module  {id: 'mod-engine', name: 'Engine', uc_range_start: 200});
CREATE (madm:Module  {id: 'mod-admin',  name: 'Admin',  uc_range_start: 300});

MATCH (m:Module {id: 'mod-core'})
UNWIND range(1, 5) AS n
CREATE (uc:UseCase {id: 'UC-' + apoc.text.lpad(toString(n), 3, '0'),
                    name: 'Core case ' + toString(n), spec_version: 1})
CREATE (m)-[:CONTAINS_UC]->(uc);

MATCH (m:Module {id: 'mod-engine'})
UNWIND range(6, 10) AS n
CREATE (uc:UseCase {id: 'UC-' + apoc.text.lpad(toString(n), 3, '0'),
                    name: 'Engine case ' + toString(n), spec_version: 1})
CREATE (m)-[:CONTAINS_UC]->(uc);

MATCH (m:Module {id: 'mod-admin'})
UNWIND range(11, 13) AS n
CREATE (uc:UseCase {id: 'UC-' + apoc.text.lpad(toString(n), 3, '0'),
                    name: 'Admin case ' + toString(n), spec_version: 1})
CREATE (m)-[:CONTAINS_UC]->(uc);

CREATE (:Wave {number: 1, name: 'Wave 1', status: 'pending'});

// Shipped task whose source UC has since drifted (spec_version 1 -> 2).
MATCH (uc:UseCase {id: 'UC-009'})
SET uc.spec_version = 2
CREATE (t:Task {id: 'UC009-BE', title: 'Engine case 9 BE', type: 'BE',
                status: 'done', wave: 1, agent: 'developer',
                phase_be: 'done', phase_fe: 'done', phase_sync: 'done',
                phase_review_be: 'done', phase_review_fe: 'done', phase_qa: 'done',
                priority: 'medium', planned_from_version: 1,
                commit: 'abc1234',
                verification_evidence: 'verify-GREEN:.tl/tasks/UC009-BE/verification.md',
                review_status: 'stale', stale_reason: 'spec-updated',
                created: datetime(), updated: datetime()})
CREATE (uc)-[:GENERATES]->(t)
WITH t
MATCH (w:Wave {number: 1})
CREATE (t)-[:IN_WAVE]->(w);

// Active (in-progress) task, also stale.
MATCH (uc:UseCase {id: 'UC-010'})
CREATE (t:Task {id: 'UC010-BE', title: 'Engine case 10 BE', type: 'BE',
                status: 'in_progress', wave: 1, agent: 'developer',
                phase_be: 'in_progress', phase_fe: 'pending', phase_sync: 'pending',
                phase_review_be: 'pending', phase_review_fe: 'pending', phase_qa: 'pending',
                priority: 'medium', planned_from_version: 1,
                review_status: 'stale', stale_reason: 'spec-updated',
                created: datetime(), updated: datetime()})
CREATE (uc)-[:GENERATES]->(t)
WITH t
MATCH (w:Wave {number: 1})
CREATE (t)-[:IN_WAVE]->(w);
