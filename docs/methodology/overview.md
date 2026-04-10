[Home](../../README.md) > [Methodology](./) > Overview

[Русская версия](overview.ru.md)

# The NaCl Methodology: Three Layers, One Graph

NaCl is a set of 57 slash-command skills for Claude Code that cover the full software development lifecycle -- from business analysis through system specification to TDD development, code review, QA, and release. What makes NaCl different is not the number of skills but the methodology beneath them: a structured pipeline where all business and system analysis artifacts live in a Neo4j graph database, queryable by both humans and AI agents.

This document explains the core ideas. The companion pages go deeper into each layer.

---

## Why Methodology Matters for AI Agents

AI coding agents like Claude Code are powerful but structurally forgetful. Each session starts with a blank context window. Over long projects -- the kind where business analysis spans weeks and implementation spans months -- three problems compound:

1. **Context loss.** The agent does not remember what it decided yesterday. Every session requires re-reading specs, re-establishing conventions, and re-discovering the project's current state.

2. **Spec decay.** Traditional specs live in dozens of markdown files. In a real project with 10-15 use cases, the docs/ directory easily reaches 70+ files. To plan a single use case, the agent must read a broad cross-section of those files -- process maps, entity catalogs, role matrices, business rules, glossary, workflow diagrams, UI specs, domain model. That is roughly 150,000 tokens of context consumed before any productive work begins.

3. **No queryability.** Flat files have no structure beyond headings. You cannot ask "which use cases touch the Order entity?" without scanning every file. You cannot validate consistency ("does every business process have at least one role assigned?") without writing fragile regex scripts. You cannot trace a UI form field back to the business entity attribute it represents.

NaCl addresses all three problems by encoding the methodology as executable skills backed by a graph database. Instead of markdown files that the agent reads sequentially, the specifications exist as typed nodes and typed edges in Neo4j. The agent queries only what it needs, when it needs it. Validation is a set of Cypher queries, not a manual checklist. Traceability is a graph traversal, not a cross-referencing exercise.

The result: the agent spends its context budget on productive work (generating code, running tests, reviewing diffs) rather than on re-reading specifications it cannot remember.

---

## The Three-Layer Pipeline

NaCl organizes work into three sequential layers. Each layer has its own skills, its own output language, and its own section of the graph.

- **BA (Business Analysis)** -- 14 skills. Output language: Russian (for stakeholders and domain experts). Produces: system context, business processes, workflows, entities, roles, rules, and glossary. All stored as Neo4j nodes.

- **SA (System Analysis)** -- 9 skills. Output language: Russian (for technical stakeholders). Produces: modules (bounded contexts), domain model, use cases with activity diagrams, forms, UI components, system roles, requirements. Also stored as Neo4j nodes.

- **TL (TeamLead)** -- 25 skills. Output language: English (for developers). Consumes the SA graph and produces task files, code (via TDD), code reviews, QA reports, commits, and releases. Artifacts live in the filesystem and Git.

The language split is intentional. Analysis documents are read by business stakeholders who work in Russian. Code, task files, commit messages, and PR descriptions are read by developers who work in English. Each skill's prompt is written in the output language, so Claude naturally produces artifacts in the correct language.

```
BA Layer (14 skills)          SA Layer (9 skills)           TL Layer (25 skills)
---------------------         ---------------------         ---------------------
Stakeholders, processes,      Modules, domain model,        Tasks, waves,
entities, roles, glossary,    use cases, forms, roles,      TDD code, review,
rules, workflows              API contracts, UI             QA, ship, deploy
        |                             |                            |
        v                             v                            v
   Neo4j Graph                   Neo4j Graph                 Files + Git
   (13 node types)               (12 node types)             (.tl/tasks/, src/)
```

The layers are strictly sequential. BA must complete before SA can begin, because SA skills read BA nodes to derive use cases from business processes. SA must complete before TL can plan, because `nacl-tl-plan` reads use cases, entities, and dependencies from the SA graph to generate task files. Cross-layer edges (like `AUTOMATES_AS` from WorkflowStep to UseCase, or `GENERATES` from UseCase to Task) make these dependencies explicit and traversable.

---

## The Graph as Single Source of Truth

The central design decision in NaCl is storing specifications as a graph rather than as documents. Here is why.

**Why Neo4j.** A property graph database provides typed nodes (BusinessProcess, UseCase, DomainEntity) with typed edges (CONTAINS, AUTOMATES_AS, GENERATES). This structure is inherently queryable. To find all use cases affected by a change to the Order entity, you write one Cypher query:

```cypher
MATCH (e:DomainEntity {name: "Order"})<-[:CONTAINS_ENTITY]-(m:Module)-[:CONTAINS_UC]->(uc:UseCase)
RETURN uc.id, uc.name
```

With markdown files, you would grep through every UC spec hoping the entity name appears somewhere in the text. The graph gives you certainty; grep gives you hope.

**The token reduction.** The `nacl-tl-plan` skill reads one Cypher query per use case -- roughly 550 tokens (50 for the query, 500 for the response containing the UC's full context: steps, forms, entities, dependencies, requirements). The alternative -- reading the ~70 markdown files that a traditional spec produces -- costs approximately 150,000 tokens. That is a **99.6% reduction** in tokens consumed per use case during planning. For an agent with a finite context window, this is the difference between planning 10 use cases in a single session and running out of context on the second one.

**What the graph enables:**

- **Impact analysis.** Change a DomainEntity and immediately see every UseCase, Form, and Requirement that references it, across all modules.

- **Cross-layer traceability.** Trace a FormField back through its Form, to the UseCase, through the AUTOMATES_AS edge to the WorkflowStep, and up to the BusinessProcess. Every link is an edge in the graph.

- **Consistency validation.** Cypher queries detect orphaned nodes (a DomainEntity with no module), missing relationships (a UseCase with no actor), and coverage gaps (a BusinessProcess with no workflow). NaCl includes 17+ validation checks across BA and SA layers.

**Schema definition.** The graph schema is defined in three files under `graph-infra/schema/`:

| File | Layer | Node types | Purpose |
|------|-------|------------|---------|
| `ba-schema.cypher` | BA | 13 | ProcessGroup, BusinessProcess, WorkflowStep, BusinessEntity, EntityAttribute, EntityState, BusinessRole, BusinessRule, GlossaryTerm, SystemContext, Stakeholder, ExternalEntity, DataFlow |
| `sa-schema.cypher` | SA | 12 | Module, UseCase, ActivityStep, DomainEntity, DomainAttribute, Enumeration, EnumValue, Form, FormField, Requirement, SystemRole, Component |
| `tl-schema.cypher` | TL | 3 | Task, Wave, APIEndpoint |

Each file defines uniqueness constraints, indexes, and documents the relationship types for its layer. Cross-layer edges (BA-to-SA, SA-to-TL) are documented in the downstream schema file.

---

## The Autonomy Principle

NaCl skills are designed to work with the user, not instead of the user. The core rule, stated in `nacl-ba-full`, is:

> **Facts come from the user, construction is done by the agent, confirmation is done by the user.**

This principle draws a clear line between what the agent may do autonomously and what requires human input.

**The agent DOES:**

- Generate structured identifiers (GPR-01, BP-001, UC-101, OBJ-005) following consistent naming conventions
- Create graph structure -- nodes, edges, properties -- from facts the user has provided
- Produce Mermaid diagrams and Excalidraw boards from graph data
- Compute traceability matrices, coverage statistics, and validation reports
- Propose reasonable defaults and assumptions, clearly marked as such

**The agent DOES NOT:**

- Invent business facts ("the system probably needs a payment module")
- Assume process details that the user has not described
- Fabricate requirements or acceptance criteria
- Skip confirmation gates to move faster

**The user CONFIRMS:**

- Every major construction phase before the agent proceeds to the next
- Every set of assumptions the agent has made (marked with `status: "assumption"` on graph nodes)
- The automation scope (which business processes become use cases)
- The final validation report before handoff to the next layer

This principle applies to all graph skills in the BA and SA layers. Each orchestrator (`nacl-ba-full`, `nacl-sa-full`) runs 10 phases, and every phase ends with a confirmation gate. The user can approve, redo, or stop at any gate. If the user cannot answer all questions in a phase, the agent records what is known, marks gaps as assumptions, and returns to them during validation (Phase 8), where Cypher queries catch incomplete data.

The TL layer is more autonomous by design -- once the SA specification is confirmed, development skills (`nacl-tl-dev-be`, `nacl-tl-dev-fe`) execute TDD cycles without asking permission for each test. But even here, code review (`nacl-tl-review`) and QA (`nacl-tl-qa`) serve as human-inspectable checkpoints before code is shipped.

---

## Orchestration Hierarchy

NaCl skills are organized into four levels of abstraction, from full-pipeline orchestrators down to shared reference libraries.

**Level 4: Pipeline orchestrator.**
`nacl-tl-conductor` manages the entire flow from intake to staging deployment. It creates feature branches, dispatches work to layer orchestrators, commits each completed use case atomically, and coordinates delivery. One branch per batch, one commit per UC.

**Level 3: Layer orchestrators.**
`nacl-ba-full` (10 phases), `nacl-sa-full` (10 phases), and `nacl-tl-full` (dev lifecycle per UC). Each orchestrator chains Level 2 skills in the correct order, manages confirmation gates, tracks progress, and handles failures with retry-or-skip logic.

**Level 2: Individual skills.**
The 48 specialized skills that do the actual work: `nacl-ba-context` defines system boundaries, `nacl-tl-dev-be` runs backend TDD, `nacl-tl-qa` executes E2E tests via Playwright, and so on. Each skill reads from and writes to a well-defined slice of the graph or filesystem.

**Level 1: Shared references.**
`nacl-core` provides Neo4j connection conventions, ID format rules, schema file locations, and Cypher query patterns. `nacl-tl-core` provides task file templates, Git conventions, and code review checklists. These are not invoked directly -- they are read by other skills as reference material.

**The delegation pattern.** Level 3 orchestrators launch Level 2 skills as Task agents -- sub-agents with isolated context windows. This is a deliberate design for token budget management. A full BA pipeline produces hundreds of graph nodes across 10 phases. If all phases ran in a single context window, the agent would exhaust its token budget by Phase 3 or 4. By delegating each phase to a sub-agent, the orchestrator keeps its own context lean (just progress tracking and gate management), while each sub-agent gets a fresh context window for its specific work.

**The graph as shared memory.** Since each sub-agent writes to Neo4j independently, the graph itself becomes the shared memory between phases. Phase 4 (entities) does not need to read the output of Phase 2 (processes) from context -- it queries the graph for BusinessProcess nodes and discovers them through Cypher. This is why the graph-first approach is not just a storage choice but an architectural necessity for multi-phase AI workflows.

---

## Reading This Documentation

This methodology section contains six documents. Here is how they connect:

- **[BA Layer](ba-layer.md)** -- Deep dive into the 10-phase BA pipeline: what each phase produces, the graph nodes it creates, the confirmation gates, and the Cypher queries that drive resume detection and validation.

- **[SA Layer](sa-layer.md)** -- Deep dive into the 10-phase SA pipeline: modules, domain model, use cases with activity diagrams, forms and UI components, system roles, and the finalization phase that produces statistics, ADRs, and a traceability matrix.

- **[Handoff](handoff.md)** -- How layers connect via cross-layer edges: `AUTOMATES_AS` (BA workflow step to SA use case), `REALIZED_AS` (BA entity to SA domain entity), `MAPPED_TO` (BA role to SA system role), `GENERATES` (SA use case to TL task). Coverage statistics and gap detection.

- **[Validation](validation.md)** -- The full catalog of validation checks: 8 internal BA checks (L1-L8), 6 internal SA checks (L1-L6), and 9 cross-layer checks (XL1-XL9). Each check is a Cypher query with a clear pass/fail criterion.

- **[Graph-First Philosophy](graph-philosophy.md)** -- The conceptual foundation: why a property graph, why not a relational database, why not markdown with frontmatter, and how the graph model aligns with the way AI agents consume and produce structured data.

If you are new to NaCl, start here, then read the BA Layer and SA Layer documents in order. If you are integrating NaCl into an existing project, start with the [Quick Start](../quickstart.md) and return to methodology when you need to understand why things work the way they do.
