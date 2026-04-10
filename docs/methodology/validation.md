[Home](../../README.md) > [Methodology](./) > Validation

[Русская версия](validation.ru.md)

# Validation Framework: Keeping the Graph Honest

NaCl stores all BA and SA specifications as nodes and edges in a Neo4j graph. A graph with 25+ node types and 30+ edge types accumulates structural debt the same way a codebase accumulates technical debt -- quietly, incrementally, and dangerously. The validation framework is the countermeasure: 17+ Cypher queries that detect inconsistencies, gaps, and broken traceability before they propagate downstream.

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

**L8: Rule Traceability.** Every BusinessRule must have at least one of: CONSTRAINS (to entity), APPLIES_IN (to process), AFFECTS (to attribute), or APPLIES_AT_STEP (to step). Rules floating without connections describe constraints but do not say what they constrain or where they apply. Unbound rules are often captured during stakeholder interviews as general statements that have not yet been linked to specific artifacts. WARNING.

---

## SA Internal Validation (L1-L6)

Run by `nacl-sa-validate`. Read-only, like the BA checks.

**L1: Data Consistency.** All nodes have required properties filled. No orphaned nodes (nodes with no parent in the hierarchy). No duplicate IDs within any node type. Duplicate IDs break referential integrity -- every Cypher match returns ambiguous results. CRITICAL.

**L2: Model Connectivity.** Every Module has at least one DomainEntity or UseCase. Every DomainEntity and UseCase is linked to exactly one Module. No empty modules (they produce empty dev waves) and no floating artifacts. CRITICAL for empty modules, WARNING for unlinked artifacts.

**L3: Requirement Completeness.** Every UseCase has at least one Requirement (via HAS_REQUIREMENT), or is explicitly marked `story_only: true`. Requirements must be categorized. Open questions are tracked. Missing requirements often mean non-functional concerns have not been considered. WARNING.

**L4: Form-Domain Traceability (Critical).** The most important SA validation check. Every FormField with a data type (text, number, date, select, etc.) must have a MAPS_TO edge to a DomainAttribute. This edge is the contract between UI specification and data model -- it declares that a specific field on a specific form stores its value in a specific attribute of a specific domain entity. Without it, developers guess which attribute to bind a field to, or create attributes ad hoc, producing schema drift between specification and implementation. CRITICAL.

```cypher
MATCH (ff:FormField)
WHERE ff.type IN ['text','number','date','select','checkbox','radio','textarea','email','phone']
  AND NOT (ff)-[:MAPS_TO]->(:DomainAttribute)
RETURN ff.id, ff.name, ff.type
```

**L5: UC-Form Validation.** Every Primary UC (priority "MVP") with `detail_status: "complete"` has at least one Form. Every Form links to at least one UseCase via USES_FORM. Catches formless UCs (complete but missing UI specification) and orphaned forms (created but never linked to a UC). WARNING.

**L6: Cross-Module Consistency.** Three sub-checks: (1) inter-module DEPENDS_ON edges must be acyclic -- circular dependencies make build ordering impossible (CRITICAL); (2) shared entities have clear ownership via exactly one CONTAINS_ENTITY edge (WARNING); (3) data flow is consistent -- dependencies between modules should be justified by concrete data references (WARNING).

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

XL1 and XL2 are CRITICAL -- functional coverage gaps where the system will not address a documented business need. XL3 and XL4 are WARNING -- rules and roles may be intentionally deferred. XL5 is INFO -- naming inconsistencies are worth resolving but do not create structural gaps.

---

## Cross-Layer Validation: SA Side (XL6-XL9)

Run by `nacl-sa-validate`. Reverse checks -- ensuring SA artifacts trace back to BA origins.

| Check | What It Flags |
|-------|---------------|
| XL6 | UseCases without a corresponding AUTOMATES_AS source | UCs not traceable to business steps |
| XL7 | DomainEntities without REALIZED_AS source | Entities not traceable to business objects |
| XL8 | SystemRoles without MAPPED_TO source | System roles not traceable to business roles |
| XL9 | Requirements without IMPLEMENTED_BY source | Requirements not traceable to business rules |

XL6 and XL7 are WARNING. Legitimate SA-only artifacts exist -- technical use cases (system initialization, data migration) and technical entities (audit logs, session records) may not have BA counterparts. The analyst reviews findings and either creates the BA traceability link or marks the artifact as `technical_only: true` to suppress future warnings.

XL8 and XL9 are INFO. System roles often include technical roles (System Administrator, API Client) that have no business-layer counterpart. Requirements may include non-functional constraints (response time, concurrent users) that originate from technical analysis rather than business rules.

Together, XL1-XL5 and XL6-XL9 form a bidirectional traceability check. The BA side asks "is every business need covered by the system?" The SA side asks "is every system element justified by a business need?" When both sets pass, the specification has full bidirectional traceability -- every requirement can be traced from business process to system implementation and back.

---

## Validation as a Quality Gate

Validation integrates into the pipeline at four gates.

**1. Before BA handoff** (Phase 8 of nacl-ba-full). Run L1-L8 against the BA graph. Any CRITICAL error blocks Phase 9 (handoff). The orchestrator presents the validation report to the user, listing every finding with its severity, check ID, and the specific node IDs that failed. The typical fix workflow: read the report, navigate to the flagged nodes using the provided IDs, add missing properties or edges, then re-run validation. WARNINGs and INFOs are presented but do not block -- the analyst can address them now or defer.

**2. After SA completion** (Phase 7 of nacl-sa-full). Run L1-L6 (internal SA consistency) + XL6-XL9 (reverse cross-layer traceability). CRITICAL errors in L1-L6 block finalization. The SA analyst must resolve structural issues -- duplicate IDs, circular module dependencies, FormFields without domain mappings -- before the specification can be finalized. XL6-XL9 findings are presented as advisory; the analyst reviews them and either creates the missing BA traceability or documents the technical justification for SA-only artifacts.

**3. Cross-layer check** (post-SA). Run XL1-XL5 from the BA side after SA data exists. This verifies bidirectional coverage: every automatable BA step has a corresponding UseCase, every business entity has a domain model counterpart, every business rule has a system requirement. This gate runs separately from Gate 1 because XL1-XL5 require SA data that does not exist during the BA phase. Can be triggered manually at any time for incremental verification as the SA layer grows.

**4. Readiness assessment** (nacl-sa-finalize). Computes per-module completion percentages based on all validation checks, weighted by severity (CRITICAL checks count more than WARNINGs). The overall readiness threshold is **90% or higher completion across all modules with zero CRITICAL errors**. Meeting this threshold means the specification is ready for development planning via `nacl-tl-plan`. Below the threshold, the finalization report identifies specific modules and checks dragging the score down, giving the analyst a prioritized remediation list.

The validation framework is designed so that specifications cannot silently degrade. Every gap is surfaced, categorized, and tracked. An analyst who ignores a WARNING today sees it again in the next run. A CRITICAL that blocked handoff yesterday still blocks it today unless fixed. This is intentional friction -- in a pipeline where AI agents construct specifications quickly, the risk is not slow construction but fast and wrong construction. Validation converts speed into reliability.
