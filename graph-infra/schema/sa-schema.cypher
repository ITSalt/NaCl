// =============================================================================
// SA Layer Schema — Neo4j 5.x
// =============================================================================
// File: graph-infra/schema/sa-schema.cypher
// Task: TECH-005
// Description: Constraints, indexes, and documentation for the SA (Solution
//              Architect) layer of the project graph, plus BA→SA handoff edges.
// =============================================================================


// ---------------------------------------------------------------------------
// 1. UNIQUE CONSTRAINTS (one per SA node label, on `id` property)
// ---------------------------------------------------------------------------

CREATE CONSTRAINT constraint_module_id
  FOR (n:Module) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_usecase_id
  FOR (n:UseCase) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_activitystep_id
  FOR (n:ActivityStep) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_domainentity_id
  FOR (n:DomainEntity) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_domainattribute_id
  FOR (n:DomainAttribute) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_enumeration_id
  FOR (n:Enumeration) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_enumvalue_id
  FOR (n:EnumValue) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_form_id
  FOR (n:Form) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_formfield_id
  FOR (n:FormField) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_requirement_id
  FOR (n:Requirement) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_systemrole_id
  FOR (n:SystemRole) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_component_id
  FOR (n:Component) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_featurerequest_id
  FOR (n:FeatureRequest) REQUIRE n.id IS UNIQUE;


// ---------------------------------------------------------------------------
// 2. INDEXES (name lookup for each label + module index on DomainEntity)
// ---------------------------------------------------------------------------

CREATE INDEX index_module_name
  FOR (n:Module) ON (n.name);

CREATE INDEX index_usecase_name
  FOR (n:UseCase) ON (n.name);

CREATE INDEX index_activitystep_name
  FOR (n:ActivityStep) ON (n.description);

CREATE INDEX index_domainentity_name
  FOR (n:DomainEntity) ON (n.name);

CREATE INDEX index_domainentity_module
  FOR (n:DomainEntity) ON (n.module);

CREATE INDEX index_domainattribute_name
  FOR (n:DomainAttribute) ON (n.name);

CREATE INDEX index_enumeration_name
  FOR (n:Enumeration) ON (n.name);

CREATE INDEX index_enumvalue_name
  FOR (n:EnumValue) ON (n.value);

CREATE INDEX index_form_name
  FOR (n:Form) ON (n.name);

CREATE INDEX index_formfield_name
  FOR (n:FormField) ON (n.name);

CREATE INDEX index_requirement_name
  FOR (n:Requirement) ON (n.description);

CREATE INDEX index_systemrole_name
  FOR (n:SystemRole) ON (n.name);

CREATE INDEX index_component_name
  FOR (n:Component) ON (n.name);

CREATE INDEX index_featurerequest_status
  FOR (n:FeatureRequest) ON (n.status);

CREATE INDEX index_featurerequest_created_at
  FOR (n:FeatureRequest) ON (n.created_at);


// ---------------------------------------------------------------------------
// 3. SA-INTERNAL RELATIONSHIP TYPES (documentation)
// ---------------------------------------------------------------------------
//
// (:Module)-[:CONTAINS_UC]->(:UseCase)
//   Module owns a use case.
//
// (:Module)-[:CONTAINS_ENTITY]->(:DomainEntity)
//   Module owns a domain entity.
//
// (:UseCase)-[:HAS_STEP {order: Int}]->(:ActivityStep)
//   Ordered sequence of activity steps inside a use case.
//
// (:UseCase)-[:USES_FORM]->(:Form)
//   Use case references an interactive form.
//
// (:UseCase)-[:HAS_REQUIREMENT]->(:Requirement)
//   Use case is governed by a requirement.
//
// (:UseCase)-[:DEPENDS_ON]->(:UseCase)
//   Use case depends on another use case.
//
// (:UseCase)-[:ACTOR]->(:SystemRole)
//   Use case is performed by a system role.
//
// (:DomainEntity)-[:HAS_ATTRIBUTE]->(:DomainAttribute)
//   Entity owns an attribute.
//
// (:DomainEntity)-[:RELATES_TO {rel_type: String, cardinality: String}]->(:DomainEntity)
//   Association between domain entities.
//
// (:DomainEntity)-[:HAS_ENUM]->(:Enumeration)
//   Entity uses an enumeration type.
//
// (:Enumeration)-[:HAS_VALUE]->(:EnumValue)
//   Enumeration contains a value.
//
// (:Form)-[:HAS_FIELD]->(:FormField)
//   Form contains a field.
//
// (:FormField)-[:MAPS_TO]->(:DomainAttribute)
//   Form field maps to a domain attribute.
//
// (:SystemRole)-[:HAS_PERMISSION {crud: String}]->(:DomainEntity)
//   Role has CRUD permission on entity.
//
// (:Component)-[:USED_IN]->(:Form)
//   UI component is used in a form.
//
// (:UseCase)-[:EXPOSES]->(:APIEndpoint)
//   Use case is exposed via an API endpoint.
//
// (:FeatureRequest)-[:INCLUDES_UC {kind: String}]->(:UseCase)
//   FeatureRequest scopes a use case. `kind` ∈ {'new','modified'}.
//
// (:FeatureRequest)-[:AFFECTS_MODULE]->(:Module)
//   FeatureRequest impacts a module (architectural touchpoint).
//
// (:FeatureRequest)-[:AFFECTS_ENTITY]->(:DomainEntity)
//   FeatureRequest impacts a domain entity (new or modified).
//
// (:FeatureRequest)-[:RAISES_REQUIREMENT]->(:Requirement)
//   FeatureRequest introduces or updates a requirement (optional).
//
// --- FeatureRequest properties (documented) ---
// FeatureRequest {
//   id: String,                // "FR-NNN"
//   slug: String,              // url-safe slug
//   title: String,
//   description: String,
//   status: String,            // "spec-complete" | "in-development" | "shipped"
//   created_at: DateTime,
//   source_skill: String,      // "nacl-sa-feature"
//   markdown_path: String      // ".tl/feature-requests/FR-NNN-<slug>.md"
// }
//
// --- Extended UseCase properties (documented) ---
// UseCase {
//   ...existing properties...,
//   user_story: String,              // "As a [role], I want [action] so that [value]"
//   acceptance_criteria: [String],   // list of acceptance criteria
//   priority: String                 // "MVP" | "Post-MVP" | "Nice-to-have"
// }


// ---------------------------------------------------------------------------
// 4. BA → SA HANDOFF RELATIONSHIP TYPES (cross-layer edges)
// ---------------------------------------------------------------------------
//
// (:WorkflowStep)-[:AUTOMATES_AS]->(:UseCase)
//   A BA workflow step is automated as an SA use case.
//
// (:BusinessEntity)-[:REALIZED_AS]->(:DomainEntity)
//   A BA business entity is realized as an SA domain entity.
//
// (:EntityAttribute)-[:TYPED_AS]->(:DomainAttribute)
//   A BA entity attribute is typed as an SA domain attribute.
//
// (:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
//   A BA business role maps to an SA system role.
//
// (:BusinessRule)-[:IMPLEMENTED_BY]->(:Requirement)
//   A BA business rule is implemented by an SA requirement.
//
// (:ProcessGroup)-[:SUGGESTS]->(:Module)
//   A BA process group suggests an SA module decomposition.
