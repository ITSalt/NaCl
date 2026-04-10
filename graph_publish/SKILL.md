---
name: graph_publish
description: |
  Публикация графа в Docmost и генерация Excalidraw-бордов.
  Используй когда пользователь просит: опубликовать граф, синхронизировать с Docmost,
  сгенерировать борды, graph_publish, graph publish.
---

# /graph_publish -- Граф -> Docmost + Excalidraw Boards

## Назначение

Публикация данных из Neo4j-графа во внешние форматы:
- **Docmost** -- генерация markdown из графа (через `graph_render md`) и публикация страниц в Docmost
- **Excalidraw Boards** -- генерация визуальных бордов из графа и привязка к страницам Docmost

```
Neo4j Graph
    |
    ├── graph_render md ──> Markdown ──> Docmost Pages     (/graph_publish docmost)
    |
    ├── graph_render excalidraw ──> .excalidraw files       (/graph_publish boards)
    |
    └── Excalidraw links ──> Docmost Pages updated          (/graph_publish boards-link)
```

## Dependencies

- `graph_core/SKILL.md` -- shared Neo4j connection, schema, ID rules
- `graph_render/SKILL.md` -- md and excalidraw rendering logic
- Neo4j MCP: `mcp__neo4j__read-cypher`
- Docmost MCP: `mcp__docmost__create_page`, `mcp__docmost__update_page`, `mcp__docmost__list_spaces`, `mcp__docmost__get_page`, `mcp__docmost__list_pages`, `mcp__docmost__search`

## Config Resolution

| Параметр | Источник (по приоритету) | Fallback |
|----------|--------------------------|----------|
| Docmost API URL | `config.yaml → docmost.api_url` | Использовать env-настройки Docmost MCP |
| `space_id` (graph scope) | `config.yaml → docmost.spaces.graph.space_id` > `docmost.spaces.sa.space_id` > manifest `space_id` | Спросить пользователя через `mcp__docmost__list_spaces` |
| `root_page_id` (graph scope) | `config.yaml → docmost.spaces.graph.root_page_id` > `docmost.spaces.sa.root_page_id` > manifest `root_page_id` | Создать новую корневую страницу |
| Boards directory | `config.yaml → graph.boards_dir` | `graph-infra/boards` |
| Neo4j Bolt port | `config.yaml → graph.neo4j_bolt_port` | `3587` |

**Принцип:** `config.yaml` — первый источник для адресации Docmost. Manifest (`.docmost-sync.json`) отвечает только за page-level sync state (page IDs, content hashes, last_updated). Если в проекте нет отдельного `spaces.graph` — fallback на `spaces.sa`, поскольку graph и SA публикуют один и тот же набор страниц.

## Invocation

```
/graph_publish <command> [args]
```

## Commands Overview

| Command | Description | Status |
|---------|-------------|--------|
| `docmost` | Full publish: generate md from graph, create/update all pages | Implemented |
| `docmost-incremental` | Publish only nodes changed since last sync | Implemented |
| `docmost-preview <type> <id>` | Preview one page in terminal (no publish) | Implemented |
| `boards` | Generate all Excalidraw boards from graph | Implemented |
| `boards-link` | Add board links/embeds to Docmost pages | Implemented |
| `full` | Complete pipeline: docmost + boards + boards-link | Implemented |

---

## Manifest: `.docmost-sync.json`

Located at project root (next to `graph-infra/`). This file tracks synchronization state between the graph and Docmost.

### Structure

```json
{
  "project": "project-name",
  "space_id": "019cd479-...",
  "root_page_id": "019cd6de-...",
  "last_sync": "2026-03-20T14:30:00Z",
  "pages": {
    "DE-Order": {
      "page_id": "019cd6f0-...",
      "parent_page_id": "019cd6df-33de-...",
      "content_hash": "sha256:a1b2c3d4...",
      "last_updated": "2026-03-20T14:30:00Z",
      "source_type": "entity",
      "source_id": "DE-Order"
    },
    "UC-101": {
      "page_id": "019cd6f1-...",
      "parent_page_id": "019cd6df-4348-...",
      "content_hash": "sha256:e5f6a7b8...",
      "last_updated": "2026-03-20T14:30:00Z",
      "source_type": "uc",
      "source_id": "UC-101"
    }
  },
  "sections": {
    "Архитектура": "019cd6df-2475-...",
    "Domain Model": "019cd6df-33de-...",
    "Use Cases": "019cd6df-4348-...",
    "Интерфейсы": "019cd6df-5512-...",
    "Трассировка": "019cd6df-6623-...",
    "Роли и права": "019cd6df-7734-..."
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `project` | Project name (from graph or user input) |
| `space_id` | Cached Docmost space ID. Source of truth: `config.yaml → docmost.spaces.graph.space_id` (fallback `spaces.sa.space_id`). Manifest stores it for offline reference; `config.yaml` wins on conflict. |
| `root_page_id` | Cached root page ID. Source of truth: `config.yaml → docmost.spaces.graph.root_page_id` (fallback `spaces.sa.root_page_id`). Manifest stores it for offline reference; `config.yaml` wins on conflict. |
| `last_sync` | ISO 8601 timestamp of the last full or incremental sync |
| `pages` | Map: logical page key -> `{page_id, parent_page_id, content_hash, last_updated, source_type, source_id}` |
| `sections` | Map: section name -> Docmost page ID (section pages serve as parents) |

### Content Hash

Compute SHA-256 of the generated markdown content (trimmed trailing whitespace per line):

```bash
echo "$CONTENT" | sed 's/[[:space:]]*$//' | shasum -a 256 | cut -d' ' -f1
```

---

## Page Structure in Docmost

The hierarchy mirrors the project's artifact types, organized by modules:

```
{Project}/
├── Архитектура/
│   ├── Context Map
│   └── Модули
├── Domain Model/
│   ├── {Entity1}
│   ├── {Entity2}
│   └── ...
├── Use Cases/
│   ├── UC Index
│   ├── {UC-101}
│   ├── {UC-102}
│   └── ...
├── Интерфейсы/
│   ├── {Form1}
│   ├── {Form2}
│   └── ...
├── Трассировка/
│   └── BA -> SA Matrix
└── Роли и права/
    └── Permission Matrix
```

### Section-to-Graph Mapping

| Section | Graph Source | graph_render command |
|---------|-------------|---------------------|
| Context Map | `Module` nodes + `DEPENDS_ON` edges | `md domain-model` (module overview) |
| Domain Model / {Entity} | `DomainEntity` + attrs + rels | `md entity <id>` |
| UC Index | All `UseCase` nodes | `md uc-index` |
| Use Cases / {UC} | `UseCase` + steps + forms | `md uc <id>` |
| Интерфейсы / {Form} | `Form` + fields + mapping | `md form <id>` |
| Трассировка | BA->SA handoff edges | `md traceability` |
| Роли и права | `SystemRole` + `Permission` nodes | Custom query (see below) |

---

## Pre-flight Checks

Before any Docmost command, verify:

1. **Docmost MCP available?** Call `mcp__docmost__list_spaces`.
   - If fails -> `ERROR: Docmost MCP not available. Check that the MCP server is connected.`

2. **Neo4j available?** Call `mcp__neo4j__read-cypher` with `RETURN 1`.
   - If fails -> `ERROR: Neo4j not available. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running.`

3. **Graph has data?** Query:
   ```cypher
   MATCH (n)
   WITH labels(n) AS lbls, count(*) AS cnt
   UNWIND lbls AS lbl
   RETURN lbl, sum(cnt) AS total ORDER BY lbl
   ```
   - If empty -> `WARNING: Graph is empty. Run /graph_import or seed data first.`

4. **Manifest exists?** Read `.docmost-sync.json`.
   - If missing and command is not `docmost` (full) -> suggest running `/graph_publish docmost` first.

---

## Command: `/graph_publish docmost`

Full publish -- generate markdown from graph for every artifact and create/update all pages in Docmost.

### Workflow

```
Step 1: Init/Load     Step 2: Create        Step 3: Generate &      Step 4: Save
── manifest ──── ->  ── section pages ── ->  ── publish pages ── ->  ── manifest ──
```

### Step 1: Resolve Docmost target, then Initialize or Load Manifest

**Step 1a: Read `config.yaml → docmost`** (first source for `space_id` / `root_page_id`):

1. Try `docmost.spaces.graph.space_id` and `docmost.spaces.graph.root_page_id`.
2. If `spaces.graph` is missing, fall back to `docmost.spaces.sa.space_id` / `spaces.sa.root_page_id` (graph and SA publish into the same Docmost area in most projects).
3. If both are empty -> mark `space_id` and `root_page_id` as "needs prompt".

**Step 1b: If `.docmost-sync.json` does NOT exist (first run):**

1. If `space_id` resolved from `config.yaml`:
   - Validate by calling `mcp__docmost__list_spaces` -- confirm the space still exists.
   - Use the resolved `space_id` directly. Do not prompt the user.
2. Otherwise ask the user:
   - `space_id` -- which Docmost space to publish into? (list spaces via `mcp__docmost__list_spaces`)
   - After the user chooses, **suggest writing the value to `config.yaml → docmost.spaces.graph.space_id`** so the next run is non-interactive.
3. If `root_page_id` resolved from `config.yaml`:
   - Use it as-is, do not create a new root page.
4. Otherwise create a new root page:
   ```
   mcp__docmost__create_page(
     title: "{project} -- Спецификация",
     content: "# {project}\n\nАвтоматически сгенерированная спецификация из графа знаний.",
     spaceId: "{space_id}"
   )
   ```
   Save returned `id` as `root_page_id` and **suggest writing it to `config.yaml → docmost.spaces.graph.root_page_id`**.
5. Initialize manifest with empty `pages` and `sections`. Persist `space_id` / `root_page_id` into the manifest as cache, but `config.yaml` remains the source of truth on subsequent runs.

**Step 1c: If `.docmost-sync.json` EXISTS:**

1. Read manifest.
2. Reconcile `space_id` / `root_page_id`:
   - If `config.yaml` has values -> use them. If they differ from manifest, log a warning and update manifest to match `config.yaml` (manifest is a cache, not the source of truth).
   - If `config.yaml` is empty -> fall back to manifest values.
3. Validate `space_id` by calling `mcp__docmost__list_spaces` -- confirm the space still exists.
4. Continue with existing section pages from `sections` map.

### Step 2: Create Section Pages

For each section in the hierarchy, create a parent page if not already in `sections`:

| Section | Title | Parent |
|---------|-------|--------|
| Архитектура | Архитектура | root_page_id |
| Domain Model | Domain Model | root_page_id |
| Use Cases | Use Cases | root_page_id |
| Интерфейсы | Интерфейсы | root_page_id |
| Трассировка | Трассировка | root_page_id |
| Роли и права | Роли и права | root_page_id |

For each section not in `sections` map:

```
mcp__docmost__create_page(
  title: "{section title}",
  content: "# {section title}\n\nРаздел спецификации.",
  spaceId: "{space_id}",
  parentPageId: "{root_page_id}"
)
```

Save returned `id` to `sections[title]`.

**Order of creation:** Архитектура, Domain Model, Use Cases, Интерфейсы, Трассировка, Роли и права. Sequential calls (Docmost does not guarantee ordering with parallel requests).

### Step 3: Generate Content and Publish Pages

Process artifacts in this order:

#### 3a: Architecture -- Context Map

1. Use `graph_render md domain-model` logic to generate the full domain model overview.
2. Also generate a module list page:

   Query modules:
   ```cypher
   MATCH (m:Module)
   OPTIONAL MATCH (m)-[:CONTAINS_ENTITY]->(de:DomainEntity)
   OPTIONAL MATCH (m)-[:CONTAINS_UC]->(uc:UseCase)
   RETURN m.id AS id, m.name AS name, m.description AS description,
          count(DISTINCT de) AS entity_count, count(DISTINCT uc) AS uc_count
   ORDER BY m.id
   ```

   Generate markdown:
   ```markdown
   # Модули

   | ID | Модуль | Описание | Сущностей | Use Cases |
   |----|--------|----------|-----------|-----------|
   | {id} | {name} | {description} | {entity_count} | {uc_count} |
   ```

3. Publish to section `Архитектура`:
   - Page "Context Map" -- `create_page` or `update_page` under `sections["Архитектура"]`
   - Page "Модули" -- under `sections["Архитектура"]`

#### 3b: Domain Model -- Entities

1. Query all DomainEntities:
   ```cypher
   MATCH (de:DomainEntity)
   RETURN de.id AS id, de.name AS name
   ORDER BY de.id
   ```

2. For each entity, use `graph_render md entity <id>` logic to generate full markdown.

3. Publish each entity page under `sections["Domain Model"]`:
   ```
   mcp__docmost__create_page(
     title: "{de.name}",
     content: "{generated_markdown}",
     spaceId: "{space_id}",
     parentPageId: "{sections['Domain Model']}"
   )
   ```
   or `mcp__docmost__update_page(pageId, content)` if `pages[de.id]` already exists.

4. Save to `pages`:
   ```json
   "{de.id}": {
     "page_id": "{returned_id}",
     "parent_page_id": "{sections['Domain Model']}",
     "content_hash": "sha256:...",
     "last_updated": "{now_iso}",
     "source_type": "entity",
     "source_id": "{de.id}"
   }
   ```

#### 3c: Use Cases -- Index + Individual UCs

1. Generate UC Index using `graph_render md uc-index` logic.
2. Publish as page "UC Index" under `sections["Use Cases"]`.

3. Query all UseCases:
   ```cypher
   MATCH (uc:UseCase)
   RETURN uc.id AS id, uc.name AS name
   ORDER BY uc.id
   ```

4. For each UC, use `graph_render md uc <id>` logic to generate markdown.
5. Publish each UC page under `sections["Use Cases"]`.

#### 3d: Interfaces -- Forms

1. Query all Forms:
   ```cypher
   MATCH (f:Form)
   RETURN f.id AS id, f.name AS name
   ORDER BY f.id
   ```

2. For each form, use `graph_render md form <id>` logic to generate markdown.
3. Publish each form page under `sections["Интерфейсы"]`.

#### 3e: Traceability

1. Use `graph_render md traceability` logic to generate the BA->SA matrix.
2. Publish as page "BA -> SA Matrix" under `sections["Трассировка"]`.

#### 3f: Roles and Permissions

1. Query SystemRoles:
   ```cypher
   MATCH (sr:SystemRole)
   OPTIONAL MATCH (sr)<-[:ACTOR]-(uc:UseCase)
   OPTIONAL MATCH (sr)<-[:MAPPED_TO]-(br:BusinessRole)
   RETURN sr.id AS id, sr.name AS name, sr.description AS description,
          collect(DISTINCT uc.id) AS use_cases,
          collect(DISTINCT br.full_name) AS ba_roles
   ORDER BY sr.id
   ```

2. Generate permission matrix markdown:
   ```markdown
   # Роли и права

   | Роль | Описание | BA-роль | Доступные UC |
   |------|----------|---------|--------------|
   | {name} | {description} | {ba_roles joined} | {use_cases joined} |
   ```

3. Publish under `sections["Роли и права"]`.

### Step 4: Save Manifest

1. Update `last_sync` to current ISO 8601 timestamp.
2. Write `.docmost-sync.json`.
3. Report summary:

```
Публикация завершена:
- Создано: {created_count} страниц
- Обновлено: {updated_count} страниц
- Пропущено: {skipped_count} (без изменений)
- Секций: {section_count}
- Manifest: .docmost-sync.json обновлён
```

### Create vs Update Decision

For each page:

1. Check if `pages[key]` exists in manifest.
2. If yes -- page already published:
   - Generate markdown, compute content_hash.
   - If content_hash matches manifest -> **SKIP** (no changes).
   - If content_hash differs -> **UPDATE** via `mcp__docmost__update_page(page_id, content)`.
3. If no -> **CREATE** via `mcp__docmost__create_page(title, content, spaceId, parentPageId)`.

### Publishing Pace

Publish pages sequentially with a brief pause between API calls (Docmost does not guarantee ordering with parallel requests). Process order:

1. Section pages (parents first)
2. Summary/index pages (Context Map, UC Index, Permission Matrix, Traceability)
3. Individual artifact pages (entities, UCs, forms) -- alphabetically within each section

---

## Command: `/graph_publish docmost-incremental`

Publish only graph nodes that changed since the last sync.

### Workflow

```
Step 1: Load manifest   Step 2: Detect         Step 3: Regenerate    Step 4: Publish
── & timestamps ──── -> ── changed nodes ── ->  ── markdown ────── -> ── & save ─────
```

### Step 1: Load Manifest

1. Read `.docmost-sync.json`.
   - If missing -> `ERROR: No manifest found. Run /graph_publish docmost first for initial sync.`
2. Extract `last_sync` timestamp.

### Step 2: Detect Changed Nodes

Query Neo4j for nodes modified after `last_sync`. All graph nodes should have an `updated_at` property (ISO 8601 string or epoch).

```cypher
// Entities changed since last sync
WITH datetime($lastSync) AS since
MATCH (de:DomainEntity)
WHERE datetime(de.updated_at) > since
RETURN 'entity' AS type, de.id AS id, de.name AS name

UNION ALL

// UseCases changed (or their steps changed)
WITH datetime($lastSync) AS since
MATCH (uc:UseCase)
WHERE datetime(uc.updated_at) > since
RETURN 'uc' AS type, uc.id AS id, uc.name AS name

UNION ALL

// Also catch UCs whose ActivitySteps changed
WITH datetime($lastSync) AS since
MATCH (as_step:ActivityStep)
WHERE datetime(as_step.updated_at) > since
WITH as_step
MATCH (uc:UseCase)-[:HAS_STEP]->(as_step)
RETURN DISTINCT 'uc' AS type, uc.id AS id, uc.name AS name

UNION ALL

// Forms changed (or their fields changed)
WITH datetime($lastSync) AS since
MATCH (f:Form)
WHERE datetime(f.updated_at) > since
RETURN 'form' AS type, f.id AS id, f.name AS name

UNION ALL

WITH datetime($lastSync) AS since
MATCH (ff:FormField)
WHERE datetime(ff.updated_at) > since
WITH ff
MATCH (f:Form)-[:HAS_FIELD]->(ff)
RETURN DISTINCT 'form' AS type, f.id AS id, f.name AS name

UNION ALL

// Roles changed
WITH datetime($lastSync) AS since
MATCH (sr:SystemRole)
WHERE datetime(sr.updated_at) > since
RETURN 'role' AS type, sr.id AS id, sr.name AS name
```

**Fallback** if nodes lack `updated_at`: regenerate markdown for all pages in manifest, compare content_hash, and publish only those with changed hashes. Report that `updated_at` properties are missing and recommend adding them.

### Step 3: Regenerate Affected Pages

For each changed node, call the appropriate `graph_render md` logic:

| type | Render command logic | Page key |
|------|---------------------|----------|
| `entity` | `graph_render md entity <id>` | `{id}` (e.g., `DE-Order`) |
| `uc` | `graph_render md uc <id>` | `{id}` (e.g., `UC-101`) |
| `form` | `graph_render md form <id>` | `{id}` (e.g., `FORM-OrderCreate`) |
| `role` | Custom role query (see docmost Step 3f) | Regenerate full roles page |

Also regenerate cross-cutting pages if any entity or UC changed:
- **UC Index** -- if any UC changed
- **Traceability** -- if any entity or UC changed
- **Context Map** -- if any entity changed (module composition may shift)

### Step 4: Publish and Save

For each regenerated page:

1. Compute new content_hash.
2. Compare with `pages[key].content_hash` in manifest.
3. If different:
   - `mcp__docmost__update_page(page_id, content)` using `page_id` from manifest.
   - Update `content_hash` and `last_updated` in manifest.
4. If same -> skip (no actual change despite node timestamp update).

Update `last_sync` and save manifest. Report:

```
Инкрементальная синхронизация:
- Проверено: {checked_count} узлов
- Обновлено: {updated_count} страниц
- Пропущено: {skipped_count} (content_hash совпадает)
- Новых: {created_count} (узел добавлен после прошлого sync)
- Manifest: .docmost-sync.json обновлён
```

---

## Command: `/graph_publish docmost-preview <type> <id>`

Preview a single page in the terminal without publishing to Docmost.

### Supported Types

| Type | Argument | graph_render logic |
|------|----------|-------------------|
| `entity` | DomainEntity.id (e.g., `DE-Order`) | `md entity <id>` |
| `uc` | UseCase.id (e.g., `UC-101`) | `md uc <id>` |
| `form` | Form.id (e.g., `FORM-OrderCreate`) | `md form <id>` |
| `uc-index` | (no id needed) | `md uc-index` |
| `domain-model` | (no id needed) | `md domain-model` |
| `traceability` | (no id needed) | `md traceability` |
| `roles` | (no id needed) | Custom roles query |

### Workflow

1. Validate `<type>` is one of the supported types.
   - If invalid -> `ERROR: Unknown type "{type}". Supported: entity, uc, form, uc-index, domain-model, traceability, roles.`

2. Call the corresponding `graph_render md` logic to generate markdown.
   - For types requiring `<id>`, validate that `<id>` is provided.
   - If node not found in graph -> `ERROR: {type} "{id}" not found in graph.`

3. Print the generated markdown to the terminal.

4. Show sync status if manifest exists:
   ```
   ---
   Sync status: {status}
   ```
   Where `{status}` is one of:
   - `NEW -- not yet published` (page key not in manifest)
   - `CHANGED -- content differs from published version` (content_hash mismatch)
   - `UP TO DATE -- matches published version` (content_hash matches)
   - `UNKNOWN -- no manifest` (manifest does not exist)

### Examples

```
/graph_publish docmost-preview entity DE-Order
/graph_publish docmost-preview uc UC-101
/graph_publish docmost-preview traceability
```

---

## Docmost MCP Usage Reference

### create_page

```
mcp__docmost__create_page(
  title: "Page Title",
  content: "# Markdown Content\n\nBody text...",
  spaceId: "019cd479-...",
  parentPageId: "019cd6de-..."    // optional, omit for top-level
)
```

Returns: `{ id: "019cd6f0-...", title: "Page Title", ... }`

### update_page

```
mcp__docmost__update_page(
  pageId: "019cd6f0-...",
  content: "# Updated Content\n\n..."
)
```

Optionally include `title` to update the title as well.

### list_spaces

```
mcp__docmost__list_spaces()
```

Returns list of spaces with their IDs. Use during init to let user pick a space.

### list_pages

```
mcp__docmost__list_pages(
  spaceId: "019cd479-..."
)
```

Returns all pages in a space. Useful for manifest rebuild.

### get_page

```
mcp__docmost__get_page(
  pageId: "019cd6f0-..."
)
```

Returns full page content. Used to verify published content matches.

### search

```
mcp__docmost__search(
  query: "search term"
)
```

Used for finding existing pages during manifest rebuild.

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Docmost MCP unavailable | `ERROR: Docmost MCP not available. Check MCP server connection.` |
| Neo4j unavailable | `ERROR: Neo4j not available. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running.` |
| Graph is empty | `WARNING: Graph is empty. Run /graph_import or seed first.` |
| Manifest missing (incremental) | `ERROR: No manifest. Run /graph_publish docmost first.` |
| Manifest missing (full) | Proceed with init flow: read `config.yaml → docmost.spaces.graph` first; only ask the user if config.yaml is empty. |
| Page create fails | Log error, continue with next page, report failures at end. |
| Page update fails (404) | Page was deleted in Docmost. Remove from manifest, re-create. |
| Unknown preview type | `ERROR: Unknown type "{type}". Supported: entity, uc, form, uc-index, domain-model, traceability, roles.` |
| Node not found in graph | `ERROR: {type} "{id}" not found in graph.` |
| Content hash unchanged | Skip update (log as "no changes"). |

---

# Excalidraw Boards

## Command: `/graph_publish boards`

Generate ALL Excalidraw boards from graph data using `graph_render excalidraw` logic for each diagram type.

**Output directory:** `{$boards_dir}/` (where `$boards_dir` is from config.yaml → graph.boards_dir, default: "graph-infra/boards")

### Pre-flight Checks

Same as Docmost commands (see Pre-flight Checks section above):
1. Neo4j available
2. Graph has data

Additionally:
3. Ensure `{$boards_dir}/` directory exists. If not, create it.

### Workflow

```
Step 1: Query graph       Step 2: Generate boards       Step 3: Track & report
── catalog nodes ──── ->  ── render excalidraw ────── -> ── summary ────────
```

### Step 1: Catalog All Diagram Sources

Query Neo4j to discover all artifacts that need boards:

```cypher
// 1a: All DomainEntities (for domain-model board)
MATCH (de:DomainEntity)
RETURN count(de) AS entity_count
```

```cypher
// 1b: All Modules (for context-map board)
MATCH (m:Module)
RETURN count(m) AS module_count
```

```cypher
// 1c: All UseCases with ActivitySteps (for activity boards)
MATCH (uc:UseCase)-[:HAS_STEP]->(as_step:ActivityStep)
RETURN DISTINCT uc.id AS id, uc.name AS name
ORDER BY uc.id
```

```cypher
// 1d: All BusinessProcesses with WorkflowSteps (for process boards)
MATCH (bp:BusinessProcess)-[:HAS_STEP]->(ws:WorkflowStep)
RETURN DISTINCT bp.id AS id, bp.name AS name
ORDER BY bp.id
```

### Step 2: Generate Boards

Generate each board using the corresponding `graph_render excalidraw` logic (see `graph_render/SKILL.md` for full rendering algorithms, layout constants, and element factories).

#### 2a: Domain Model Board

Use `graph_render excalidraw domain-model` logic:
- Query all DomainEntities + attributes + RELATES_TO + enumerations
- Layout as grid of entity cards with arrows
- **Output:** `{$boards_dir}/domain-model.excalidraw`

#### 2b: Context Map Board

Use `graph_render excalidraw context-map` logic:
- Query all Modules + DEPENDS_ON + cross-module entity relationships
- Layout as horizontal module boxes with dependency arrows
- **Output:** `{$boards_dir}/context-map.excalidraw`

#### 2c: Activity Boards (one per UseCase)

For each UseCase discovered in Step 1c, use `graph_render excalidraw activity <UC-ID>` logic:
- Query ActivitySteps for the UC
- Layout as top-down flowchart with User/System swimlanes
- **Output:** `{$boards_dir}/activity-{UC-ID}.excalidraw`

If a UseCase has no ActivitySteps, skip it and log: `SKIP: {UC-ID} -- no activity steps`.

#### 2d: BA Process Boards (one per BusinessProcess)

For each BusinessProcess discovered in Step 1d, use `graph_render excalidraw ba-process <BP-ID>` logic:
- Query WorkflowSteps with roles, documents
- Layout as horizontal role-swimlane flowchart
- **Output:** `{$boards_dir}/process-{BP-ID}.excalidraw`

If a BusinessProcess has no WorkflowSteps, skip it and log: `SKIP: {BP-ID} -- no workflow steps`.

### Step 3: Track and Report

After all boards are generated, update `.docmost-sync.json` with a `boards` section (create the key if absent):

```json
{
  "boards": {
    "domain-model": {
      "file": "{$boards_dir}/domain-model.excalidraw",
      "generated_at": "2026-03-20T14:30:00Z",
      "element_count": 42,
      "source": "all DomainEntities"
    },
    "context-map": {
      "file": "{$boards_dir}/context-map.excalidraw",
      "generated_at": "2026-03-20T14:30:00Z",
      "element_count": 18,
      "source": "all Modules"
    },
    "activity-UC-101": {
      "file": "{$boards_dir}/activity-UC-101.excalidraw",
      "generated_at": "2026-03-20T14:30:00Z",
      "element_count": 24,
      "source": "UC-101"
    },
    "process-BP-001": {
      "file": "{$boards_dir}/process-BP-001.excalidraw",
      "generated_at": "2026-03-20T14:30:00Z",
      "element_count": 36,
      "source": "BP-001"
    }
  }
}
```

Save the manifest file.

### Report Format

```
Генерация Excalidraw-бордов завершена:
- Domain Model: domain-model.excalidraw ({N} элементов)
- Context Map: context-map.excalidraw ({N} элементов)
- Activity Diagrams: {UC_count} бордов ({UC-IDs joined})
- BA Process Diagrams: {BP_count} бордов ({BP-IDs joined})
- Пропущено: {skip_count} (нет шагов)
──────────────────────────────────
Итого: {total_boards} бордов, {total_elements} элементов
Директория: {$boards_dir}/
Manifest: .docmost-sync.json обновлён (секция boards)
```

### Generation Order

Generate boards sequentially in this order:
1. `domain-model` (single board)
2. `context-map` (single board)
3. `activity-{UC-ID}` for each UC (alphabetical by UC-ID)
4. `process-{BP-ID}` for each BP (alphabetical by BP-ID)

### Error Handling for Boards

| Situation | Action |
|-----------|--------|
| Neo4j unavailable | `ERROR: Neo4j not available. Check config.yaml → graph.neo4j_bolt_port (default: 3587) and ensure Docker is running.` |
| No DomainEntities | Skip domain-model board, log: `SKIP: domain-model -- no entities in graph` |
| No Modules | Skip context-map board, log: `SKIP: context-map -- no modules in graph` |
| No UseCases with steps | Skip all activity boards, log: `SKIP: activity boards -- no UCs with steps` |
| No BusinessProcesses | Skip all process boards, log: `SKIP: process boards -- no BPs in graph` |
| Individual board generation fails | Log error, continue with next board, report failures at end |
| `{$boards_dir}/` dir missing | Create it automatically |

---

## Command: `/graph_publish boards-link`

Add links to generated Excalidraw boards inside the corresponding Docmost pages. This command reads the boards manifest and the page manifest, determines which board is relevant for each page, and appends a diagram link section to each Docmost page.

### Pre-flight Checks

1. **Manifest exists?** Read `.docmost-sync.json`.
   - If missing -> `ERROR: No manifest found. Run /graph_publish docmost first.`
2. **Boards section exists?** Check `manifest.boards`.
   - If missing or empty -> `ERROR: No boards generated. Run /graph_publish boards first.`
3. **Docmost MCP available?** Call `mcp__docmost__list_spaces`.
   - If fails -> `ERROR: Docmost MCP not available.`

### Workflow

```
Step 1: Load manifest     Step 2: Map pages         Step 3: Update pages      Step 4: Report
── boards + pages ──── -> ── to boards ──────── ->  ── append link ──────── -> ── summary ──
```

### Step 1: Load Manifest

Read `.docmost-sync.json` and extract:
- `pages` -- map of page keys to `{page_id, source_type, source_id}`
- `boards` -- map of board keys to `{file}`

### Step 2: Determine Page-to-Board Mapping

For each page in `manifest.pages`, determine the relevant board file based on `source_type` and `source_id`:

| Page source_type | Board key | Board file | Link label |
|-----------------|-----------|------------|------------|
| `entity` | `domain-model` | `boards/domain-model.excalidraw` | Domain Model |
| `uc` | `activity-{source_id}` | `boards/activity-{source_id}.excalidraw` | Activity Diagram: {source_id} |
| `uc-index` | `context-map` | `boards/context-map.excalidraw` | Context Map |
| `domain-model` | `domain-model` | `boards/domain-model.excalidraw` | Domain Model |
| `context-map` | `context-map` | `boards/context-map.excalidraw` | Context Map |
| `traceability` | `context-map` | `boards/context-map.excalidraw` | Context Map |
| `form` | `domain-model` | `boards/domain-model.excalidraw` | Domain Model |
| `roles` | `context-map` | `boards/context-map.excalidraw` | Context Map |

Additionally, for section pages (Архитектура, Domain Model, Use Cases, etc.):

| Section page | Board key | Board file |
|-------------|-----------|------------|
| Архитектура | `context-map` | `boards/context-map.excalidraw` |
| Domain Model | `domain-model` | `boards/domain-model.excalidraw` |
| Use Cases | `context-map` | `boards/context-map.excalidraw` |

**Board existence check:** Before mapping, verify the board key exists in `manifest.boards`. If the board was skipped during generation (e.g., no activity steps for a UC), skip linking for that page and log: `SKIP link: {page_key} -- board {board_key} not generated`.

### Step 3: Update Docmost Pages

For each mapped page:

1. Fetch current page content via `mcp__docmost__get_page(pageId: page_id)`.

2. Check if the page already has a diagram link section (search for `<!-- excalidraw-link -->`).
   - If present, **replace** the existing link section.
   - If absent, **append** the link section at the end.

3. The link section format:

```markdown

<!-- excalidraw-link -->
---
📊 **Диаграмма:** `boards/{board_filename}.excalidraw`
<!-- /excalidraw-link -->
```

Where `{board_filename}` is the filename without path (e.g., `domain-model`, `activity-UC-101`, `process-BP-001`).

For UC pages that also have a related BA process board, append both links:

```markdown

<!-- excalidraw-link -->
---
📊 **Диаграмма:** `boards/activity-{UC-ID}.excalidraw`
<!-- /excalidraw-link -->
```

4. Update the page via `mcp__docmost__update_page(pageId: page_id, content: updated_content)`.

### Step 4: Report

```
Встраивание ссылок на борды завершено:
- Обновлено: {updated_count} страниц
- Пропущено: {skipped_count} (борд не сгенерирован)
- Уже со ссылкой: {replaced_count} (ссылка обновлена)
- Manifest: .docmost-sync.json без изменений
```

### Update Pace

Process pages sequentially. For each page:
1. GET current content
2. Modify content (append or replace link section)
3. PUT updated content

This avoids race conditions with Docmost API.

### Error Handling for Boards-Link

| Situation | Action |
|-----------|--------|
| Manifest missing | `ERROR: No manifest. Run /graph_publish docmost first.` |
| Boards section missing | `ERROR: No boards. Run /graph_publish boards first.` |
| Docmost MCP unavailable | `ERROR: Docmost MCP not available.` |
| Page not found in Docmost (404) | Log: `WARN: Page {page_key} (id: {page_id}) not found in Docmost. Skipping.` |
| Board file not in manifest | Skip linking, log: `SKIP link: {page_key} -- board not generated` |
| Page update fails | Log error, continue with next page, report failures at end |

---

## Command: `/graph_publish full`

Complete publishing pipeline: Docmost pages + Excalidraw boards + board links. Runs all three stages sequentially and produces a combined summary report.

### Pre-flight Checks

Run all pre-flight checks once at the start (before any step):

1. **Docmost MCP available?** Call `mcp__docmost__list_spaces`.
2. **Neo4j available?** Call `mcp__neo4j__read-cypher` with `RETURN 1`.
3. **Graph has data?** Query node counts by label.

If any check fails, abort the entire pipeline with the corresponding error message. Do not proceed to partial execution.

### Workflow

```
Step 1: Docmost            Step 2: Boards             Step 3: Links              Step 4: Report
── markdown → pages ── ->  ── graph → .excalidraw ── -> ── links → pages ──── -> ── summary ──
```

### Step 1: Publish Docmost Pages

Execute the full `/graph_publish docmost` logic:
- Initialize or load manifest
- Create section pages
- Generate markdown from graph and publish all pages
- Save manifest

Capture results:
- `docmost_created` -- number of pages created
- `docmost_updated` -- number of pages updated
- `docmost_skipped` -- number of pages skipped (unchanged)

### Step 2: Generate Excalidraw Boards

Execute the full `/graph_publish boards` logic:
- Catalog all diagram sources from graph
- Generate domain-model, context-map, activity, and process boards
- Track boards in manifest

Capture results:
- `boards_generated` -- number of boards created
- `boards_skipped` -- number skipped (no steps/data)
- `boards_total_elements` -- total Excalidraw elements across all boards

### Step 3: Embed Board Links

Execute the full `/graph_publish boards-link` logic:
- Map pages to boards
- Append diagram link sections to Docmost pages
- Update pages via Docmost MCP

Capture results:
- `links_added` -- number of pages updated with links
- `links_skipped` -- number of pages skipped (board not available)
- `links_replaced` -- number of existing links updated

### Step 4: Combined Summary Report

```
═══════════════════════════════════════════
  /graph_publish full -- Полная публикация
═══════════════════════════════════════════

📄 Docmost (Step 1):
   Создано:    {docmost_created} страниц
   Обновлено:  {docmost_updated} страниц
   Пропущено:  {docmost_skipped} (без изменений)

📊 Excalidraw Boards (Step 2):
   Сгенерировано: {boards_generated} бордов
   Пропущено:     {boards_skipped} (нет данных)
   Элементов:     {boards_total_elements}
   Директория:    {$boards_dir}/

🔗 Board Links (Step 3):
   Добавлено:  {links_added} ссылок
   Обновлено:  {links_replaced} ссылок
   Пропущено:  {links_skipped} (борд отсутствует)

───────────────────────────────────────────
Итого: {docmost_created + docmost_updated} страниц в Docmost,
       {boards_generated} бордов в {$boards_dir}/,
       {links_added + links_replaced} ссылок встроено.
Manifest: .docmost-sync.json обновлён.
═══════════════════════════════════════════
```

### Step Failure Handling

If a step fails partway through:

| Failed Step | Behavior |
|-------------|----------|
| Step 1 (docmost) fails | Abort pipeline. Report partial results from Step 1. Do not proceed to Steps 2-3. |
| Step 2 (boards) fails partially | Continue with successfully generated boards. Proceed to Step 3 with available boards. Report partial failures. |
| Step 3 (boards-link) fails partially | Continue linking remaining pages. Report partial failures in summary. |

In all cases, save the manifest with whatever state was achieved before the failure. This ensures the next run of `/graph_publish full` or any incremental command can pick up where it left off.

---

## Integration with Other Skills

### After `/graph_import`

After importing data into the graph, suggest:
```
Граф обновлён. Опубликовать в Docmost?
-> /graph_publish docmost
```

### After `/graph_render`

If a user renders an artifact and the manifest exists, suggest incremental sync:
```
Страница сгенерирована. Обновить в Docmost?
-> /graph_publish docmost-incremental
```

### After graph edits (any `write-cypher`)

When another graph skill modifies nodes, suggest incremental sync:
```
Граф изменён ({N} узлов). Синхронизировать с Docmost?
-> /graph_publish docmost-incremental
```
