---
name: nacl-sa-validate
description: |
  Validate NaCl SA graph consistency, connectivity, requirements, form-domain
  traceability, UC-form coverage, cross-module rules, feature requests, staleness
  closure, decision provenance, and BA-to-SA coverage. Use when checking SA
  quality or says `/nacl-sa-validate`.
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
2. Count canonical SA nodes and report whether the graph has data.
3. Detect schema drift by comparing labels and relationship types with the SA
   schema when introspection is available.
4. Check BA layer availability before BA-to-SA levels.
5. Audit exemption properties used by deeper checks: `has_ui`, `system_only`,
   `shared`, `internal`, and `field_category`.

Internal checks:

- L1 data consistency: required ids, names, property types, duplicate ids, and
  orphan nodes.
- L2 connectivity: modules contain use cases and entities, entities have
  attributes, enums connect to attributes, and core edges are present.
- L3 requirements: use cases have requirements, requirements are typed and
  linked, and BA rules mapped to requirements are not orphaned.
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
- Internal SA levels L1 through L9 (L8 staleness closure, L9 decision provenance).
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
