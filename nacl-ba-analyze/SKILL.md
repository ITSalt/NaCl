---
name: nacl-ba-analyze
description: |
  Анализ Excalidraw-доски бизнес-процесса: полнота, diff со snapshot, сравнение с Neo4j-графом.
  Используй когда пользователь просит: проанализировать доску, проверить доску,
  найти проблемы на доске, board analysis, nacl-ba-analyze.
---

# /nacl-ba-analyze --- Анализ Excalidraw-доски

## Роль

You are a Business Analyst agent specialized in visual board analysis. You read Excalidraw `.excalidraw` JSON files representing business process diagrams, analyze them for completeness and consistency, track changes via snapshots, and compare board state with the Neo4j knowledge graph. Your output is a structured report that helps the BA understand what is complete, what is missing, what changed, and what needs attention.

---

## Вызов

```
/nacl-ba-analyze [board_path]
```

- `board_path` --- optional, absolute or relative path to an `.excalidraw` file.
- If omitted --- find the most recently modified `.excalidraw` file in `{$boards_dir}/` (where `$boards_dir` is from config.yaml → graph.boards_dir, default: "graph-infra/boards").

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Excalidraw JSON format and element types
- `customData` structure (`nodeId`, `nodeType`, `confidence`, `synced`)
- Color coding for confidence (green/amber/red stroke)
- Element type mapping (BA concept to Excalidraw type + backgroundColor)
- ID generation rules (BP-NNN, OBJ-NNN, ROL-NN, etc.)
- Neo4j MCP tool names and connection info

---

## Phase 1: Read Board

### 1.1 Locate the board file

If `board_path` is provided, use it directly. Otherwise, find the latest board:

```bash
ls -t {$boards_dir}/*.excalidraw | head -1
```

If no `.excalidraw` files exist in `{$boards_dir}/`, stop and report:

> No Excalidraw boards found in `{$boards_dir}/`. Create a board first with `/nacl-ba-import-doc` or `/nacl-ba-from-board`, then run `/nacl-ba-analyze`.

### 1.2 Read and parse the JSON

Use the Read tool to read the entire `.excalidraw` file. Parse the JSON structure:

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [...],
  "appState": {...}
}
```

### 1.3 Build the element graph

Iterate over `elements` and classify each element. Skip elements where `isDeleted` is `true`.

**Shape elements** (have `customData`):

| customData.nodeType | Excalidraw type | Classification |
|---|---|---|
| `WorkflowStep` | `rectangle` | Step |
| `Decision` | `diamond` | Decision |
| `BusinessEntity` | `rectangle` | Document/Entity |
| `BusinessRole` | `rectangle` | Role |
| `Annotation` | `text` (standalone) | Note |

**Text elements** (bound to shapes):
- Elements with `type: "text"` and a `containerId` pointing to a shape are **labels**. Extract the `text` field as the display name of the parent shape.
- To resolve a shape's label: find the text element whose `containerId` equals the shape's `id`.

**Arrow elements** (connections):
- Elements with `type: "arrow"` represent connections between shapes.
- `startBinding.elementId` --- the source shape id.
- `endBinding.elementId` --- the target shape id.
- If `startBinding` or `endBinding` is `null`, the arrow is **unbound** (dangling).

**Detection logic for resolving labels:**

```
For each shape element (rectangle, diamond):
  1. Look at boundElements array for entries with type: "text"
  2. Find the text element with that id
  3. Use its "text" field as the shape's display name

For each arrow element:
  1. Read startBinding.elementId -> source shape
  2. Read endBinding.elementId -> target shape
  3. If either is null -> mark arrow as dangling
```

### 1.4 Build lookup tables

Construct these in-memory structures (conceptual --- the agent reasons over them):

- `steps[]` --- all elements where `customData.nodeType == "WorkflowStep"`
- `decisions[]` --- all elements where `customData.nodeType == "Decision"`
- `entities[]` --- all elements where `customData.nodeType == "BusinessEntity"`
- `roles[]` --- all elements where `customData.nodeType == "BusinessRole"`
- `annotations[]` --- all elements where `customData.nodeType == "Annotation"`
- `arrows[]` --- all elements where `type == "arrow"`
- `labelMap{}` --- map from shape id to its text label
- `incomingArrows{}` --- map from target element id to list of arrows pointing to it
- `outgoingArrows{}` --- map from source element id to list of arrows originating from it

---

## Phase 2: Completeness Analysis

Run the following checks against the element graph built in Phase 1. For each check, collect a list of findings.

### 2.1 Steps without a performer

A step needs at least one connection to a BusinessRole. Check:

```
For each step in steps[]:
  hasPerformer = false
  For each arrow in arrows[]:
    If arrow connects step <-> any element with nodeType == "BusinessRole":
      hasPerformer = true
  If NOT hasPerformer:
    Add finding: "Step '{label}' (id: {id}) has no performer (no PERFORMED_BY link to a BusinessRole)"
```

Also check if the step is positioned inside a swimlane (visually within the bounding box of a BusinessRole rectangle). This is a spatial check:

```
For each step in steps[]:
  If step has no arrow connection to a role:
    For each role in roles[]:
      If step.x >= role.x AND step.y >= role.y
         AND step.x + step.width <= role.x + role.width
         AND step.y + step.height <= role.y + role.height:
        hasPerformer = true (via swimlane containment)
```

### 2.2 Documents without connections

```
For each entity in entities[]:
  connectedArrows = arrows where startBinding.elementId == entity.id
                    OR endBinding.elementId == entity.id
  If connectedArrows is empty:
    Add finding: "Document '{label}' (id: {id}) is not connected to any step"
```

### 2.3 Decisions with fewer than 2 outgoing arrows

```
For each decision in decisions[]:
  outgoing = arrows where startBinding.elementId == decision.id
  If len(outgoing) < 2:
    Add finding: "Decision '{label}' (id: {id}) has {len(outgoing)} outgoing arrows (expected >= 2)"
```

### 2.4 Steps with broken flow (no incoming or no outgoing arrow)

```
For each step in steps[]:
  incoming = arrows where endBinding.elementId == step.id
  outgoing = arrows where startBinding.elementId == step.id

  If len(incoming) == 0 AND len(outgoing) == 0:
    Add finding (critical): "Step '{label}' (id: {id}) is completely isolated (no arrows)"
  Else if len(incoming) == 0:
    Add finding (info): "Step '{label}' (id: {id}) has no incoming arrows (possible start step)"
  Else if len(outgoing) == 0:
    Add finding (info): "Step '{label}' (id: {id}) has no outgoing arrows (possible end step)"
```

Note: A single start step with no incoming arrows and a single end step with no outgoing arrows is normal. Flag only when multiple steps lack incoming or outgoing arrows, or when a step in the middle of the flow is disconnected.

### 2.5 Duplicate names

```
Collect all labels for steps, entities, decisions.
Group by normalized label (lowercase, trimmed).
For each group with count > 1:
  Add finding: "Duplicate name '{label}' found on {count} elements: {list of ids}"
```

### 2.6 Low-confidence elements

```
For each shape element with customData.confidence == "low":
  Add finding: "Element '{label}' (id: {id}, type: {nodeType}) has confidence: low --- needs information from stakeholder"
```

Also flag `confidence: "medium"` as informational:

```
For each shape element with customData.confidence == "medium":
  Add finding (info): "Element '{label}' (id: {id}, type: {nodeType}) has confidence: medium --- inferred by AI, may need confirmation"
```

### 2.7 Dangling arrows

```
For each arrow in arrows[]:
  If startBinding is null OR endBinding is null:
    Add finding: "Arrow (id: {id}) is not fully connected (startBinding: {present/null}, endBinding: {present/null})"
```

### 2.8 Elements without customData

```
For each element with type in ["rectangle", "diamond"]:
  If customData is missing or customData.nodeType is missing:
    Add finding: "Shape element (id: {id}) at ({x}, {y}) has no customData.nodeType --- cannot classify"
```

---

## Phase 3: Diff with Previous Snapshot

### 3.1 Snapshot storage

Snapshots are stored in: `{$boards_dir}/.snapshots/`

Naming convention: `{boardname}-{ISO-timestamp}.json`

Example: `test-board-2026-03-19T14-30-00.json`

Where `{boardname}` is the `.excalidraw` filename without extension, and `{ISO-timestamp}` uses dashes instead of colons for filesystem compatibility.

### 3.2 Find the latest snapshot

```bash
ls -t {$boards_dir}/.snapshots/{boardname}-*.json | head -1
```

If no previous snapshot exists, skip the diff phase and note in the report:

> First analysis --- no previous snapshot found. Current state saved as baseline.

### 3.3 Snapshot format

A snapshot is a simplified JSON array of elements:

```json
[
  {
    "id": "rect-001",
    "type": "rectangle",
    "nodeType": "WorkflowStep",
    "text": "Process application",
    "x": 100,
    "y": 200,
    "width": 200,
    "height": 60,
    "customData": {
      "nodeId": "BP-001-S03",
      "nodeType": "WorkflowStep",
      "confidence": "high",
      "synced": false
    }
  },
  {
    "id": "arrow-001",
    "type": "arrow",
    "startElementId": "rect-001",
    "endElementId": "diamond-001"
  }
]
```

**For shape elements**, store: `id`, `type`, `nodeType` (from customData), `text` (resolved label), `x`, `y`, `width`, `height`, `customData` (full object).

**For arrow elements**, store: `id`, `type`, `startElementId` (from startBinding.elementId), `endElementId` (from endBinding.elementId).

### 3.4 Diff algorithm

Compare current board state with the latest snapshot by element `id`:

```
currentMap = map of id -> element from current board
snapshotMap = map of id -> element from latest snapshot

added = []      // elements in currentMap but NOT in snapshotMap
removed = []    // elements in snapshotMap but NOT in currentMap
textChanged = [] // elements in both maps where text differs
moved = []      // elements in both maps where (x,y) differs by > 10px

For each id in currentMap:
  If id NOT in snapshotMap:
    added.append(currentMap[id])
  Else:
    snap = snapshotMap[id]
    curr = currentMap[id]
    If curr.text != snap.text:
      textChanged.append({id, oldText: snap.text, newText: curr.text})
    If abs(curr.x - snap.x) > 10 OR abs(curr.y - snap.y) > 10:
      moved.append({id, oldPos: (snap.x, snap.y), newPos: (curr.x, curr.y)})

For each id in snapshotMap:
  If id NOT in currentMap:
    removed.append(snapshotMap[id])
```

### 3.5 Save current state as new snapshot

After comparison, save the current board state as a new snapshot:

1. Create directory if it does not exist: `{$boards_dir}/.snapshots/`
2. Generate filename: `{boardname}-{current ISO timestamp}.json`
3. Write the simplified JSON array (format from 3.3)

---

## Phase 4: Graph Comparison

This phase runs ONLY for elements that have `customData.synced == true` AND `customData.nodeId != null`.

If no synced elements exist, skip this phase and note:

> No synced elements found on the board. Run `/nacl-ba-sync` to synchronize board elements with the Neo4j graph.

### 4.1 Collect synced elements

```
syncedElements = []
For each shape element:
  If customData.synced == true AND customData.nodeId is not null:
    syncedElements.append(element)
```

### 4.2 Query Neo4j for each synced element

For each synced element, query Neo4j using the MCP tool `mcp__neo4j__read-cypher`:

```cypher
MATCH (n {id: $nodeId})
RETURN n.id AS id, n.name AS name, labels(n) AS labels, properties(n) AS props
```

Where `$nodeId` is `customData.nodeId` (e.g., `"BP-001-S03"`).

### 4.3 Compare board vs graph

For each synced element:

```
boardLabel = resolved text label from the board
graphName = n.name from Neo4j query

If Neo4j returns no node:
  Add finding (critical): "Element '{boardLabel}' (nodeId: {nodeId}) is marked as synced, but node not found in Neo4j"

Else if boardLabel != graphName:
  Add finding (warning): "Name mismatch for nodeId {nodeId}: board says '{boardLabel}', graph says '{graphName}'"

Else:
  // Names match, element is consistent
```

Also compare `customData.nodeType` with the Neo4j node labels:

```
boardType = customData.nodeType
graphLabels = labels(n) from Neo4j

If boardType NOT in graphLabels:
  Add finding (warning): "Type mismatch for nodeId {nodeId}: board type '{boardType}', graph labels {graphLabels}"
```

### 4.4 Check for graph nodes not on the board

Optionally, query Neo4j for all nodes that belong to the same process and check if any are missing from the board. This requires knowing the process ID. If the board filename contains a BP-ID (e.g., `BP-001-workflow.excalidraw`), run:

```cypher
MATCH (bp:BusinessProcess {id: $bpId})-[:HAS_STEP]->(s:WorkflowStep)
RETURN s.id AS id, s.name AS name
```

Compare the result set with synced steps on the board. Any graph node not present on the board is a finding:

```
Add finding (info): "Graph node '{name}' (id: {id}) exists in Neo4j but is not on the board"
```

---

## Phase 5: Report

Generate a structured markdown report and output it directly to the user. Do NOT write the report to a file unless the user explicitly asks.

### 5.1 Report template

```markdown
## Board Analysis: {boardname}

**Board file:** `{board_path}`
**Analysis date:** {YYYY-MM-DD HH:MM}
**Previous snapshot:** {snapshot_path or "none (first analysis)"}

---

### Statistics

| Category | Count | Details |
|---|---|---|
| Workflow Steps | {N} | automatable: {M} (backgroundColor == #e3f2fd) |
| Decisions | {N} | |
| Documents / Entities | {N} | |
| Roles | {N} | |
| Annotations | {N} | |
| Arrows (connections) | {N} | dangling: {D} |
| **Total elements** | **{T}** | |

**Confidence breakdown:**
- High: {N} elements
- Medium: {N} elements
- Low: {N} elements

**Sync status:**
- Synced with graph: {N} elements
- Not synced: {N} elements

---

### Problems (require attention)

List all findings from Phase 2 and Phase 4, ordered by severity.

Use these severity markers:
- `[CRITICAL]` --- broken structure, missing data, sync inconsistency
- `[WARNING]` --- incomplete but not broken (missing performer, low confidence)
- `[INFO]` --- informational (possible start/end step, medium confidence, moved elements)

Format each finding as a numbered list:

1. **[CRITICAL]** Step "Process application" (id: rect-005) --- completely isolated, no arrows connected
2. **[WARNING]** Step "Verify documents" (id: rect-003) --- no performer (no link to BusinessRole)
3. **[WARNING]** Document "Application form" (id: rect-010) --- not connected to any step
4. **[WARNING]** Decision "Approved?" (id: diamond-002) --- only 1 outgoing arrow (expected >= 2)
5. **[WARNING]** Element "Review" (id: rect-007) --- confidence: low, needs information
6. **[INFO]** Element "Notify client" (id: rect-008) --- confidence: medium, AI-inferred
7. **[INFO]** Arrow (id: arrow-015) --- not fully connected (endBinding: null)

If no problems found:

> No problems detected. The board is complete and consistent.

---

### Changes since last analysis

If a previous snapshot exists, report the diff from Phase 3.

**Added ({N} elements):**
- {nodeType}: "{label}" (id: {id})

**Removed ({N} elements):**
- {nodeType}: "{label}" (id: {id})

**Text changed ({N} elements):**
- "{old_text}" -> "{new_text}" (id: {id})

**Moved ({N} elements):**
- "{label}": ({old_x}, {old_y}) -> ({new_x}, {new_y})

If no previous snapshot:

> First analysis --- no previous snapshot to compare. Current state saved as baseline snapshot.

---

### Graph comparison

If Phase 4 was executed, report results.

**Synced elements checked:** {N}

| nodeId | Board name | Graph name | Status |
|---|---|---|---|
| BP-001-S03 | Process application | Process application | Consistent |
| BP-001-S05 | Verify docs | Verify documents | NAME MISMATCH |
| BP-001-S07 | New step | (not found) | MISSING IN GRAPH |

If no synced elements:

> No synced elements on the board. Run `/nacl-ba-sync` to synchronize.

---

### Recommendations

Based on all findings, provide actionable recommendations:

1. **Assign performers** --- {N} steps lack a performer. Draw arrows to BusinessRole elements or place steps inside role swimlanes.
2. **Connect documents** --- {N} documents are orphaned. Connect them to the steps that produce or consume them.
3. **Complete decisions** --- {N} decisions need additional outgoing arrows for alternative paths.
4. **Resolve low-confidence elements** --- {N} elements need stakeholder input. Review elements marked in red.
5. **Synchronize with graph** --- {N} elements are ready for sync. Run `/nacl-ba-sync` to push to Neo4j.
6. **Fix graph mismatches** --- {N} elements have name mismatches between board and graph. Update the board or run `/nacl-ba-sync --force` to overwrite.

Only include recommendations that apply (skip categories with 0 findings).
```

### 5.2 Report output

Print the report directly as your response. The user reads it in the terminal.

If the user requests saving to a file, write to: `{$boards_dir}/.reports/{boardname}-analysis-{YYYY-MM-DD}.md`

---

## Error Handling

### Board file not found

If the specified path does not exist or no `.excalidraw` files are found:

> Board file not found: `{path}`. Verify the path or check `{$boards_dir}/` for available boards.

### Invalid JSON

If the file is not valid JSON or lacks the `"type": "excalidraw"` field:

> File `{path}` is not a valid Excalidraw file. Expected JSON with `"type": "excalidraw"`.

### Neo4j unavailable

If `mcp__neo4j__read-cypher` returns an error during Phase 4:

> Neo4j is not reachable. Skipping graph comparison (Phase 4). Board analysis (Phases 1-3) completed normally.

Continue with Phases 1-3 results and note the skip in the report.

---

## Reads / Writes

### Reads

```yaml
# Board file:
- {$boards_dir}/{boardname}.excalidraw          # the board being analyzed

# Previous snapshot (if exists):
- {$boards_dir}/.snapshots/{boardname}-*.json    # latest snapshot for diff

# Shared references:
- nacl-core/SKILL.md                                 # Excalidraw format, customData structure

# Neo4j (via MCP, Phase 4 only):
- mcp__neo4j__read-cypher                             # query graph nodes for comparison
```

### Writes

```yaml
# New snapshot (always):
- {$boards_dir}/.snapshots/{boardname}-{ISO-timestamp}.json

# Report (only if user requests file output):
- {$boards_dir}/.reports/{boardname}-analysis-{YYYY-MM-DD}.md
```

---

## Checklist

Before completing the analysis, verify:

### Phase 1: Read Board
- [ ] Board file located and read successfully
- [ ] JSON parsed, `type: "excalidraw"` confirmed
- [ ] All non-deleted elements classified by nodeType
- [ ] Text labels resolved for all shape elements via boundElements/containerId
- [ ] Arrow connections mapped via startBinding/endBinding

### Phase 2: Completeness Analysis
- [ ] Steps without performer identified
- [ ] Documents without connections identified
- [ ] Decisions with < 2 outgoing arrows identified
- [ ] Broken flow (isolated steps) identified
- [ ] Duplicate names detected
- [ ] Low-confidence elements flagged
- [ ] Dangling arrows detected
- [ ] Elements without customData flagged

### Phase 3: Diff with Snapshot
- [ ] Previous snapshot located (or noted as first analysis)
- [ ] Added/removed/changed/moved elements computed
- [ ] Current state saved as new snapshot

### Phase 4: Graph Comparison
- [ ] Synced elements collected (or noted as none)
- [ ] Neo4j queried for each synced element (or noted as unavailable)
- [ ] Name and type mismatches flagged
- [ ] Missing graph nodes flagged

### Phase 5: Report
- [ ] Statistics section complete
- [ ] Problems listed with severity markers
- [ ] Changes section complete (or noted as first analysis)
- [ ] Graph comparison section complete (or noted as skipped)
- [ ] Recommendations provided for all applicable categories
