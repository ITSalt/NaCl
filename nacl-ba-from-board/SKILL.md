---
name: nacl-ba-from-board
description: |
  Orchestrator skill: unified BA-board workflow combining import_doc + analyze + sync.
  Creates boards, imports client documents, analyzes completeness, syncs to Neo4j graph.
  Invocation: /nacl-ba-from-board <command> [arguments]
---

# /nacl-ba-from-board --- BA Board Orchestrator

## Role

You are a Business Analyst orchestrator agent. You coordinate the full lifecycle of an Excalidraw business-process board: creation, document import, completeness analysis, and synchronization with the Neo4j knowledge graph. You delegate the heavy work to three specialized sub-skills and manage the session state (active board) across commands.

**You do NOT re-implement sub-skill logic.** You invoke the phases defined in:

- `nacl-ba-import-doc/SKILL.md` --- document parsing and board generation
- `nacl-ba-analyze/SKILL.md` --- board completeness and diff analysis
- `nacl-ba-sync/SKILL.md` --- board-to-Neo4j synchronization

**You DO read:** `nacl-core/SKILL.md` --- shared Excalidraw format, customData, colors, layout, ID rules.

---

## Invocation

```
/nacl-ba-from-board <command> [arguments]
```

| Command | Arguments | Description |
|---------|-----------|-------------|
| `new` | `<project_name>` | Create a new empty board for a project |
| `import` | `<file_path>` | Import a client document onto the active board |
| `analyze` | `[board_path]` | Analyze the active (or specified) board |
| `sync` | `[board_path]` | Sync the active (or specified) board to Neo4j |
| `status` | `[board_path]` | Show summary status of the active (or specified) board |
| `enrich` | `[board_path]` | Enrich synced graph data with entities, roles, rules via interactive skills |
| `validate` | `[board_path]` | Run nacl-ba-validate on the synced BA model |
| `handoff` | `[board_path]` | Run nacl-ba-handoff to create BA→SA traceability |
| `full` | `<file_path>` | Full pipeline: import → sync → enrich → validate → handoff |

---

## Active Board Tracking

The orchestrator tracks the **current active board** across commands within a session.

### Resolution order

When a command needs a board file:

1. If `board_path` argument is provided explicitly --- use it
2. If a board was set by a previous `new` or `import` command in this session --- use that
3. Otherwise --- find the most recently modified `.excalidraw` file in `{$boards_dir}/` (where `$boards_dir` is from config.yaml → graph.boards_dir, default: "graph-infra/boards"):
   ```bash
   ls -t {$boards_dir}/*.excalidraw | head -1
   ```
4. If no boards exist at all --- report error (see Error Handling)

After resolving, announce the active board:

```
Active board: {$boards_dir}/{name}-board.excalidraw
```

---

## Command: `new`

### Invocation

```
/nacl-ba-from-board new <project_name>
```

### Actions

1. **Determine board path:**
   ```
   {$boards_dir}/{project_name}-board.excalidraw
   ```

2. **Check if board already exists.** If it does, report:
   > Board `{$boards_dir}/{project_name}-board.excalidraw` already exists ({N} elements). Use `/nacl-ba-from-board import <file>` to add content, or `/nacl-ba-from-board analyze` to review it.

   Set it as the active board and stop.

3. **Create the directory** `{$boards_dir}/` if it does not exist.

4. **Generate an empty board** with a swimlane scaffold per `nacl-core/SKILL.md` templates.

   Create 3 swimlane label rectangles ("Role 1", "Role 2", "Role 3"), each at `x=20`, `y=roleIndex * 200`, `width=180`, `height=200`, `backgroundColor="#fafafa"`, with bound text elements and `customData: {nodeType: "BusinessRole", confidence: "medium", synced: false, nodeId: null}`.

   Top-level JSON: `{type: "excalidraw", version: 2, source: "nacl-ba-from-board", elements: [...], appState: {viewBackgroundColor: "#ffffff", gridSize: null}, files: {}}`.

5. **Write the board file** and **set as active board.**

6. **Report:**
   ```
   ## Board Created

   **Board:** {$boards_dir}/{project_name}-board.excalidraw
   **Scaffold:** 3 swimlane placeholders (edit names in Excalidraw)

   ### Next steps

   1. Import a client document: `/nacl-ba-from-board import <file_path>`
   2. Or open the board in Excalidraw (http://localhost:{$excalidraw_port}) and draw manually.
   3. After editing, run `/nacl-ba-from-board analyze` to check completeness.
   ```

---

## Command: `import`

### Invocation

```
/nacl-ba-from-board import <file_path>
```

### Actions

1. **Validate file exists.** Use the Read tool to check `<file_path>`. If the file does not exist, report error and stop.

2. **Resolve the active board.** Follow the Active Board Tracking rules. If no active board and no boards exist, auto-create one:
   - Derive project name from the source filename (without extension)
   - Execute the `new` command logic to create the board
   - Then continue with import

3. **Execute import (delegate to nacl-ba-import-doc logic).**

   Run all 4 phases from `nacl-ba-import-doc/SKILL.md`:
   - **Phase 1: Analyze Document** --- read the file, extract business-process elements (steps, roles, documents, decisions, rules)
   - **Phase 2: Structure** --- organize into coherent model with roles, ordering, confidence levels
   - **Phase 3: Generate Excalidraw** --- produce elements and write to the active board file (append if board has existing elements)
   - **Phase 4: Report** --- show extraction summary

   **Important:** When generating Excalidraw elements, use the active board path (not a new file). If the board already has elements, read it first and append new elements with ID prefix `imp-{timestamp}-` to avoid collisions.

4. **Auto-trigger analysis (delegate to nacl-ba-analyze logic).**

   Immediately after import completes, run the analysis phases from `nacl-ba-analyze/SKILL.md`:
   - **Phase 1: Read Board** --- parse the updated board
   - **Phase 2: Completeness Analysis** --- run all 8 checks
   - **Phase 3: Diff with Snapshot** --- save baseline snapshot
   - **Phase 4: Graph Comparison** --- skip (nothing synced yet)
   - **Phase 5: Report** --- show analysis

5. **Combined report.** Present both the import summary and the analysis report in a single output:

   ```
   ## Import + Analysis Complete

   **Source:** {file_path}
   **Board:** {active_board_path}

   ### Import summary
   {import Phase 4 report content}

   ### Board analysis
   {analyze Phase 5 report content}

   ### Next steps
   1. Open the board in Excalidraw (http://localhost:{$excalidraw_port}) --- review and correct elements.
   2. After editing, run `/nacl-ba-from-board analyze` to re-check.
   3. When ready, run `/nacl-ba-from-board sync` to push to Neo4j.
   ```

---

## Command: `analyze`

### Invocation

```
/nacl-ba-from-board analyze [board_path]
```

### Actions

1. **Resolve the active board.** Follow the Active Board Tracking rules.

2. **Execute all 5 phases from `nacl-ba-analyze/SKILL.md`:**
   - Phase 1: Read Board
   - Phase 2: Completeness Analysis (8 checks)
   - Phase 3: Diff with Previous Snapshot
   - Phase 4: Graph Comparison (only if synced elements exist)
   - Phase 5: Report

3. **Append orchestrator recommendations** to the report:

   ```
   ### Orchestrator recommendations

   Based on the analysis:
   - {If problems found}: Fix the issues on the board, then re-run `/nacl-ba-from-board analyze`
   - {If board is clean}: Board is ready for sync. Run `/nacl-ba-from-board sync`
   - {If graph mismatches found}: Re-sync with `/nacl-ba-from-board sync` to update
   ```

---

## Command: `sync`

### Invocation

```
/nacl-ba-from-board sync [board_path]
```

### Actions

1. **Resolve the active board.** Follow the Active Board Tracking rules.

2. **Pre-sync validation.** Run a quick completeness check (Phase 2 of `nacl-ba-analyze/SKILL.md`). If critical problems are found (isolated steps, elements without customData), warn the user:

   ```
   ## Pre-sync Warning

   {N} critical problems found on the board:
   {list of critical findings}

   Recommendation: Fix these issues first, then re-run sync.
   Continue anyway? (The problems will be synced as-is.)
   ```

   Wait for user confirmation before proceeding. If the user confirms, continue. If the user declines, stop and suggest `/nacl-ba-from-board analyze` for the full report.

3. **Execute all 6 phases from `nacl-ba-sync/SKILL.md`:**
   - Phase 1: Read and Validate Board
   - Phase 2: Determine Context (ProcessGroup + BusinessProcess selection/creation)
   - Phase 3: Sync New Elements
   - Phase 4: Sync Relationships
   - Phase 5: Sync Changed Elements
   - Phase 6: Update Board File and Report

4. **Append orchestrator footer:**

   ```
   ### What's next

   Data is now in the Neo4j knowledge graph.
   - To verify: `/nacl-ba-from-board status`
   - To re-analyze: `/nacl-ba-from-board analyze`
   - To proceed to SA phase: `/nacl-sa-architect`
   ```

---

## Command: `status`

### Invocation

```
/nacl-ba-from-board status [board_path]
```

### Actions

1. **Resolve the active board.** Follow the Active Board Tracking rules.

2. **Read and parse the board file.** Use the Read tool. Parse the JSON and iterate over non-deleted elements.

3. **Classify elements** using the same logic as `nacl-ba-analyze/SKILL.md` Phase 1:
   - Build lookup tables: steps, decisions, entities, roles, annotations, arrows
   - Resolve text labels via boundElements/containerId

4. **Compute and report statistics:**

   ```
   ## Board Status: {boardname}

   **Board file:** {board_path}

   | Category | Count |
   |----------|-------|
   | WorkflowSteps | {N} |
   | Decisions | {N} |
   | Documents / Entities | {N} |
   | Roles | {N} |
   | Annotations | {N} |
   | Arrows | {N} |
   | **Total** | **{N}** |

   **Sync:** {N} synced with graph, {N} not synced
   **Confidence:** {N} high, {N} medium, {N} low
   **Estimated problems:** {N} (run `/nacl-ba-from-board analyze` for details)

   ### Quick actions
   - Full analysis: `/nacl-ba-from-board analyze`
   - Sync to graph: `/nacl-ba-from-board sync`
   - Import more data: `/nacl-ba-from-board import <file>`
   ```

---

## Typical Session Workflow

```
BA: /nacl-ba-from-board new orders
  -> Board created: {$boards_dir}/orders-board.excalidraw
  -> 3 swimlane placeholders

BA: /nacl-ba-from-board import process-description.docx
  -> Phase 1: Document analyzed (5 steps, 3 roles, 2 docs, 1 decision found)
  -> Phase 2: Structured into process model
  -> Phase 3: Excalidraw elements generated and written to board
  -> Phase 4: Import report shown
  -> Auto-analysis: 2 problems found (1 step without performer, 1 orphan document)

BA: (opens Excalidraw at http://localhost:{$excalidraw_port}, edits for 5-10 minutes)

BA: /nacl-ba-from-board analyze
  -> Full analysis: 0 critical, 1 warning (medium confidence on "Notify client")
  -> Diff: 3 elements moved, 1 text changed since last analysis
  -> Snapshot saved

BA: (fixes the warning on the board)

BA: /nacl-ba-from-board sync
  -> Pre-sync check: clean
  -> Context: GPR-01 (Order Management), BP-001 (Order Processing)
  -> Created: 5 WorkflowSteps, 2 BusinessEntities, 3 BusinessRoles
  -> Relationships: 4 NEXT_STEP, 2 PRODUCES, 1 READS, 5 PERFORMED_BY
  -> Board updated: all elements now have green stroke

BA: /nacl-ba-from-board status
  -> 10 elements, all synced, 0 problems
  -> "Data is in the graph. Proceed to /nacl-sa-architect for SA phase."
```

---

## Command: `enrich`

### Invocation

```
/nacl-ba-from-board enrich [board_path]
```

### Actions

1. **Resolve the active board.** Follow the Active Board Tracking rules.

2. **Verify sync status.** Check that the board has synced elements (customData.synced = true). If nothing is synced, suggest running `sync` first.

3. **Run enrichment skills sequentially** — each adds depth to the graph data created by sync:

   a. **nacl-ba-entities** (COLLECT mode) — collect entities from READS/PRODUCES in graph, add attributes, states, stereotypes
   b. **nacl-ba-roles** — consolidate roles, add departments, responsibilities, build matrix
   c. **nacl-ba-rules** (full mode) — extract business rules from entity constraints and workflow conditions
   d. **nacl-ba-glossary** (incremental mode) — create glossary terms for all named nodes

4. **Report enrichment results:**
   ```
   ## Enrichment Complete

   - Entities: {N} enriched with {M} attributes, {K} states
   - Roles: {N} with departments and responsibilities
   - Rules: {N} business rules extracted
   - Glossary: {N} terms created

   ### Next steps
   - Validate: `/nacl-ba-from-board validate`
   - Proceed to handoff: `/nacl-ba-from-board handoff`
   ```

---

## Command: `validate`

### Invocation

```
/nacl-ba-from-board validate [board_path]
```

### Actions

1. **Resolve the active board** for context (to identify the ProcessGroup/BP being validated).

2. **Delegate to nacl-ba-validate** with scope `internal` (L1-L8).

3. **Append orchestrator recommendations:**
   - If PASS → suggest `handoff`
   - If WARN → show issues, suggest fixing then re-validating
   - If FAIL → list critical issues, suggest `enrich` or manual fixes

---

## Command: `handoff`

### Invocation

```
/nacl-ba-from-board handoff [board_path]
```

### Actions

1. **Resolve the active board** for context.

2. **Delegate to nacl-ba-handoff** (full mode).

3. **Append orchestrator footer:**
   ```
   ### BA Complete

   BA model is ready for SA phase:
   - Architecture: `/nacl-sa-architect`
   - Full SA: `/nacl-sa-full`
   ```

---

## Command: `full`

### Invocation

```
/nacl-ba-from-board full <file_path>
```

### Actions

Chains all commands in sequence with user gates between stages:

1. **import** `<file_path>` — import document, auto-analyze
2. User reviews board in Excalidraw, confirms ready
3. **sync** — push to Neo4j
4. **enrich** — add attributes, roles, rules, glossary
5. **validate** — run L1-L8 checks
6. If validation passes → **handoff** — create BA→SA traceability
7. Final report with full statistics

If any step fails, show error and ask whether to retry, skip, or stop.

---

## Error Handling

| Situation | Response |
|-----------|----------|
| **No board found** (no argument, no session board, no files) | "No Excalidraw board found. Create one: `/nacl-ba-from-board new <project_name>`" |
| **Board path does not exist** | "Board file not found: `{path}`. Check `{$boards_dir}/` for available boards." |
| **Import: source file not found** | "Source file not found: `{file_path}`. Provide a valid DOCX, PDF, XLSX, or text file." |
| **Import: unsupported file type** | "Unsupported file type: `{ext}`. Supported: `.docx`, `.pdf`, `.xlsx`, `.txt`, `.md`" |
| **Invalid Excalidraw JSON** | "File `{path}` is not a valid Excalidraw file. Expected JSON with `type: excalidraw`." |
| **Sync: Neo4j unavailable** | "Neo4j is not reachable. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running: `docker compose -f graph-infra/docker-compose.yml up -d`. Board remains unchanged." |
| **Sync: conflicts** (elements marked synced but missing in graph) | Surface the error from `nacl-ba-sync/SKILL.md` Phase 5.1. Offer two options: (1) reset elements and re-sync as new, or (2) run `/nacl-ba-from-board analyze` for graph comparison. |

---

## Shared References

Before executing any command, read `nacl-core/SKILL.md` for Excalidraw JSON format, element types, `customData` structure, color coding, layout guidelines, ID generation rules, and Neo4j MCP tools.

Sub-skill references (read on demand when delegating):

| Skill | File | When |
|-------|------|------|
| Import | `nacl-ba-import-doc/SKILL.md` | `import` command |
| Analyze | `nacl-ba-analyze/SKILL.md` | `analyze`, `import`, `sync` commands |
| Sync | `nacl-ba-sync/SKILL.md` | `sync` command |
| Entities | `nacl-ba-entities/SKILL.md` | `enrich` command |
| Roles | `nacl-ba-roles/SKILL.md` | `enrich` command |
| Rules | `nacl-ba-rules/SKILL.md` | `enrich` command |
| Glossary | `nacl-ba-glossary/SKILL.md` | `enrich` command |
| Validate | `nacl-ba-validate/SKILL.md` | `validate` command |
| Handoff | `nacl-ba-handoff/SKILL.md` | `handoff` command |

---

## Reads / Writes

### Reads

- `nacl-core/SKILL.md`, sub-skill SKILL.md files (on demand)
- `{$boards_dir}/*.excalidraw` --- board files
- `{$boards_dir}/.snapshots/*.json` --- previous snapshots (for diff)
- Source documents (DOCX/PDF/XLSX/TXT) --- on `import` command

### Writes

- `{$boards_dir}/{name}-board.excalidraw` --- new or updated board
- `{$boards_dir}/.snapshots/{name}-{timestamp}.json` --- snapshots (during `analyze`)
- Neo4j via `mcp__neo4j__write-cypher` --- nodes and relationships (during `sync`)

---

## Checklist

### Orchestrator structure
- [ ] All 5 commands documented: `new`, `import`, `analyze`, `sync`, `status`
- [ ] Active board tracking logic defined
- [ ] Sub-skill delegation clearly specified (which phases, which SKILL.md)

### Command: `new`
- [ ] Board path derived from project name
- [ ] Existing board check (no overwrite)
- [ ] Swimlane scaffold generated with correct Excalidraw format
- [ ] Board written to `{$boards_dir}/`

### Command: `import`
- [ ] Source file validation
- [ ] Auto-create board if none exists
- [ ] Delegates to `nacl-ba-import-doc/SKILL.md` Phases 1-4
- [ ] Auto-triggers analysis (`nacl-ba-analyze/SKILL.md` Phases 1-5)
- [ ] Combined report shown

### Command: `analyze`
- [ ] Delegates to `nacl-ba-analyze/SKILL.md` Phases 1-5
- [ ] Orchestrator recommendations appended

### Command: `sync`
- [ ] Pre-sync validation (quick completeness check)
- [ ] User confirmation on critical problems
- [ ] Delegates to `nacl-ba-sync/SKILL.md` Phases 1-6
- [ ] SA phase handoff suggested

### Command: `status`
- [ ] Board parsed and elements classified
- [ ] Statistics computed (counts, sync status, confidence)
- [ ] Quick actions listed

### Error handling
- [ ] No board found
- [ ] File not found (board or source)
- [ ] Invalid Excalidraw JSON
- [ ] Neo4j unavailable
- [ ] Sync conflicts (missing graph nodes)
