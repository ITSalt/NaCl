// =============================================================================
// Validation — Named Cypher Queries
// =============================================================================
// File: graph-infra/queries/validation-queries.cypher
// Task: TECH-007
// =============================================================================


// ---------------------------------------------------------------------------
// Query: val_orphaned_form_fields
// Description: FormFields that have no MAPS_TO edge to a DomainAttribute.
//              These are potential data-binding gaps in the UI layer.
// ---------------------------------------------------------------------------
MATCH (f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN f.name AS form_name, ff.name AS field_name, ff.field_type AS field_type, ff.label AS label;


// ---------------------------------------------------------------------------
// Query: val_uc_without_requirements
// Description: UseCases that have no HAS_REQUIREMENT edge.
//              Every UC should be governed by at least one requirement.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase)
WHERE NOT (uc)-[:HAS_REQUIREMENT]->(:Requirement)
RETURN uc.id, uc.name;


// ---------------------------------------------------------------------------
// Query: val_entity_without_uc
// Description: DomainEntities not referenced by any UseCase's forms.
//              These entities exist in the domain model but have no UI surface.
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity)
WHERE NOT (:FormField)-[:MAPS_TO]->(:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de)
RETURN de.id, de.name, de.module;


// ---------------------------------------------------------------------------
// Query: val_disconnected_nodes
// Description: Nodes with zero relationships of any kind.
//              These are orphans that may indicate missing data or edges.
// ---------------------------------------------------------------------------
MATCH (n)
WHERE NOT (n)--()
RETURN labels(n)[0] AS label, n.id AS id,
       coalesce(n.name, n.term, n.function_name, n.description, n.title) AS display_name;


// ---------------------------------------------------------------------------
// Query: val_ba_sa_consistency
// Description: Every WorkflowStep with stereotype "Автоматизируется" should
//              have a corresponding UseCase via AUTOMATES_AS.
//              Returns steps that violate this rule.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep {stereotype: "Автоматизируется"})
OPTIONAL MATCH (ws)-[:AUTOMATES_AS]->(uc:UseCase)
RETURN bp.id AS bp_id, bp.name AS bp_name,
       ws.id AS ws_id, ws.function_name AS ws_function,
       CASE WHEN uc IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
       uc.id AS uc_id;


// =============================================================================
// BA Layer Validation — L1 through L8
// =============================================================================


// ---------------------------------------------------------------------------
// Query: val_ba_L1_bp_completeness
// Description: Every BusinessProcess must have trigger, result, and an owner.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess)
WHERE bp.trigger IS NULL OR bp.result IS NULL
   OR NOT EXISTS { MATCH (:BusinessRole)-[:OWNS]->(bp) }
RETURN bp.id AS id, bp.name AS name,
       CASE WHEN bp.trigger IS NULL THEN 'missing trigger' ELSE '' END +
       CASE WHEN bp.result IS NULL THEN ', missing result' ELSE '' END +
       CASE WHEN NOT EXISTS { MATCH (:BusinessRole)-[:OWNS]->(bp) } THEN ', missing owner' ELSE '' END AS issues;


// ---------------------------------------------------------------------------
// Query: val_ba_L2_workflow_coverage
// Description: Every BP with has_decomposition=true must have at least one step.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess {has_decomposition: true})
WHERE NOT EXISTS { MATCH (bp)-[:HAS_STEP]->(:WorkflowStep) }
RETURN bp.id AS id, bp.name AS name, 'has_decomposition=true but no steps' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L3_step_performers
// Description: Every WorkflowStep must have a PERFORMED_BY relationship.
// ---------------------------------------------------------------------------
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
WHERE NOT EXISTS { MATCH (ws)-[:PERFORMED_BY]->(:BusinessRole) }
RETURN bp.id AS bp_id, ws.id AS ws_id, ws.function_name AS step_name,
       'missing PERFORMED_BY' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L4_entity_attributes
// Description: Every BusinessEntity must have at least one EntityAttribute.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity)
WHERE NOT EXISTS { MATCH (e)-[:HAS_ATTRIBUTE]->(:EntityAttribute) }
RETURN e.id AS id, e.name AS name, 'no attributes defined' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L5_entity_process_matrix
// Description: Every BusinessEntity should be referenced by at least one
//              workflow step (READS/PRODUCES/MODIFIES).
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity)
WHERE NOT EXISTS {
  MATCH (:WorkflowStep)-[:READS|PRODUCES|MODIFIES]->(e)
}
RETURN e.id AS id, e.name AS name, 'not referenced by any workflow step' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L6_role_process_matrix
// Description: Every BusinessRole should have at least one OWNS or
//              PARTICIPATES_IN or PERFORMED_BY relationship.
// ---------------------------------------------------------------------------
MATCH (r:BusinessRole)
WHERE NOT EXISTS { MATCH (r)-[:OWNS]->(:BusinessProcess) }
  AND NOT EXISTS { MATCH (r)-[:PARTICIPATES_IN]->(:BusinessProcess) }
  AND NOT EXISTS { MATCH (:WorkflowStep)-[:PERFORMED_BY]->(r) }
RETURN r.id AS id, r.full_name AS name, 'role has no process relationships' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L7_glossary_coverage
// Description: Key entities and roles should have GlossaryTerm via DEFINES.
// ---------------------------------------------------------------------------
MATCH (e:BusinessEntity)
WHERE NOT EXISTS { MATCH (:GlossaryTerm)-[:DEFINES]->(e) }
RETURN 'Entity' AS category, e.id AS id, e.name AS name, 'no glossary term' AS issue
UNION ALL
MATCH (r:BusinessRole)
WHERE NOT EXISTS { MATCH (:GlossaryTerm)-[:DEFINES]->(r) }
RETURN 'Role' AS category, r.id AS id, r.full_name AS name, 'no glossary term' AS issue;


// ---------------------------------------------------------------------------
// Query: val_ba_L8_rules_binding
// Description: Every BusinessRule must have at least one traceability link
//              (CONSTRAINS, APPLIES_IN, AFFECTS, or APPLIES_AT_STEP).
// ---------------------------------------------------------------------------
MATCH (brq:BusinessRule)
WHERE NOT EXISTS { MATCH (brq)-[:CONSTRAINS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_IN]->() }
  AND NOT EXISTS { MATCH (brq)-[:AFFECTS]->() }
  AND NOT EXISTS { MATCH (brq)-[:APPLIES_AT_STEP]->() }
RETURN brq.id AS id, brq.name AS name, 'rule has no traceability links' AS issue;
