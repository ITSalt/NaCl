---
name: nacl-sa-roles
model: sonnet
effort: medium
description: |
  System roles and permission matrix through Neo4j graph: SystemRole, HAS_PERMISSION, MAPPED_TO.
  Modes: IMPORT_BA (import BusinessRole from BA layer), CREATE (new role), MODIFY (change role), FULL (full role model).
  Use when: define system roles in graph, import BA roles, create permission matrix, nacl-sa-roles.
---

# /nacl-sa-roles --- System Roles & Permissions (Graph)

## Purpose

Define system roles, build the CRUD permission matrix against DomainEntities, and create BA-to-SA role mapping edges. All data lives in Neo4j -- no markdown artifacts.

**Shared references:** `nacl-core/SKILL.md`

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read-only queries (fetch BA roles, existing SystemRoles, DomainEntities) |
| `mcp__neo4j__write-cypher` | Create/update/delete nodes and edges |
| `mcp__neo4j__get-schema` | Introspect current graph schema |

---

## Modes

### Mode `IMPORT_BA`

Import BA business roles from Neo4j graph as SystemRole candidates with N:M mapping and full handoff traceability.

**When:** BA layer populated in Neo4j (BusinessRole nodes exist), SA role model not yet created.

### Mode `CREATE`

Create a single new SystemRole interactively with permissions.

**When:** User asks to add a new system role not sourced from BA (e.g. Admin, System).

**Parameter:** `role_name` -- name of the role to create.

### Mode `MODIFY`

Modify an existing SystemRole: change permissions, add/remove MAPPED_TO edges, update properties.

**When:** User asks to change permissions or properties of an existing role.

**Parameter:** `role_name` -- name of the role to modify.

### Mode `FULL`

Build the complete role model: all roles, permission matrix, data scope rules.

**When:** After `nacl-sa-architect` and `nacl-sa-domain`, when building the full role model from scratch.

---

## Workflow

```
+-----------------+    +-----------------+    +-----------------+    +-----------------+
| Phase 1         |    | Phase 2         |    | Phase 3         |    | Phase 4         |
| Identify        |--->| CRUD            |--->| Data scope      |--->| Workflow        |
| roles           |    | permission      |    | constraints     |    | permissions     |
|                 |    | matrix          |    |                 |    |                 |
+-----------------+    +-----------------+    +-----------------+    +-----------------+
```

Each phase ends with:
1. **Summary** -- what was understood
2. **Confirmation** -- user approval
3. **Graph writes** -- create/update nodes and edges in Neo4j

**Do not proceed to the next phase without explicit user confirmation!**

---

## Pre-check

1. Verify DomainEntity nodes exist (needed for permission matrix):

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id AS id, de.name AS name, m.name AS module
ORDER BY m.name, de.name
```

If no DomainEntities found -- suggest running `nacl-sa-domain` first.

2. Check existing SystemRole nodes:

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
OPTIONAL MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr)
OPTIONAL MATCH (sr)-[p:HAS_PERMISSION]->(de:DomainEntity)
RETURN sr.id AS id, sr.name AS name, sr.type AS type, sr.description AS description,
       collect(DISTINCT br.full_name) AS mapped_from_ba,
       count(DISTINCT p) AS permission_count
ORDER BY sr.id
```

If SystemRoles already exist -- warn about possible overwrite and suggest `MODIFY` mode.

3. Check for available BA roles (for IMPORT_BA suggestion):

```cypher
// mcp__neo4j__read-cypher
MATCH (br:BusinessRole)
WHERE NOT (br)-[:MAPPED_TO]->(:SystemRole)
RETURN count(br) AS unmapped_ba_roles
```

If unmapped BA roles exist -- suggest starting with `IMPORT_BA` mode.

---

## Mode: IMPORT_BA

### Step 1: Read BA roles from graph

**Goal:** Fetch all BusinessRole nodes and their process associations.

**Cypher -- fetch all BA roles with context:**

```cypher
// mcp__neo4j__read-cypher
MATCH (br:BusinessRole)
OPTIONAL MATCH (br)-[:OWNS]->(owned:BusinessProcess)
OPTIONAL MATCH (br)-[:PARTICIPATES_IN]->(part:BusinessProcess)
OPTIONAL MATCH (br)-[:PERFORMED_BY]-(ws:WorkflowStep)
RETURN br.id AS id, br.full_name AS name, br.description AS description,
       collect(DISTINCT owned.name) AS owns_processes,
       collect(DISTINCT part.name) AS participates_in,
       collect(DISTINCT ws.function_name) AS performs_steps
ORDER BY br.id
```

**Cypher -- check already-mapped BA roles:**

```cypher
// mcp__neo4j__read-cypher
MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
RETURN br.id AS ba_id, br.full_name AS ba_name,
       sr.id AS sa_id, sr.name AS sa_name
```

If all BA roles already mapped -- tell the user. Suggest `CREATE` or `MODIFY` mode.

**Cypher -- fetch DomainEntities for permission context:**

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id AS id, de.name AS name, m.name AS module
ORDER BY m.name, de.name
```

**Cypher -- fetch UseCases for actor assignment context:**

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS id, uc.name AS name, m.name AS module
ORDER BY m.name, uc.id
```

---

### Step 2: Propose N:M mapping BA -> SA

**Goal:** For each BusinessRole, propose one or more SystemRoles. Multiple BA roles may merge into one SA role. One BA role may split into multiple SA roles.

**Mapping rules:**

| Situation | Action | Example |
|-----------|--------|---------|
| 1 BA role = 1 SA role | Direct mapping (1:1) | "Менеджер" -> "Manager" |
| 1 BA role -> N SA roles | Split by access level (1:N) | "Руководитель" -> "TeamLead", "DepartmentHead" |
| N BA roles -> 1 SA role | Merge similar system rights (N:1) | "Кладовщик", "Приёмщик" -> "WarehouseOperator" |
| No BA source | System-only role (new) | -- -> "Admin", "System" |

**Always consider adding these system-only roles if not present in BA:**
- **Admin** -- full system access, user management, configuration
- **System** -- automated/background processes (if the system has scheduled tasks, integrations, etc.)

**Present to user:**

```
**BA -> SA Role Mapping**

Found {N} BA business roles -> proposing {M} SA system roles:

| # | BA Role(s) | SA Role (candidate) | Type | Mapping |
|---|-----------|--------------------|----|---------|
| 1 | {BA Role 1} | {SA Role 1} | internal | 1:1 |
| 2 | {BA Role 2}, {BA Role 3} | {SA Role 2} | internal | N:1 (merge) |
| 3 | {BA Role 4} | {SA Role 3a}, {SA Role 3b} | external | 1:N (split) |
| 4 | -- | Admin | internal | New SA role |
| 5 | -- | System | internal | New SA role |

Questions:
1. Is the proposed BA -> SA mapping correct?
2. Should any roles be split or merged differently?
3. Which additional system-only roles are needed?
4. Role types: internal (employee) or external (client, partner)?
```

---

### Step 3: Create SystemRole nodes and MAPPED_TO edges

**Goal:** Write SystemRole nodes and BA->SA handoff edges to Neo4j.

**Cypher -- get next SystemRole ID:**

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
WITH max(toInteger(replace(sr.id, 'SR-', ''))) AS maxNum
RETURN 'SR-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 2, '0') AS nextId
```

If `apoc` is not available, compute the next ID in the agent and pass it as a parameter.

**Cypher -- create SystemRole:**

```cypher
// mcp__neo4j__write-cypher
MERGE (sr:SystemRole {id: $id})
SET sr.name = $name,
    sr.type = $type,
    sr.description = $description,
    sr.responsibilities = $responsibilities,
    sr.status = 'draft',
    sr.created = datetime()
```

Parameters:
- `$id` -- format `SR-NN` (e.g. "SR-01")
- `$name` -- English PascalCase (e.g. "OrderManager")
- `$type` -- "internal" or "external"
- `$description` -- Russian description of the role
- `$responsibilities` -- semicolon-separated list of main responsibilities (Russian)

**Cypher -- create MAPPED_TO handoff edge (BusinessRole -> SystemRole):**

```cypher
// mcp__neo4j__write-cypher
MATCH (br:BusinessRole {id: $baRoleId}), (sr:SystemRole {id: $saRoleId})
MERGE (br)-[:MAPPED_TO]->(sr)
```

Execute for each BA-to-SA pair in the confirmed mapping table.

**After all roles created, verify:**

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
OPTIONAL MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr)
RETURN sr.id AS id, sr.name AS name, sr.type AS type,
       collect(DISTINCT {ba_id: br.id, ba_name: br.full_name}) AS mapped_from
ORDER BY sr.id
```

**Present summary:**

```
**Step 3 complete: SystemRole nodes created**

| SA Role | ID | Type | Mapped from BA |
|---------|-----|------|---------------|
| {name} | {id} | {type} | {ba_names or "New SA role"} |

Total: {N} SystemRole nodes, {M} MAPPED_TO edges
```

After confirmation -> proceed to Phase 2 (CRUD matrix).

---

## Phase 1: Identify Roles (FULL / CREATE modes)

**Goal:** Determine all system roles.

### Mode FULL

If BA roles exist in the graph, start with IMPORT_BA Steps 1-3 to pre-populate. Then continue here to review and add system-only roles.

If no BA roles -- gather roles from user.

**Cypher -- load context for role proposal:**

```cypher
// mcp__neo4j__read-cypher
MATCH (m:Module)
OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
RETURN m.name AS module,
       collect(DISTINCT uc.name) AS use_cases,
       collect(DISTINCT de.name) AS entities
ORDER BY m.name
```

**Present to user:**

```
Based on the system architecture and domain model I propose the following roles:

1. **{Role 1}** ({type: internal/external}) -- {description, what the role does}
2. **{Role 2}** ({type}) -- {description}
3. **Admin** (internal) -- full system access, configuration, user management

Questions:
1. Are the proposed roles correct?
2. Any additional roles?
3. Can one user hold multiple roles?
4. Is there a role hierarchy (permission inheritance)?
```

### Mode CREATE

Ask user for role details:

```
**New SystemRole: {name}**

1. English name (PascalCase): {suggestion}
2. Type: internal / external?
3. Description: ?
4. Main responsibilities (3-5 items): ?
5. Map to existing BA role? (optional)

Confirm?
```

Create the SystemRole node using the Cypher from IMPORT_BA Step 3.

### Rules

- Minimum 2 roles (otherwise no role model needed)
- Maximum 7 roles (otherwise reconsider decomposition)
- Each role must differ from others by at least one module or access level
- Guest / unauthenticated user -- separate role if public access exists
- Admin -- always present if the system requires configuration

---

## Phase 2: CRUD Permission Matrix

**Goal:** Define access for each role to each DomainEntity (Create, Read, Update, Delete).

### Step 2.1: Fetch all DomainEntities

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity)
OPTIONAL MATCH (m:Module)-[:CONTAINS_ENTITY]->(de)
RETURN de.id AS id, de.name AS name, m.name AS module
ORDER BY m.name, de.name
```

### Step 2.2: Fetch all SystemRoles

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
RETURN sr.id AS id, sr.name AS name, sr.type AS type
ORDER BY sr.id
```

### Step 2.3: Propose CRUD matrix

Build a table: rows = DomainEntities, columns = SystemRoles. For each cell determine: C/R/U/D or combination.

Use BA context to inform proposals:
- If a BA role OWNS a process that PRODUCES an entity -> C (create)
- If a BA role PARTICIPATES_IN a process that READS an entity -> R (read)
- If a BA role performs steps that MODIFY an entity -> U (update)
- Admin gets CRUD on everything

**Cypher -- BA role-entity interaction (for informed proposals):**

```cypher
// mcp__neo4j__read-cypher
MATCH (br:BusinessRole)-[:PERFORMED_BY]-(ws:WorkflowStep)
MATCH (ws)-[rel:READS|PRODUCES|MODIFIES]->(be:BusinessEntity)
MATCH (be)-[:REALIZED_AS]->(de:DomainEntity)
OPTIONAL MATCH (br)-[:MAPPED_TO]->(sr:SystemRole)
RETURN sr.name AS system_role,
       de.name AS domain_entity,
       collect(DISTINCT type(rel)) AS interactions
ORDER BY sr.name, de.name
```

**Present to user:**

```
**CRUD Permission Matrix**

| DomainEntity | {Role 1} | {Role 2} | {Role 3} | Admin |
|-------------|----------|----------|----------|-------|
| {Entity 1}  | CR       | R        | --       | CRUD  |
| {Entity 2}  | CRUD     | R        | R(own)   | CRUD  |
| {Entity 3}  | --       | CRU      | R        | CRUD  |

Legend:
- C = Create, R = Read, U = Update, D = Delete
- R(own) = read only own records
- CRU(own) = create, read, update only own records
- -- = no access

Questions:
1. Are the access levels correct?
2. Any entities that should be restricted further?
3. Should we distinguish "list view" vs "detail view"?
```

### Step 2.4: Write HAS_PERMISSION edges to Neo4j

**Cypher -- create HAS_PERMISSION edge:**

```cypher
// mcp__neo4j__write-cypher
MATCH (sr:SystemRole {id: $roleId}), (de:DomainEntity {id: $entityId})
MERGE (sr)-[p:HAS_PERMISSION]->(de)
SET p.crud = $crud,
    p.scope = $scope
```

Parameters:
- `$roleId` -- SystemRole.id (e.g. "SR-01")
- `$entityId` -- DomainEntity.id (e.g. "DE-Order")
- `$crud` -- combination of C/R/U/D letters (e.g. "CRUD", "CR", "R")
- `$scope` -- data visibility scope: "all", "own", "department", "assigned" (default "all")

Execute for each confirmed (role, entity) pair from the matrix.

**CRUD notation rules:**
- `"CRUD"` -- full access
- `"CR"` -- create and read
- `"R"` -- read only
- `"RU"` -- read and update
- `""` (empty string) or no edge -- no access (do not create HAS_PERMISSION edge for no-access pairs)

### Step 2.5: Verify permission matrix

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)-[p:HAS_PERMISSION]->(de:DomainEntity)
RETURN sr.name AS role, de.name AS entity, p.crud AS crud, p.scope AS scope
ORDER BY sr.name, de.name
```

**Present summary:**

```
**Phase 2 complete: CRUD matrix written to graph**

| DomainEntity | {Role 1} | {Role 2} | ... | Admin |
|-------------|----------|----------|-----|-------|
| {Entity}    | {crud}   | {crud}   | ... | CRUD  |

Total: {N} HAS_PERMISSION edges
```

---

## Phase 3: Data Scope Constraints

**Goal:** Define which records each role can see (row-level security).

### Questions

```
For each role, let's define data visibility:

1. **{Role 1}**: Sees {all data / only own / only department}?
2. **{Role 2}**: Sees {all data / only own}?

Questions:
1. Should data be filtered by ownership?
2. Is there an organizational hierarchy (departments, branches)?
3. Should a manager see other managers' data?
```

### Scope Values

| Scope | Description | Filter Rule |
|-------|-------------|-------------|
| `all` | Sees all records | No filter |
| `own` | Only records where user = creator/owner | `entity.owner_id = current_user.id` |
| `department` | Records from user's department | `entity.department_id = current_user.department_id` |
| `assigned` | Records explicitly assigned to user | `entity.assignee_id = current_user.id` |

### Update HAS_PERMISSION scope

For each (role, entity) pair that needs scope restriction:

```cypher
// mcp__neo4j__write-cypher
MATCH (sr:SystemRole {id: $roleId})-[p:HAS_PERMISSION]->(de:DomainEntity {id: $entityId})
SET p.scope = $scope,
    p.scope_rule = $scopeRule
```

Parameters:
- `$scope` -- "all", "own", "department", "assigned"
- `$scopeRule` -- human-readable filter rule (e.g. "order.client_id = current_user.id")

### Verify data scope

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)-[p:HAS_PERMISSION]->(de:DomainEntity)
WHERE p.scope <> 'all'
RETURN sr.name AS role, de.name AS entity, p.crud AS crud,
       p.scope AS scope, p.scope_rule AS scope_rule
ORDER BY sr.name, de.name
```

**Present summary:**

```
**Phase 3 complete: Data scope constraints**

| Role | Entity | CRUD | Scope | Rule |
|------|--------|------|-------|------|
| {role} | {entity} | {crud} | {scope} | {rule} |

Roles with restricted scope: {N}
```

---

## Phase 4: Workflow Permissions

**Goal:** Define authorization rules for business process transitions and link roles to UseCases.

### Step 4.1: Link roles to UseCases (ACTOR edges)

**Cypher -- fetch UseCases without actors:**

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)
WHERE NOT (uc)-[:ACTOR]->(:SystemRole)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN uc.id AS id, uc.name AS name, m.name AS module
ORDER BY m.name, uc.id
```

**Cypher -- infer actors from BA handoff (WorkflowStep -> UseCase, WorkflowStep <- BusinessRole -> SystemRole):**

```cypher
// mcp__neo4j__read-cypher
MATCH (ws:WorkflowStep)-[:AUTOMATES_AS]->(uc:UseCase)
MATCH (ws)-[:PERFORMED_BY]->(br:BusinessRole)-[:MAPPED_TO]->(sr:SystemRole)
WHERE NOT (uc)-[:ACTOR]->(sr)
RETURN uc.id AS uc_id, uc.name AS uc_name,
       sr.id AS sr_id, sr.name AS sr_name
ORDER BY uc.id
```

Present the proposed UC -> Role mapping and confirm with user.

**Cypher -- create ACTOR edge (UseCase -> SystemRole):**

```cypher
// mcp__neo4j__write-cypher
MATCH (uc:UseCase {id: $ucId}), (sr:SystemRole {id: $roleId})
MERGE (uc)-[:ACTOR]->(sr)
```

### Step 4.2: Status transition authorization

For entities with lifecycle states (Enumerations representing status), define which roles can perform which transitions.

**Cypher -- find entities with status enums:**

```cypher
// mcp__neo4j__read-cypher
MATCH (de:DomainEntity)-[:HAS_ATTRIBUTE]->(da:DomainAttribute {data_type: "Enum"})
MATCH (de)-[:HAS_ENUM]->(en:Enumeration)-[:HAS_VALUE]->(ev:EnumValue)
WHERE da.name CONTAINS 'status' OR da.name CONTAINS 'state' OR da.name CONTAINS 'Status'
RETURN de.name AS entity, en.name AS enum_name,
       collect(ev.value) AS states
ORDER BY de.name
```

**Present to user:**

```
**Status transition authorization**

### {Entity}

| Transition | Allowed Roles | Condition |
|-----------|---------------|-----------|
| NEW -> IN_PROGRESS | {Role 1}, {Role 2} | -- |
| IN_PROGRESS -> COMPLETED | {Role 1} | All items processed |
| * -> CANCELLED | {Role 1}, Admin | -- |

Questions:
1. Who can perform each transition?
2. Are there approval workflows (multi-step authorization)?
3. Are there amount/limit-based permissions?
```

Transition rules are captured as properties on HAS_PERMISSION edges or as separate documentation in the dialogue summary. For complex workflows, note them in the SystemRole description.

### Step 4.3: Verify workflow permissions

```cypher
// mcp__neo4j__read-cypher
MATCH (uc:UseCase)-[:ACTOR]->(sr:SystemRole)
OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
RETURN m.name AS module, uc.id AS uc_id, uc.name AS uc_name,
       collect(sr.name) AS actors
ORDER BY m.name, uc.id
```

**Present summary:**

```
**Phase 4 complete: Workflow permissions**

| Module | UseCase | Actors |
|--------|---------|--------|
| {module} | {uc_name} | {role_list} |

UseCases with actors: {covered}/{total}
UseCases without actors: {uncovered_list}
```

---

## Mode: MODIFY

### Step 1: Load role with full context

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole {name: $name})
OPTIONAL MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr)
OPTIONAL MATCH (sr)-[p:HAS_PERMISSION]->(de:DomainEntity)
OPTIONAL MATCH (uc:UseCase)-[:ACTOR]->(sr)
RETURN sr,
       collect(DISTINCT {ba_id: br.id, ba_name: br.full_name}) AS mapped_from,
       collect(DISTINCT {entity: de.name, entity_id: de.id, crud: p.crud, scope: p.scope}) AS permissions,
       collect(DISTINCT {uc_id: uc.id, uc_name: uc.name}) AS actor_in
```

Present current state to user and ask what to change.

### Step 2: Apply changes

**Cypher -- update SystemRole properties:**

```cypher
// mcp__neo4j__write-cypher
MATCH (sr:SystemRole {id: $id})
SET sr.name = $name,
    sr.type = $type,
    sr.description = $description,
    sr.responsibilities = $responsibilities
```

**Cypher -- add HAS_PERMISSION:**

Use the `create HAS_PERMISSION` Cypher from Phase 2 Step 2.4.

**Cypher -- update HAS_PERMISSION:**

```cypher
// mcp__neo4j__write-cypher
MATCH (sr:SystemRole {id: $roleId})-[p:HAS_PERMISSION]->(de:DomainEntity {id: $entityId})
SET p.crud = $crud,
    p.scope = $scope,
    p.scope_rule = $scopeRule
```

**Cypher -- remove HAS_PERMISSION:**

```cypher
// mcp__neo4j__write-cypher
MATCH (sr:SystemRole {id: $roleId})-[p:HAS_PERMISSION]->(de:DomainEntity {id: $entityId})
DELETE p
```

**Cypher -- add MAPPED_TO edge:**

Use the `create MAPPED_TO` Cypher from IMPORT_BA Step 3.

**Cypher -- remove MAPPED_TO edge:**

```cypher
// mcp__neo4j__write-cypher
MATCH (br:BusinessRole {id: $baRoleId})-[r:MAPPED_TO]->(sr:SystemRole {id: $saRoleId})
DELETE r
```

**Cypher -- add ACTOR edge:**

Use the `create ACTOR` Cypher from Phase 4 Step 4.1.

**Cypher -- remove ACTOR edge:**

```cypher
// mcp__neo4j__write-cypher
MATCH (uc:UseCase {id: $ucId})-[r:ACTOR]->(sr:SystemRole {id: $roleId})
DELETE r
```

### Step 3: Verify

After changes, reload the role using the Step 1 query and present the updated state.

---

## ID Generation

| Node Type | Format | Example |
|-----------|--------|---------|
| SystemRole | SR-NN | SR-01 |

To check for ID collisions:

```cypher
// mcp__neo4j__read-cypher
OPTIONAL MATCH (sr:SystemRole {id: $id})
RETURN sr IS NOT NULL AS exists
```

---

## Validation Queries

Run these after any write operation to ensure graph integrity.

**Cypher -- SystemRoles without any permissions:**

```cypher
// val_role_without_permissions
MATCH (sr:SystemRole)
WHERE NOT (sr)-[:HAS_PERMISSION]->(:DomainEntity)
RETURN sr.id, sr.name
```

**Cypher -- DomainEntities not covered by any role:**

```cypher
// val_entity_without_permissions
MATCH (de:DomainEntity)
WHERE NOT (:SystemRole)-[:HAS_PERMISSION]->(de)
RETURN de.id, de.name, de.module
```

**Cypher -- BA roles not yet mapped to SA:**

```cypher
// val_unmapped_ba_roles
MATCH (br:BusinessRole)
WHERE NOT (br)-[:MAPPED_TO]->(:SystemRole)
RETURN br.id, br.full_name
```

**Cypher -- UseCases without ACTOR:**

```cypher
// val_uc_without_actor
MATCH (uc:UseCase)
WHERE NOT (uc)-[:ACTOR]->(:SystemRole)
RETURN uc.id, uc.name
```

**Cypher -- handoff coverage stats (role slice):**

```cypher
// val_role_coverage
MATCH (br:BusinessRole)
WITH count(br) AS total_roles
OPTIONAL MATCH (br2:BusinessRole)-[:MAPPED_TO]->(:SystemRole)
WITH total_roles, count(br2) AS covered_roles
RETURN total_roles, covered_roles,
       CASE WHEN total_roles > 0
            THEN round(100.0 * covered_roles / total_roles)
            ELSE 0 END AS coverage_pct
```

---

## Completion

After Phase 4 is confirmed:

1. **Run validation queries** -- report any issues.

2. **Final verification:**

```cypher
// mcp__neo4j__read-cypher
MATCH (sr:SystemRole)
OPTIONAL MATCH (br:BusinessRole)-[:MAPPED_TO]->(sr)
OPTIONAL MATCH (sr)-[p:HAS_PERMISSION]->(de:DomainEntity)
OPTIONAL MATCH (uc:UseCase)-[:ACTOR]->(sr)
RETURN sr.id AS id, sr.name AS name, sr.type AS type,
       count(DISTINCT br) AS ba_mapping_count,
       count(DISTINCT p) AS permission_count,
       count(DISTINCT uc) AS uc_actor_count
ORDER BY sr.id
```

3. **Present final summary:**

```
**Role model complete (in graph)**

| Role | ID | Type | BA Mapped | Permissions | UC Actor |
|------|----|------|-----------|-------------|----------|
| {name} | {id} | {type} | {N} | {N} | {N} |

BA role coverage: {covered}/{total} ({pct}%)
Entity permission coverage: {covered_entities}/{total_entities}
UseCase actor coverage: {covered_uc}/{total_uc}

Next steps:
1. `/nacl-sa-uc` -- detail Use Cases with activity steps and forms
2. `/nacl-sa-uc` -- create User Stories per module
```

---

## Checklist /nacl-sa-roles

### Phase 1: Identify roles
- [ ] All roles identified (2-7 roles)
- [ ] Role types specified (internal/external)
- [ ] Responsibilities described
- [ ] BA -> SA mapping confirmed (if IMPORT_BA)
- [ ] SystemRole nodes created in graph (MERGE)
- [ ] MAPPED_TO edges created (BusinessRole -> SystemRole)

### Phase 2: CRUD permission matrix
- [ ] Matrix filled for all (role x entity) pairs
- [ ] No unintended gaps (explicit "--" for no access)
- [ ] HAS_PERMISSION edges created with crud property
- [ ] User confirmed the matrix

### Phase 3: Data scope constraints
- [ ] Data scope defined for each role
- [ ] scope and scope_rule set on HAS_PERMISSION edges
- [ ] Row-level security rules documented

### Phase 4: Workflow permissions
- [ ] ACTOR edges created (UseCase -> SystemRole)
- [ ] Status transition authorization defined
- [ ] Approval workflows described (if any)
- [ ] UC actor coverage checked

### Validation
- [ ] No SystemRoles without permissions (val_role_without_permissions)
- [ ] No DomainEntities without any role access (val_entity_without_permissions)
- [ ] No unmapped BA roles (val_unmapped_ba_roles)
- [ ] No UseCases without actors (val_uc_without_actor)
- [ ] Handoff coverage reported (val_role_coverage)
