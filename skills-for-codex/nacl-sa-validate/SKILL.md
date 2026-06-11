---
name: nacl-sa-validate
description: |
  Validate NaCl SA graph consistency, connectivity, requirements, form-domain
  traceability, UC-form coverage, cross-module rules, feature requests, staleness
  closure, decision provenance, screen state machines, behavior slices, domain
  error taxonomy, cache & degradation policies, and BA-to-SA coverage. Use when
  checking SA quality or says `/nacl-sa-validate`.
---

# NaCl SA Validate For Codex

Validate the SA graph without writing to it. This workflow reports findings and
coverage only; repairs belong to the relevant SA skill and require confirmation.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Goal Compatibility

This skill can be a target behind `nacl-goal` only through the
`validate:module:<MOD-ID>` alias. Reference `../nacl-goal/SKILL.md` and
`../references/goal-codex-contract.md`.

Codex itself must not claim that Anthropic `/goal` ran unless the runtime
exposes it and evidence exists. The deterministic proof source is
`../../nacl-goal/checks/validate.sh <MOD-ID>`, with validation truth surfaced
through GOAL_PROOF. Use the closed Codex status vocabulary when the wrapper
cannot run.

## Workflow

Levels:

- `internal`: SA-only checks.
- `ba-cross`: BA-to-SA traceability checks.
- `full`: internal plus BA-to-SA checks.
- Scoped validation may limit checks to specific modules, use cases, entities,
  or feature requests when the user provides scope.

Pre-flight:

1. Verify graph read tooling.
2. Count canonical SA nodes and report whether the graph has data. The
   canonical set includes the SA-extension labels: `Decision`, the screen-machine
   labels, `Slice`, `DomainError`/`ErrorPresentation`, `CachePolicy`/`DegradationRule`,
   and `APIEndpoint`; a future L14+ level must extend this set in the same change.
3. Detect schema drift by comparing labels and relationship types with the SA
   schema when introspection is available. Known neighbor-layer labels
   (BA family incl. `EntityState`/`GlossaryTerm`/`SystemContext`; TL family
   `Task`/`Wave`/`IntakeItem`; legacy `RuntimeContract`) and zero-count
   constraint-registered label tokens are NOT drift findings.
4. Check BA layer availability before BA-to-SA levels. When `full` is
   requested but the BA layer is empty, run the complete internal set
   (L1-L13) and skip the BA-to-SA cross-checks with a warning in the report.
5. Audit exemption properties used by deeper checks: `has_ui`, `system_only`,
   `shared`, `internal`, `field_category`, and `anchor_exempt` (L3.7).

Internal checks:

- L1 data consistency: required ids, names, property types, duplicate ids, and
  orphan nodes.
- L2 connectivity: modules contain use cases and entities, entities have
  attributes, enums connect to attributes, and core edges are present.
- L3 requirements: use cases have requirements, requirements are typed and
  linked, and BA rules mapped to requirements are not orphaned. L3.7 (CRITICAL):
  every must-anchor requirement (class functional|validation|behavioral|interface,
  read as `coalesce(rq.rq_type,rq.req_type,rq.type,'unknown')` — real graphs store the
  class in any of the three) has a `REALIZED_BY` edge to the step/field/form that
  implements it — `functional`/`behavioral` -> `ActivityStep`, `validation` ->
  `FormField`, `interface` -> `Form`|`Screen`; the overloaded reserved `type` values
  (nfr|adr|question|assumption) and nodes flagged `anchor_exempt=true` are exempt. L3.7b (WARNING) cross-checks the target label against the class; L3.8
  (WARNING, opt-in once any REALIZED_BY exists) flags System steps no requirement realizes.
- L4 form-domain traceability: input fields have `MAPS_TO`, attributes used by
  forms exist, and internal attributes are exempt only when flagged.
- L5 UC-form validation: UI use cases have forms, user steps reference forms
  when appropriate, and forms are linked to use cases.
- L6 cross-module consistency: entities are owned by one module unless marked
  shared, relationships crossing modules are intentional, and dependencies are
  recorded.
- L7 feature request consistency: `FeatureRequest` ids are collision-free,
  linked UCs exist, and requested new or modified scope is traceable.
- L8 staleness closure: no node carries `review_status='stale'` (read with
  `coalesce(n.review_status,'current')`). A stale node is a downstream of an
  upstream change that was never re-synced; `stale_origin`/`stale_since` give the
  lineage. CRITICAL. In scoped runs, restrict to the changed node's dependents.
- L9 decision provenance: every active `FeatureRequest` has
  `IMPLEMENTS -> :Decision`; every non-superseded `:Decision` has a `JUSTIFIES`
  edge and a non-empty `rationale`; superseded decisions carry
  `status='superseded'`. L9.1–L9.3 CRITICAL, L9.4 WARNING. L9.1 exempts
  grandfathered FRs via `coalesce(fr.decision_exempt,false)=false`; L9.5 (INFO)
  lists grandfathered FRs so the debt stays visible. Decisions are the
  graph-native "why" — never stored as standalone markdown. Closing this gap on
  a pre-provenance project follows the provenance-gap-closure runbook (honest
  backfill from the FR's own recorded rationale; grandfather only when none is
  recoverable).
- L10 screen state machines (SA-extension connectivity): no orphaned
  `Screen`/`ScreenState`/`ScreenEvent`/`Transition`/`ScreenEffect`/`AnalyticsEvent`
  nodes; every extension node has its required parent edge (`HAS_SCREEN`,
  `HAS_STATE`, `HAS_EVENT`, `HAS_TRANSITION`, `TRIGGERS`, `EMITS`); every Screen
  has `RENDERS -> Form` (exempt via `coalesce(scr.formless,false)=false`);
  load/mutate effects have `CALLS -> APIEndpoint`, navigate effects
  `NAVIGATES_TO -> Screen`, analytics effects `EMITS -> AnalyticsEvent`; every
  reified Transition has exactly one same-screen `FROM_STATE`/`TO_STATE`/`ON_EVENT`;
  no two transitions share `(from_state, on_event)` unless all are guarded
  (determinism); exactly one `is_initial=true` state per screen and every
  non-initial state is reachable from it; error states have an escape transition
  (exempt via `coalesce(st.terminal,false)=false`; missing user-triggered escape
  is WARNING); effect edges target correct labels; kind vocabularies are
  canonical (`state_kind` ∈ initial|loading|busy|content|empty|error,
  `event_kind` ∈ user|system|lifecycle, `effect_kind` ∈
  load|mutate|navigate|analytics). A graph with zero Screen nodes passes L10
  cleanly. Label-qualify every query — `HAS_STATE` and `TRIGGERS` names are
  shared with the BA layer.
- L11 behavior slices (SA-extension connectivity): no orphaned `Slice` nodes;
  every Slice has its parent `(:UseCase)-[:HAS_SLICE]->`; every Slice has at
  least one behavioral anchor — `COVERS -> ScreenState|Transition` and/or
  `(sl:Slice)-[:CALLS]-> APIEndpoint` (no exemption flag by design: anchorless
  behavior text belongs in `UseCase.acceptance_criteria`, not in a node);
  COVERS targets belong to a screen of the slice's own UC; every slice of a
  planned UC (one that `GENERATES` tasks) has `VERIFIED_BY -> Task` owned by
  that UC (self-healing: `nacl-tl-plan` re-links on re-plan); `VERIFIED_BY`
  and `CALLS` targets carry correct labels; no slice has an empty `then`
  (CRITICAL — the unverifiable-behavior failure, mirror of the L9.3 empty
  rationale); `slice_kind` ∈ happy|alternate|error|edge (WARNING); machine
  elements of slice-adopting UCs not covered by any slice are WARNING;
  a UC with slices but no happy-kind slice is INFO. A graph with zero Slice
  nodes passes L11 cleanly. Label-qualify `CALLS` by source — the name is
  shared with `ScreenEffect -> APIEndpoint`.
- L12 domain error taxonomy (SA-extension connectivity): no orphaned
  `DomainError`/`ErrorPresentation` nodes; every DomainError has its parent
  `(:Module)-[:HAS_ERROR]->` and ≥1 incoming `(api:APIEndpoint)-[:MAY_RAISE]->`
  (no exemption flag by design: an error observable at no API surface is an
  implementation detail, not a domain error; provisional endpoints satisfy the
  anchor); every ErrorPresentation has its parent
  `(:DomainError)-[:PRESENTED_AS]->` and ≥1 incoming
  `(st:ScreenState)-[:SHOWS]->`; `HANDLES` runs ScreenState -> DomainError and
  obeys the channel rule — the handling state's screen has a
  `ScreenEffect-CALLS` to an endpoint that MAY_RAISE the error (deliberately
  NO same-UC rule: errors are shared module vocabulary); MAY_RAISE /
  PRESENTED_AS / SHOWS targets carry correct labels; SHOWS closes the
  triangle (a state never shows a presentation of an error it does not
  handle); no blank `DomainError.code` (the API-envelope join key) or
  `ErrorPresentation.message` (user-language text, never the internal code;
  for `silent` presentations it documents the observable absence) — both
  CRITICAL; `error_kind` ∈ validation|not_found|conflict|permission|
  rate_limit|external|internal and `presentation_kind` ∈ toast|banner|inline|
  modal|fullscreen|silent (WARNING); errors raisable through a screen's own
  calls that no state handles are WARNING; handled errors with no shown
  presentation are WARNING; error-kind slices covering error states that
  handle no catalogued error are INFO. A graph with zero DomainError nodes
  passes L12 cleanly. All five edge names are unshared (no label-qualification
  hazard, unlike L10/L11).
- L13 cache & degradation policies (SA-extension connectivity): no orphaned
  `CachePolicy`/`DegradationRule` nodes; every CachePolicy has its parent
  `(:Module)-[:HAS_CACHE]->` (the cache catalog is module-scoped shared
  vocabulary, like the error catalog) and ≥1 outgoing
  `(cp)-[:CACHES]->(:APIEndpoint)` (no exemption flag by design: a policy
  caching no surface is dead vocabulary; provisional endpoints satisfy the
  anchor); every DegradationRule has its parent
  `(:UseCase)-[:HAS_DEGRADATION]->` (rules are UC-scoped behavior, like
  slices — deliberately asymmetric to the module-scoped catalog) and ≥1
  anchor — `ON_ERROR -> DomainError` and/or `DEGRADES_TO -> ScreenState`
  (no exemption; an anchorless rule is unreachable prose); error-triggered
  rules (`trigger_kind='error'`) REQUIRE `ON_ERROR`; `DEGRADES_TO` targets a
  state of a screen of the rule's OWN UC (same-UC rule), and for
  error-triggered rules the target's screen must actually call (via
  `ScreenEffect-CALLS`) an endpoint that MAY_RAISE one of the rule's
  ON_ERROR errors (channel rule); HAS_CACHE / CACHES / HAS_DEGRADATION /
  ON_ERROR / DEGRADES_TO targets carry correct labels; no blank
  `invalidation_kind` (the load-bearing cache contract — when the cache
  stops lying), no `ttl`-kind policy without `ttl_seconds`, no blank
  `behavior` (the observable degraded behavior, mirror of `slice.then`) —
  all CRITICAL; `storage_kind` ∈ memory|local_storage|indexed_db|cache_api|
  http|server|cdn, `invalidation_kind` ∈ ttl|event|manual|session|never,
  `trigger_kind` ∈ error|offline|capability, `fallback_kind` ∈ cached_data|
  static_content|alternate_provider|alternate_ui|skip_unit|backoff
  (WARNING); a backoff fallback on an explicitly `retryable=false` error is
  WARNING (retryable consistency — the consumer of the Phase-3 groundwork);
  cached surfaces whose retryable/external errors no rule degrades are
  WARNING (anchored on CACHES, so error-only graphs stay silent);
  `cached_data` rules that meet no CachePolicy through their errors' raisers
  or their screen's calls are INFO; two same-storage policies on one
  endpoint are WARNING. A graph with zero CachePolicy/DegradationRule nodes
  passes L13 cleanly. All five edge names are unshared (second phase in a
  row).

BA-to-SA checks:

- XL6: automated BA workflow steps are covered by `AUTOMATES_AS` use cases, and
  non-BA UCs are explicitly marked system-only when applicable.
- XL7: BA entities and attributes are realized as domain entities and
  attributes, with external documents handled explicitly.
- XL8: BA roles map to system roles, and infrastructure-only roles are flagged.
- XL9: BA business rules are implemented by requirements or marked out of
  scope.

Reporting:

- For each level, report check counts, findings grouped by severity, coverage
  metrics, and recommended repair skill.
- Overall verification status must use only `VERIFIED`, `FAILED`,
  `PARTIALLY_VERIFIED`, `BLOCKED`, `NOT_RUN`, or `UNVERIFIED`.
- Use `NOT_RUN` for intentionally skipped levels and include the reason.
- Use `BLOCKED` for missing graph access, missing schema, unavailable BA layer
  for requested BA-to-SA checks, or absent required scope.

## Severity And Result Semantics

Validation never writes graph data or files. Migration or repair Cypher may be
shown as a recommendation only, and must be executed by another confirmed
workflow.

Severity groups:

- `CRITICAL`: broken traceability, missing mandatory relationships, duplicate
  ids, dangling scope, or schema drift that blocks TL planning.
- `WARNING`: incomplete optional coverage, unmapped BA data, missing exemption
  flags, or readiness gaps that can be intentionally deferred.
- `INFO`: statistics, intentionally skipped checks, or advisory cleanup.

Overall status calculation:

- `FAILED` when any requested level has unresolved `CRITICAL` findings.
- `PARTIALLY_VERIFIED` when some requested levels run but others are `BLOCKED`
  or `NOT_RUN`, or when BA-to-SA checks cannot run for missing BA data.
- `VERIFIED` only when every requested level ran and no `CRITICAL` findings
  remain.
- `BLOCKED` when validation cannot start because graph read access, schema data,
  or required scope is missing.
- `UNVERIFIED` when the result cannot be checked against graph state.

Use named validation and SA query expectations where available, including
`sa_uc_full_context`, `sa_domain_model`, `sa_form_domain_mapping`,
`sa_module_overview`, `sa_uc_dependencies`, `sa_statistics_summary`,
`sa_readiness_assessment`, handoff coverage queries, and validation queries such
as `val_orphaned_form_fields`, `val_uc_without_requirements`,
`val_entity_without_uc`, `val_disconnected_nodes`, and
`val_ba_sa_consistency`.

## Capabilities

### May Do

- Read SA and BA graph data for validation.
- Run schema, consistency, connectivity, traceability, and coverage checks.
- Produce a markdown validation report to the user.
- Recommend the next NaCl skill for repairs.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data or project files.
- Repair findings during validation.
- Claim a check ran when tooling or data was unavailable.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph validation requires graph read tooling.
- Schema drift checks require graph introspection or readable schema files.
- BA-to-SA checks require BA graph data.
- Scoped validation requires resolvable scope ids.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required graph tooling, schema, BA data, or scope is
  missing.
- Use `PARTIALLY_VERIFIED` when some requested levels run and others are
  `NOT_RUN` or `BLOCKED`.
- Use `UNVERIFIED` when a result cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-validate/SKILL.md`

### Preserved Methodology

- Read-only validation boundary.
- Pre-flight graph and schema checks.
- Internal SA levels L1 through L13 (L8 staleness closure, L9 decision provenance, L10 screen state machines, L11 behavior slices, L12 domain error taxonomy, L13 cache & degradation policies).
- BA-to-SA coverage levels XL6 through XL9.
- Exemption-property handling for validation filters.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Source-environment status names in active reporting.
- Slash-command-only invocation wording.

### Codex Replacement Behavior

- Use graph reads only when available.
- Map final outcomes to the closed verification vocabulary.
- Report skipped and unavailable levels honestly.
- Leave repairs to confirmed follow-up workflows.
