// =============================================================================
// UI Reachability — Neo4j Graph Schema and Rule (SA Layer, sa-ui owner)
// =============================================================================
// File: nacl-sa-ui/references/reachability.cypher
// Wave: W7-ui-reachability
// Description: Cypher template for the UI-reachability graph rule. The rule
//              fires when an actor-triggered UseCase (actor != SYSTEM) lacks
//              an inbound HAS_INBOUND_ACTION edge from a reachable Component.
//              A reachable Component is one transitively reachable from the
//              root navigation entrypoint via parent_menu / route mounting.
//
// Worked examples (see nacl-sa-ui/SKILL.md "Nav Actions" subsection):
//   - Project-Beta UC-100 "upload audio" missing upload button on the catalog
//     page. UC-100 had a Form with `open_button`, but no Component in the
//     navigation tree carried a HAS_INBOUND_ACTION edge to FORM-Upload,
//     so a user landing on `/catalog` could not reach `/upload` without
//     typing the URL.
//   - Project-Alpha admin UCs UC-301/302/303/305 lacked any AdminLayout sidebar
//     entry. The Forms existed and routes mounted, but no reachable
//     Component pointed to them. Users could only reach the screens by
//     pasting the URL.
//
// SCOPE: this file is a template / schema reference. It is consumed by
// nacl-sa-validate (consumer-side; not changed by W7) and by nacl-tl-review
// (primary-owner exception declared in W7 scope_in). It is NOT a validator —
// the actual validator is owned by nacl-sa-validate.
// =============================================================================


// ---------------------------------------------------------------------------
// 1. NODE LABELS USED BY THE RULE
// ---------------------------------------------------------------------------
//
//   Component       — UI Component (existing label; created by nacl-sa-ui
//                     `components` and `navigation` phases). Components with
//                     `component_type = 'navigation'` carry route/menu props.
//   Form            — UI Form (existing label; created by nacl-sa-uc detail).
//   UseCase         — UseCase (existing label).
//   SystemRole      — Actor role (existing label). The literal name "SYSTEM"
//                     identifies machine actors; UCs with actor=SYSTEM are
//                     excluded from this rule.
//
// All node IDs follow the SA-layer convention from nacl-core/SKILL.md.


// ---------------------------------------------------------------------------
// 2. EDGE TYPES
// ---------------------------------------------------------------------------
//
//   HAS_INBOUND_ACTION   — NEW edge introduced by W7.
//                          Component -[:HAS_INBOUND_ACTION]-> Form
//                          Declares: "this Component exposes an action
//                          (button, menu item, link, CTA) that triggers
//                          the Form (and through it the UC)".
//                          Cardinality: many Components MAY have an inbound
//                          action edge to the same Form. A Form with zero
//                          inbound edges and actor != SYSTEM is the blocker.
//
//   USED_IN              — existing (Component used in a Form's render). NOT
//                          equivalent to HAS_INBOUND_ACTION. USED_IN means
//                          "Component is rendered as part of this Form's
//                          screen"; HAS_INBOUND_ACTION means "Component
//                          exposes a user affordance to navigate to / open
//                          this Form". Both edges may co-exist between the
//                          same pair.
//
//   USES_FORM            — existing (UseCase uses a Form to expose itself).
//   HAS_FIELD            — existing.
//   ACTOR                — existing (UseCase ACTOR SystemRole).
//   CONTAINS_UC          — existing (Module contains UseCase).
//
//   Reachability traversal (Query 2 below) walks the navigation tree:
//
//     Component { component_type: 'navigation', parent_menu: null }
//                                                       (the root navigation)
//        -- (recursive via Component.parent_menu) -->
//     Component { component_type: 'navigation', parent_menu: <parent.id> }
//        -- USED_IN --> Form
//        -- HAS_INBOUND_ACTION --> Form
//
//   A Component is "reachable from root" iff it sits in the parent_menu
//   chain rooted at a Component with parent_menu IS NULL.


// ---------------------------------------------------------------------------
// 3. PROPERTY KEYS
// ---------------------------------------------------------------------------
//
// Component.id              string  — e.g. "CMP-NavDashboard"
// Component.name            string
// Component.component_type  string  — "navigation" | "display" | ...
// Component.route           string  — e.g. "/", "/upload", "/admin/users"
// Component.roles           string  — comma-separated, e.g. "Admin,Manager"
// Component.menu_order      integer
// Component.parent_menu     string  — parent Component.id or NULL (root)
//
// Form.id                   string  — e.g. "FORM-Upload"
// Form.name                 string
//
// UseCase.id                string  — e.g. "UC-100"
// UseCase.actor             string  — convenience copy of ACTOR'ed SystemRole.name;
//                                     queries below resolve via the ACTOR edge
//                                     when this denormalized field is absent.
//
// SystemRole.id             string  — e.g. "ROLE-SYSTEM"
// SystemRole.name           string  — the literal "SYSTEM" identifies machine
//                                     actors and is the excluded value below.


// ---------------------------------------------------------------------------
// 4. QUERY 1 — RULE: actor-triggered UCs lacking inbound nav-action
//              from a reachable Component
// ---------------------------------------------------------------------------
//
// Purpose: enumerate every UseCase that is user-triggered (actor != SYSTEM)
// whose Forms have zero inbound HAS_INBOUND_ACTION edges originating at a
// reachable Component. Each row of the result set is a blocker; consumers
// (sa-validate, tl-review) refuse VERIFIED until the result set is empty
// or each row is covered by a signed exception (W4).
//
// Parameters:
//   $rootComponentId        string  (optional) — id of the root navigation
//                                                Component. If null, the
//                                                root is auto-detected as
//                                                the Component(s) with
//                                                component_type='navigation'
//                                                AND parent_menu IS NULL.
//
// Result columns:
//   uc_id, uc_name, actor_name, form_id, form_name, reason
//
//   reason ∈ {
//     'no-form'                — UC has no USES_FORM edge,
//     'no-inbound-action'      — Form exists but no HAS_INBOUND_ACTION edge,
//     'unreachable-component'  — HAS_INBOUND_ACTION edges exist but every
//                                source Component is NOT reachable from root
//   }
//
// =============================================================================

// ui_reachability_blockers
WITH coalesce($rootComponentId, '__AUTO__') AS rootHint
// Step 1: compute reachable Components transitively from any navigation root.
// A "root" Component is one with component_type='navigation' AND
// parent_menu IS NULL. If $rootComponentId is provided, the traversal seed
// is restricted to that id only.
CALL {
  WITH rootHint
  MATCH (root:Component { component_type: 'navigation' })
  WHERE root.parent_menu IS NULL
    AND (rootHint = '__AUTO__' OR root.id = rootHint)
  // Walk the parent_menu chain downward to all descendants.
  // parent_menu stores the parent Component.id as a string property.
  MATCH path = (root)<-[:PARENT_OF*0..]-(descendant:Component)
  // Note: PARENT_OF is the inverse view. If the project models the
  // parent_menu relationship as a string property only (no explicit
  // PARENT_OF edge), use the recursive form below instead.
  RETURN collect(DISTINCT descendant) AS reachable_components
}

// Step 2: enumerate all actor-triggered UseCases.
MATCH (uc:UseCase)-[:ACTOR]->(role:SystemRole)
WHERE coalesce(role.name, '') <> 'SYSTEM'
  // Formless screens (splash / 404 / landing) render no Form BY
  // specification, so the 'no-form' blocker below is inapplicable —
  // there is no Form to reach. Excluded here as a structural, self-
  // justifying exemption (like actor=SYSTEM), mirroring sa-validate
  // L10.2's exemption of formless screens from the RENDERS -> Form rule.
  // A real Form that merely lacks an inbound action still blocks.
  AND NOT EXISTS {
    MATCH (uc)-[:HAS_SCREEN]->(scr:Screen)
    WHERE coalesce(scr.formless, false) = true
  }

// Step 3: pull the UC's Forms (may be zero).
OPTIONAL MATCH (uc)-[:USES_FORM]->(f:Form)

// Step 4: for each Form, check inbound HAS_INBOUND_ACTION edges from
// reachable Components.
OPTIONAL MATCH (c:Component)-[:HAS_INBOUND_ACTION]->(f)
WHERE c IN reachable_components

WITH uc, role, f,
     reachable_components,
     collect(DISTINCT c) AS reachable_inbound_components
WITH uc, role, f, reachable_inbound_components,
     CASE
       WHEN f IS NULL THEN 'no-form'
       WHEN size(reachable_inbound_components) = 0
            AND NOT EXISTS { MATCH (:Component)-[:HAS_INBOUND_ACTION]->(f) }
         THEN 'no-inbound-action'
       WHEN size(reachable_inbound_components) = 0
            AND EXISTS { MATCH (:Component)-[:HAS_INBOUND_ACTION]->(f) }
         THEN 'unreachable-component'
       ELSE NULL
     END AS reason

WHERE reason IS NOT NULL
RETURN uc.id           AS uc_id,
       uc.name         AS uc_name,
       role.name       AS actor_name,
       coalesce(f.id, '<no-form>')     AS form_id,
       coalesce(f.name, '<no-form>')   AS form_name,
       reason
ORDER BY uc_id, form_id;


// ---------------------------------------------------------------------------
// 5. QUERY 2 — REACHABLE COMPONENTS (transitive via parent_menu / route)
// ---------------------------------------------------------------------------
//
// Purpose: return the set of Components reachable from any navigation root,
// for consumers that need the raw set (debugging, sa-validate reports,
// tl-review evidence section).
//
// Two equivalent traversal forms are documented below. Use form B if the
// project models parent_menu only as a string property (no explicit
// PARENT_OF edge created during sa-ui `navigation`).
//
// Result columns:
//   component_id, component_name, route, menu_order, depth
// =============================================================================

// reachable_components_form_a  (uses PARENT_OF edges if they exist)
MATCH (root:Component { component_type: 'navigation' })
WHERE root.parent_menu IS NULL
MATCH path = (root)<-[:PARENT_OF*0..]-(c:Component)
RETURN c.id           AS component_id,
       c.name         AS component_name,
       c.route        AS route,
       c.menu_order   AS menu_order,
       length(path)   AS depth
ORDER BY depth, menu_order, component_id;

// reachable_components_form_b  (string-property recursion; portable when
// PARENT_OF edges are not materialized — this is the default shape created
// by sa-ui `navigation` Phase 3.1 today)
//
// Conceptually:
//   reachable = { c : c.parent_menu IS NULL AND c.component_type='navigation' }
//             ∪ { c : c.parent_menu = p.id  AND p ∈ reachable }
//
// In Cypher (Neo4j 5 syntax with sub-query iteration):
//
//   CALL {
//     MATCH (c:Component { component_type: 'navigation' })
//     WHERE c.parent_menu IS NULL
//     RETURN c, 0 AS depth
//     UNION
//     MATCH (parent:Component { component_type: 'navigation' })
//     WHERE parent.parent_menu IS NOT NULL
//     // Iterative resolution: depth_n = depth_{n-1} + 1
//     // Drivers without recursive CTEs should call this query
//     // multiple times until the result set is stable, or use a
//     // procedure such as apoc.path.subgraphAll.
//     RETURN parent AS c, 1 AS depth
//   }
//   RETURN c.id, c.name, c.route, c.menu_order, depth
//
// For projects on Neo4j 5+, the recommended portable form is to materialize
// PARENT_OF edges at sa-ui `navigation` write time (Phase 3.1 should emit
// `MERGE (parent)-[:PARENT_OF]->(child)`); then Query 5/form-a applies
// directly.


// ---------------------------------------------------------------------------
// 6. EXEMPTION FLAGS
// ---------------------------------------------------------------------------
//
// A UC may legitimately lack a navigation-tree entrypoint and still be valid:
//
//   - UC.actor = 'SYSTEM'                       (already excluded above)
//   - UC.has_ui = false                         (machine-only UC; no Form)
//   - UC.entrypoint_type IN ['deep-link-only',  (intentional URL-only access,
//                            'embed-only']       e.g. invitation links)
//   - a HAS_SCREEN screen with formless=true    (splash / 404 / landing;
//                                                renders no Form by spec —
//                                                already excluded above)
//
// Query 1 above implements the actor-SYSTEM AND formless-screen exclusions
// (both structural and self-justifying). The remaining exemption flags
// (has_ui, entrypoint_type) are consumed by sa-validate when wrapping this
// query — see nacl-sa-validate (consumer-side, owner of the full validator).


// ---------------------------------------------------------------------------
// 7. CONSUMER CONTRACT (informative)
// ---------------------------------------------------------------------------
//
// The two queries above are CONSUMED by:
//   - nacl-sa-validate  — internal L-rule check; emits BLOCKED at validator
//                         level when Query 1 returns any rows.
//   - nacl-tl-review    — primary-owner exception (W7 scope_in); the consumer
//                         check in tl-review SKILL.md "Nav-actions consumer
//                         check" subsection refuses APPROVED when the UCs
//                         affected by the current review intersect Query 1's
//                         result set.
//
// Both consumers read the result set; they do not mutate the graph. Writes
// to HAS_INBOUND_ACTION edges happen during nacl-sa-uc `navigation` Phase 3
// when the user confirms each Form's nav-actions list (see SKILL.md).
