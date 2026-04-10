---
name: nacl-core
description: |
  Shared references, templates, and utilities for all nacl-* skills.
  Not directly invocable — provides Neo4j connection conventions,
  schema references, ID format rules, and Excalidraw standards.
---

# Graph Core — Shared References

This skill is NOT invocable by users. It provides shared references, templates, and utilities for all `nacl-*` skills.

## Neo4j Connection

All graph skills use Neo4j MCP tools:
- `mcp__neo4j__read-cypher` — read-only queries
- `mcp__neo4j__write-cypher` — create/update/delete
- `mcp__neo4j__get-schema` — introspect schema

**Connection is managed by the MCP server** (configured in `.mcp.json` at project root).
Skills do NOT pass connection strings — they just call MCP tools.

## Graph Config Resolution (execute at skill start)

Every graph skill MUST read `config.yaml` at the start to resolve graph settings.

### Steps:

1. Read `config.yaml` from the project root (current working directory)
2. Extract the `graph` section
3. If `graph` section missing or `config.yaml` absent → use all defaults
4. Store resolved values for use in error messages and board paths:
   - `$neo4j_bolt_port` = graph.neo4j_bolt_port || 3587
   - `$neo4j_http_port` = graph.neo4j_http_port || 3574
   - `$neo4j_password` = graph.neo4j_password || "neo4j_graph_dev"
   - `$excalidraw_port` = graph.excalidraw_port || 3580
   - `$boards_dir` = graph.boards_dir || "graph-infra/boards"
   - `$container_prefix` = graph.container_prefix || project.name || "graph"

### Configuration Resolution Table

| Data | Source priority |
|------|---------------|
| Neo4j Bolt port | `graph.neo4j_bolt_port` > fallback `3587` |
| Neo4j HTTP port | `graph.neo4j_http_port` > fallback `3574` |
| Neo4j password | `graph.neo4j_password` > fallback `"neo4j_graph_dev"` |
| Excalidraw port | `graph.excalidraw_port` > fallback `3580` |
| Boards directory | `graph.boards_dir` > fallback `"graph-infra/boards"` |
| Container prefix | `graph.container_prefix` > `project.name` > fallback `"graph"` |

### Important:
- Do NOT pass connection strings to MCP tools — the MCP server handles this
- These values are ONLY for: error messages, Docker commands, board file paths, Excalidraw URLs
- When showing error messages, always use resolved values: `bolt://localhost:{$neo4j_bolt_port}`

## Schema Reference

Schema files: `graph-infra/schema/`
- `ba-schema.cypher` — BA layer (13 node types: ProcessGroup, BusinessProcess, WorkflowStep, BusinessEntity, EntityAttribute, EntityState, BusinessRole, BusinessRule, GlossaryTerm, SystemContext, Stakeholder, ExternalEntity, DataFlow)
- `sa-schema.cypher` — SA layer (12 node types)
- `tl-schema.cypher` — TL layer (3 node types)

## Graph Skills Registry

### BA Layer (14 skills)
| Skill | Purpose |
|-------|---------|
| nacl-ba-context | System boundaries → Neo4j |
| nacl-ba-process | Business process map → Neo4j |
| nacl-ba-workflow | Activity diagrams → Neo4j |
| nacl-ba-entities | Entity catalog → Neo4j |
| nacl-ba-roles | Business roles → Neo4j |
| nacl-ba-glossary | Glossary → Neo4j |
| nacl-ba-rules | Business rules → Neo4j |
| nacl-ba-validate | L1-L8 + XL1-XL5 validation |
| nacl-ba-handoff | BA→SA traceability |
| nacl-ba-full | Full BA orchestrator (10 phases) |
| nacl-ba-from-board | Board orchestrator (import/sync/enrich/validate/handoff) |
| nacl-ba-import-doc | Document → Excalidraw |
| nacl-ba-analyze | Board completeness analysis |
| nacl-ba-sync | Board → Neo4j sync |

### SA Layer (9 skills)
| Skill | Purpose |
|-------|---------|
| nacl-sa-architect | Module decomposition |
| nacl-sa-domain | Domain model |
| nacl-sa-roles | Role model + permissions |
| nacl-sa-uc | UC registry + detailing |
| nacl-sa-ui | UI architecture |
| nacl-sa-validate | L1-L6 + XL6-XL9 validation |
| nacl-sa-feature | Incremental feature specification |
| nacl-sa-finalize | Statistics, ADR, readiness |
| nacl-sa-full | Full SA orchestrator (10 phases) |

### TL Layer (7 skills)
| Skill | Purpose |
|-------|---------|
| nacl-tl-plan | Task planning from graph |
| nacl-tl-intake | Graph-aware triage |
| nacl-tl-status | Status + SA coverage |
| nacl-tl-next | Next task + SA context |
| nacl-tl-full | Full lifecycle orchestrator |
| nacl-tl-conductor | Batch process manager |
| nacl-tl-hotfix | Emergency hotfix to main |

### Output (2 skills)
| Skill | Purpose |
|-------|---------|
| nacl-render | Graph → Markdown + Excalidraw |
| nacl-publish | Graph → Docmost |

Query library: `graph-infra/queries/`
- `ba-queries.cypher`, `sa-queries.cypher`, `handoff-queries.cypher`, `validation-queries.cypher`, `tl-queries.cypher`

## Excalidraw File-Based Workflow

Board files stored in: `{$boards_dir}/*.excalidraw`
(where `$boards_dir` is resolved from `config.yaml → graph.boards_dir`, default: `graph-infra/boards`)

AI reads/writes .excalidraw JSON directly (no MCP server needed).

### Excalidraw JSON Format

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [...],
  "appState": {"viewBackgroundColor": "#ffffff"}
}
```

### Element Types Used

| BA Concept | Excalidraw Type | backgroundColor | customData.nodeType |
|---|---|---|---|
| WorkflowStep (бизнес-функция) | rectangle | #e8f5e9 (green) | WorkflowStep |
| WorkflowStep (автоматизируется) | rectangle | #e3f2fd (blue) | WorkflowStep |
| Decision | diamond | #fff3e0 (orange) | Decision |
| BusinessEntity / Document | rectangle | #f3e5f5 (purple) | BusinessEntity |
| BusinessRole (swimlane label) | rectangle | #fafafa (grey) | BusinessRole |
| Annotation / Note | text | — | Annotation |
| Connection | arrow | — | — |

### Color Coding for Confidence

| Confidence | strokeColor | Meaning |
|---|---|---|
| High (confirmed) | #2e7d32 (green) | Clearly identified in source |
| Medium (assumption) | #f57f17 (amber) | AI inferred from context |
| Low (needs info) | #c62828 (red) | Missing information |

### customData Structure

Every shape element MUST have customData:
```json
{
  "customData": {
    "nodeId": "BP-001-S03",       // Neo4j node id (null if not synced)
    "nodeType": "WorkflowStep",   // Graph node label
    "confidence": "high",         // high | medium | low
    "sourceDoc": "process.docx",  // source document (if from import)
    "sourcePage": 3,              // page number in source
    "synced": false               // true after /nacl-ba-sync
  }
}
```

### Excalidraw Element Template (rectangle with text)

To create a labeled rectangle, you need TWO elements:
1. The shape (rectangle/diamond) with `boundElements` pointing to text
2. The text element with `containerId` pointing back to shape

```json
{
  "id": "rect-001",
  "type": "rectangle",
  "x": 100, "y": 200,
  "width": 200, "height": 60,
  "strokeColor": "#2e7d32",
  "backgroundColor": "#e3f2fd",
  "fillStyle": "solid",
  "strokeWidth": 2,
  "strokeStyle": "solid",
  "roughness": 1,
  "opacity": 100,
  "angle": 0,
  "seed": 12345,
  "version": 1,
  "versionNonce": 1,
  "isDeleted": false,
  "groupIds": [],
  "frameId": null,
  "boundElements": [{"id": "text-001", "type": "text"}],
  "updated": 1,
  "link": null,
  "locked": false,
  "customData": {
    "nodeId": "BP-001-S03",
    "nodeType": "WorkflowStep",
    "confidence": "high",
    "synced": false
  }
}
```

### Layout Guidelines

- Swimlanes: horizontal bands, 200px height each
- Steps: left-to-right flow, 220px spacing
- Documents: right column, 50px margin from steps
- Decisions: centered between alternative paths
- Arrows: use startBinding/endBinding for connected arrows

## ID Generation Rules

| Layer | Format | Example | Counter |
|---|---|---|---|
| BA Process Group | GPR-NN | GPR-01 | Global sequential |
| BA Process | BP-NNN | BP-001 | Global sequential |
| BA Workflow Step | {BP}-S{NN} | BP-001-S03 | Per-process |
| BA Entity | OBJ-NNN | OBJ-001 | Global sequential |
| BA Entity Attribute | {OBJ}-A{NN} | OBJ-001-A01 | Per-entity |
| BA Entity State | {OBJ}-ST{NN} | OBJ-001-ST01 | Per-entity |
| BA Role | ROL-NN | ROL-01 | Global sequential |
| BA Rule | BRQ-NNN | BRQ-001 | Global sequential |
| BA Glossary | GLO-NNN | GLO-001 | Global sequential |
| System Context | SYS-NNN | SYS-001 | Global sequential |
| Stakeholder | STK-NN | STK-01 | Global sequential |
| External Entity | EXT-NN | EXT-01 | Global sequential |
| Data Flow | DFL-NNN | DFL-001 | Global sequential |

To get next available ID:
```cypher
// Example: next BusinessProcess ID
MATCH (bp:BusinessProcess)
WITH max(toInteger(replace(bp.id, 'BP-', ''))) AS maxNum
RETURN 'BP-' + apoc.text.lpad(toString(coalesce(maxNum, 0) + 1), 3, '0') AS nextId
```
