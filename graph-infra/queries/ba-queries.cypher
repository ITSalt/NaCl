// =============================================================================
// BA Layer — Named Cypher Queries
// =============================================================================
// File: graph-infra/queries/ba-queries.cypher
// Task: TECH-007
// =============================================================================


// ---------------------------------------------------------------------------
// Query: ba_all_processes
// Description: All business processes grouped by ProcessGroup.
// ---------------------------------------------------------------------------
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
RETURN gpr, collect(bp) AS processes;


// ---------------------------------------------------------------------------
// Query: ba_workflow_steps
// Params: $bpId — BusinessProcess.id (e.g. "BP-001")
// Description: Ordered workflow steps for a specific business process,
//              including the role that performs each step.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess {id: $bpId})-[:HAS_STEP]->(ws:WorkflowStep)
OPTIONAL MATCH (ws)-[:PERFORMED_BY]->(r:BusinessRole)
RETURN ws, r
ORDER BY ws.step_number;


// ---------------------------------------------------------------------------
// Query: ba_entity_with_attributes
// Params: $entityId — BusinessEntity.id (e.g. "OBJ-001")
// Description: A business entity with all its attributes.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: $entityId})-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
RETURN e, collect(a) AS attributes;


// ---------------------------------------------------------------------------
// Query: ba_entity_lifecycle
// Params: $entityId — BusinessEntity.id (e.g. "OBJ-001")
// Description: States and transitions for a business entity's lifecycle.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity {id: $entityId})-[:HAS_STATE]->(s:EntityState)
OPTIONAL MATCH (s)-[t:TRANSITIONS_TO]->(s2:EntityState)
RETURN s, t.condition AS condition, s2;


// ---------------------------------------------------------------------------
// Query: ba_role_participation
// Params: $roleId — BusinessRole.id (e.g. "ROL-01")
// Description: All processes a role owns and participates in.
// ---------------------------------------------------------------------------
MATCH (r:BusinessRole {id: $roleId})
OPTIONAL MATCH (r)-[:OWNS]->(owned:BusinessProcess)
OPTIONAL MATCH (r)-[:PARTICIPATES_IN]->(part:BusinessProcess)
RETURN r,
       collect(DISTINCT owned) AS owns,
       collect(DISTINCT part) AS participates;


// ---------------------------------------------------------------------------
// Query: ba_rules_for_entity
// Params: $entityId — BusinessEntity.id (e.g. "OBJ-001")
// Description: Business rules that constrain a specific entity.
// ---------------------------------------------------------------------------
MATCH (rule:BusinessRule)-[:CONSTRAINS]->(e:BusinessEntity {id: $entityId})
RETURN rule;


// ---------------------------------------------------------------------------
// Query: ba_automation_scope
// Description: All steps with stereotype "Автоматизируется" — the boundary
//              between manual BA processes and automated SA use cases.
// ---------------------------------------------------------------------------
MATCH (ws:WorkflowStep {stereotype: "Автоматизируется"})
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws)
OPTIONAL MATCH (ws)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       uc.id AS uc_id, uc.name AS uc_name;


// ---------------------------------------------------------------------------
// Query: ba_system_context
// Description: Full system context — scope, stakeholders, external entities,
//              data flows. Used by graph_ba_context for diagram generation.
// ---------------------------------------------------------------------------
MATCH (sc:SystemContext)
OPTIONAL MATCH (sc)-[:HAS_STAKEHOLDER]->(stk:Stakeholder)
OPTIONAL MATCH (sc)-[:HAS_EXTERNAL_ENTITY]->(ext:ExternalEntity)
OPTIONAL MATCH (ext)-[flow:HAS_FLOW]->(sc)
RETURN sc,
       collect(DISTINCT stk) AS stakeholders,
       collect(DISTINCT ext) AS external_entities,
       collect(DISTINCT {entity: ext.name, direction: flow.direction, data: flow.data_description}) AS data_flows;


// ---------------------------------------------------------------------------
// Query: ba_process_map
// Description: All process groups with their processes, triggers, results,
//              and inter-process links (TRIGGERS, CALLS_SUB).
// ---------------------------------------------------------------------------
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
OPTIONAL MATCH (bp)-[:TRIGGERS]->(triggered:BusinessProcess)
OPTIONAL MATCH (bp)-[:CALLS_SUB]->(sub:BusinessProcess)
OPTIONAL MATCH (bp)<-[:OWNS]-(owner:BusinessRole)
RETURN gpr, collect(DISTINCT {
  bp: bp,
  owner: owner.full_name,
  triggers: collect(DISTINCT triggered.id),
  subprocesses: collect(DISTINCT sub.id)
}) AS processes;


// ---------------------------------------------------------------------------
// Query: ba_entity_crud_matrix
// Description: Entity-process CRUD matrix computed from READS/PRODUCES/MODIFIES
//              relationships via workflow steps.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
OPTIONAL MATCH (ws)-[:READS]->(e_read:BusinessEntity)
OPTIONAL MATCH (ws)-[:PRODUCES]->(e_prod:BusinessEntity)
OPTIONAL MATCH (ws)-[:MODIFIES]->(e_mod:BusinessEntity)
WITH bp,
     collect(DISTINCT e_read.id) AS reads,
     collect(DISTINCT e_prod.id) AS creates,
     collect(DISTINCT e_mod.id) AS updates
UNWIND (reads + creates + updates) AS entity_id
WITH bp.id AS bp_id, bp.name AS bp_name, entity_id,
     entity_id IN creates AS is_create,
     entity_id IN reads AS is_read,
     entity_id IN updates AS is_update
MATCH (e:BusinessEntity {id: entity_id})
RETURN e.id AS entity_id, e.name AS entity_name,
       bp_id, bp_name,
       CASE WHEN is_create THEN 'C' ELSE '' END +
       CASE WHEN is_read THEN 'R' ELSE '' END +
       CASE WHEN is_update THEN 'U' ELSE '' END AS crud
ORDER BY e.id, bp_id;


// ---------------------------------------------------------------------------
// Query: ba_role_process_matrix
// Description: Role-process matrix from OWNS and PARTICIPATES_IN relationships.
// ---------------------------------------------------------------------------
MATCH (r:BusinessRole)
OPTIONAL MATCH (r)-[:OWNS]->(owned:BusinessProcess)
OPTIONAL MATCH (r)-[:PARTICIPATES_IN]->(part:BusinessProcess)
RETURN r.id AS role_id, r.full_name AS role_name,
       collect(DISTINCT {bp: owned.id, relation: 'Owner'}) +
       collect(DISTINCT {bp: part.id, relation: 'Participant'}) AS processes
ORDER BY r.id;


// ---------------------------------------------------------------------------
// Query: ba_glossary_coverage
// Description: Check which key entities, roles, processes have GlossaryTerm
//              nodes linked via DEFINES.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity)
OPTIONAL MATCH (gt:GlossaryTerm)-[:DEFINES]->(e)
WITH 'Entity' AS category, e.id AS id, e.name AS name,
     CASE WHEN gt IS NOT NULL THEN 'covered' ELSE 'missing' END AS status
RETURN category, id, name, status
UNION ALL
MATCH (r:BusinessRole)
OPTIONAL MATCH (gt:GlossaryTerm)-[:DEFINES]->(r)
WITH 'Role' AS category, r.id AS id, r.full_name AS name,
     CASE WHEN gt IS NOT NULL THEN 'covered' ELSE 'missing' END AS status
RETURN category, id, name, status
UNION ALL
MATCH (bp:BusinessProcess)
OPTIONAL MATCH (gt:GlossaryTerm)-[:DEFINES]->(bp)
WITH 'Process' AS category, bp.id AS id, bp.name AS name,
     CASE WHEN gt IS NOT NULL THEN 'covered' ELSE 'missing' END AS status
RETURN category, id, name, status;


// ---------------------------------------------------------------------------
// Query: ba_rules_catalog
// Description: All business rules with their traceability links.
// ---------------------------------------------------------------------------
MATCH (brq:BusinessRule)
OPTIONAL MATCH (brq)-[:CONSTRAINS]->(e:BusinessEntity)
OPTIONAL MATCH (brq)-[:APPLIES_IN]->(bp:BusinessProcess)
OPTIONAL MATCH (brq)-[:AFFECTS]->(attr:EntityAttribute)
OPTIONAL MATCH (brq)-[:APPLIES_AT_STEP]->(ws:WorkflowStep)
RETURN brq,
       collect(DISTINCT e.id) AS constrained_entities,
       collect(DISTINCT bp.id) AS applied_in_processes,
       collect(DISTINCT attr.id) AS affected_attributes,
       collect(DISTINCT ws.id) AS applied_at_steps
ORDER BY brq.id;


// ---------------------------------------------------------------------------
// Query: ba_next_id
// Params: $label — node label (e.g. "BusinessProcess", "BusinessEntity")
// Params: $prefix — ID prefix (e.g. "BP-", "OBJ-")
// Params: $padLen — zero-padding length (e.g. 3)
// Description: Get next available sequential ID for any BA node type.
// ---------------------------------------------------------------------------
// Usage: CALL { MATCH (n) WHERE $label IN labels(n)
//   WITH max(toInteger(replace(n.id, $prefix, ''))) AS maxNum
//   RETURN coalesce(maxNum, 0) + 1 AS nextNum }
// RETURN $prefix + apoc.text.lpad(toString(nextNum), $padLen, '0') AS nextId


// ---------------------------------------------------------------------------
// Query: ba_all_entities
// Description: All business entities with stereotypes and attribute counts.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity)
OPTIONAL MATCH (e)-[:HAS_ATTRIBUTE]->(a:EntityAttribute)
OPTIONAL MATCH (e)-[:HAS_STATE]->(s:EntityState)
RETURN e.id AS id, e.name AS name, e.stereotype AS stereotype,
       count(DISTINCT a) AS attr_count, count(DISTINCT s) AS state_count
ORDER BY e.id;


// ---------------------------------------------------------------------------
// Query: ba_all_roles
// Description: All business roles with their departments and process counts.
// ---------------------------------------------------------------------------
MATCH (r:BusinessRole)
OPTIONAL MATCH (r)-[:OWNS]->(owned:BusinessProcess)
OPTIONAL MATCH (r)-[:PARTICIPATES_IN]->(part:BusinessProcess)
OPTIONAL MATCH (:WorkflowStep)-[:PERFORMED_BY]->(r)
WITH r, count(DISTINCT owned) AS owns_count,
     count(DISTINCT part) AS participates_count
RETURN r.id AS id, r.full_name AS name, r.department AS department,
       owns_count, participates_count
ORDER BY r.id;


// ---------------------------------------------------------------------------
// Query: ba_all_glossary_terms
// Description: All glossary terms with their definitions and links.
// ---------------------------------------------------------------------------
MATCH (gt:GlossaryTerm)
OPTIONAL MATCH (gt)-[:DEFINES]->(target)
OPTIONAL MATCH (gt)-[:ALIAS_OF]->(canonical:GlossaryTerm)
RETURN gt.id AS id, gt.term AS term, gt.definition AS definition,
       gt.source_id AS source,
       collect(DISTINCT {label: labels(target)[0], id: target.id}) AS defines,
       canonical.term AS alias_of
ORDER BY gt.term;
