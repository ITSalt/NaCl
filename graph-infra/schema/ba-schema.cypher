// =============================================================================
// BA Layer Schema — Constraints, Indexes, Relationship Types
// File: graph-infra/schema/ba-schema.cypher
// Task: TECH-004
//
// Node Labels:
//   ProcessGroup, BusinessProcess, WorkflowStep, BusinessEntity,
//   EntityAttribute, EntityState, BusinessRole, BusinessRule, GlossaryTerm
//
// Execute each statement separately — Neo4j requires one DDL per transaction.
// =============================================================================


// -----------------------------------------------------------------------------
// 1. UNIQUE CONSTRAINTS on id for every BA node label
// -----------------------------------------------------------------------------

CREATE CONSTRAINT constraint_processgroup_id FOR (n:ProcessGroup) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_businessprocess_id FOR (n:BusinessProcess) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_workflowstep_id FOR (n:WorkflowStep) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_businessentity_id FOR (n:BusinessEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_entityattribute_id FOR (n:EntityAttribute) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_entitystate_id FOR (n:EntityState) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_businessrole_id FOR (n:BusinessRole) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_businessrule_id FOR (n:BusinessRule) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_glossaryterm_id FOR (n:GlossaryTerm) REQUIRE n.id IS UNIQUE;


// -----------------------------------------------------------------------------
// 2. INDEXES on name for every BA node label (search by name)
// -----------------------------------------------------------------------------

CREATE INDEX index_processgroup_name FOR (n:ProcessGroup) ON (n.name);

CREATE INDEX index_businessprocess_name FOR (n:BusinessProcess) ON (n.name);

CREATE INDEX index_workflowstep_function_name FOR (n:WorkflowStep) ON (n.function_name);

CREATE INDEX index_businessentity_name FOR (n:BusinessEntity) ON (n.name);

CREATE INDEX index_entityattribute_name FOR (n:EntityAttribute) ON (n.name);

CREATE INDEX index_entitystate_name FOR (n:EntityState) ON (n.name);

CREATE INDEX index_businessrole_name FOR (n:BusinessRole) ON (n.full_name);

CREATE INDEX index_businessrule_name FOR (n:BusinessRule) ON (n.name);

CREATE INDEX index_glossaryterm_term FOR (n:GlossaryTerm) ON (n.term);


// -----------------------------------------------------------------------------
// 3. FULL-TEXT INDEX for search across name + description fields
//    Covers: ProcessGroup, BusinessProcess, BusinessEntity, BusinessRule,
//            GlossaryTerm (term + definition)
// -----------------------------------------------------------------------------

CREATE FULLTEXT INDEX fulltext_ba_search
  FOR (n:ProcessGroup|BusinessProcess|BusinessEntity|BusinessRule|GlossaryTerm)
  ON EACH [n.name, n.description];


// -----------------------------------------------------------------------------
// 4. SYSTEM CONTEXT NODE TYPES (system boundaries, stakeholders, data flows)
// -----------------------------------------------------------------------------

CREATE CONSTRAINT constraint_systemcontext_id FOR (n:SystemContext) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_stakeholder_id FOR (n:Stakeholder) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_externalentity_id FOR (n:ExternalEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_dataflow_id FOR (n:DataFlow) REQUIRE n.id IS UNIQUE;

CREATE INDEX index_systemcontext_name FOR (n:SystemContext) ON (n.name);

CREATE INDEX index_stakeholder_name FOR (n:Stakeholder) ON (n.name);

CREATE INDEX index_externalentity_name FOR (n:ExternalEntity) ON (n.name);


// -----------------------------------------------------------------------------
// 5. NODE PROPERTY DOCUMENTATION
// -----------------------------------------------------------------------------
//
// SystemContext {id: String, name: String, goals: [String],
//   in_scope: [String], out_of_scope: [String],
//   constraints: [String], assumptions: [String]}
//
// Stakeholder {id: String, name: String, role: String, interest: String}
//
// ExternalEntity {id: String, name: String, type: String
//   ("User"|"ExternalSystem"|"Organization"), description: String}
//
// DataFlow {id: String, name: String, direction: String ("IN"|"OUT"|"BOTH"),
//   data_description: String}
//
// BusinessProcess (extended properties):
//   trigger: String, result: String,
//   has_decomposition: Boolean, automation_level: String ("manual"|"partial"|"full")
//
// WorkflowStep (extended properties):
//   change_marker: String ("[inherited As-Is]"|"[changed]"|"[new]")
//
// BusinessEntity (extended properties):
//   stereotype: String ("Внешний документ"|"Бизнес-объект"|"Результат"),
//   has_states: Boolean
//
// BusinessRole (extended properties):
//   department: String, responsibilities: [String]
//
// BusinessRule (extended properties):
//   rule_type: String ("constraint"|"calculation"|"invariant"|"authorization"),
//   formulation: String, severity: String ("critical"|"warning"|"info")
//


// -----------------------------------------------------------------------------
// 6. RELATIONSHIP TYPES (documented, no DDL needed — Neo4j creates on use)
// -----------------------------------------------------------------------------
//
// --- Process hierarchy ---
// (:ProcessGroup)-[:CONTAINS]->(:BusinessProcess)
// (:BusinessProcess)-[:HAS_STEP {order: Int}]->(:WorkflowStep)
// (:BusinessProcess)-[:TRIGGERS]->(:BusinessProcess)          # sequential process links
// (:BusinessProcess)-[:CALLS_SUB]->(:BusinessProcess)         # subprocess decomposition
//
// --- Workflow flow ---
// (:WorkflowStep)-[:NEXT_STEP {label: String}]->(:WorkflowStep)
// (:WorkflowStep)-[:PERFORMED_BY]->(:BusinessRole)
//
// --- Role-process ---
// (:BusinessRole)-[:OWNS]->(:BusinessProcess)
// (:BusinessRole)-[:PARTICIPATES_IN]->(:BusinessProcess)
//
// --- Entity interactions ---
// (:WorkflowStep)-[:READS]->(:BusinessEntity)
// (:WorkflowStep)-[:PRODUCES]->(:BusinessEntity)
// (:WorkflowStep)-[:MODIFIES]->(:BusinessEntity)
//
// --- Entity structure ---
// (:BusinessEntity)-[:HAS_ATTRIBUTE]->(:EntityAttribute)
// (:BusinessEntity)-[:HAS_STATE]->(:EntityState)
// (:EntityState)-[:TRANSITIONS_TO {condition: String}]->(:EntityState)
// (:BusinessEntity)-[:RELATES_TO {rel_type: String, cardinality: String}]->(:BusinessEntity)
//
// --- Business rules ---
// (:BusinessRule)-[:CONSTRAINS]->(:BusinessEntity)
// (:BusinessRule)-[:APPLIES_IN]->(:BusinessProcess)
// (:BusinessRule)-[:AFFECTS]->(:EntityAttribute)
// (:BusinessRule)-[:APPLIES_AT_STEP]->(:WorkflowStep)         # step-level rule binding
//
// --- Glossary ---
// (:GlossaryTerm)-[:DEFINES]->(:BusinessEntity)
// (:GlossaryTerm)-[:DEFINES]->(:BusinessRole)
// (:GlossaryTerm)-[:DEFINES]->(:BusinessProcess)
// (:GlossaryTerm)-[:ALIAS_OF]->(:GlossaryTerm)               # synonym resolution
//
// --- System context ---
// (:SystemContext)-[:HAS_STAKEHOLDER]->(:Stakeholder)
// (:SystemContext)-[:HAS_EXTERNAL_ENTITY]->(:ExternalEntity)
// (:ExternalEntity)-[:HAS_FLOW {direction: String, data_description: String}]->(:SystemContext)
// -----------------------------------------------------------------------------
