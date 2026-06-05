---
name: nacl-core
description: |
  Shared NaCl conventions for Codex-adapted skills: graph configuration,
  Neo4j tool assumptions, schema locations, ID conventions, Excalidraw board
  conventions, confirmation gates, and verification vocabulary. Use when a
  Codex NaCl skill needs common graph or workflow rules. Also use when the user
  refers to `nacl-core`.
---

# NaCl Core For Codex

This skill is a shared reference for Codex-adapted NaCl skills. It is not a
user-facing workflow skill.

## Core Rules

- Preserve graph-first BA/SA methodology and TL lifecycle contracts.
- Read project `config.yaml` before graph-aware work when file access is
  available.
- Use only statuses from `../references/verification-vocabulary.md`.
- Honour the evidence taxonomy in `../references/verification-evidence.md`
  whenever a skill writes a terminal `Task.status` to the graph.
- Apply confirmation gates from `../references/migration-rules.md`.
- Do not select or constrain the runtime model.

## Graph Configuration

Resolve graph settings from the current project's `config.yaml` when file access
is available:

| Data | Source priority |
|---|---|
| Neo4j Bolt port | `graph.neo4j_bolt_port` > fallback `3587` |
| Neo4j HTTP port | `graph.neo4j_http_port` > fallback `3574` |
| Neo4j password | `graph.neo4j_password` > fallback `"neo4j_graph_dev"` |
| Boards directory | `graph.boards_dir` > fallback `"graph-infra/boards"` |
| Container prefix | `graph.container_prefix` > `project.name` > fallback `"graph"` |

Connection strings are for user-facing diagnostics only. Actual graph access is
allowed only through graph tools available in the current Codex environment.

## Schema And Query Locations

- BA schema: `graph-infra/schema/ba-schema.cypher`
- SA schema: `graph-infra/schema/sa-schema.cypher`
- TL schema: `graph-infra/schema/tl-schema.cypher`
- Queries: `graph-infra/queries/`

## ID Conventions (selected)

Allocate ids by scanning the existing max suffix and incrementing. Provenance and
change-tracking ids:

- `DEC-NNN` — `:Decision` node (graph-native rationale; global sequential, like
  `ADR-NNN`). Written by `nacl-sa-feature`, `nacl-tl-fix` (L2/L3), and
  `nacl-sa-finalize`. A `:Decision` is NOT a `Requirement` — keep it a distinct
  label so it does not pollute the L3 requirement check or the planner.
- Change-tracking properties (no new ids): `UseCase.spec_version`,
  `Task.planned_from_version`, and `review_status`/`stale_reason`/`stale_since`/
  `stale_origin` on snapshot-bearing nodes — read with
  `coalesce(n.review_status,'current')`.
- Screen state machine ids (written by `nacl-sa-ui state-machine`):
  `SCR-{PascalName}` (`:Screen`), `SCRST-{Screen}-{State}` (`:ScreenState`),
  `SCREV-{Screen}-{Event}` (`:ScreenEvent`), `SCRTR-{Screen}-NNN` (reified
  `:Transition`, per-screen sequential), `SCREF-{Screen}-NNN` (`:ScreenEffect`,
  per-screen sequential), `ANEV-{Name}` (`:AnalyticsEvent`). `{Screen}` is the
  PascalName part of the Screen id without the `SCR-` prefix.

If these files are unavailable, report:

```text
Status: BLOCKED
Reason: graph schema or query files are unavailable in the current workspace
```

## Capabilities

### May Do

- Provide shared graph, schema, board, and verification conventions.
- Read project configuration and schema files when file access is available.
- Explain which graph tools a downstream skill needs.

### Must Not Do

- Modify graph data directly.
- Modify project files.
- Select or constrain the runtime model.
- Claim graph access exists without checking tool availability.

### Conditional Tools And Actions

- File reads are conditional on workspace access.
- Graph reads or writes are conditional on available graph tooling.
- Board file operations are conditional on available filesystem permissions.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when required files, tools, or permissions are unavailable.
- Use `UNVERIFIED` when conventions cannot be checked against the workspace.

## Source Comparison

- Source Claude skill path: `../../nacl-core/SKILL.md`

### Preserved Methodology

- Graph-first shared conventions.
- Config-driven graph defaults.
- Schema and query location awareness.
- Excalidraw board conventions.

### Removed Claude Mechanics

- Direct assumptions about specific MCP tool availability.
- Source framework wording as runtime instruction.
- Non-Codex frontmatter shape.

### Codex Replacement Behavior

- Treat graph and file access as conditional capabilities.
- Use closed verification vocabulary.
- Keep this skill as shared guidance, not a direct workflow.
