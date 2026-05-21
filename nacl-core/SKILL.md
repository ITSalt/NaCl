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

## Task.verification_evidence — Taxonomy

`Task.verification_evidence` is a string property on TL `Task` nodes that records *how* a task was verified. It is **read** by `nacl-tl-release` (Step 2 pre-merge gate and the final report Evidence-level column) and **must be written** by every skill that advances a Task to a terminal status. Leaving it `NULL` on a `done` task causes the release skill to surface a "Verification gap" — that is a data-integrity failure, not normal output.

### Values

| Value | When to write | Written by |
|---|---|---|
| `test-GREEN:<artifact_path>` | PASS + regression test ran RED→GREEN. `<artifact_path>` is a repo-relative path to the test file (e.g. `apps/web/src/__tests__/funnel.spec.ts`) or to the task's regression-test record (`.tl/tasks/<TASK_ID>/regression-test.md`). | conductor Phase 3, tl-full Phase 7, tl-fix terminal step, tl-deliver, tl-hotfix |
| `test-UNVERIFIED` | Code applied but RED→GREEN not confirmed (no regression test, or sub-skill returned `UNVERIFIED`). Paired with `t.status = 'verified-pending'`. | Same writers as above |
| `no-test` | PASS under explicit user `--no-test` (or equivalent) override. Paired with `t.status = 'done'`. | Same writers as above |
| `null` (unset) | Reserved for `t.status ∈ {'failed', 'blocked'}` — those tasks are excluded from release scope, so an evidence string would be misleading. | n/a |

### Format rules

- Single string, no JSON.
- `test-GREEN` payload after `:` is a forward-slash repo-relative path; no quoting, no scheme.
- Use the test file path when one exists, otherwise the `.tl/tasks/<TASK_ID>/regression-test.md` artifact path.
- `test-UNVERIFIED` and `no-test` carry no payload — exactly those literal strings.

### Reader contract

`nacl-tl-release` parses `verification_evidence` like this:
- Prefix `test-GREEN:` → `Evidence level = test-GREEN`, path extracted for the report column.
- Literal `test-UNVERIFIED` → `Evidence level = test-UNVERIFIED`.
- Literal `no-test` → `Evidence level = no-test`.
- `NULL` / empty / unrecognised → `Evidence level = unknown` → "Verification gap" footer.

Sources: `nacl-tl-release/SKILL.md:183`, `:615-622`.

### Writer obligation

Every skill in this list MUST set `verification_evidence` in the same Cypher statement that sets `t.status` to a terminal value:

- `nacl-tl-conductor` — Phase 3 graph-write block (PASS / UNVERIFIED writes).
- `nacl-tl-full` — Phase 7 final aggregation graph-write.
- `nacl-tl-fix` — terminal graph-write after fix verified.
- `nacl-tl-deliver` — stamping after delivery validation.
- `nacl-tl-hotfix` — hotfix Task node graph-write.

Skills that only *read* terminal status (`nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-reconcile`) do NOT write this field. They may, however, gate on it: if a writer leaves it NULL, an orchestrator gate (e.g. conductor Phase 4) MUST HALT and surface the contract violation.

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

## Board Meta Sidecar (`<board>.meta.json`)

Every `.excalidraw` board file may have a companion sidecar file at `{$boards_dir}/<board>.meta.json`. This file is the source of truth for "when was this board last generated from the graph" and "when was it last synced back". The **NaCl Analyst Tool** (`analyst-tool/`) reads the sidecar to display sync status in its sidebar tree — without the sidecar the tool cannot determine freshness. Skills are the **canonical writers** of this file; the tool only reads it (and may write optimistically as a fallback when a skill run fails partway through).

### Schema

```json
{
  "lastGeneratedAt":        "2026-05-03T18:42:00.000Z",
  "lastGeneratedBy":        "nacl-render",
  "lastSyncedAt":           "2026-05-03T19:00:00.000Z",
  "lastSyncStatus":         "ok",
  "lastSyncRunId":          "r-95f71b58",
  "contentHashAtLastSync":  "sha256:<64-hex-chars>"
}
```

All six fields are **nullable** (`null` when not yet set). Dates are ISO-8601 UTC strings.

### Field Semantics

| Field | Type | Writer | Null means |
|---|---|---|---|
| `lastGeneratedAt` | ISO-8601 string \| null | `nacl-render` | board was never generated from graph |
| `lastGeneratedBy` | string \| null | `nacl-render` | board was never generated from graph |
| `lastSyncedAt` | ISO-8601 string \| null | `nacl-ba-sync` (success only) | board was never synced to graph |
| `lastSyncStatus` | `"ok"` \| `"failed"` \| null | `nacl-ba-sync` | no sync has been attempted |
| `lastSyncRunId` | string \| null | `nacl-ba-sync` | invoked directly (not via analyst-tool), or no run ID available |
| `contentHashAtLastSync` | `"sha256:<hex>"` \| null | `nacl-render` and `nacl-ba-sync` (success only) | no render or sync has completed |

### Who Writes What

| Action | Fields written |
|---|---|
| Render from graph (success) | `lastGeneratedAt`, `lastGeneratedBy`, `contentHashAtLastSync` |
| Sync to graph (success) | `lastSyncedAt`, `lastSyncStatus = "ok"`, `lastSyncRunId`, `contentHashAtLastSync` |
| Sync to graph (failure) | `lastSyncStatus = "failed"`, `lastSyncRunId` |
| Analyst-tool save | nothing — the tool does not write meta; `hasUnsyncedEdits` is derived at read time from `mtime` + recomputed hash |

### Content Hash Algorithm

`contentHashAtLastSync` is a SHA-256 hash of a **normalized** representation of the board scene. The algorithm (canonical TypeScript implementation: `analyst-tool/server/src/services/meta.ts`, function `computeBoardHash`):

1. **Extract** three top-level fields from the `.excalidraw` JSON: `elements` (array), `appState` (object), `files` (object).
2. **Normalize `appState`**: keep only `viewBackgroundColor` and `gridSize`; all other keys are dropped. Missing keys default to `null`.
3. **Normalize each element** in `elements`:
   - Strip the following volatile per-element keys: `version`, `versionNonce`, `seed`, `updated`.
   - Sort the remaining keys alphabetically (ascending).
   - Produce a new object with only the sorted, non-volatile keys.
4. **Assemble** the normalized scene object:
   ```json
   {
     "elements": [ ...normalized elements... ],
     "appState": { "viewBackgroundColor": <value or null>, "gridSize": <value or null> },
     "files": <files object or {}>
   }
   ```
5. **Serialize** with `JSON.stringify` (no extra whitespace, no key sorting at the top level — the top-level key order is `elements`, `appState`, `files` as shown above).
6. **Hash** the UTF-8 bytes of the JSON string with SHA-256.
7. **Prefix** the lowercase hex digest with `sha256:`.

Result format: `"sha256:<64 lowercase hex characters>"`.

Any re-implementation (Python, shell, etc.) **must** produce the same byte sequence as the TypeScript reference for identical input. The key sort in step 3 is per-element, not recursive — nested objects inside element properties are not sorted.

### Atomic Write Requirement

To prevent the `analyst-tool` fs-watcher from reading a half-written file, the sidecar **must** be written atomically:

1. Write the new JSON content to `<board>.meta.json.tmp` (same directory as the board).
2. Rename `<board>.meta.json.tmp` → `<board>.meta.json`.

On POSIX filesystems `rename(2)` is atomic. On Windows the tool is expected to run on macOS/Linux so this guarantee holds.

### Merge Rule

A skill never blindly overwrites the entire sidecar. Before writing, it reads the existing sidecar (or uses all-null defaults if missing), merges only the fields it owns (per the "Who Writes What" table above), and writes the merged result. This ensures `nacl-render` does not destroy `lastSyncedAt` set by a previous `nacl-ba-sync` run, and vice versa.

### Analyst Tool Integration

The meta sidecar is also read by the local **NaCl Analyst Tool** (`analyst-tool/`), which uses it to display sync status in the sidebar tree. The tool writes meta optimistically as a fallback in case a skill run fails partway, but the skills themselves are the canonical writers per the table above.

---

## Project Initialization

The `/nacl-init` skill creates or updates `CLAUDE.md`, `config.yaml`, and graph infrastructure for a project. Re-running `/nacl-init` on an existing project is idempotent and triggers automatic migration of legacy infrastructure (removing stale excalidraw containers, creating missing `graph-infra/boards/`, injecting missing `project.id` / `project.name` fields) — see `nacl-init/SKILL.md` § Auto-migrate Legacy Artefacts for details.

---

## Project Registry (`~/.nacl/projects.json`)

The NaCl Analyst Tool discovers projects through a per-user registry at `~/.nacl/projects.json` (override via `NACL_HOME` env var — see `docs/configuration.md`). **The registry is written only by `nacl-init`** (Step 2d); the analyst-tool and all other skills only read it. The canonical TypeScript types (`ProjectRecord`, `ProjectRegistry`) and the atomic-write implementation live in `analyst-tool/server/src/services/project-registry.ts`. Every entry has the fields `id`, `name`, `root`, `createdAt`, and `lastUsed`; the top-level object carries `version: 1` and `activeProjectId`. Skills must never write to this file directly — invoke `/nacl-init` to register or refresh a project.

---

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

## Skill Modifier Conventions

Skills accept **modifiers** — arguments that change behavior. See [Skill Modifiers Reference](docs/skill-modifiers.md) for the full catalog.

### Three Paradigms

| Paradigm | When to Use | Syntax | Example |
|----------|------------|--------|---------|
| **Mode** (positional) | 2-5 mutually exclusive workflow branches | `/skill MODE` | `/nacl-sa-domain IMPORT_BA` |
| **Subcommand** | 3+ distinct operations under one namespace | `/skill command [args]` | `/nacl-ba-from-board sync` |
| **Flag** | Optional behavioral modifiers | `/skill [target] --flag` | `/nacl-tl-ship --deploy` |

### Standard Flag Families

Reuse these before inventing new flags:

| Family | Flags | Purpose |
|--------|-------|---------|
| Task type filter | `--be`, `--fe`, `--tech` | Filter by development type |
| Workflow filter | `--review`, `--sync`, `--qa` | Filter by workflow phase |
| Scope | `--wave N`, `--feature FR-NNN`, `--task UC###`, `--all` | Limit scope |
| Skip | `--skip-{phase}` | Skip a named workflow phase |
| User gates | `--yes` (skip), `--confirm` (add) | Control confirmation prompts |
| Safety | `--dry-run`, `--force`, `--force-push` | Risk-level control |
| Auto-chain | `--deploy`, `--auto-ship` | Chain into next skill |
| Version | `--major`, `--minor`, `--patch` | SemVer bump type |
| Output | `--compact`, `--list`, `--final`, `--output <path>` | Control output format |

### Naming Rules for New Modifiers

- **Flags:** kebab-case with double dashes: `--skip-verify`, `--dry-run`
- **Mode values:** UPPER_CASE for CRUD branches (`FULL`, `CREATE`, `MODIFY`), lowercase for utility modes (`full`, `module`)
- **Subcommands:** lowercase: `sync`, `verify`, `stories`
- **Identifiers:** match layer format: `UC028`, `FR-001`, `TECH003`
