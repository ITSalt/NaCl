// =============================================================================
// Handoff Layer — Named Cypher Queries (BA→SA traceability)
// =============================================================================
// File: graph-infra/queries/handoff-queries.cypher
// Task: TECH-007
// =============================================================================


// ---------------------------------------------------------------------------
// Query: handoff_traceability_matrix
// Description: Full BA→SA traceability across 4 categories:
//   1. WorkflowStep → UseCase (via AUTOMATES_AS)
//   2. BusinessEntity → DomainEntity (via REALIZED_AS)
//   3. BusinessRole → SystemRole (via MAPPED_TO)
//   4. BusinessRule → Requirement (via IMPLEMENTED_BY)
// ---------------------------------------------------------------------------
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN 'Step→UC' AS category, ws.id AS ba_id, ws.function_name AS ba_name, uc.id AS sa_id, uc.name AS sa_name
UNION ALL
MATCH (be:BusinessEntity)-[:REALIZED_AS]->(de:DomainEntity)
RETURN 'Entity→Domain' AS category, be.id AS ba_id, be.name AS ba_name, de.id AS sa_id, de.name AS sa_name
UNION ALL
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN 'Role→SysRole' AS category, br.id AS ba_id, br.full_name AS ba_name, sr.id AS sa_id, sr.name AS sa_name
UNION ALL
MATCH (brq:BusinessRule)-[:IMPLEMENTED_BY]->(rq:Requirement)
RETURN 'Rule→Req' AS category, brq.id AS ba_id, brq.name AS ba_name, rq.id AS sa_id, rq.description AS sa_name;


// ---------------------------------------------------------------------------
// Query: handoff_uncovered_ba_steps
// Description: WorkflowSteps with stereotype "Автоматизируется" that have NO
//              AUTOMATES_AS edge — these are gaps in SA coverage.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
WHERE NOT (ws)-[:AUTOMATES_AS]->(:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function;


// ---------------------------------------------------------------------------
// Query: handoff_uncovered_entities
// Description: Business entities (type: "Бизнес-объект") that have no
//              REALIZED_AS edge — not yet mapped to a domain entity.
// ---------------------------------------------------------------------------
MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WHERE NOT (be)-[:REALIZED_AS]->(:DomainEntity)
RETURN be.id, be.name, be.type;


// ---------------------------------------------------------------------------
// Query: handoff_coverage_stats
// Description: Coverage percentages per category — how much of BA is mapped to SA.
// ---------------------------------------------------------------------------
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
WITH count(ws) AS total_auto
OPTIONAL MATCH (ws2:WorkflowStep {stereotype: "Автоматизируется"})-[:AUTOMATES_AS]->(:UseCase)
WITH total_auto, count(ws2) AS covered_auto
WITH total_auto, covered_auto,
     CASE WHEN total_auto > 0 THEN round(100.0 * covered_auto / total_auto) ELSE 0 END AS step_pct

MATCH (be:BusinessEntity {type: "Бизнес-объект"})
WITH total_auto, covered_auto, step_pct, count(be) AS total_entities
OPTIONAL MATCH (be2:BusinessEntity {type: "Бизнес-объект"})-[:REALIZED_AS]->(:DomainEntity)
WITH total_auto, covered_auto, step_pct, total_entities, count(be2) AS covered_entities
WITH total_auto, covered_auto, step_pct, total_entities, covered_entities,
     CASE WHEN total_entities > 0 THEN round(100.0 * covered_entities / total_entities) ELSE 0 END AS entity_pct

MATCH (br:BusinessRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, count(br) AS total_roles
OPTIONAL MATCH (br2:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, count(br2) AS covered_roles
WITH step_pct, entity_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles,
     CASE WHEN total_roles > 0 THEN round(100.0 * covered_roles / total_roles) ELSE 0 END AS role_pct

MATCH (brq:BusinessRule)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, count(brq) AS total_rules
OPTIONAL MATCH (brq2:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement)
WITH step_pct, entity_pct, role_pct, total_auto, covered_auto, total_entities, covered_entities, total_roles, covered_roles, total_rules, count(brq2) AS covered_rules

RETURN
  step_pct AS automation_coverage_pct,
  entity_pct AS entity_coverage_pct,
  role_pct AS role_coverage_pct,
  CASE WHEN total_rules > 0 THEN round(100.0 * covered_rules / total_rules) ELSE 0 END AS rule_coverage_pct,
  {steps_covered: covered_auto, steps_total: total_auto,
   entities_covered: covered_entities, entities_total: total_entities,
   roles_covered: covered_roles, roles_total: total_roles,
   rules_covered: covered_rules, rules_total: total_rules} AS details;
