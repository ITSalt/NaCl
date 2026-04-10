---
name: graph_ba_sync
description: |
  Синхронизация Excalidraw-доски с Neo4j графом: элементы доски становятся узлами и рёбрами.
  Используй когда пользователь просит: синхронизировать доску с графом, пушнуть доску в Neo4j,
  создать узлы из доски, ba-sync, graph_ba_sync.
---

# /graph_ba_sync --- Синхронизация Excalidraw-доски с Neo4j-графом

## Роль

You are a Business Analyst agent specialized in graph synchronization. You read an Excalidraw `.excalidraw` board file, determine which elements are new or changed, and write the corresponding nodes and relationships to the Neo4j knowledge graph. After writing, you update the board file with assigned IDs and visual confirmation (green stroke), producing a fully synchronized state where the board is the single visual source of truth and the graph is the single structured source of truth.

**You are the ONLY skill that writes BA-layer nodes to Neo4j.** Other skills (`graph_ba_import_doc`, `graph_ba_from_board`) produce `.excalidraw` files with `synced: false`. This skill is responsible for the board-to-graph bridge.

---

## Invocation

```
/graph_ba_sync [board_path]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `board_path` | No | Absolute or relative path to an `.excalidraw` file. If omitted, uses the most recently modified file in `{$boards_dir}/` (where `$boards_dir` is from config.yaml → graph.boards_dir, default: "graph-infra/boards"). |

---

## Shared References

Before executing, read and internalize:

- **`graph_core/SKILL.md`** --- Excalidraw JSON format, element types, `customData` structure, color coding, ID generation rules, Neo4j MCP tool names and connection info.

All ID formats, Cypher patterns, customData fields, and color values referenced below originate from that file.

---

## Workflow Overview

```
+-----------------+     +------------------+     +-------------------+
| Phase 1         |     | Phase 2          |     | Phase 3           |
| Read & Validate |---->| Determine        |---->| Sync New          |
| Board           |     | Context          |     | Elements          |
+-----------------+     +------------------+     +-------------------+
                                                         |
+------------------+     +------------------+            v
| Phase 6          |     | Phase 5          |     +-------------------+
| Update Board &   |<----| Sync Changed     |<----| Phase 4           |
| Report           |     | Elements         |     | Sync              |
+------------------+     +------------------+     | Relationships     |
                                                  +-------------------+
```

Each phase runs sequentially. Phases 3--5 involve interactive Neo4j writes. Phase 6 writes back to the `.excalidraw` file.

---

## Phase 1: Read and Validate Board

### 1.1 Locate the board file

If `board_path` is provided, use it directly. Otherwise, find the latest board:

```bash
ls -t {$boards_dir}/*.excalidraw | head -1
```

If no `.excalidraw` files exist in `{$boards_dir}/`, stop and report:

> No Excalidraw boards found in `{$boards_dir}/`. Create a board first with `/graph_ba_import_doc` or `/graph_ba_from_board`, then run `/graph_ba_sync`.

### 1.2 Read and parse the JSON

Use the Read tool to read the entire `.excalidraw` file. Parse the JSON structure and confirm:

- Top-level field `"type"` equals `"excalidraw"`
- The `"elements"` array exists and is non-empty

If the file is not valid Excalidraw JSON, stop and report:

> File `{path}` is not a valid Excalidraw file. Expected JSON with `"type": "excalidraw"`.

### 1.3 Validate customData

Iterate over all non-deleted shape elements (`type` in `["rectangle", "diamond"]`). For each:

- Verify `customData` exists
- Verify `customData.nodeType` is one of: `WorkflowStep`, `Decision`, `BusinessEntity`, `BusinessRole`, `Annotation`

Collect elements that lack `customData` or `customData.nodeType` into a `warnings` list:

```
Shape element (id: {id}) at ({x}, {y}) has no customData.nodeType --- will be skipped during sync.
```

Skip these elements in all subsequent phases. They remain on the board but are not synchronized.

### 1.4 Classify elements into sync categories

Build three lists from the valid shape elements:

- **`newElements[]`** --- elements where `customData.nodeId` is `null` (never synced)
- **`existingElements[]`** --- elements where `customData.nodeId` is not `null` and `customData.synced` is `true`
- **`dirtySyncedElements[]`** --- elements where `customData.nodeId` is not `null` and `customData.synced` is `false` (previously synced, then modified on the board)

Also build:

- **`arrows[]`** --- all elements where `type == "arrow"`
- **`labelMap{}`** --- map from shape `id` to its text label (resolved via `boundElements` / `containerId` linkage as described in `graph_ba_analyze/SKILL.md` Phase 1.3)

### 1.5 Summary gate

Report to the user before proceeding:

```
Board: {board_path}
Total shape elements: {N}
  - New (nodeId: null): {N} --- will be created in Neo4j
  - Synced (unchanged): {N} --- will be skipped
  - Modified (synced: false): {N} --- will be updated in Neo4j
  - Skipped (no customData): {N}
Arrows: {N}

Proceeding with sync...
```

If there are zero new elements AND zero dirty elements, report:

> Nothing to sync. All board elements are already synchronized with Neo4j. Board is up to date.

Stop execution.

---

## Phase 2: Determine Context

Every WorkflowStep must belong to a BusinessProcess, and every BusinessProcess must belong to a ProcessGroup. This phase establishes these parent containers.

### 2.1 Query existing ProcessGroups

Use `mcp__neo4j__read-cypher`:

```cypher
MATCH (gpr:ProcessGroup)
RETURN gpr.id AS id, gpr.name AS name
ORDER BY gpr.id
```

Present results to the user:

```
Existing ProcessGroups in the graph:
  1. GPR-01: {name}
  2. GPR-02: {name}
  ...
  N. [Create new ProcessGroup]

Which ProcessGroup do the processes on this board belong to?
```

If the user selects an existing group, record its `id` as `targetGprId`.

If the user chooses to create a new one, ask for the name, then generate the ID and create the node:

**Generate next GPR ID:**

```cypher
MATCH (gpr:ProcessGroup)
WITH coalesce(max(toInteger(replace(gpr.id, 'GPR-', ''))), 0) + 1 AS nextNum
RETURN 'GPR-' + right('00' + toString(nextNum), 2) AS nextId
```

If no ProcessGroup nodes exist, the result is `GPR-01`.

**Create the ProcessGroup node** via `mcp__neo4j__write-cypher`:

```cypher
MERGE (gpr:ProcessGroup {id: $gprId})
ON CREATE SET gpr.name = $name,
              gpr.description = '',
              gpr.created = datetime(),
              gpr.updated = datetime()
ON MATCH SET  gpr.updated = datetime()
RETURN gpr.id AS id, gpr.name AS name
```

Record `targetGprId`.

### 2.2 Query existing BusinessProcesses within the selected group

Use `mcp__neo4j__read-cypher`:

```cypher
MATCH (gpr:ProcessGroup {id: $gprId})-[:CONTAINS]->(bp:BusinessProcess)
RETURN bp.id AS id, bp.name AS name
ORDER BY bp.id
```

Present results to the user:

```
Existing BusinessProcesses in {gprName}:
  1. BP-001: {name}
  2. BP-002: {name}
  ...
  N. [Create new BusinessProcess]

Which BusinessProcess does this board represent?
```

If the user selects an existing process, record its `id` as `targetBpId`.

If the user chooses to create a new one, ask for the name, then generate the ID and create:

**Generate next BP ID:**

```cypher
MATCH (bp:BusinessProcess)
WITH coalesce(max(toInteger(replace(bp.id, 'BP-', ''))), 0) + 1 AS nextNum
RETURN 'BP-' + right('000' + toString(nextNum), 3) AS nextId
```

If no BusinessProcess nodes exist, the result is `BP-001`.

**Create the BusinessProcess node and link to ProcessGroup** via `mcp__neo4j__write-cypher`:

```cypher
MATCH (gpr:ProcessGroup {id: $gprId})
MERGE (bp:BusinessProcess {id: $bpId})
ON CREATE SET bp.name = $name,
              bp.description = '',
              bp.status = 'draft',
              bp.created = datetime(),
              bp.updated = datetime()
ON MATCH SET  bp.updated = datetime()
MERGE (gpr)-[:CONTAINS]->(bp)
RETURN bp.id AS id, bp.name AS name
```

Record `targetBpId`.

### 2.3 Context summary

Report back:

```
Sync context established:
  ProcessGroup: {targetGprId} ({gprName})
  BusinessProcess: {targetBpId} ({bpName})
```

---

## Phase 3: Sync New Elements

Process every element in `newElements[]` (those with `customData.nodeId == null`).

For each element, determine the node type from `customData.nodeType` and execute the corresponding creation sequence.

### 3.1 WorkflowStep

**a) Generate step ID:**

```cypher
MATCH (bp:BusinessProcess {id: $bpId})-[:HAS_STEP]->(ws:WorkflowStep)
WITH coalesce(max(toInteger(replace(replace(ws.id, $bpId + '-S', ''), '', ''))), 0) + 1 AS nextNum
RETURN $bpId + '-S' + right('00' + toString(nextNum), 2) AS nextId
```

If no steps exist for this process, the result is `{BP-NNN}-S01`.

**b) Resolve display text:**

Look up `labelMap[element.id]` to get the function name text.

**c) Determine stereotype:**

- If the element's Excalidraw `backgroundColor` is `#e3f2fd` (blue), the stereotype is `"Автоматизируется"`
- If the element's Excalidraw `backgroundColor` is `#e8f5e9` (green), the stereotype is `"Бизнес-функция"`
- Default: `"Бизнес-функция"`

**d) Determine step_number:**

Assign step numbers based on the left-to-right X-coordinate ordering of all WorkflowStep elements on the board. The leftmost step gets `step_number: 1`, the next gets `2`, and so on.

**e) Create the node** via `mcp__neo4j__write-cypher`:

```cypher
MERGE (ws:WorkflowStep {id: $wsId})
ON CREATE SET ws.function_name = $functionName,
              ws.step_number   = $stepNumber,
              ws.stereotype    = $stereotype,
              ws.change_marker = coalesce($changeMarker, '[new]'),
              ws.description   = '',
              ws.created       = datetime(),
              ws.updated       = datetime()
ON MATCH SET  ws.function_name = $functionName,
              ws.step_number   = $stepNumber,
              ws.stereotype    = $stereotype,
              ws.change_marker = coalesce($changeMarker, ws.change_marker),
              ws.updated       = datetime()
RETURN ws.id AS id
```

**f) Link to BusinessProcess** via `mcp__neo4j__write-cypher`:

```cypher
MATCH (bp:BusinessProcess {id: $bpId})
MATCH (ws:WorkflowStep {id: $wsId})
MERGE (bp)-[:HAS_STEP {order: $stepNumber}]->(ws)
RETURN bp.id AS bpId, ws.id AS wsId
```

**g) Record the mapping:** Store `{excalidrawElementId -> wsId}` for later use in Phase 4 and Phase 6.

### 3.2 Decision

Decisions are modeled as `WorkflowStep` nodes with `stereotype: "Решение"`.

**a) Generate step ID:** Same query as 3.1a (they share the step counter within the process).

**b) Resolve display text:** Look up `labelMap[element.id]`.

**c) Create the node** via `mcp__neo4j__write-cypher`:

```cypher
MERGE (ws:WorkflowStep {id: $wsId})
ON CREATE SET ws.function_name = $functionName,
              ws.step_number   = $stepNumber,
              ws.stereotype    = 'Решение',
              ws.description   = '',
              ws.created       = datetime(),
              ws.updated       = datetime()
ON MATCH SET  ws.function_name = $functionName,
              ws.step_number   = $stepNumber,
              ws.stereotype    = 'Решение',
              ws.updated       = datetime()
RETURN ws.id AS id
```

**d) Link to BusinessProcess:** Same as 3.1f.

**e) Record the mapping:** Store `{excalidrawElementId -> wsId}`.

### 3.3 BusinessEntity

**a) Generate entity ID:**

```cypher
MATCH (e:BusinessEntity)
WITH coalesce(max(toInteger(replace(e.id, 'OBJ-', ''))), 0) + 1 AS nextNum
RETURN 'OBJ-' + right('000' + toString(nextNum), 3) AS nextId
```

If no BusinessEntity nodes exist, the result is `OBJ-001`.

**b) Resolve display text:** Look up `labelMap[element.id]` for the entity name.

**c) Determine entity type:**

- If the text contains keywords indicating a document (e.g., "заявка", "акт", "отчёт", "форма", "договор", "счёт", "приказ", "протокол", "application", "report", "form", "contract", "invoice") --- set `type: "Документ"`, `stereotype: "Внешний документ"`
- If the text contains keywords indicating a result (e.g., "результат", "итог", "решение", "result", "output") --- set `type: "Результат"`, `stereotype: "Результат"`
- If the text contains keywords indicating an object (e.g., "клиент", "заказ", "товар", "проект", "client", "order", "product", "project") --- set `type: "Бизнес-объект"`, `stereotype: "Бизнес-объект"`
- Default: `type: "Бизнес-объект"`, `stereotype: "Бизнес-объект"`

**d) Create the node** via `mcp__neo4j__write-cypher`:

```cypher
MERGE (be:BusinessEntity {id: $entityId})
ON CREATE SET be.name        = $name,
              be.type        = $entityType,
              be.stereotype  = $stereotype,
              be.has_states  = false,
              be.description = '',
              be.created     = datetime(),
              be.updated     = datetime()
ON MATCH SET  be.name        = $name,
              be.type        = $entityType,
              be.stereotype  = coalesce($stereotype, be.stereotype),
              be.updated     = datetime()
RETURN be.id AS id
```

**e) Record the mapping:** Store `{excalidrawElementId -> entityId}`.

### 3.4 BusinessRole

**a) Generate role ID:**

```cypher
MATCH (r:BusinessRole)
WITH coalesce(max(toInteger(replace(r.id, 'ROL-', ''))), 0) + 1 AS nextNum
RETURN 'ROL-' + right('00' + toString(nextNum), 2) AS nextId
```

If no BusinessRole nodes exist, the result is `ROL-01`.

**b) Resolve display text:** Look up `labelMap[element.id]` for the role full name.

**c) Check for existing role with the same name** (to prevent duplicates when a role appears on multiple boards):

```cypher
MATCH (r:BusinessRole)
WHERE toLower(r.full_name) = toLower($fullName)
RETURN r.id AS id
```

If a match is found, reuse the existing `id` and skip creation. Record the mapping.

**d) Create the node** (if no match) via `mcp__neo4j__write-cypher`:

```cypher
MERGE (r:BusinessRole {id: $roleId})
ON CREATE SET r.full_name   = $fullName,
              r.description = '',
              r.created     = datetime(),
              r.updated     = datetime()
ON MATCH SET  r.full_name   = $fullName,
              r.updated     = datetime()
RETURN r.id AS id
```

**e) Link role to BusinessProcess** via `mcp__neo4j__write-cypher`:

```cypher
MATCH (r:BusinessRole {id: $roleId})
MATCH (bp:BusinessProcess {id: $bpId})
MERGE (r)-[:PARTICIPATES_IN]->(bp)
RETURN r.id AS roleId, bp.id AS bpId
```

**f) Record the mapping:** Store `{excalidrawElementId -> roleId}`.

### 3.5 Annotation

Annotations (`customData.nodeType == "Annotation"`) are **not synced to Neo4j**. They exist only on the board as visual notes.

For each Annotation element:
- Set `customData.synced = true` (marks it as "processed")
- Set `customData.nodeId = "ANNOTATION"` (sentinel value, not a real graph ID)
- No Neo4j write occurs

### 3.6 Progress tracking

After processing each new element, maintain a running log:

```
[1/{total}] Created WorkflowStep BP-001-S01: "Review application"
[2/{total}] Created WorkflowStep BP-001-S02: "Verify documents"
[3/{total}] Created BusinessEntity OBJ-001: "Application form"
[4/{total}] Reused BusinessRole ROL-01: "Procurement Manager" (already exists)
[5/{total}] Skipped Annotation: "Max processing time: 5 days"
```

---

## Phase 4: Sync Relationships

Process every element in `arrows[]`. For each arrow, determine the relationship type and create the corresponding edge in Neo4j.

### 4.1 Resolve arrow endpoints

For each arrow element:

```
sourceId = arrow.startBinding.elementId  (Excalidraw element ID)
targetId = arrow.endBinding.elementId    (Excalidraw element ID)
```

If `startBinding` or `endBinding` is `null`, the arrow is dangling. Log a warning and skip:

```
Arrow (id: {arrow.id}) is not fully connected --- skipping relationship creation.
```

Look up the Neo4j node IDs using the mapping built in Phase 3 and Phase 1.4:

```
sourceNodeId = mapping[sourceId]   (e.g., "BP-001-S01")
targetNodeId = mapping[targetId]   (e.g., "BP-001-S02")
sourceNodeType = customData.nodeType of the source element
targetNodeType = customData.nodeType of the target element
```

If either endpoint has no mapping (e.g., element was skipped due to missing customData), log a warning and skip.

### 4.2 Determine relationship type

Apply the following rules based on the node types of the source and target:

| Source nodeType | Target nodeType | Relationship | Direction |
|----------------|----------------|--------------|-----------|
| WorkflowStep | WorkflowStep | `NEXT_STEP` | source -> target |
| Decision (diamond) | WorkflowStep | `NEXT_STEP` | source -> target |
| WorkflowStep | Decision (diamond) | `NEXT_STEP` | source -> target |
| Decision (diamond) | Decision (diamond) | `NEXT_STEP` | source -> target |
| WorkflowStep | BusinessEntity | `PRODUCES` | source -> target |
| BusinessEntity | WorkflowStep | `READS` | target -> source (the step reads the entity) |
| BusinessRole | WorkflowStep | `PERFORMED_BY` | target -> source (the step is performed by the role) |
| WorkflowStep | BusinessRole | `PERFORMED_BY` | source -> target (the step is performed by the role) |
| BusinessRole | BusinessProcess | `PARTICIPATES_IN` | source -> target |

> **Decision nodes:** Decision diamonds are stored in Neo4j as `WorkflowStep` with `stereotype: "Решение"` and a `step_number` assigned in sequence alongside regular steps (see Phase 3.2). They have no `PERFORMED_BY` relationship --- decisions are process gates, not role-assigned. In the table above, "Decision (diamond)" refers to Excalidraw diamond elements with `customData.nodeType: "Decision"` which become `WorkflowStep` nodes in Neo4j.

**Special case for BusinessEntity arrows:**

When an arrow goes **from** a WorkflowStep **to** a BusinessEntity, the relationship is `PRODUCES` (the step produces the entity).

When an arrow goes **from** a BusinessEntity **to** a WorkflowStep, the relationship is `READS` (the step reads/consumes the entity). In Neo4j, this is stored as `(step)-[:READS]->(entity)`, so the Cypher direction is reversed from the arrow direction on the board.

**Special case for BusinessRole arrows:**

Regardless of arrow direction on the board, the Neo4j relationship is always `(step)-[:PERFORMED_BY]->(role)`.

### 4.3 Create relationships

For each resolved arrow, use `mcp__neo4j__write-cypher` with the appropriate Cypher.

**NEXT_STEP** (WorkflowStep/Decision to WorkflowStep/Decision):

```cypher
MATCH (source:WorkflowStep {id: $sourceId})
MATCH (target:WorkflowStep {id: $targetId})
MERGE (source)-[:NEXT_STEP]->(target)
RETURN source.id AS from, target.id AS to
```

**PRODUCES** (WorkflowStep to BusinessEntity):

```cypher
MATCH (ws:WorkflowStep {id: $wsId})
MATCH (be:BusinessEntity {id: $entityId})
MERGE (ws)-[:PRODUCES]->(be)
RETURN ws.id AS step, be.id AS entity
```

**READS** (BusinessEntity arrow to WorkflowStep --- stored as step READS entity):

```cypher
MATCH (ws:WorkflowStep {id: $wsId})
MATCH (be:BusinessEntity {id: $entityId})
MERGE (ws)-[:READS]->(be)
RETURN ws.id AS step, be.id AS entity
```

**PERFORMED_BY** (BusinessRole to/from WorkflowStep):

```cypher
MATCH (ws:WorkflowStep {id: $wsId})
MATCH (r:BusinessRole {id: $roleId})
MERGE (ws)-[:PERFORMED_BY]->(r)
RETURN ws.id AS step, r.id AS role
```

### 4.4 Swimlane-based PERFORMED_BY inference

After processing all explicit arrows, check for steps that lack a `PERFORMED_BY` relationship but are visually contained within a BusinessRole swimlane on the board.

For each WorkflowStep that has no `PERFORMED_BY` edge created in 4.3:

```
For each BusinessRole element on the board:
  If step.x >= role.x AND step.y >= role.y
     AND step.x + step.width <= role.x + role.width
     AND step.y + step.height <= role.y + role.height:
    -> The step is inside this role's swimlane
    -> Create PERFORMED_BY relationship (same Cypher as 4.3)
```

### 4.5 Progress tracking

```
[1/{total}] NEXT_STEP: BP-001-S01 -> BP-001-S02
[2/{total}] NEXT_STEP: BP-001-S02 -> BP-001-S03
[3/{total}] PRODUCES: BP-001-S03 -> OBJ-001
[4/{total}] READS: BP-001-S01 <- OBJ-002 (stored as BP-001-S01 -[:READS]-> OBJ-002)
[5/{total}] PERFORMED_BY: BP-001-S01 -> ROL-01
[6/{total}] PERFORMED_BY (swimlane): BP-001-S02 -> ROL-01
[7/{total}] Skipped arrow (id: arrow-015) --- dangling (endBinding: null)
```

---

## Phase 5: Sync Changed Elements

Process every element in `dirtySyncedElements[]` (those with `customData.nodeId != null` AND `customData.synced == false`). These are elements that were previously synced but then modified on the board.

### 5.1 Read current state from Neo4j

For each element, query the current node using `mcp__neo4j__read-cypher`:

```cypher
MATCH (n {id: $nodeId})
RETURN n.id AS id,
       labels(n) AS labels,
       properties(n) AS props
```

If the node is not found in Neo4j, log an error:

```
[ERROR] Element '{label}' has nodeId={nodeId} but node not found in Neo4j. Skipping update.
         Consider removing nodeId from customData and re-syncing as new element.
```

Skip this element.

### 5.2 Compare and update

Resolve the current board text via `labelMap[element.id]` and compare with the Neo4j node's name/function_name.

**For WorkflowStep / Decision nodes** (compare against `function_name`):

```
boardText = labelMap[element.id]
graphText = props.function_name

If boardText != graphText:
  -> Update needed
```

Update via `mcp__neo4j__write-cypher`:

```cypher
MATCH (ws:WorkflowStep {id: $wsId})
SET ws.function_name = $newFunctionName,
    ws.updated       = datetime()
RETURN ws.id AS id, ws.function_name AS function_name
```

**For BusinessEntity nodes** (compare against `name`):

```cypher
MATCH (be:BusinessEntity {id: $entityId})
SET be.name    = $newName,
    be.updated = datetime()
RETURN be.id AS id, be.name AS name
```

**For BusinessRole nodes** (compare against `full_name`):

```cypher
MATCH (r:BusinessRole {id: $roleId})
SET r.full_name = $newFullName,
    r.updated   = datetime()
RETURN r.id AS id, r.full_name AS full_name
```

### 5.3 Mark as synced

After a successful update (or if the text has not changed), mark the element for sync confirmation in Phase 6:

```
element.customData.synced = true
```

### 5.4 Progress tracking

```
[1/{total}] Updated WorkflowStep BP-001-S03: "Verify documents" -> "Verify and validate documents"
[2/{total}] No change for BusinessEntity OBJ-001: "Application form" (text unchanged)
[3/{total}] Updated BusinessRole ROL-02: "Manager" -> "Senior Manager"
[4/{total}] [ERROR] Node BP-001-S99 not found in Neo4j --- skipped
```

---

## Phase 6: Update Board File and Report

### 6.1 Update customData in all processed elements

For each element that was successfully synced or created in Phases 3--5, update its `customData`:

```json
{
  "customData": {
    "nodeId": "{assigned Neo4j ID}",
    "nodeType": "{unchanged}",
    "confidence": "{unchanged}",
    "sourceDoc": "{unchanged}",
    "sourcePage": "{unchanged}",
    "synced": true
  }
}
```

### 6.2 Update strokeColor for synced elements

For every element where `customData.synced` was set to `true` in this run, change the `strokeColor` to green:

```
strokeColor = "#2e7d32"
```

This provides visual feedback that the element is confirmed in the graph.

### 6.3 Write the updated board file

Reconstruct the full `.excalidraw` JSON with the updated elements array and write it back to the same path using the Write tool.

Preserve all other fields (`type`, `version`, `source`, `appState`, `files`) unchanged. Preserve all elements that were not processed (arrows, text elements, skipped elements) exactly as they were.

### 6.4 Generate the sync report

Print the report directly to the user:

```markdown
## Sync Complete: {boardname}

**Board file:** `{board_path}`
**Sync date:** {YYYY-MM-DD HH:MM}
**Target process:** {targetBpId} ({bpName}) in {targetGprId} ({gprName})

---

### Nodes Created

| # | Neo4j ID | Type | Name |
|---|----------|------|------|
| 1 | BP-001-S01 | WorkflowStep | Review application |
| 2 | BP-001-S02 | WorkflowStep | Verify documents |
| 3 | OBJ-001 | BusinessEntity | Application form |
| 4 | ROL-01 | BusinessRole | Procurement Manager |

**Total created:** {N} ({X} WorkflowSteps, {Y} BusinessEntities, {Z} BusinessRoles)

---

### Relationships Created

| # | Type | From | To |
|---|------|------|----|
| 1 | NEXT_STEP | BP-001-S01 | BP-001-S02 |
| 2 | PRODUCES | BP-001-S02 | OBJ-001 |
| 3 | PERFORMED_BY | BP-001-S01 | ROL-01 |

**Total created:** {N} ({A} NEXT_STEP, {B} READS, {C} PRODUCES, {D} PERFORMED_BY)

---

### Nodes Updated

| # | Neo4j ID | Type | Old Value | New Value |
|---|----------|------|-----------|-----------|
| 1 | BP-001-S03 | WorkflowStep | Verify documents | Verify and validate documents |

**Total updated:** {N}

---

### Warnings & Errors

{List of all warnings and errors from all phases, or "None" if clean.}

---

### Board Visual Changes

- Elements with green stroke (#2e7d32): {N} (confirmed synced)
- Elements unchanged: {N}

---

### Next Steps

1. Open the board in Excalidraw (http://localhost:{$excalidraw_port}) to verify visual state.
2. Run `/graph_ba_analyze` to validate board completeness and graph consistency.
3. Elements with non-green stroke still need attention (medium/low confidence).
```

If there were errors, add:

```
4. Fix errors listed above and re-run `/graph_ba_sync` for failed elements.
```

---

## Idempotency Rules

This skill MUST be safe to run multiple times on the same board without creating duplicates.

### Rule 1: MERGE instead of CREATE

All Neo4j node creation uses `MERGE` keyed on `{id}`. If a node with the same ID already exists, its properties are updated (`ON MATCH SET`) instead of creating a duplicate.

### Rule 2: Skip synced-and-unchanged elements

Elements where `customData.synced == true` AND `customData.nodeId != null` are in `existingElements[]`. They are **not processed** in Phase 3 or Phase 5 unless their `synced` flag has been reset to `false` (indicating a board edit after the last sync).

### Rule 3: Relationship MERGE

All relationship creation uses `MERGE`, not `CREATE`. Running the sync twice does not produce duplicate edges:

```cypher
MERGE (source)-[:NEXT_STEP]->(target)      // idempotent
MERGE (ws)-[:PERFORMED_BY]->(r)             // idempotent
MERGE (ws)-[:READS]->(be)                   // idempotent
MERGE (ws)-[:PRODUCES]->(be)                // idempotent
MERGE (gpr)-[:CONTAINS]->(bp)               // idempotent
MERGE (bp)-[:HAS_STEP {order: N}]->(ws)     // idempotent
MERGE (r)-[:PARTICIPATES_IN]->(bp)          // idempotent
```

### Rule 4: ID reuse for existing nodeId

If an element already has `customData.nodeId` set (from a previous sync), that ID is reused. The skill never generates a new ID for an element that already has one.

### Rule 5: Role deduplication by name

Before creating a BusinessRole node, query for an existing role with the same `full_name` (case-insensitive). If found, reuse the existing node and skip creation (see Phase 3.4c).

---

## Error Handling

### Board file not found

> Board file not found: `{path}`. Verify the path or check `{$boards_dir}/` for available boards.

### Invalid JSON

> File `{path}` is not a valid Excalidraw file. Expected JSON with `"type": "excalidraw"`.

### Neo4j unavailable

If any `mcp__neo4j__write-cypher` or `mcp__neo4j__read-cypher` call fails with a connection error:

> Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`. Cannot proceed with sync.

Stop execution. Do NOT write partial results to the board file --- the board must remain in its pre-sync state so that a retry produces correct results.

### Partial failure mid-sync

If a single node creation fails but Neo4j is otherwise reachable:

1. Log the error for that element
2. Do NOT update that element's `customData` (leave `synced: false`, `nodeId: null`)
3. Continue processing remaining elements
4. Include the failure in the final report
5. The user can fix the issue and re-run `/graph_ba_sync` --- idempotency ensures already-synced elements are skipped

---

## Reads / Writes

### Reads

```yaml
# Board file:
- {$boards_dir}/{boardname}.excalidraw          # the board being synced

# Shared references:
- graph_core/SKILL.md                                 # ID formats, Excalidraw format, Neo4j schema

# Neo4j (via MCP):
- mcp__neo4j__read-cypher                             # query existing nodes, generate next IDs
```

### Writes

```yaml
# Board file (updated with nodeId, synced, strokeColor):
- {$boards_dir}/{boardname}.excalidraw

# Neo4j (via MCP):
- mcp__neo4j__write-cypher                            # create/update nodes, create relationships
```

### Creates directories

None. The board file already exists (this skill reads an existing board).

### Calls

| Tool | Purpose |
|------|---------|
| `mcp__neo4j__read-cypher` | Query existing nodes, generate next available IDs, read node state for comparison |
| `mcp__neo4j__write-cypher` | Create/update nodes (MERGE), create relationships (MERGE) |

### Called by

| Caller | Context |
|--------|---------|
| User | Manual invocation: `/graph_ba_sync [board_path]` |
| Recommended after | `/graph_ba_import_doc` or `/graph_ba_from_board` |

---

## Checklist

Before completing the sync, verify:

### Phase 1: Read and Validate Board
- [ ] Board file located and read successfully
- [ ] JSON parsed, `type: "excalidraw"` confirmed
- [ ] All shape elements checked for `customData`
- [ ] Elements classified into new / existing / dirty / skipped
- [ ] Text labels resolved for all shape elements via boundElements/containerId
- [ ] Summary gate shown to user

### Phase 2: Determine Context
- [ ] ProcessGroup selected or created
- [ ] BusinessProcess selected or created
- [ ] CONTAINS relationship ensured between ProcessGroup and BusinessProcess

### Phase 3: Sync New Elements
- [ ] Every new WorkflowStep created with MERGE and linked to BusinessProcess via HAS_STEP
- [ ] Every new Decision created as WorkflowStep with stereotype "Решение"
- [ ] Every new BusinessEntity created with MERGE
- [ ] Every new BusinessRole created with MERGE (or reused if name matches)
- [ ] BusinessRole linked to BusinessProcess via PARTICIPATES_IN
- [ ] Annotations marked as synced with sentinel nodeId "ANNOTATION"
- [ ] All excalidrawElementId -> nodeId mappings recorded

### Phase 4: Sync Relationships
- [ ] All arrows with valid bindings processed
- [ ] NEXT_STEP relationships created for step-to-step arrows
- [ ] PRODUCES relationships created for step-to-entity arrows
- [ ] READS relationships created for entity-to-step arrows
- [ ] PERFORMED_BY relationships created for role-step arrows
- [ ] Swimlane-based PERFORMED_BY inferred for steps without explicit role arrows
- [ ] Dangling arrows logged as warnings

### Phase 5: Sync Changed Elements
- [ ] All dirty elements queried from Neo4j
- [ ] Text changes detected and updated
- [ ] Missing nodes logged as errors
- [ ] Updated elements marked for sync confirmation

### Phase 6: Update Board and Report
- [ ] All processed elements have updated customData (nodeId, synced: true)
- [ ] strokeColor changed to #2e7d32 for all synced elements
- [ ] Board file rewritten with updated elements
- [ ] Sync report displayed with node/relationship counts
- [ ] Warnings and errors listed
- [ ] Next steps provided
