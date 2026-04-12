---
name: nacl-tl-plan
model: opus
effort: high
description: |
  Graph-based development planning from SA specifications in Neo4j.
  One Cypher query per UC instead of reading ~70 markdown files.
  Creates paired BE+FE tasks, TECH tasks, api-contracts, and execution waves.
  Task file format is IDENTICAL to nacl-tl-plan (dev agents don't change).
  Use when: create dev plan from graph, plan implementation, generate tasks,
  create development schedule, generate execution waves, or the user says "/nacl-tl-plan".
---

# /nacl-tl-plan -- Development Planning from Neo4j Graph

## Purpose

Graph-powered replacement for `/nacl-tl-plan`. Reads the SA specification from Neo4j
(modules, use cases, entities, dependencies) via Cypher queries and generates
self-sufficient task files for dev agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`).

**Critical difference from nacl-tl-plan:**

| Aspect | nacl-tl-plan | nacl-tl-plan |
|--------|---------|---------------|
| Data source | ~70 markdown files in `docs/` | Neo4j graph |
| Tokens per UC | ~150K (read all docs) | ~550 (~50 query + ~500 response) |
| Retrieval method | Read files sequentially | 1 Cypher query per UC |
| Task file format | Standard `.tl/tasks/` | **IDENTICAL** (dev agents unchanged) |

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read SA graph (modules, UCs, entities, deps) |
| `mcp__neo4j__write-cypher` | Create Wave and Task nodes in the TL layer |
| `mcp__neo4j__get-schema` | Introspect current graph schema before planning |

---

## Invocation

```
/nacl-tl-plan [options]
```

### Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `scope` | `full` (default) | Plan all UCs from the graph |
| | `module:<id>` | Plan only UCs in a specific module |
| | `uc:<id1>,<id2>` | Plan only specific UCs |
| `--feature` | `FR-NNN` | Plan only UCs from a feature request (reads `.tl/feature-requests/FR-NNN.md` to get UC list) |
| `wave-start` | `0` (default) | Starting wave number (for incremental planning) |

---

## Workflow Overview

```
Phase 1: READ SA GRAPH
  |
  +-- Modules, UseCases, DomainEntities, Dependencies
  +-- Priorities, SystemRoles
  |
Phase 2: WAVE PLANNING
  |
  +-- Topological sort by DEPENDS_ON + priority
  +-- Wave 0: TECH tasks (infra)
  +-- Wave 1+: UC-BE before UC-FE, independent UCs in parallel
  +-- Create Wave / Task nodes in Neo4j
  |
Phase 3: TASK GENERATION
  |
  +-- For each UC: run sa_uc_full_context($ucId)
  +-- Map query result to 8 task files
  +-- Write files to .tl/tasks/UC###/
  |
Phase 4: MASTER PLAN
  |
  +-- Update master-plan.md
  +-- Update status.json
  +-- Update changelog.md
```

---

## Phase 1: Read SA Graph

### Step 1.1: Pre-flight -- verify graph has SA data

```cypher
// Pre-flight: count SA-layer nodes
MATCH (n)
WHERE n:Module OR n:UseCase OR n:DomainEntity OR n:Form OR n:Requirement OR n:SystemRole
RETURN labels(n)[0] AS label, count(n) AS count
ORDER BY label
```

**If result is empty or all counts are 0:**
1. STOP -- planning is impossible without SA data in the graph.
2. Suggest user runs `/nacl-sa-architect` or `/nacl-sa-domain` first.

### Step 1.2: Get all modules with their UCs and entities

```cypher
// All modules with UC and entity counts
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.id AS module_id, m.name AS module_name,
       count(DISTINCT uc) AS uc_count,
       count(DISTINCT de) AS entity_count
ORDER BY m.id
```

### Step 1.3: Get all UCs with priorities and dependencies

```cypher
// sa_uc_dependencies -- all UCs with their DEPENDS_ON edges
MATCH (uc:UseCase)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       uc.priority AS priority,
       m.id AS module_id, m.name AS module_name,
       collect(dep.id) AS depends_on
ORDER BY uc.priority DESC, uc.id
```

### Step 1.4: Get complete domain model overview

```cypher
// Domain entities with attribute count and relationships
MATCH (de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ATTRIBUTE]->(da:DomainAttribute)
OPTIONAL MATCH (de)-[rel:RELATES_TO]->(de2:DomainEntity)
RETURN de.id AS entity_id, de.name AS entity_name,
       count(DISTINCT da) AS attr_count,
       collect(DISTINCT {target: de2.name, type: rel.rel_type, card: rel.cardinality}) AS relationships
ORDER BY de.id
```

### Step 1.5: Check for existing TL-layer data (incremental planning)

```cypher
// Count existing Task and Wave nodes
MATCH (n)
WHERE n:Task OR n:Wave
RETURN labels(n)[0] AS label, count(n) AS count
```

**If Tasks/Waves already exist:** Warn the user and ask whether to:
- **Overwrite** -- delete existing TL data and re-plan
- **Increment** -- add new tasks/waves to existing plan
- **Abort** -- cancel planning

---

## Phase 2: Wave Planning

### Step 2.1: Topological sort

Using the `depends_on` data from Step 1.3, sort UCs by:

1. **Dependency order** -- a UC that depends on another UC must come after it
2. **Priority** -- among independent UCs, higher priority comes first
3. **Module grouping** -- UCs in the same module stay close when possible

### Step 2.2: Wave assignment rules

| Rule | Description |
|------|-------------|
| **Wave 0** | Always TECH tasks (infrastructure) |
| **BE before FE** | For the same UC, `UC###-BE` is in an earlier wave than `UC###-FE` |
| **Dependency chain** | If UC-B depends on UC-A, then UC-B-BE wave > UC-A-BE wave |
| **Parallel independent** | UCs with no mutual dependencies can be in the same wave |
| **api-contract first** | `api-contract.md` is created during planning, so available to FE by default |
| **SYNC after pair** | `nacl-tl-sync` runs when both BE and FE for a UC are approved |
| **QA in final waves** | E2E tests run after sync is complete |

### Step 2.3: Standard TECH tasks

Create TECH tasks for Wave 0. Common TECH tasks:

| Task ID | Title | Category |
|---------|-------|----------|
| TECH-001 | Docker Compose Setup | infra |
| TECH-002 | CI/CD Pipeline | cicd |
| TECH-003 | Database Migrations Setup | database |
| TECH-004 | Shared Types Package | types |
| TECH-005 | Authentication Setup | auth |
| TECH-006 | Error Handling Middleware | middleware |
| TECH-007 | Logging & Monitoring | monitoring |

Adjust list based on what the project actually needs (infer from graph content).

### Step 2.4: Create Wave and Task nodes in Neo4j

```cypher
// Create Wave node
MERGE (w:Wave {id: $waveId})
SET w.number = $waveNumber,
    w.name = $waveName,
    w.status = 'pending'
```

```cypher
// Create Task node and link to Wave and UseCase
MERGE (t:Task {id: $taskId})
SET t.title = $title,
    t.type = $type,
    t.status = 'pending',
    t.wave = $waveNumber,
    t.agent = $agent,
    t.phase_be = 'pending',
    t.phase_fe = 'pending',
    t.phase_sync = 'pending',
    t.phase_review_be = 'pending',
    t.phase_review_fe = 'pending',
    t.phase_qa = 'pending',
    t.priority = coalesce($priority, 'medium'),
    t.created = datetime(),
    t.updated = datetime()
WITH t
MATCH (w:Wave {number: $waveNumber})
MERGE (t)-[:IN_WAVE]->(w)
WITH t
MATCH (uc:UseCase {id: $ucId})
MERGE (uc)-[:GENERATES]->(t)
```

```cypher
// Create dependency edge between tasks
MATCH (t1:Task {id: $taskId}), (t2:Task {id: $dependsOnId})
MERGE (t1)-[:DEPENDS_ON]->(t2)
```

---

## Phase 3: Task Generation

### The Key Query: sa_uc_full_context

For each UC, run ONE Cypher query to get everything needed for all task files.

Query from `graph-infra/queries/sa-queries.cypher`:

```cypher
// sa_uc_full_context($ucId)
// ~50 tokens query, ~500 tokens response per UC
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
```

Additionally, fetch API endpoints for the UC (from TL layer if they exist, or via EXPOSES):

```cypher
// API endpoints for UC
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:EXPOSES]->(api:APIEndpoint)
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)-[:IMPLEMENTS]->(api2:APIEndpoint)
RETURN collect(DISTINCT api) + collect(DISTINCT api2) AS api_endpoints
```

And fetch enumeration values used by the UC's domain entities:

```cypher
// Enumerations used by UC's entities
MATCH (uc:UseCase {id: $ucId})
OPTIONAL MATCH (uc)-[:USES_FORM]->(:Form)-[:HAS_FIELD]->(:FormField)
       -[:MAPS_TO]->(:DomainAttribute)<-[:HAS_ATTRIBUTE]-(de:DomainEntity)
OPTIONAL MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
RETURN collect(DISTINCT en) AS enumerations,
       collect(DISTINCT ev) AS enum_values
```

### Query Result to Task File Mapping

The sa_uc_full_context result maps directly to each task file section:

```
sa_uc_full_context result
  |
  +-- uc (UseCase node)
  |     props: id, name, description, priority, preconditions, postconditions
  |     |
  |     +---> task-be.md: Header, Description, Actor, Preconditions
  |     +---> task-fe.md: Header, Description, Actor
  |     +---> acceptance.md: UC name, preconditions, postconditions
  |     +---> impl-brief.md: Overview, preconditions, postconditions
  |     +---> impl-brief-fe.md: Overview, user-facing context
  |
  +-- activity_steps (ActivityStep nodes)
  |     props: id, description, order, step_type (system|user|api)
  |     |
  |     +---> task-be.md: Main Flow (system steps)
  |     +---> task-fe.md: User Interactions (user steps)
  |     +---> api-contract.md: Endpoints (api steps)
  |     +---> impl-brief.md: Implementation Steps (system steps)
  |     +---> impl-brief-fe.md: Implementation Steps (user steps)
  |     +---> test-spec.md: Test Scenarios (one per system step)
  |     +---> test-spec-fe.md: Test Scenarios (one per user step)
  |
  +-- forms (Form nodes)
  |     props: id, name, description
  |     |
  |     +---> task-fe.md: Forms section
  |     +---> impl-brief-fe.md: UI Spec section
  |
  +-- form_fields (FormField nodes)
  |     props: id, name, label, field_type, required, validation, placeholder
  |     |
  |     +---> task-fe.md: Form Fields table
  |     +---> api-contract.md: Request body fields
  |     +---> impl-brief-fe.md: Component field specs
  |     +---> test-spec-fe.md: Field validation test cases
  |
  +-- domain_attributes (DomainAttribute nodes)
  |     props: id, name, data_type, required, description, constraints
  |     |
  |     +---> task-be.md: Context Extract (entity attribute table)
  |     +---> api-contract.md: Shared Types (TypeScript interfaces)
  |     +---> test-spec.md: Validation test cases (type, required, constraints)
  |
  +-- domain_entities (DomainEntity nodes)
  |     props: id, name, description, module
  |     |
  |     +---> task-be.md: Context Extract (entity name, description)
  |     +---> task-fe.md: Context Extract (entity reference)
  |     +---> api-contract.md: Shared Types (entity interfaces)
  |     +---> impl-brief.md: DB schema, service layer
  |
  +-- requirements (Requirement nodes)
  |     props: id, description, type (FR|NFR), priority, acceptance_criteria
  |     |
  |     +---> acceptance.md: Acceptance Criteria list
  |     +---> test-spec.md: Test cases derived from requirements
  |     +---> test-spec-fe.md: FE test cases from UI requirements
  |     +---> task-be.md: Requirements section
  |     +---> task-fe.md: Requirements section
  |
  +-- roles (SystemRole nodes)
  |     props: id, name, permissions
  |     |
  |     +---> task-be.md: Actor, Authorization section
  |     +---> api-contract.md: Authentication section
  |     +---> test-spec.md: Auth test cases
  |
  +-- api_endpoints (APIEndpoint nodes)
  |     props: id, method, path, description, request_body, response_body
  |     |
  |     +---> api-contract.md: Endpoints table, Request/Response schemas
  |     +---> task-be.md: API Endpoints to implement
  |     +---> task-fe.md: API calls to consume
  |     +---> impl-brief.md: Route + controller + service steps
  |     +---> impl-brief-fe.md: API hook / fetch implementation
  |
  +-- enumerations / enum_values
        props: id, name, value, description
        |
        +---> api-contract.md: Shared Types (enum definitions)
        +---> task-fe.md: Dropdown/select options
        +---> task-be.md: Enum validation
```

### Task File Directory Structure

```
.tl/
+-- master-plan.md
+-- changelog.md
+-- status.json
+-- .gitignore
+-- tasks/
    +-- UC001/
    |   +-- task-be.md
    |   +-- task-fe.md
    |   +-- test-spec.md
    |   +-- test-spec-fe.md
    |   +-- impl-brief.md
    |   +-- impl-brief-fe.md
    |   +-- acceptance.md
    |   +-- api-contract.md
    +-- UC002/
    |   +-- (same 8 files)
    +-- TECH-001/
    |   +-- task.md
    |   +-- test-spec.md
    |   +-- impl-brief.md
    +-- TECH-002/
        +-- (same 3 files)
```

### File Generation Order per UC

For each UC, generate files in this order:

1. **api-contract.md** -- defines shared types and endpoints (uses: `api_endpoints`, `domain_attributes`, `domain_entities`, `form_fields`, `roles`, `enumerations`)
2. **task-be.md** -- backend task (uses: `uc`, `activity_steps` [system], `domain_entities`, `domain_attributes`, `requirements`, `roles`, `api_endpoints`)
3. **task-fe.md** -- frontend task (uses: `uc`, `activity_steps` [user], `forms`, `form_fields`, `domain_entities`, `requirements`, `api_endpoints`)
4. **test-spec.md** -- backend tests (uses: `activity_steps` [system], `requirements`, `domain_attributes`, `api_endpoints`, `roles`)
5. **test-spec-fe.md** -- frontend tests (uses: `activity_steps` [user], `forms`, `form_fields`, `requirements`)
6. **impl-brief.md** -- Backend implementation plan. Structure: 1) Entities/models to create (from `domain_entities`, `domain_attributes`), 2) Services/repositories (from `activity_steps` [system]), 3) API controllers (from `api_endpoints`), 4) Validation logic (from `requirements` [validation type]), 5) Integration points (from cross-UC edges). Derived from: DomainEntity attributes, APIEndpoints, Requirements. (uses: `activity_steps` [system], `domain_entities`, `domain_attributes`, `api_endpoints`, `requirements`)
7. **impl-brief-fe.md** -- Frontend implementation plan. Structure: 1) Pages/routes (from `activity_steps` [user]), 2) Components hierarchy (from `forms`, `form_fields`), 3) API client hooks (from `api_endpoints`), 4) State management (from `domain_entities`), 5) Form validation (from `requirements` [validation type], `form_fields` [required]). Derived from: Forms, FormFields, Components, MAPS_TO mapping. (uses: `activity_steps` [user], `forms`, `form_fields`, `domain_entities`, `api_endpoints`)
8. **acceptance.md** -- shared acceptance criteria (uses: `uc`, `requirements`)

### Splitting Activity Steps by Layer

ActivityStep nodes have a `step_type` property (or infer from `description`):

| step_type / Pattern | Target File | Layer |
|---------------------|-------------|-------|
| `system` / "System validates...", "System saves...", "System calculates..." | `task-be.md` | BE |
| `user` / "User clicks...", "User fills...", "System displays..." | `task-fe.md` | FE |
| `api` / "System sends request...", "API returns..." | `api-contract.md` | Shared |

If `step_type` is not set, infer from the description text:
- "System validates/saves/calculates/checks/sends notification" --> BE
- "User clicks/fills/navigates/selects", "System displays/shows" --> FE
- "System sends request to API/receives data" --> Shared

### Key Principle: Self-Sufficiency

**CRITICAL**: Task files must be **self-sufficient**. Dev agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`) must NOT query Neo4j or read SA docs during development. ALL information from the graph subquery must be embedded into the task files.

**DO**: Embed content from the query result

```markdown
## Context Extract

### Entity: Order
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| number | String | Yes | Auto-generated ORD-YYYYMMDD-NNNN |
| status | OrderStatus | Yes | Current order status |
| total | Decimal | Yes | Order total amount |
```

**DON'T**: Leave references

```markdown
## Context
Query Neo4j for DomainEntity:Order attributes
```

---

## Phase 4: Master Plan

### Step 4.1: Generate master-plan.md

```markdown
# Master Plan -- {Project Name}

**Generated:** {date}
**Source:** Neo4j graph (nacl-tl-plan)
**Modules:** {module count}
**Use Cases:** {uc count}

## Module Structure

| Module | UCs | Entities | Description |
|--------|-----|----------|-------------|
| {from Step 1.2 results} |

## Task List

### UC Tasks

| UC ID | Title | Priority | Module | BE Wave | FE Wave | Depends On |
|-------|-------|----------|--------|---------|---------|------------|
| {from wave planning} |

### TECH Tasks

| Task ID | Title | Category | Wave |
|---------|-------|----------|------|
| TECH-001 | Docker Compose Setup | infra | 0 |
| ... |

## Execution Waves

### Wave 0: Infrastructure
| Task | Title | Agent | Est. |
|------|-------|-------|------|
| TECH-001 | Docker Compose Setup | nacl-tl-dev | 1h |
| ... |

### Wave 1: Core Backend
| Task | Title | Agent | Depends On |
|------|-------|-------|------------|
| UC001-BE | {title} API | nacl-tl-dev-be | TECH-001, TECH-003 |
| ... |

### Wave 2: Core Frontend + Dependent Backend
| Task | Title | Agent | Depends On |
|------|-------|-------|------------|
| UC001-FE | {title} Form | nacl-tl-dev-fe | UC001-BE |
| ... |

## Critical Path

{Identify the longest dependency chain}

## Open Questions

{Any issues found during planning}

## Next Task

Start with Wave 0: `TECH-001 [{title}]`
Run: `/nacl-tl-dev TECH-001`
```

### Step 4.2: Generate status.json

```json
{
  "project": "{Project Name}",
  "created": "{ISO date}",
  "updated": "{ISO date}",
  "source": "nacl-tl-plan",
  "summary": {
    "total_uc": 0,
    "total_tech": 0,
    "pending": 0,
    "in_progress": 0,
    "ready_for_review": 0,
    "approved": 0,
    "done": 0,
    "blocked": 0
  },
  "waves": {
    "total": 0,
    "current": 0
  },
  "tasks": []
}
```

**UC task entry format:**

```json
{
  "id": "UC001",
  "title": "Create Order",
  "type": "uc",
  "phases": {
    "be": { "status": "pending" },
    "fe": { "status": "pending" },
    "sync": { "status": "pending" },
    "review-be": { "status": "pending" },
    "review-fe": { "status": "pending" },
    "qa": { "status": "pending" }
  },
  "wave": 1,
  "priority": "high",
  "blockers": [],
  "blocks": []
}
```

**TECH task entry format:**

```json
{
  "id": "TECH-001",
  "title": "Docker Compose Setup",
  "type": "tech",
  "status": "pending",
  "wave": 0,
  "priority": "high",
  "blockers": [],
  "blocks": []
}
```

### Step 4.3: Generate changelog.md

```markdown
# Changelog

## [PLAN] {date}

- Created development plan from Neo4j graph (nacl-tl-plan)
- Generated N UC tasks (BE + FE pairs) + M TECH tasks
- Defined K execution waves
- API contracts created for all UCs
- Source: Neo4j SA layer ({node count} nodes, {edge count} edges)
```

### Step 4.4: Create .tl/.gitignore

```
qa-screenshots/
```

---

## TECH Task Generation

For TECH tasks (Wave 0), create 3 files per task in `.tl/tasks/TECH-###/`:

| File | Purpose |
|------|---------|
| `task.md` | What to configure/create (single file, NOT task-be/task-fe) |
| `test-spec.md` | Verification tests (if applicable) |
| `impl-brief.md` | How to implement |

TECH tasks do NOT have `task-be.md` or `task-fe.md` -- they use a single `task.md`.

---

## Reference Documents

Load these for detailed task file format guidelines:

| Task | Reference |
|------|-----------|
| Task file format | `nacl-tl-core/references/task-file-format.md` |
| API contract rules | `nacl-tl-core/references/api-contract-rules.md` |
| Frontend rules | `nacl-tl-core/references/frontend-rules.md` |
| FE code style | `nacl-tl-core/references/fe-code-style.md` |
| Dev environment | `nacl-tl-core/references/dev-environment.md` |

## Templates

Use templates from `nacl-tl-core/templates/` for consistent output:

### UC Task Templates

| Template | Target File |
|----------|-------------|
| `task-be-template.md` | `task-be.md` |
| `task-fe-template.md` | `task-fe.md` |
| `test-spec-template.md` | `test-spec.md` |
| `test-spec-fe-template.md` | `test-spec-fe.md` |
| `impl-brief-template.md` | `impl-brief.md` |
| `impl-brief-fe-template.md` | `impl-brief-fe.md` |
| `acceptance-template.md` | `acceptance.md` |
| `api-contract-template.md` | `api-contract.md` |

### TECH Task Templates

| Template | Target File |
|----------|-------------|
| `tech-task-template.md` | `task.md` |
| `test-spec-template.md` | `test-spec.md` |
| `impl-brief-template.md` | `impl-brief.md` |

---

## Error Handling

### Neo4j connection failure

If `mcp__neo4j__read-cypher` fails:
1. Connection: read from config.yaml graph section (see nacl-core/SKILL.md → Graph Config Resolution). MCP tools handle the connection automatically.
2. Suggest user verify Neo4j is running.
3. Abort planning with a clear error message.

### Empty graph

If pre-flight returns zero SA nodes:
1. STOP immediately.
2. Report: "SA layer is empty. Run `/nacl-sa-architect` or `/nacl-sa-domain` to populate it."

### Missing UC data

If `sa_uc_full_context` returns a UC with no activity steps or no requirements:
1. Create task files with available information.
2. Add note in impl-brief: "Activity steps pending" or "Requirements pending".
3. Set task priority to low until resolved.
4. Add to blockers in status.json.

### Circular dependencies

If topological sort detects a cycle:
1. Run the circular dependency check:
```cypher
MATCH path = (uc:UseCase)-[:DEPENDS_ON*1..10]->(uc)
RETURN uc.id, [n IN nodes(path) | n.id] AS cycle
LIMIT 5
```
2. Report the cycle and ask user to resolve it.
3. Do NOT proceed with wave planning until cycles are resolved.

### Incremental planning conflicts

If Task/Wave nodes already exist:
1. Warn the user.
2. Offer options: overwrite / increment / abort.
3. For overwrite, delete existing TL nodes first:
```cypher
MATCH (n) WHERE n:Task OR n:Wave DETACH DELETE n
```

---

## Reads / Writes

### Reads (Neo4j -- via mcp__neo4j__read-cypher)

```yaml
# SA layer nodes:
- Module, UseCase, ActivityStep, DomainEntity, DomainAttribute
- Enumeration, EnumValue, Form, FormField
- Requirement, SystemRole, Component, APIEndpoint

# SA layer edges:
- CONTAINS_UC, CONTAINS_ENTITY, HAS_STEP, USES_FORM, HAS_FIELD
- MAPS_TO, HAS_ATTRIBUTE, HAS_REQUIREMENT, DEPENDS_ON, ACTOR
- HAS_ENUM, HAS_VALUE, EXPOSES, RELATES_TO

# TL layer nodes (for incremental check):
- Task, Wave

# Key named queries (graph-infra/queries/):
- sa_uc_full_context (sa-queries.cypher)
- sa_uc_dependencies (sa-queries.cypher)
- sa_module_overview (sa-queries.cypher)
- tl_uc_task_context (tl-queries.cypher)
```

### Writes (Neo4j -- via mcp__neo4j__write-cypher)

```yaml
# TL layer nodes created:
- Wave (id, number, name, status)
- Task (id, title, type, status, wave, agent)

# TL layer edges created:
- (Task)-[:IN_WAVE]->(Wave)
- (Task)-[:DEPENDS_ON]->(Task)
- (UseCase)-[:GENERATES]->(Task)
- (Task)-[:IMPLEMENTS]->(APIEndpoint)
```

### Writes (Filesystem)

```yaml
# Files created:
- .tl/master-plan.md
- .tl/changelog.md
- .tl/status.json
- .tl/.gitignore
- .tl/tasks/UC###/task-be.md (per UC)
- .tl/tasks/UC###/task-fe.md (per UC)
- .tl/tasks/UC###/test-spec.md (per UC)
- .tl/tasks/UC###/test-spec-fe.md (per UC)
- .tl/tasks/UC###/impl-brief.md (per UC)
- .tl/tasks/UC###/impl-brief-fe.md (per UC)
- .tl/tasks/UC###/acceptance.md (per UC)
- .tl/tasks/UC###/api-contract.md (per UC)
- .tl/tasks/TECH-###/task.md (per TECH)
- .tl/tasks/TECH-###/test-spec.md (per TECH)
- .tl/tasks/TECH-###/impl-brief.md (per TECH)
```

---

## Output Summary

After completion, display:

```
Development Plan Created (from Neo4j graph)

Project: [Name]
Source: Neo4j SA layer ({N} nodes queried)
Tasks: {N} UC tasks + {M} TECH tasks
  BE tasks: {N} (one per UC)
  FE tasks: {N} (one per UC)
  TECH tasks: {M}
  API Contracts: {N} (one per UC)
Execution Waves: {K} waves
Dependencies: Mapped in graph (Task DEPENDS_ON Task)

Wave 0: TECH-001, TECH-002, TECH-003
Wave 1: UC001-BE, UC002-BE
Wave 2: UC001-FE, UC003-BE
Wave 3: UC002-FE, UC003-FE
...

Next task: TECH-001 [Docker Compose Setup]

Run: /nacl-tl-dev TECH-001 to start infrastructure setup
Run: /nacl-tl-status to see progress
```

---

## Quality Checklist

Before completing, verify:

### Task files
- [ ] Every UC has exactly 8 files (task-be, task-fe, test-spec, test-spec-fe, impl-brief, impl-brief-fe, acceptance, api-contract)
- [ ] Every TECH task has 2-3 files (task, impl-brief, optionally test-spec)
- [ ] All task-be.md files have complete frontmatter with `depends_on` and `blocks`
- [ ] All task-fe.md files reference `api-contract.md` for endpoints
- [ ] All api-contract.md files have Shared Types, Endpoints, Errors, and Authentication
- [ ] No task file contains external references (e.g., "see docs/..." or "query Neo4j for...") -- all content is embedded

### Wave planning
- [ ] Wave 0 contains only TECH tasks
- [ ] No FE task is in an earlier wave than its corresponding BE task
- [ ] Dependencies match graph DEPENDS_ON edges
- [ ] master-plan.md has Execution Waves with correct dependency ordering
- [ ] status.json has entries for all UC and TECH tasks with correct wave assignments

### Graph state
- [ ] Wave nodes created in Neo4j
- [ ] Task nodes created in Neo4j with correct IN_WAVE edges
- [ ] GENERATES edges connect UseCases to Tasks
- [ ] DEPENDS_ON edges connect dependent Tasks

### Tracking files
- [ ] .tl/.gitignore exists with `qa-screenshots/`
- [ ] changelog.md has initial PLAN entry noting Neo4j as source
- [ ] status.json matches the wave plan

---

## Next Steps

After planning:

- `/nacl-tl-dev TECH###` -- Start TECH task development (Wave 0 first)
- `/nacl-tl-dev-be UC###` -- Start backend development for a UC
- `/nacl-tl-dev-fe UC###` -- Start frontend development for a UC
- `/nacl-tl-status` -- View project progress (waves, tasks, stubs)
- `/nacl-tl-next` -- Get next suggested task based on wave and dependencies
