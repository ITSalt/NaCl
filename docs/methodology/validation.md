[Home](../../README.md) > [Methodology](./) > Validation

[Русская версия](validation.ru.md)

# Validation Framework: Keeping the Graph Honest

NaCl stores all BA and SA specifications as nodes and edges in a Neo4j graph. A graph with 35+ node types and 60+ edge types accumulates structural debt the same way a codebase accumulates technical debt -- quietly, incrementally, and dangerously. The validation framework is the countermeasure: 30 validation levels -- 8 BA-internal (L1-L8), 13 SA-internal (L1-L13), 9 cross-layer (XL1-XL9) -- comprising 70+ Cypher checks that detect inconsistencies, gaps, and broken traceability before they propagate downstream.

---

## Why Graph Validation Matters

Specification drift is the primary risk in a multi-phase analysis pipeline. As work progresses, artifacts get added but connections get forgotten. A WorkflowStep is created without a performer. A BusinessEntity gains attributes but loses its connection to the process that produces it. A BusinessRule is documented but never bound to an entity or step. Each gap is small in isolation, but they compound into a specification that looks complete while being structurally unsound.

**Orphaned nodes.** An entity with no process using it serves no purpose -- either a leftover from a deleted process or an artifact that was never integrated. A role with no steps is either misnamed or miscategorized. These orphans do not cause errors during analysis, but they confuse the SA layer when it imports BA data and encounters nodes that connect to nothing.

**Broken traceability.** A WorkflowStep marked "Автоматизируется" (automatable) signals the SA layer to create a UseCase. If no AUTOMATES_AS edge exists after SA completion, that step has fallen through the cracks -- the business requirement exists, but no system functionality addresses it. The reverse is equally dangerous: a UseCase with no traceability back to a business step is a feature that nobody asked for, either an undocumented requirement or scope creep.

**Manual review does not scale.** A typical NaCl project produces 50-100 BA nodes and 80-150 SA nodes, connected by 200-400 edges. A human reviewer scanning the graph in Neo4j Browser or reading exported Markdown cannot reliably detect every missing edge, every orphaned node, every uncovered automation step. They catch the obvious gaps and miss the subtle ones -- and the subtle ones are exactly what compound into downstream failures.

The solution: validation as Cypher queries -- automated, repeatable, objective. Each check is a single query that returns either an empty result set (pass) or a list of specific node IDs that violate the check (fail). The queries are read-only: they never create, update, or delete graph data. They observe and report, nothing more.

---

## Severity Model

| Severity | Meaning | Effect |
|----------|---------|--------|
| CRITICAL | Structural error that blocks downstream work | Any CRITICAL = FAIL. Handoff is blocked until fixed. |
| WARNING | Should be fixed but not blocking | 5+ WARNINGs in one category = WARN status |
| INFO | Optional improvement | No effect on pass/fail |

A single CRITICAL finding blocks handoff because CRITICAL checks target structural prerequisites -- a process without an owner, a FormField without a data source. WARNINGs use an accumulation threshold (5+ per category) because individual WARNINGs are often acceptable early on -- a placeholder role, a deferred entity. But five such gaps suggest a systemic problem. INFO findings surface improvement opportunities without creating noise.

Reports are stored as `ValidationReport` nodes in the graph with properties: `layer` ("BA" or "SA"), `timestamp` (ISO 8601), `status` ("PASS"/"WARN"/"FAIL"), and `issues` (JSON array of findings with check ID, severity, node ID, and description). Storing reports as graph nodes makes validation history queryable -- you can track whether a model is converging toward completeness or accumulating issues.

---

## BA Internal Validation (L1-L8)

Run by `nacl-ba-validate`. All checks are read-only -- they never modify the graph.

**L1: Process Completeness.** Every BusinessProcess must have three things: a `trigger` property (what starts the process), a `result` property (what it produces), and an OWNS edge from a BusinessRole (process accountability). A process without a trigger has no defined starting condition. A process without an owner has no one responsible for its outcomes. Missing any of these means the process cannot be meaningfully decomposed into workflow steps. CRITICAL.

**L2: Workflow Coverage.** Every BP with `has_decomposition: true` must have at least one WorkflowStep linked via HAS_STEP. The `has_decomposition` flag is a promise that the process has been broken into individual steps; L2 verifies the promise was kept. An empty decomposition creates a false sense of completeness -- the SA layer reads decomposed processes to identify automation candidates, and missing steps produce a silent gap in automation scope. CRITICAL.

**L3: Performer Binding.** Every WorkflowStep must have a PERFORMED_BY edge to a BusinessRole. Steps without performers are orphaned actions -- they describe what happens but not who does it. In the 3-swimlane workflow model, the left swimlane (performer) would be blank for these steps, breaking the visual representation and making role-based analysis impossible. No unassigned steps allowed. CRITICAL.

**L4: Entity Attribute Quality.** EntityAttribute nodes must have valid `type` values from the allowed set (string, number, date, boolean, enum, reference, etc.). Both `name` and `type` properties must be filled -- an attribute with a name but no type is a partial definition that cannot be mapped to a domain attribute in the SA layer. Missing types create rework when `nacl-sa-domain` imports BA entities and encounters attributes it cannot classify. WARNING.

**L5: Entity-Process Matrix.** Checks READS / PRODUCES / MODIFIES edges between WorkflowSteps and BusinessEntities. Flags two conditions: orphaned entities not referenced by any step (WARNING) -- they exist but no process touches them; and detached steps that interact with no entity (INFO) -- procedural steps like phone calls are legitimate, so this is advisory only.

**L6: Role-Process Matrix.** Checks OWNS / PARTICIPATES_IN edges. Flags orphan roles with no process connection and unassigned processes with no role connection. Both are WARNING -- orphan roles often appear when the analyst creates roles during Phase 5 that are relevant to future processes not yet modeled. Neither condition is fatal, but both should be resolved before handoff.

**L7: Glossary Coverage.** GlossaryTerm nodes should exist for key named artifacts (entities, roles, processes) that use domain-specific terminology. L7 flags significant terms without a DEFINES edge. Common terms like "User" need no entry, but domain terms like "Settlement Period" or "Acceptance Protocol" should have definitions that establish shared meaning. INFO.

**L8: Rule Traceability.** Three sub-checks. L8.1 (BusinessRule with none of CONSTRAINS/APPLIES_IN/AFFECTS/APPLIES_AT_STEP) and L8.2 (BusinessRule missing mandatory `id`/`name`) are CRITICAL -- rules floating without connections describe constraints but do not say what they constrain or where they apply, and both block BA-to-SA handoff. L8.3 (a traceability target with no `id`) is WARNING. Unbound rules are often captured during stakeholder interviews as general statements that have not yet been linked to specific artifacts.

---

## SA Internal Validation (L1-L13)

Run by `nacl-sa-validate`. Read-only, like the BA checks. L1-L7 cover the
core specification; L8-L13 cover change propagation and the connected-spec
extension layers introduced in 2.15.

**L1: Data Consistency.** All nodes have required properties filled. No orphaned nodes (nodes with no parent in the hierarchy). No duplicate IDs within any node type. Duplicate IDs break referential integrity -- every Cypher match returns ambiguous results. CRITICAL.

**L2: Model Connectivity.** Every Module has at least one DomainEntity or UseCase. Every DomainEntity and UseCase is linked to exactly one Module. No empty modules (they produce empty dev waves) and no floating artifacts. CRITICAL for empty modules, WARNING for unlinked artifacts.

**L3: Requirement Completeness.** Nine sub-checks. L3.1 (UseCases without any HAS_REQUIREMENT edge) and L3.5 (ActivitySteps with an empty/missing `actor` property) are CRITICAL. L3.2 (orphaned requirements), L3.3 (UseCases without ActivitySteps), L3.4 (UseCases without an actor SystemRole), and L3.6 (non-canonical `actor` values) are WARNING. L3.7-L3.8, added in 2.21.0, enforce the **outgoing-anchor invariant**: every must-anchor requirement (class `functional`/`validation`/`behavioral`/`interface`) needs a `REALIZED_BY` edge to the step/field/form that implements it (L3.7, CRITICAL); the target's label must agree with the requirement's class (L3.7b, WARNING); and once a project has opted into anchoring, every `System`-actor step should be realized by some requirement (L3.8, opt-in WARNING). Exemptions are class-based, not a `story_only` flag: NFRs (`type: 'nfr'`), ADRs/questions/assumptions, and requirements explicitly marked `anchor_exempt: true` are excluded from L3.7.

**L4: Form-Domain Traceability (Critical).** The most important SA validation check. Every input FormField must have a MAPS_TO edge to a DomainAttribute -- display and action fields (`field_category` other than `input`) are exempt. This edge is the contract between UI specification and data model -- it declares that a specific field on a specific form stores its value in a specific attribute of a specific domain entity. Without it, developers guess which attribute to bind a field to, or create attributes ad hoc, producing schema drift between specification and implementation. CRITICAL.

```cypher
// L4.1 -- Severity: CRITICAL
MATCH (f:Form)-[:HAS_FIELD]->(ff:FormField)
WHERE NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
  AND coalesce(ff.field_category, 'input') = 'input'  -- REQUIRED FILTER: exempt display/action
RETURN ff.id, ff.name, ff.field_type
```

**L5: UC-Form Validation.** Every Primary UC (priority "MVP") with `detail_status: "complete"` has at least one Form. Every Form links to at least one UseCase via USES_FORM. Catches formless UCs (complete but missing UI specification) and orphaned forms (created but never linked to a UC). WARNING.

**L6: Cross-Module Consistency.** Three sub-checks: (1) inter-module DEPENDS_ON edges must be acyclic -- circular dependencies make build ordering impossible (CRITICAL); (2) shared entities have clear ownership via exactly one CONTAINS_ENTITY edge (WARNING); (3) data flow is consistent -- dependencies between modules should be justified by concrete data references (WARNING).

**L7: FeatureRequest Consistency.** Every FR-NNN markdown file must have a matching FeatureRequest node, and every FeatureRequest node must include at least one UseCase via INCLUDES_UC (or carry an explicit exemption). INCLUDES_UC edges must carry a known `kind`, referenced UseCases must exist, FR ids must not be reused across node labels, and duplicate FR-NNN files on disk are flagged. Feature requests are the unit of incremental specification -- a dangling FR node or an unanchored markdown file is a feature whose scope the graph cannot see. CRITICAL.

**L8: Staleness Closure.** When a specification change propagates through the graph (`nacl-sa-feature`, `nacl-tl-fix`), affected UseCases, Tasks, Forms, and Requirements receive `review_status: "stale"` with the origin and reason recorded. L8 is the gate that refuses to let stale nodes silently re-enter development: every stale node must be reviewed and re-planned via `nacl-tl-plan` -- the only sanctioned way a node leaves `stale` -- before the graph is considered consistent again. CRITICAL.

**L9: Decision Provenance.** Every active FeatureRequest must anchor the decision that resolved it via IMPLEMENTS to a Decision node, unless grandfathered with `decision_exempt: true` (surfaced separately as INFO). Decisions must justify at least one artifact via JUSTIFIES, carry a non-blank `rationale`, and superseded decisions must be marked as such. This turns "why was this built this way" from git archaeology into a single Cypher query. CRITICAL, with supersession hygiene as WARNING.

**L10: Screen State Machines.** The deterministic UI contract. Every Screen belongs to a UseCase (HAS_SCREEN) and renders a Form (unless `formless`); states, events, and reified transitions belong to their screen; every Transition has exactly one FROM_STATE, TO_STATE, and ON_EVENT within the same screen; no two unguarded transitions share a (state, event) pair -- determinism; exactly one initial state exists and every state is reachable from it; error states have an escape transition (unless `terminal`); effects target the right node type (load/mutate -> APIEndpoint, navigate -> Screen, analytics -> AnalyticsEvent). Mostly CRITICAL; kind-vocabulary checks are WARNING.

**L11: Behavior Slices.** Graph-native Given/When/Then acceptance scenarios. Every Slice belongs to a UseCase (HAS_SLICE) and must anchor into the screen machine (COVERS -> ScreenState/Transition within its own UC) and/or into the API surface (CALLS -> APIEndpoint) -- no exemption exists by design: behavior text with no graph anchor belongs in acceptance-criteria prose, not in a node. Once the UC has generated Tasks, every slice must be verified by one (VERIFIED_BY; re-planning self-heals this edge). The `then` outcome must be non-blank. Machine elements not covered by any slice are WARNING; a sliced UC without a happy-path slice is INFO. CRITICAL core.

**L12: Domain Error Taxonomy.** Transport-independent failure modes. Every DomainError belongs to a Module catalog (HAS_ERROR), is raisable by at least one endpoint (MAY_RAISE), and carries a non-blank `code` -- the join key to the API envelope. Every ErrorPresentation belongs to an error (PRESENTED_AS), is shown by some state (SHOWS), and carries a non-blank user-facing `message`. The channel rule constrains HANDLES: a state may only handle errors its screen can actually receive through its effect calls; the SHOWS triangle closes only over handled errors. Raisable-but-unhandled errors on screens that call the raising endpoint are WARNING (the handling-completeness gap). CRITICAL core.

**L13: Cache & Degradation Policies.** Resilience as specification. Every CachePolicy belongs to a Module (HAS_CACHE), caches at least one endpoint (CACHES), and carries a complete invalidation contract (`invalidation_kind`; `ttl_seconds` when TTL-based). Every DegradationRule belongs to a UseCase (HAS_DEGRADATION), names its trigger and a non-blank observable `behavior`, anchors error-triggered rules to DomainErrors (ON_ERROR), and degrades into states of its own UC reachable through the error channel. Consistency checks flag backoff against non-retryable errors and overlapping policies on the same endpoint and storage; the cached-surface gap -- retryable/external errors on cached endpoints with no degradation answer -- is WARNING. CRITICAL core.

L10-L13 validate the **connected-spec extension layers** (2.15+), which are opt-in per project: a graph with zero nodes of a layer's labels passes that level vacuously -- zero findings, not skipped checks. Adoption is ordered by dependency (machines before slices, errors before resilience; `nacl-sa-full` Phase 6b automates the sequence). Exemptions are deliberately scarce: L10 recognizes `formless` screens and `terminal` states, L9 recognizes grandfathered feature requests -- L11, L12, and L13 have no exemption properties at all, because an anchorless slice, an unraisable error, or a policy that caches nothing is dead vocabulary, not an edge case.

---

## Cross-Layer Validation: BA Side (XL1-XL5)

Run by `nacl-ba-validate` after the SA layer has data. Checks that BA artifacts are properly mapped to SA counterparts.

| Check | Query Pattern | What It Flags |
|-------|--------------|---------------|
| XL1 | WorkflowStep (stereotype="Автоматизируется") without AUTOMATES_AS edge | Automated steps not covered by any UC |
| XL2 | BusinessEntity (type="Бизнес-объект") without REALIZED_AS edge | Business entities not modeled in domain |
| XL3 | BusinessRule without IMPLEMENTED_BY edge | Rules not captured as requirements |
| XL4 | BusinessRole without MAPPED_TO edge | Roles not represented in the system |
| XL5 | GlossaryTerm misalignment with SA nomenclature | Language drift between layers |

XL1 and XL2 are CRITICAL -- functional coverage gaps where the system will not address a documented business need. XL3 (Rule Coverage, XL3.1: BusinessRule not traced to a Requirement via IMPLEMENTED_BY) is also CRITICAL. XL4 (Role Coverage, XL4.1: BusinessRole not mapped to a SystemRole via MAPPED_TO) is WARNING -- roles may be intentionally deferred. XL5 (Glossary Alignment) is split: XL5.1 (DomainEntity with no matching BA GlossaryTerm) is WARNING, XL5.2 (name mismatch between a linked GlossaryTerm and DomainEntity) is INFO.

---

## Cross-Layer Validation: SA Side (XL6-XL9)

Run by `nacl-sa-validate`. Primarily forward checks -- ensuring BA artifacts got traced into SA -- each with a reverse sub-check for the opposite direction.

| Check | Forward core (CRITICAL) | Reverse sub-check |
|-------|--------------------------|--------------------|
| XL6 (UC Coverage) | XL6.1: automated BA WorkflowStep with no AUTOMATES_AS edge to a UseCase | XL6.2 (WARNING): UseCase not traced from any WorkflowStep and not marked `system_uc: true` |
| XL7 (Entity Coverage) | XL7.1: BusinessEntity with no REALIZED_AS edge to a DomainEntity | -- (XL7.2/XL7.3/XL7.4 are INFO/WARNING audits, not reverse checks) |
| XL8 (Role Coverage) | XL8.1: BusinessRole with no MAPPED_TO edge to a SystemRole | XL8.2 (WARNING): SystemRole not mapped from any BusinessRole and not marked `system_only: true` |
| XL9 (Rule Coverage) | XL9.1: BusinessRule with no IMPLEMENTED_BY edge to a Requirement | -- (XL9.2 out-of-scope audit is INFO; XL9.3, IMPLEMENTED_BY target integrity, is CRITICAL) |

The forward-coverage cores (XL6.1, XL7.1, XL8.1, XL9.1) are CRITICAL -- they are the same gap XL1/XL2 flag from the BA side, re-checked once SA data exists, and any CRITICAL blocks SA finalization. The reverse sub-checks are WARNING and use property-based exemptions for legitimate SA-only artifacts: `system_uc: true` on a UseCase with no BA source step, `system_only: true` on a SystemRole with no BA source role. No `technical_only` property exists.

Together, XL1-XL5 and XL6-XL9 form a bidirectional traceability check. The BA side asks "is every business need covered by the system?" The SA side asks "is every system element justified by a business need?" When both sets pass, the specification has full bidirectional traceability -- every requirement can be traced from business process to system implementation and back.

---

## Validation as a Quality Gate

Validation integrates into the pipeline at four gates.

**1. Before BA handoff** (Phase 8 of nacl-ba-full). Run L1-L8 against the BA graph. Any CRITICAL error blocks Phase 9 (handoff). The orchestrator presents the validation report to the user, listing every finding with its severity, check ID, and the specific node IDs that failed. The typical fix workflow: read the report, navigate to the flagged nodes using the provided IDs, add missing properties or edges, then re-run validation. WARNINGs and INFOs are presented but do not block -- the analyst can address them now or defer.

**2. After SA completion** (Phase 7 of nacl-sa-full). Run L1-L13 (internal SA consistency) + XL6-XL9 (forward BA-to-SA coverage, re-checked from the SA side). CRITICAL errors in L1-L13 and in the XL6-XL9 forward cores (XL6.1, XL7.1, XL8.1, XL9.1) block finalization. The SA analyst must resolve structural issues -- duplicate IDs, circular module dependencies, FormFields without domain mappings, anchorless slices, unraisable errors, uncovered BA steps/entities/roles/rules -- before the specification can be finalized. L10-L13 pass vacuously when the project has not adopted the extension layers; the explicit skip recorded by nacl-sa-full Phase 6b makes that vacuous pass a documented choice. The reverse sub-checks (XL6.2, XL8.2) are WARNING and advisory; the analyst reviews them and either creates the missing BA traceability or marks the artifact `system_uc`/`system_only` to document SA-only intent.

**3. Cross-layer check** (post-SA). Run XL1-XL5 from the BA side after SA data exists. This verifies bidirectional coverage: every automatable BA step has a corresponding UseCase, every business entity has a domain model counterpart, every business rule has a system requirement. This gate runs separately from Gate 1 because XL1-XL5 require SA data that does not exist during the BA phase. Can be triggered manually at any time for incremental verification as the SA layer grows.

**4. Readiness assessment** (nacl-sa-finalize). Computes per-module completion percentages based on all validation checks, weighted by severity (CRITICAL checks count more than WARNINGs). The overall readiness threshold is **90% or higher completion across all modules with zero CRITICAL errors**. Meeting this threshold means the specification is ready for development planning via `nacl-tl-plan`. Below the threshold, the finalization report identifies specific modules and checks dragging the score down, giving the analyst a prioritized remediation list.

The validation framework is designed so that specifications cannot silently degrade. Every gap is surfaced, categorized, and tracked. An analyst who ignores a WARNING today sees it again in the next run. A CRITICAL that blocked handoff yesterday still blocks it today unless fixed. This is intentional friction -- in a pipeline where AI agents construct specifications quickly, the risk is not slow construction but fast and wrong construction. Validation converts speed into reliability.
