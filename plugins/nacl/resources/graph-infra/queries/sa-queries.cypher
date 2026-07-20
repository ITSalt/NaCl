// =============================================================================
// SA Layer — Named Cypher Queries
// =============================================================================
// File: graph-infra/queries/sa-queries.cypher
// Task: TECH-007
// =============================================================================


// ---------------------------------------------------------------------------
// Query: sa_uc_full_context
// Params: $ucId — UseCase.id (e.g. "UC-101")
// Description: Full UC subgraph — the KEY query for tl-plan.
//   Returns: UseCase, ActivitySteps, Forms, FormFields, mapped DomainAttributes,
//   DomainEntities, Requirements, SystemRole.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc,
       collect(DISTINCT as_step) AS activity_steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT ff) AS form_fields,
       collect(DISTINCT da) AS domain_attributes,
       collect(DISTINCT de) AS domain_entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles;


// ---------------------------------------------------------------------------
// Query: sa_domain_model
// Description: All domain entities with their attributes and inter-entity
//              relationships. The complete domain model.
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
RETURN de,
       collect(DISTINCT da) AS attributes,
       collect(DISTINCT {target: de2.name, rel_type: rel.rel_type, cardinality: rel.cardinality}) AS relationships;


// ---------------------------------------------------------------------------
// Query: sa_form_domain_mapping
// Params: $formId — Form.id (e.g. "FORM-OrderCreate")
// Description: FormField → DomainAttribute mapping for a specific form.
//              Shows how UI fields connect to domain attributes.
// ---------------------------------------------------------------------------
MATCH (f:Form {id: $formId})-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
RETURN f.name AS form_name,
       ff.name AS field_name, ff.field_type AS field_type, ff.label AS field_label,
       da.name AS attribute_name, da.data_type AS attribute_type,
       de.name AS entity_name;


// ---------------------------------------------------------------------------
// Query: sa_module_overview
// Params: $moduleId — Module.id (e.g. "mod-orders")
// Description: All use cases and domain entities in a module.
// ---------------------------------------------------------------------------
MATCH (m:Module {id: $moduleId})
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m,
       collect(DISTINCT uc) AS use_cases,
       collect(DISTINCT de) AS entities;


// ---------------------------------------------------------------------------
// Query: sa_uc_dependencies
// Description: Graph of UC DEPENDS_ON relationships (for planning).
// ---------------------------------------------------------------------------
MATCH (uc:UseCase)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       collect(dep.id) AS depends_on;


// ---------------------------------------------------------------------------
// Query: sa_statistics_summary
// Description: Aggregate counts for specification finalization — nodes by type,
//              coverage percentages, readiness indicators.
// ---------------------------------------------------------------------------
MATCH (m:Module) WITH count(m) AS modules
MATCH (uc:UseCase) WITH modules, count(uc) AS ucs
MATCH (de:DomainEntity) WITH modules, ucs, count(de) AS entities
MATCH (da:DomainAttribute) WITH modules, ucs, entities, count(da) AS attributes
MATCH (f:Form) WITH modules, ucs, entities, attributes, count(f) AS forms
MATCH (ff:FormField) WITH modules, ucs, entities, attributes, forms, count(ff) AS fields
MATCH (sr:SystemRole) WITH modules, ucs, entities, attributes, forms, fields, count(sr) AS roles
MATCH (rq:Requirement) WITH modules, ucs, entities, attributes, forms, fields, roles, count(rq) AS requirements
MATCH (c:Component) WITH modules, ucs, entities, attributes, forms, fields, roles, requirements, count(c) AS components
RETURN modules, ucs, entities, attributes, forms, fields, roles, requirements, components;


// ---------------------------------------------------------------------------
// Query: sa_statistics_extensions
// Description: Aggregate counts for the connected-spec extension layers (2.15+):
//              decision provenance (L8-L9), screen state machines (L10),
//              behavior slices (L11), domain error taxonomy (L12),
//              cache & degradation policies (L13). COUNT {} subqueries are
//              zero-safe: a graph that has not adopted a layer returns 0
//              for its labels, never an empty result.
// ---------------------------------------------------------------------------
RETURN
  COUNT { (n:Decision) }          AS decisions,
  COUNT { (n:Screen) }            AS screens,
  COUNT { (n:ScreenState) }       AS screen_states,
  COUNT { (n:ScreenEvent) }       AS screen_events,
  COUNT { (n:Transition) }        AS screen_transitions,
  COUNT { (n:ScreenEffect) }      AS screen_effects,
  COUNT { (n:AnalyticsEvent) }    AS analytics_events,
  COUNT { (n:Slice) }             AS slices,
  COUNT { (n:DomainError) }       AS domain_errors,
  COUNT { (n:ErrorPresentation) } AS error_presentations,
  COUNT { (n:CachePolicy) }       AS cache_policies,
  COUNT { (n:DegradationRule) }   AS degradation_rules;


// ---------------------------------------------------------------------------
// Query: sa_extension_adoption
// Description: Adoption-aware coverage of the opt-in extension layers (2.15+)
//              for readiness assessment. Three independent zero-safe parts:
//              UC-scoped layers (screens, slices, degradation), module-scoped
//              catalogs (errors, cache), FR decision provenance.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase)
RETURN count(uc) AS total_ucs,
       count(CASE WHEN coalesce(uc.has_ui, false) THEN 1 END) AS ui_ucs,
       count(CASE WHEN EXISTS { (uc)-[:HAS_SCREEN]->(:Screen) } THEN 1 END) AS ucs_with_screens,
       count(CASE WHEN EXISTS { (uc)-[:HAS_SLICE]->(:Slice) } THEN 1 END) AS ucs_with_slices,
       count(CASE WHEN EXISTS { (uc)-[:HAS_DEGRADATION]->(:DegradationRule) } THEN 1 END) AS ucs_with_degradation;

MATCH (m:Module)
RETURN count(m) AS total_modules,
       count(CASE WHEN EXISTS { (m)-[:HAS_ERROR]->(:DomainError) } THEN 1 END) AS modules_with_errors,
       count(CASE WHEN EXISTS { (m)-[:HAS_CACHE]->(:CachePolicy) } THEN 1 END) AS modules_with_cache;

MATCH (fr:FeatureRequest)
RETURN count(fr) AS total_frs,
       count(CASE WHEN EXISTS { (fr)-[:IMPLEMENTS]->(:Decision) } THEN 1 END) AS frs_with_decision,
       count(CASE WHEN coalesce(fr.decision_exempt, false) THEN 1 END) AS frs_exempt;


// ---------------------------------------------------------------------------
// Query: sa_glossary_extract
// Description: Extract unique terms from entity, enumeration, and role names
//              for glossary generation.
// ---------------------------------------------------------------------------
MATCH (de:DomainEntity)
RETURN 'DomainEntity' AS source_type, de.id AS id, de.name AS term
UNION ALL
MATCH (en:Enumeration)
RETURN 'Enumeration' AS source_type, en.id AS id, en.name AS term
UNION ALL
MATCH (sr:SystemRole)
RETURN 'SystemRole' AS source_type, sr.id AS id, sr.name AS term;


// ---------------------------------------------------------------------------
// Query: sa_readiness_assessment
// Description: Per-module completion percentages for specification readiness.
// ---------------------------------------------------------------------------
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
WITH m, count(uc) AS total_ucs,
     count(CASE WHEN uc.detail_status = 'complete' THEN 1 END) AS detailed_ucs
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
WITH m, total_ucs, detailed_ucs, count(de) AS total_entities
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de2:DomainEntity)-[:HAS_ATTRIBUTE]->()
WITH m, total_ucs, detailed_ucs, total_entities,
     count(DISTINCT de2) AS entities_with_attrs
RETURN m.id AS module_id, m.name AS module_name,
       total_ucs, detailed_ucs,
       CASE WHEN total_ucs > 0 THEN round(100.0 * detailed_ucs / total_ucs) ELSE 0 END AS uc_readiness_pct,
       total_entities, entities_with_attrs,
       CASE WHEN total_entities > 0 THEN round(100.0 * entities_with_attrs / total_entities) ELSE 0 END AS entity_readiness_pct;


// ---------------------------------------------------------------------------
// Query: sa_impact_analysis
// Params: $keywords — list of keywords to search
// Description: Find modules, entities, UCs affected by keywords.
//              Used by graph_sa_feature for impact detection.
// ---------------------------------------------------------------------------
CALL db.index.fulltext.queryNodes('fulltext_ba_search', $keywords) YIELD node, score
WHERE score > 0.5
RETURN labels(node)[0] AS node_type, node.id AS id,
       coalesce(node.name, node.term, node.function_name, node.description) AS name,
       score
ORDER BY score DESC
LIMIT 20;


// ---------------------------------------------------------------------------
// Query: sa_next_uc_in_module
// Params: $moduleId — Module.id
// Description: Find next available UC number for a module, with a MANDATORY
//              collision check against ALL UseCase ids. Range-partitioned
//              projects keep the module-local number (candidate = local max + 1,
//              empty module starts at m.uc_range_start); projects with global
//              UC numbering collide on the module-local candidate and fall
//              back to global max + 1, which is collision-free by construction.
// ---------------------------------------------------------------------------
MATCH (m:Module {id: $moduleId})
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(muc:UseCase)
WITH m, max(toInteger(replace(muc.id, 'UC-', ''))) AS localMax
OPTIONAL MATCH (any:UseCase) WHERE any.id =~ 'UC-[0-9]+'
WITH coalesce(localMax + 1, m.uc_range_start, 1) AS candidate,
     collect(toInteger(replace(any.id, 'UC-', ''))) AS allNums
WITH CASE WHEN candidate IN allNums
     THEN reduce(mx = 0, n IN allNums | CASE WHEN n > mx THEN n ELSE mx END) + 1
     ELSE candidate END AS nextNum
RETURN 'UC-' + apoc.text.lpad(toString(nextNum), 3, '0') AS nextUcId;


// ---------------------------------------------------------------------------
// Query: sa_feature_scope
// Params: $ucIds — list of UseCase IDs
// Description: Full subgraph for affected UCs — entities, forms, requirements.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase) WHERE uc.id IN $ucIds
OPTIONAL MATCH (uc)-[:HAS_STEP]->(as_step:ActivityStep)
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)-[:HAS_FIELD]->(ff:FormField)
OPTIONAL MATCH (ff)-[:MAPS_TO]->(da:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (uc)-[:HAS_REQUIREMENT]->(rq:Requirement)
OPTIONAL MATCH (uc)-[:ACTOR]->(sr:SystemRole)
RETURN uc,
       collect(DISTINCT as_step) AS steps,
       collect(DISTINCT f) AS forms,
       collect(DISTINCT de) AS entities,
       collect(DISTINCT rq) AS requirements,
       collect(DISTINCT sr) AS roles;


// ---------------------------------------------------------------------------
// Query: sa_find_uc_by_keywords
// Params: $keywords — search text
// Description: Search UC names and descriptions for intake classification.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase)
WHERE toLower(uc.name) CONTAINS toLower($keywords)
   OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keywords)
RETURN uc.id AS id, uc.name AS name, uc.detail_status AS status
ORDER BY uc.id;


// ---------------------------------------------------------------------------
// Query: sa_impact_closure
// Params: $changedNodeId — id of the node that changed (UC, attribute, endpoint…)
// Description: THE change-propagation engine. Given a changed node, returns the
//   full transitive DOWNSTREAM dependent set ("what must be revisited") AND the
//   UPSTREAM rationale chain ("why the node exists"), across BA→SA→TL layers.
//   No reverse edges are introduced: relationships are matched WITHOUT arrowheads
//   in the downstream half, so traversal crosses each edge in both directions;
//   the type allow-list is what bounds the walk to relevant artifacts.
//   New node-type phases (Screen/Slice/Error/Cache) APPEND their edge types to
//   the allow-list below — that single edit makes them reachable by impact
//   analysis. Read staleness with coalesce(node.review_status,'current').
//   Phase 1 (screen state machine) appended: HAS_SCREEN, RENDERS, HAS_STATE,
//   HAS_EVENT, HAS_TRANSITION, FROM_STATE, TO_STATE, ON_EVENT, TRIGGERS,
//   CALLS, NAVIGATES_TO, EMITS. Note: HAS_STATE/TRIGGERS/NAVIGATES_TO names are
//   shared with BA / legacy nav edges (same precedent as HAS_STEP) — harmless
//   here because this closure is EXPLORATION/DISPLAY ONLY; the staleness gate
//   stamp is computed by the tight directed query in the write-skills, never
//   by this traversal.
//   Phase 2 (behavior slices) appended: HAS_SLICE, COVERS, VERIFIED_BY
//   (downstream) and HAS_SLICE (upstream, mirroring HAS_SCREEN). Slice-CALLS
//   needs no registration — CALLS is already listed (name shared with
//   ScreenEffect-CALLS by design; label-qualify the source in any query that
//   must tell them apart). VERIFIED_BY is deliberately NOT in the upstream
//   half: like GENERATES, it answers "what depends on this", not "why does
//   this exist" — a Task's rationale chain runs through FR/Decision.
//   Phase 3 (domain error taxonomy) appended: HAS_ERROR, MAY_RAISE, HANDLES,
//   PRESENTED_AS, SHOWS (downstream) and HAS_ERROR, PRESENTED_AS (upstream —
//   the two parent edges, mirroring HAS_SCREEN/HAS_SLICE; MAY_RAISE/HANDLES/
//   SHOWS answer "what depends on this", so they stay downstream-only). All
//   five names are NEW (verified free in both schemas, the skill texts, and
//   db.relationshipTypes() of a live graph) — the first phase with no
//   namespace sharing. Deepest legit probe: DomainAttribute → FormField →
//   Form → Screen → ScreenState → HANDLES → DomainError → PRESENTED_AS →
//   ErrorPresentation = 6 hops, exactly the *1..6 ceiling.
//   Phase 4 (cache & degradation) appended: HAS_CACHE, CACHES,
//   HAS_DEGRADATION, ON_ERROR, DEGRADES_TO (downstream) and HAS_CACHE,
//   HAS_DEGRADATION (upstream — the two parent edges, mirroring
//   HAS_ERROR/PRESENTED_AS; CACHES/ON_ERROR/DEGRADES_TO answer "what depends
//   on this", so they stay downstream-only). All five names are again NEW
//   (verified free in both schemas, skill texts, and db.relationshipTypes()
//   of a live graph — grep hits for ON_ERROR are the VALIDATION_ERROR
//   substring in prose). Min-hop notes: DA → DomainEntity → Module →
//   HAS_CACHE → CachePolicy = 3 hops (the catalog-parent shortcut, same
//   effect as Module-HAS_ERROR); DA → … → ScreenState ← DEGRADES_TO ←
//   DegradationRule = 5 hops — ceiling untouched.
// ---------------------------------------------------------------------------
MATCH (changed {id: $changedNodeId})
MATCH path = (changed)
      -[:HAS_ATTRIBUTE|MAPS_TO|HAS_FIELD|USES_FORM|HAS_STEP|HAS_REQUIREMENT
       |ACTOR|CONTAINS_UC|CONTAINS_ENTITY|HAS_ENUM|HAS_VALUE|EXPOSES|IMPLEMENTS
       |GENERATES|INCLUDES_UC|AFFECTS_ENTITY|AFFECTS_MODULE|DEPENDS_ON
       |HAS_SCREEN|RENDERS|HAS_STATE|HAS_EVENT|HAS_TRANSITION|FROM_STATE
       |TO_STATE|ON_EVENT|TRIGGERS|CALLS|NAVIGATES_TO|EMITS
       |HAS_SLICE|COVERS|VERIFIED_BY
       |HAS_ERROR|MAY_RAISE|HANDLES|PRESENTED_AS|SHOWS
       |HAS_CACHE|CACHES|HAS_DEGRADATION|ON_ERROR|DEGRADES_TO*1..6]
      -(dep)
WHERE dep <> changed
WITH dep AS node, min(length(path)) AS hops
RETURN labels(node)[0] AS node_type, node.id AS id,
       coalesce(node.name, node.title, node.description, node.value) AS display,
       hops, 'downstream' AS direction,
       coalesce(node.review_status, 'current') AS review_status,
       node.stale_origin AS stale_origin
UNION
MATCH (changed {id: $changedNodeId})
MATCH up = (origin)
      -[:AUTOMATES_AS|REALIZED_AS|IMPLEMENTED_BY|MAPPED_TO|TYPED_AS|SUGGESTS
       |HAS_REQUIREMENT|INCLUDES_UC|RAISES_REQUIREMENT|CONTAINS_UC|CONTAINS_ENTITY
       |IMPLEMENTS|JUSTIFIES|HAS_SCREEN|HAS_SLICE|HAS_ERROR|PRESENTED_AS
       |HAS_CACHE|HAS_DEGRADATION*1..5]
      ->(changed)
WHERE origin <> changed
WITH origin AS node, min(length(up)) AS hops
RETURN labels(node)[0] AS node_type, node.id AS id,
       coalesce(node.name, node.title, node.description, node.value) AS display,
       hops, 'upstream-rationale' AS direction,
       coalesce(node.review_status, 'current') AS review_status,
       node.stale_origin AS stale_origin
ORDER BY direction, hops, node_type, id;


// ---------------------------------------------------------------------------
// Query: sa_decisions_for_node
// Params: $nodeId — any artifact id (UseCase/DomainEntity/Module/…)
// Description: Every Decision that explains the node's current shape, oldest-first,
//   with the supersession chain made explicit. The graph-native "why is this here"
//   answer — pull one node, see every decision and how each shaped it.
// ---------------------------------------------------------------------------
MATCH (d:Decision)-[j:JUSTIFIES]->(x {id: $nodeId})
OPTIONAL MATCH (d)-[:SUPERSEDES]->(prev:Decision)
OPTIONAL MATCH (newer:Decision)-[:SUPERSEDES]->(d)
RETURN d.id AS decision, d.title AS title, d.rationale AS why,
       j.role AS how, d.status AS status, d.created_at AS when,
       d.source AS source, prev.id AS supersedes, newer.id AS superseded_by
ORDER BY d.created_at ASC;


// ---------------------------------------------------------------------------
// Query: sa_timeline_of_why
// Params: $ucId — UseCase.id
// Description: The full reasoning history of a UseCase, a year later, as one
//   chronological table: every Decision (feature decisions + fix decisions, the
//   latter carry created_by='nacl-tl-fix') and every FeatureRequest that touched
//   it, time-ordered. "Why was this decided" as a single Cypher query.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})
CALL {
  WITH uc
  MATCH (d:Decision)-[:JUSTIFIES]->(uc)
  RETURN 'decision' AS kind, d.created_at AS at, d.id AS id,
         d.title AS what, d.rationale AS why, d.source AS source,
         d.created_by AS by, d.status AS status
  UNION
  WITH uc
  MATCH (fr:FeatureRequest)-[r:INCLUDES_UC]->(uc)
  RETURN 'feature_request' AS kind, fr.created_at AS at, fr.id AS id,
         fr.title AS what, ('UC ' + r.kind) AS why, fr.markdown_path AS source,
         fr.source_skill AS by, fr.status AS status
}
RETURN kind, at, id, what, why, source, by, status
ORDER BY at ASC;


// ---------------------------------------------------------------------------
// Query: sa_screen_machine
// Params: $screenId — Screen.id (e.g. "SCR-ResultViewer")
// Description: The full deterministic state machine of one screen — states,
//   events, reified transitions with guards, and the side effects each
//   transition triggers (with their cross-layer targets: APIEndpoint for
//   load/mutate, Screen for navigate, AnalyticsEvent for analytics).
//   One row per transition: enough to render a Mermaid stateDiagram or to
//   re-check determinism by eye. Label-qualified everywhere because HAS_STATE
//   and TRIGGERS names are shared with the BA layer.
// ---------------------------------------------------------------------------
MATCH (scr:Screen {id: $screenId})
OPTIONAL MATCH (uc:UseCase)-[:HAS_SCREEN]->(scr)
OPTIONAL MATCH (scr)-[:RENDERS]->(f:Form)
OPTIONAL MATCH (scr)-[:HAS_TRANSITION]->(tr:Transition)
OPTIONAL MATCH (tr)-[:FROM_STATE]->(fromSt:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(toSt:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
OPTIONAL MATCH (tr)-[:TRIGGERS]->(eff:ScreenEffect)
OPTIONAL MATCH (eff)-[:CALLS]->(api:APIEndpoint)
OPTIONAL MATCH (eff)-[:NAVIGATES_TO]->(navScr:Screen)
OPTIONAL MATCH (eff)-[:EMITS]->(anev:AnalyticsEvent)
RETURN scr.id AS screen, uc.id AS use_case, f.id AS renders_form,
       tr.id AS transition, fromSt.name AS from_state, ev.name AS on_event,
       tr.guard AS guard, toSt.name AS to_state,
       collect(DISTINCT {
         effect: eff.id, kind: eff.effect_kind,
         target: coalesce(api.id, navScr.id, anev.id)
       }) AS effects
ORDER BY transition;


// ---------------------------------------------------------------------------
// Query: sa_uc_screen_machine
// Params: $ucId — UseCase.id (e.g. "UC-006")
// Description: UC-scoped sibling of sa_screen_machine — the deterministic
//   state machines of every screen this UseCase HAS_SCREEN, one row per
//   transition: screen + route + rendered form, from/to states with their
//   state_kind, the event with its event_kind, the guard, and the effects
//   with their cross-layer targets (load/mutate → APIEndpoint, navigate →
//   Screen, analytics → AnalyticsEvent). Empty result = the UC has not
//   adopted the screen-machine layer (nacl-tl-plan skips the task-fe.md
//   section). Label-qualified everywhere (HAS_STATE/TRIGGERS names are
//   shared with the BA layer). The effects map-collect is null-filtered
//   (the Фаза-2 gotcha: a bare map-collect over an unmatched OPTIONAL emits
//   one all-null map instead of []).
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})-[:HAS_SCREEN]->(scr:Screen)
OPTIONAL MATCH (scr)-[:RENDERS]->(f:Form)
OPTIONAL MATCH (scr)-[:HAS_TRANSITION]->(tr:Transition)
OPTIONAL MATCH (tr)-[:FROM_STATE]->(fromSt:ScreenState)
OPTIONAL MATCH (tr)-[:TO_STATE]->(toSt:ScreenState)
OPTIONAL MATCH (tr)-[:ON_EVENT]->(ev:ScreenEvent)
OPTIONAL MATCH (tr)-[:TRIGGERS]->(eff:ScreenEffect)
OPTIONAL MATCH (eff)-[:CALLS]->(api:APIEndpoint)
OPTIONAL MATCH (eff)-[:NAVIGATES_TO]->(navScr:Screen)
OPTIONAL MATCH (eff)-[:EMITS]->(anev:AnalyticsEvent)
RETURN scr.id AS screen, scr.route AS route, f.id AS renders_form,
       tr.id AS transition,
       fromSt.name AS from_state, fromSt.state_kind AS from_kind,
       ev.name AS on_event, ev.event_kind AS event_kind, tr.guard AS guard,
       toSt.name AS to_state, toSt.state_kind AS to_kind,
       [e IN collect(DISTINCT {
          effect: eff.id, kind: eff.effect_kind,
          target: coalesce(api.id, navScr.id, anev.id)
        }) WHERE e.effect IS NOT NULL] AS effects
ORDER BY screen, transition;


// ---------------------------------------------------------------------------
// Query: sa_uc_slices
// Params: $ucId — UseCase.id (e.g. "UC-006")
// Description: All behavior slices of one UseCase with their anchors and
//   verification — one row per slice: the Given/When/Then contract, the
//   screen-machine elements it COVERS, the endpoints it CALLS, and the tasks
//   that VERIFY it. Enough to render a coverage table or to eyeball L11 by
//   hand. CALLS is label-qualified on the source (the name is shared with
//   ScreenEffect-CALLS). The covers map-collect is null-filtered: a bare
//   collect(DISTINCT {…}) over an unmatched OPTIONAL emits one all-null map
//   instead of [] (caught by the Фаза-2 skill-level verifier on a CALLS-only
//   backend slice); scalar collects (calls/verified_by) skip nulls natively.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})-[:HAS_SLICE]->(sl:Slice)
OPTIONAL MATCH (sl)-[:COVERS]->(cov)
  WHERE cov:ScreenState OR cov:Transition
OPTIONAL MATCH (sl)-[:CALLS]->(api:APIEndpoint)
OPTIONAL MATCH (sl)-[:VERIFIED_BY]->(t:Task)
RETURN sl.id AS slice, sl.name AS name, sl.slice_kind AS kind,
       sl.given AS given, sl.when AS when, sl.then AS then,
       [c IN collect(DISTINCT {id: cov.id, type: labels(cov)[0]})
        WHERE c.id IS NOT NULL] AS covers,
       collect(DISTINCT api.id) AS calls,
       collect(DISTINCT t.id) AS verified_by
ORDER BY slice;


// ---------------------------------------------------------------------------
// Query: sa_uc_errors
// Params: $ucId — UseCase.id (e.g. "UC-035")
// Description: The domain-error contract of one UseCase — every DomainError
//   its EXPOSES endpoints MAY_RAISE, with the handling states of this UC's own
//   screens and the presentations those states SHOW. One row per error: enough
//   to render the BE error-contract table and the FE handling table, or to
//   eyeball L12 by hand. Handling is NOT restricted to this UC's screens by
//   the model (errors are shared vocabulary; the channel rule is the real
//   scope) — this query lists the UC's own handling states because that is
//   what its task files need. Both map-collects are null-filtered: a bare
//   collect over an unmatched OPTIONAL emits one all-null map instead of []
//   (the Фаза-2 gotcha; scalar collects skip nulls natively).
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})-[:EXPOSES]->(api:APIEndpoint)-[:MAY_RAISE]->(err:DomainError)
OPTIONAL MATCH (uc)-[:HAS_SCREEN]->(:Screen)-[:HAS_STATE]->(st:ScreenState)-[:HANDLES]->(err)
OPTIONAL MATCH (st)-[:SHOWS]->(p:ErrorPresentation)<-[:PRESENTED_AS]-(err)
RETURN err.id AS error, err.code AS code, err.error_kind AS kind,
       err.http_status AS http_status, err.retryable AS retryable,
       collect(DISTINCT api.id) AS raised_by,
       [h IN collect(DISTINCT {state: st.id,
                               presentation: p.id,
                               message: p.message,
                               presentation_kind: p.presentation_kind})
        WHERE h.state IS NOT NULL] AS handled_by
ORDER BY error;


// ---------------------------------------------------------------------------
// Query: sa_uc_resilience
// Params: $ucId — UseCase.id (e.g. "UC-006")
// Description: The cache & degradation contract of one UseCase — every
//   CachePolicy that CACHES the data surfaces this UC EXPOSES (with storage,
//   invalidation, ttl, serves_stale), and every DegradationRule the UC owns
//   (with its trigger, fallback, observable degraded behavior, ON_ERROR
//   failure modes incl. their retryable flag, and DEGRADES_TO states).
//   One row per UC: enough to render the BE cache-contract table and the FE
//   degradation-handling table, or to eyeball L13 by hand. Cache policies
//   are listed through the UC's own endpoints because that is what its task
//   files need — the catalog itself is module-scoped shared vocabulary.
//   All map-collects are null-filtered (the Фаза-2 gotcha: a bare map-collect
//   over an unmatched OPTIONAL emits one all-null map instead of []); scalar
//   collects skip nulls natively.
// ---------------------------------------------------------------------------
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:HAS_DEGRADATION]->(dr:DegradationRule)
OPTIONAL MATCH (dr)-[:ON_ERROR]->(err:DomainError)
OPTIONAL MATCH (dr)-[:DEGRADES_TO]->(st:ScreenState)
WITH uc, dr,
     [e IN collect(DISTINCT {id: err.id, code: err.code, retryable: err.retryable})
      WHERE e.id IS NOT NULL] AS on_errors,
     collect(DISTINCT st.id) AS degrades_to
WITH uc,
     [r IN collect(DISTINCT {id: dr.id, name: dr.name, trigger: dr.trigger_kind,
                             fallback: dr.fallback_kind, behavior: dr.behavior,
                             on_errors: on_errors, degrades_to: degrades_to})
      WHERE r.id IS NOT NULL] AS rules
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)<-[:CACHES]-(cp:CachePolicy)
WITH uc, rules, cp, collect(DISTINCT api.id) AS cached_endpoints
WITH uc, rules,
     [c IN collect(DISTINCT {id: cp.id, name: cp.name, storage: cp.storage_kind,
                             invalidation: cp.invalidation_kind, ttl: cp.ttl_seconds,
                             serves_stale: cp.serves_stale, caches: cached_endpoints})
      WHERE c.id IS NOT NULL] AS cache_policies
RETURN uc.id AS uc_id, cache_policies, rules;
