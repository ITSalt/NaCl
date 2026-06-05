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

CREATE CONSTRAINT constraint_decision_id
  FOR (n:Decision) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_screen_id
  FOR (n:Screen) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_screenstate_id
  FOR (n:ScreenState) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_screenevent_id
  FOR (n:ScreenEvent) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_transition_id
  FOR (n:Transition) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_screeneffect_id
  FOR (n:ScreenEffect) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_analyticsevent_id
  FOR (n:AnalyticsEvent) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_slice_id
  FOR (n:Slice) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_domainerror_id
  FOR (n:DomainError) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT constraint_errorpresentation_id
  FOR (n:ErrorPresentation) REQUIRE n.id IS UNIQUE;


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

CREATE INDEX index_decision_status
  FOR (n:Decision) ON (n.status);

CREATE INDEX index_decision_created_at
  FOR (n:Decision) ON (n.created_at);

// Full-text so impact analysis / audit can find prior decisions by keyword.
CREATE FULLTEXT INDEX fulltext_decision_search
  FOR (n:Decision) ON EACH [n.title, n.context, n.rationale];

CREATE INDEX index_screen_name
  FOR (n:Screen) ON (n.name);

CREATE INDEX index_screenstate_kind
  FOR (n:ScreenState) ON (n.state_kind);

CREATE INDEX index_screenevent_kind
  FOR (n:ScreenEvent) ON (n.event_kind);

CREATE INDEX index_screeneffect_kind
  FOR (n:ScreenEffect) ON (n.effect_kind);

CREATE INDEX index_analyticsevent_name
  FOR (n:AnalyticsEvent) ON (n.name);

CREATE INDEX index_slice_name
  FOR (n:Slice) ON (n.name);

CREATE INDEX index_slice_kind
  FOR (n:Slice) ON (n.slice_kind);

CREATE INDEX index_domainerror_code
  FOR (n:DomainError) ON (n.code);

CREATE INDEX index_domainerror_kind
  FOR (n:DomainError) ON (n.error_kind);

CREATE INDEX index_errorpresentation_kind
  FOR (n:ErrorPresentation) ON (n.presentation_kind);


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
// (:FeatureRequest)-[:IMPLEMENTS]->(:Decision)
//   The FeatureRequest is the graph-native change anchor that carried out a
//   decision. The FR markdown file is a rendered projection, NOT the authority.
//
// (:Decision)-[:JUSTIFIES {role: String}]->(target)
//   A decision shaped an artifact. target ∈ {UseCase, DomainEntity, Module,
//   Requirement, Form, Component, Enumeration, APIEndpoint, Screen, Slice,
//   DomainError} (CachePolicy joins later with no schema change).
//   role ∈ {'creates','shapes','constrains'}; default 'shapes'.
//
// (:Decision)-[:SUPERSEDES]->(:Decision)
//   The newer decision replaces an older one. On write, the older Decision gets
//   status='superseded'. This is the year-long evolving-rationale chain: pull
//   one thread, traverse SUPERSEDES, recover the full historicity.
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
//   markdown_path: String      // ".tl/feature-requests/FR-NNN-<slug>.md" (projection, not authority)
// }
//
// --- Decision properties (documented) — graph-native provenance ---
// Decision {
//   id: String,                       // "DEC-NNN" (project-wide sequence, like ADR-NNN)
//   title: String,                    // one-line "what was decided"  [REQUIRED on write]
//   chosen: String,                   // the option taken             [REQUIRED on write]
//   rationale: String,                // WHY chosen — the load-bearing field [REQUIRED on write]
//   source: String,                   // provenance handle: "FR-NNN" | git sha | "ADR-NNN (imported)" [REQUIRED]
//   context: String,                  // the forces that made a decision necessary (default "")
//   alternatives_considered: [String],// options weighed (default [])
//   status: String,                   // "accepted" | "superseded" | "proposed"
//   created_at: DateTime,
//   created_by: String,               // "nacl-sa-feature" | "nacl-tl-fix" | "nacl-sa-finalize" | human
//   level: String                     // "L2" | "L3-spec-gap" | "feature" | "architecture"
// }
//
// --- Extended UseCase properties (documented) ---
// UseCase {
//   ...existing properties...,
//   user_story: String,              // "As a [role], I want [action] so that [value]"
//   acceptance_criteria: [String],   // list of acceptance criteria
//   priority: String,                // "MVP" | "Post-MVP" | "Nice-to-have"
//   spec_version: Int                // bumped by any SA writer that changes UC shape
//                                    // (nacl-sa-uc, nacl-sa-feature, nacl-tl-fix L2/L3).
//                                    // Compared against Task.planned_from_version for
//                                    // idempotent incremental re-planning. Read with
//                                    // coalesce(uc.spec_version, 0).
// }
//
// --- Staleness / review-status properties (documented) ---
// These four properties may appear on any SA/TL node that carries an embedded
// snapshot of upstream state (primarily Task, but also UseCase, Form,
// Requirement). They are set by write-skills (nacl-sa-feature, nacl-tl-fix
// L2/L3) after running the sa_impact_closure traversal, and cleared on
// successful re-sync (nacl-tl-plan regen, nacl-tl-fix verify). All are read
// with coalesce(n.review_status,'current') — no migration/backfill needed; an
// absent property means 'current'.
//   review_status : String     // 'current' | 'stale'   (default 'current')
//   stale_reason  : String      // human-readable cause, e.g. "upstream UC-014 modified"
//   stale_since   : DateTime     // when it was stamped
//   stale_origin  : String       // id of the node whose change caused it (UC/FR) — lineage answer


// ---------------------------------------------------------------------------
// 3-bis. SCREEN STATE MACHINE (deterministic UI behavior, owned by nacl-sa-ui)
// ---------------------------------------------------------------------------
// Mirrors the BA entity-state pattern (EntityState-[:TRANSITIONS_TO]->) at the
// SA level, but with a REIFIED Transition node: (a) the validator needs a stable
// transition id for reports, (b) only a node can be the source of
// TRIGGERS->ScreenEffect, (c) a reified node falls under the orphan check.
//
// NAMESPACE NOTE (label-qualify in every query): two edge-type names are shared
// with the BA layer by deliberate pattern-mirroring —
//   HAS_STATE  : (:BusinessEntity)->(:EntityState)  AND  (:Screen)->(:ScreenState)
//   TRIGGERS   : (:BusinessProcess)->(:BusinessProcess)  AND  (:Transition)->(:ScreenEffect)
// NAVIGATES_TO also pre-exists in older graphs as Form->Form / Component->Form
// navigation. Always constrain by node labels; never match these by type alone.
//
// (:UseCase)-[:HAS_SCREEN]->(:Screen)
//   REQUIRED parent. Every Screen belongs to exactly one UseCase (L10.1).
//
// (:Screen)-[:RENDERS]->(:Form)
//   REQUIRED sibling (L10.2; exemption: Screen.formless=true). This is the
//   bridge that makes a DomainAttribute change reach the screen:
//   DA <-MAPS_TO- FormField <-HAS_FIELD- Form <-RENDERS- Screen -> states.
//   Without RENDERS the screen is unreachable from the domain model.
//
// (:Screen)-[:HAS_STATE]->(:ScreenState)
//   REQUIRED parent of each state (L10.1).
//
// (:Screen)-[:HAS_EVENT]->(:ScreenEvent)
//   REQUIRED parent of each event (L10.1).
//
// (:Screen)-[:HAS_TRANSITION]->(:Transition)
//   REQUIRED parent of each reified transition (L10.1).
//
// (:Transition)-[:FROM_STATE]->(:ScreenState)
// (:Transition)-[:TO_STATE]->(:ScreenState)
// (:Transition)-[:ON_EVENT]->(:ScreenEvent)
//   REQUIRED, exactly one each, and the target must belong to the SAME Screen
//   as the Transition (L10.3 reference validity).
//
// (:Transition)-[:TRIGGERS]->(:ScreenEffect)
//   0..n side effects fired when the transition is taken. Parent edge of
//   ScreenEffect (L10.1).
//
// (:ScreenEffect)-[:CALLS]->(:APIEndpoint)
//   REQUIRED for effect_kind in {load, mutate} (L10.2/L10.7). If the endpoint
//   does not exist yet at authoring time, nacl-sa-ui MERGEs a provisional one
//   (provisional=true) plus (:UseCase)-[:EXPOSES]-> so it cannot orphan;
//   nacl-tl-plan enriches it later from api-contracts.
//
// (:ScreenEffect)-[:NAVIGATES_TO]->(:Screen)
//   REQUIRED for effect_kind = 'navigate' (L10.2).
//
// (:ScreenEffect)-[:EMITS]->(:AnalyticsEvent)
//   REQUIRED for effect_kind = 'analytics' (L10.2). AnalyticsEvent is a minimal
//   sink node — without it an analytics effect would be a dead end and fail the
//   connectivity invariant.
//
// --- Screen state machine properties (documented) ---
// Screen {
//   id: String,            // "SCR-<PascalName>"
//   name: String,
//   description: String,
//   route: String,          // optional URL route, mirrors Component.route
//   formless: Boolean,      // exemption flag for L10.2 (screen renders no Form,
//                           // e.g. splash / 404); default false
//   created_by: String,     // "nacl-sa-ui"
//   created_at: DateTime
// }
// ScreenState {
//   id: String,             // "SCRST-<Screen>-<State>"
//   name: String,
//   state_kind: String,     // 'initial' | 'loading' | 'busy' | 'content' | 'empty' | 'error'
//                           // 'busy' = a user-initiated operation in progress
//                           // (recording, uploading, processing) — distinct from
//                           // 'loading' (fetching data to display). Added after the
//                           // first real non-CRUD screen (voice recorder) had to
//                           // flatten three distinct pipeline stages into 'loading'.
//   is_initial: Boolean,    // exactly ONE per Screen (L10.5a)
//   terminal: Boolean       // exemption flag for L10.6 (intentional dead-end
//                           // error state); default false
// }
// ScreenEvent {
//   id: String,             // "SCREV-<Screen>-<Event>"
//   name: String,           // e.g. "OnLoad", "OnLoaded", "OnRetry"
//   event_kind: String      // 'user' | 'system' | 'lifecycle'
// }
// Transition {
//   id: String,             // "SCRTR-<Screen>-NNN" (per-screen counter)
//   guard: String           // optional guard condition; transitions sharing
//                           // (from_state, on_event) MUST all be guarded (L10.4)
// }
// ScreenEffect {
//   id: String,             // "SCREF-<Screen>-NNN" (per-screen counter)
//   effect_kind: String,    // 'load' | 'mutate' | 'navigate' | 'analytics'
//   description: String
// }
// AnalyticsEvent {
//   id: String,             // "ANEV-<Name>"
//   name: String
// }


// ---------------------------------------------------------------------------
// 3-ter. BEHAVIOR SLICES (vertical behavior decomposition, owned by nacl-sa-uc)
// ---------------------------------------------------------------------------
// A Slice is the graph-native acceptance scenario (Given/When/Then): one
// vertical slice of observable UC behavior, below the UseCase (a UC has
// several slices), above the Task (tasks stay per-UC — the slice layer is an
// OVERLAY; per-slice tasks are deliberately out of scope). Adoption is opt-in:
// a graph with zero Slice nodes passes L11 vacuously, exactly as a graph with
// zero Screen nodes passes L10.
//
// ANCHOR INVARIANT (L11.2): every Slice must carry at least one behavioral
// anchor — COVERS into the screen state machine and/or CALLS to an
// APIEndpoint. An anchorless slice is prose that change propagation can never
// reach (the precise drift this whole extension family exists to kill); such
// text belongs in UseCase.acceptance_criteria, not in a node. There is
// deliberately NO exemption flag for L11.2.
//
// NAMESPACE NOTE: the CALLS edge-type name is shared with
// (:ScreenEffect)-[:CALLS]->(:APIEndpoint) from § 3-bis — deliberately: the
// semantics are identical ("artifact invokes endpoint") and the sharing
// precedent (HAS_STATE/TRIGGERS/NAVIGATES_TO) is accepted. Label-qualify the
// SOURCE in every query: (sl:Slice)-[:CALLS]-> vs (eff:ScreenEffect)-[:CALLS]->.
//
// (:UseCase)-[:HAS_SLICE]->(:Slice)
//   REQUIRED parent. Every Slice belongs to exactly one UseCase (L11.1).
//
// (:Slice)-[:COVERS]->(:ScreenState)
// (:Slice)-[:COVERS]->(:Transition)
//   UI-behavior anchor into the Phase-1 screen-machine hub. A state target
//   means "the slice covers being in this state" (e.g. Empty); a transition
//   target means "the slice covers this behavior" (e.g. Error→Loading on
//   retry). The target must belong to a Screen of the slice's OWN UseCase
//   (L11.3, mirrors the L10.3 same-screen rule).
//
// (:Slice)-[:CALLS]->(:APIEndpoint)
//   Backend-behavior anchor. For backend-only UCs (has_ui=false) this is the
//   only anchor available. When the endpoint does not exist yet, use the
//   provisional path from § 3-bis (MERGE provisional=true + (:UseCase)-[:EXPOSES]->).
//
// (:Slice)-[:VERIFIED_BY]->(:Task)
//   TL overlay: which per-UC delivery unit proves this behavior. NOT required
//   at authoring time (tasks may not exist before nacl-tl-plan has run);
//   REQUIRED once the parent UC has GENERATES tasks (L11.4 verification
//   closure — self-healing: nacl-tl-plan MERGEs these edges when it
//   (re)plans a UC that has slices).
//
// --- Slice properties (documented) ---
// Slice {
//   id: String,             // "SLC-{NNN}-{PascalName}" — NNN is the UC number
//                           // (SLC-006-HappyPath); the NNN infix makes repeated
//                           // scenario names unique across UCs and enables the
//                           // scoped-L11 filter sl.id STARTS WITH 'SLC-NNN-'
//   name: String,           // short scenario name ("Happy path", "Empty result")
//   slice_kind: String,     // 'happy' | 'alternate' | 'error' | 'edge' (L11.6b)
//   given: String,          // precondition (recommended)
//   when: String,           // trigger (recommended)
//   then: String,           // observable outcome [REQUIRED non-blank on write —
//                           // L11.6a, mirrors the L9.3 empty-rationale gate:
//                           // a slice with no observable outcome is unverifiable]
//   criterion_index: Int,   // optional back-ref into UseCase.acceptance_criteria
//   created_by: String,     // "nacl-sa-uc"
//   created_at: DateTime
// }


// ---------------------------------------------------------------------------
// 3-quater. DOMAIN ERROR TAXONOMY (transport-independent, owned by nacl-sa-uc)
// ---------------------------------------------------------------------------
// A DomainError is a named, catalogued failure mode of the domain
// (PROMO_NOT_FOUND) — transport-independent: the code is the source of truth,
// the HTTP status is only a projection hint. An ErrorPresentation is how one
// error is presented to the user (user-language message + presentation kind).
// Adoption is opt-in: a graph with zero DomainError nodes passes L12 vacuously,
// exactly as zero Screens pass L10 and zero Slices pass L11.
//
// OWNERSHIP: the catalog is MODULE-scoped, not UC-scoped — an error is shared
// vocabulary of a bounded context (the same ALREADY_SUBSCRIBED is raised by
// endpoints of different UCs). MERGE by id shares the node across UCs; the
// producer guard refuses UCs that have no CONTAINS_UC module.
//
// ANCHOR INVARIANT (L12.2, deliberately NO exemption flag, mirrors L11.2):
//   - every DomainError carries ≥1 incoming (api:APIEndpoint)-[:MAY_RAISE]->.
//     An error observable at no API surface is not a domain error but an
//     implementation detail — it belongs in Requirements / RuntimeContract
//     notes, not in a node. Pipeline failures of backend UCs are observable
//     through their status endpoint — that endpoint is the surface.
//   - every ErrorPresentation carries ≥1 incoming (st:ScreenState)-[:SHOWS]->.
//     A presentation no state shows is dead text.
// MAY_RAISE may legally point at provisional endpoints (provisional=true +
// EXPOSES anchor — the § 3-bis path); real graphs may have no concrete
// APIEndpoint nodes at all before nacl-tl-plan runs.
//
// (:Module)-[:HAS_ERROR]->(:DomainError)
//   REQUIRED parent. Every DomainError belongs to exactly one Module (L12.1).
//
// (:APIEndpoint)-[:MAY_RAISE]->(:DomainError)
//   Cross-layer anchor: calling this endpoint may yield this error. Several
//   endpoints (across UCs and modules) may raise the same error.
//
// (:ScreenState)-[:HANDLES]->(:DomainError)
//   Being in this state IS the handling of this error. CHANNEL RULE (L12.3):
//   legal iff the state's Screen has a ScreenEffect-[:CALLS]->(endpoint) that
//   MAY_RAISE the error — the exact channel through which the UI receives it.
//   There is deliberately NO same-UC rule (asymmetric to L11.3): errors are
//   shared vocabulary; a UC-B screen legally handles an error raised by a
//   UC-A endpoint when it actually calls that endpoint. Source is ScreenState
//   only, never Transition (the retry escape is L10.6's concern).
//
// (:DomainError)-[:PRESENTED_AS]->(:ErrorPresentation)
//   REQUIRED parent of each presentation (L12.1). One error may have several
//   presentations (inline on the form screen, toast on a list screen).
//
// (:ScreenState)-[:SHOWS]->(:ErrorPresentation)
//   Triangle closure: which presentation of the error this state renders.
//   Requires (st)-[:HANDLES]->(error) on the presentation's parent error
//   (L12.5) — showing a presentation of an unhandled error is mis-wiring.
//
// --- DomainError properties (documented) ---
// DomainError {
//   id: String,             // "ERR-{UPPER_SNAKE_CODE}" (ERR-PROMO_NOT_FOUND)
//   code: String,           // REQUIRED non-blank (L12.6a) — the join key to the
//                           // API envelope and the codebase. Domain-prefixed
//                           // UPPER_SNAKE latin: PROMO_NOT_FOUND, never NOT_FOUND
//                           // (prefix discipline keeps module catalogs collision-free).
//                           // Granularity: one node per code the API envelope can
//                           // distinguish; field-level form validation is ONE
//                           // VALIDATION_FAILED (details live in the presentation).
//   name: String,
//   description: String,
//   error_kind: String,     // 'validation' | 'not_found' | 'conflict' | 'permission'
//                           // | 'rate_limit' | 'external' | 'internal' (L12.6b)
//   http_status: Int,       // optional projection hint (404, 409, …) — transport
//                           // is NOT the source of truth, the code is
//   retryable: Boolean,     // optional; feeds Phase-4 cache/degradation policies
//   created_by: String,     // "nacl-sa-uc" | "nacl-tl-fix"
//   created_at: DateTime
// }
// ErrorPresentation {
//   id: String,             // "ERRP-{CODE}-{PascalName}" (ERRP-PROMO_NOT_FOUND-Inline);
//                           // PascalName derives from the presentation kind/context
//                           // by the Phase-1 latin-PascalName rule
//   message: String,        // REQUIRED non-blank (L12.6a) — USER-LANGUAGE text,
//                           // never the internal code (mirrors the L9.3 / L11.6a
//                           // "forgot why" → "forgot what the user sees" gate).
//                           // For kind='silent' the message documents the
//                           // observable absence ("stale data stays visible,
//                           // no interruption") — deliberate silence is a
//                           // decision, not a gap.
//   presentation_kind: String, // 'toast' | 'banner' | 'inline' | 'modal'
//                              // | 'fullscreen' | 'silent' (L12.6b)
//   recovery_action: String,   // optional: 'retry' | 'back' | 'support' | 'none'
//   created_by: String,     // "nacl-sa-uc"
//   created_at: DateTime
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
