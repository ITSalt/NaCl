[Home](../../README.md) > [Methodology](./) > Graph-First Philosophy

[Русская версия](graph-philosophy.ru.md)

# Graph-First Philosophy: Why It Works

NaCl stores all BA and SA specification artifacts in a Neo4j graph database instead of markdown files. This is not a technology preference -- it is a structural response to a structural problem. When an AI agent must work with dozens of interconnected specification artifacts across multiple sessions, the storage format determines whether the agent spends its token budget on productive work or on re-reading documents it cannot remember.

This document explains why a property graph is the right storage model for specifications consumed by AI agents, what concrete advantages it provides for both agents and humans, how the bidirectional sync model bridges visual editing and machine queryability, and where the graph deliberately stops.

---

## The File-Based Antipattern

The conventional approach to storing specifications is a `docs/` directory with markdown files. On a real project with 10-15 use cases, this directory reaches 70+ files: process maps, entity catalogs, role matrices, business rules, glossary, workflow diagrams, UI specs, domain model definitions, API contracts, and more.

This approach creates five compounding problems.

**Context explosion.** To generate a task for UC-101, the AI agent must read: the UC spec, the domain model, the API contract, the form descriptions, the role definitions, the related requirements. Across files, that totals approximately 150K tokens per use case. For an agent with a finite context window, this means planning two or three use cases can exhaust the entire budget before any productive work begins.

**Token waste.** Most of the content the agent reads is irrelevant to the specific use case. The domain model file describes 30 entities, but UC-101 touches 3 of them. The role definitions file lists 8 roles, but UC-101 involves 2. The agent cannot know what is relevant without reading everything first. The result is a fundamentally inefficient read pattern: consume 150K tokens, use 5K of them.

**Inconsistency.** Nothing prevents `docs/domain-model.md` from saying "Order has 5 fields" while `docs/uc-101.md` references 7 fields. Markdown files are independent text documents. They do not validate each other, they do not share a schema, and they do not enforce referential integrity. Inconsistencies accumulate silently until they surface as bugs in implementation -- the most expensive place to discover specification errors.

**No impact analysis.** "What breaks if I rename the `status` field?" In a file-based system, answering this question requires grepping 70 files and hoping you found every reference. Grep matches strings, not semantics. It finds "status" in comments, in unrelated contexts, and misses references that use a different phrasing. The result is either false positives that waste investigation time or missed dependencies that cause regressions.

**Stale content.** As the project evolves, some files get updated and others do not. A change to the domain model might propagate to the UC spec but not to the API contract. There is no mechanism to detect which files are out of sync. The specification set gradually degrades into a collection of documents at different points in time, with no way to distinguish current truth from historical artifacts.

These are not theoretical risks. They are the default state of every non-trivial specification set stored as flat files. The graph-first approach eliminates all five by making relationships explicit, queryable, and validatable.

---

## What the Graph Gives AI Agents

Switching to Neo4j means every artifact is a node, every relationship is an edge, and every constraint is enforced by the schema. The consequences for AI agent workflows are immediate and measurable.

**One query per UC, not 70 file reads.** The `sa_uc_full_context` Cypher query returns the complete subgraph for a use case -- activity steps, forms, fields, domain attributes, entities, requirements, roles -- in approximately 550 tokens. The `nacl-tl-plan` skill uses this query to generate task files. Compare 550 tokens per UC with 150,000 tokens for the file-based equivalent. That is a 99.6% reduction in context consumption, which translates directly into the agent's ability to plan more use cases per session, hold more working context simultaneously, and spend its token budget on code generation rather than specification reading.

**Precise impact analysis.** "What breaks if I rename the `status` field?" becomes a single Cypher query:

```cypher
MATCH (da:DomainAttribute {name: "status"})
  <-[:MAPS_TO]-(ff:FormField)
  <-[:HAS_FIELD]-(f:Form)
  <-[:USES_FORM]-(uc:UseCase)
RETURN uc.id, uc.name, f.name, ff.name
```

The result is an exact list of affected use cases, forms, and fields. No false positives from string matching in comments. No missed dependencies from alternative phrasings. The graph encodes semantic relationships, not textual co-occurrence, so the answer is both complete and precise.

**Automatic validation.** The 17+ validation checks (L1-L8 for BA internal consistency, L1-L6 for SA internal consistency, XL1-XL9 for cross-layer integrity) are Cypher queries that run in seconds. They detect orphaned nodes -- a DomainEntity with no module, a UseCase with no actor, a FormField that maps to a nonexistent DomainAttribute. In a file-based system, each of these checks would require a custom parser for the specific file format, and the parsers would break every time someone reformatted a heading or changed a table structure.

**Cross-layer traceability.** From a UI form field, traverse all the way back to the business process that required it:

```
FormField -[:MAPS_TO]-> DomainAttribute -[:HAS_ATTRIBUTE]-> DomainEntity
  -[:REALIZED_AS]<- BusinessEntity -[:PRODUCES]<- WorkflowStep
  -[:HAS_STEP]<- BusinessProcess
```

This traversal is one Cypher query. In a file-based system, it requires reading and cross-referencing four or five different documents, mentally assembling the chain, and hoping that every intermediate reference is spelled correctly and up to date. The graph makes the chain an explicit, machine-traversable path.

---

## What the Graph Gives Humans

The graph is not exclusively an AI optimization. It provides capabilities that humans cannot get from flat files at any token cost.

**Queryable specs.** "Show me all entities that the Manager role can modify" is a Cypher query that returns an immediate, authoritative answer. No scrolling through documents, no Ctrl+F across files, no assembling partial answers from multiple sources. The specification becomes a database that answers questions rather than a library that requires reading.

**Visual boards.** NaCl integrates with Excalidraw for visual process modeling. Business process maps, workflow diagrams, and entity relationship charts are rendered as interactive boards where stakeholders can see the full picture and manipulate it directly. Boards sync bidirectionally with the graph: edit a shape on the board and the corresponding graph node updates; update a node in the graph and the board regenerates to reflect the change. Stakeholders work with the visual representation they understand, while the graph maintains the structured truth beneath it.

**Automatic traceability matrices.** The `handoff_traceability_matrix` query generates a complete cross-reference table from the graph -- which business processes map to which use cases, which entities realize which business objects, which roles have which system permissions. In a file-based system, a traceability matrix is a manually assembled spreadsheet that falls out of date the moment someone adds a use case and forgets to update the matrix. In the graph, the matrix is a query result. It cannot be stale because it is computed from the same data it traces.

**Living documentation.** The `nacl-publish` skill renders the graph into Docmost wiki pages and Excalidraw diagrams. The documentation is always derived from the graph -- it cannot fall out of sync because it is regenerated from the source of truth every time it is published. This inverts the traditional relationship between specs and documentation. Instead of documentation being the primary artifact that might or might not reflect reality, the graph is the primary artifact and documentation is a read-only projection of it.

---

## The Bidirectional Sync Model

NaCl uses two complementary interfaces to the same underlying data, each optimized for a different audience.

**Excalidraw boards** are the human-facing interface. They are visual, intuitive, and support collaborative editing. Every shape on a board carries `customData` properties linking it to a graph node -- the shape's ID, type, label, and a `synced` flag indicating whether the shape has been pushed to Neo4j.

**Neo4j graph** is the machine-facing interface. It is structured, queryable, and validatable. Every node has typed properties, every edge has a defined meaning, and the schema enforces constraints that prevent structural corruption.

The sync cycle connects these two interfaces:

1. **Import.** A client document (DOCX, PDF, or text) is parsed by `nacl-ba-import-doc`, which creates an Excalidraw board with shapes laid out in swimlanes. Each shape has `synced: false` and a confidence color indicating how certain the parser is about its extraction.

2. **Review.** The analyst reviews the board visually -- adjusting labels, moving shapes between swimlanes, adding missing steps, removing duplicates. This is the human judgment step where domain expertise corrects and enriches the machine extraction.

3. **Sync.** Running `nacl-ba-sync` pushes new and modified shapes to Neo4j as nodes and edges. Shapes receive `synced: true` and their stroke color changes to green, providing immediate visual feedback about what has been committed to the graph.

4. **Validation.** Graph validation queries run against the synced data, detecting structural issues -- missing relationships, orphaned nodes, incomplete coverage. Issues are reported back with specific node references.

5. **Fix and re-sync.** Fixes can be applied either on the board (visual adjustments) or directly in the graph (Cypher mutations). Either way, a re-sync brings both representations back into alignment.

This model means stakeholders never need to learn Cypher or understand graph databases. They work with visual boards that look like the whiteboards they already use. AI agents never need to parse visual layouts. They work with the graph that gives them typed, queryable, relationship-rich data. Same data, different representations, each optimized for its consumer.

---

## When NOT to Use the Graph

The graph is for specifications, not for code. The TL layer deliberately stores three categories of artifacts outside the graph:

**Code** lives in files managed by Git (`src/`). Code has its own versioning system with diffs, branches, and merge conflict resolution. It has its own quality tools -- linters, type checkers, test runners, static analyzers. It has its own review process via pull requests. Duplicating code in a graph would add overhead to every commit without providing any benefit that Git does not already deliver better.

**Task files** live in the filesystem (`.tl/tasks/`). Each task file is a self-sufficient specification document generated from the graph by `nacl-tl-plan`. Once generated, the task file contains everything a developer agent needs to implement the use case: acceptance criteria, API contracts, entity definitions, form specifications, dependencies. The task file is the handoff point -- the boundary where graph-based specification ends and file-based development begins.

**Build artifacts** live in CI/CD pipelines. Docker images, test reports, deployment logs -- these are ephemeral, pipeline-specific outputs that have no place in a specification graph.

The reasoning behind this boundary is straightforward. The graph's value is in the specification layer, where relationships between artifacts matter more than the content of any single artifact. "Which use cases touch the Order entity?" is a relationship question that the graph answers instantly. Code is the opposite: the content -- the logic, the control flow, the data transformations -- matters more than the relationships between files. A function's correctness depends on what it does, not on how many other files reference it.

**The boundary is explicit:** SA graph produces task files via `nacl-tl-plan`, and task files produce code via `nacl-tl-dev-be` and `nacl-tl-dev-fe`. After the graph generates self-sufficient task files, developer agents work exclusively with files, not the graph. The graph's job is done once the specification is precise enough to be a standalone work order. Extending the graph into the code layer would blur this boundary without improving either the specifications or the code.
