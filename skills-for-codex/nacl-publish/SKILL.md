---
name: nacl-publish
description: |
  Publish NaCl graph-derived Markdown and board artifacts to external
  documentation targets. Use when publishing graph docs, syncing Docmost pages,
  generating or linking boards, previewing publish scope, or when the user says
  `/nacl-publish`.
---

# NaCl Publish For Codex

Publish is a graph-read and external-write workflow. Read `../nacl-core/SKILL.md`
and `../nacl-render/SKILL.md` before publishing.

## Workflow

1. Resolve graph, documentation target, space, board directory, and manifest
   configuration.
2. Preview the publish scope and changed pages or boards.
3. Stop for confirmation before external writes or board file edits.
4. **Run the pre-publish reconciliation gate** (see below). On any
   disagreement: refuse the publish.
5. Generate Markdown through render behavior and publish create/update actions
   through available documentation tooling.
6. Generate board files or link board references only when the required tooling
   and paths are available.
7. Update the publish manifest when file editing is available and confirmed.

## Pre-publish reconciliation

Publishing inconsistent state to Docmost makes drift visible to
stakeholders and harder to retract than an internal `.tl/` artifact.
Before any external write, compare the **live graph** against
`.tl/changelog.md` (and `.tl/release-status.json` when present).
Preview-only operations are exempt.

**Live graph reads only — no `.cypher` export fallback.** A stale
export would push out-of-date pages to Docmost; the W5 binding
forbids this fallback. If the graph container is unreachable, report
`Status: BLOCKED` with workflow detail `graph_unavailable` and refuse
the publish. Operators who must publish despite an unreachable graph
file a signed exception against gate `graph-stale` (W4 schema in
`.tl/exceptions/_template.yaml`); the exception does not re-enable
the export path.

**Cross-checks (publish subset):**

| Pair | Sources | Assertion |
|---|---|---|
| P-P1 | `.tl/changelog.md` released FR list vs graph `FeatureRequest` | every FR named in the latest changelog section exists as a `FeatureRequest` node in the live graph. |
| P-P2 | `.tl/changelog.md` released UC list vs graph `UseCase` | every UC named in the latest changelog section exists as a `UseCase` node. |
| P-P3 | `.tl/release-status.json.release_tag` vs graph `release_tag` | if the JSON tag is non-null, the live graph carries it on ≥1 `FeatureRequest` / `Task` node (assertion is informational when JSON is absent). |

A pair PASSES iff the assertion holds, or holds under an active
signed exception. Expired exceptions do not satisfy a pair.

**Refusal on disagreement:** report `Status: BLOCKED` with workflow
detail `publish-drift` and a per-pair delta. Do not write to
Docmost. Do not write boards. Resolution is to reconcile the
graph (run the relevant SA / TL skill) or file a `graph-stale`
exception.

**Reconciliation evidence:** on PASS, write
`.tl/reconciliation/<ISO-8601>-publish.json` per the schema at
`/Users/maxnikitin/projects/NaCl/.tl/reconciliation/_template.json`.
Required fields: `timestamp`, `intake_id` (or `null` for a
publish-only run), `sources_checked`, `deltas`,
`active_exceptions`, `expired_exceptions`, `terminal_status`.

## Capabilities

### May Do

- Read graph data for documentation rendering.
- Create or update external documentation pages when documentation tooling is
  available and confirmed.
- Generate board artifacts through available render behavior.
- Maintain a publish manifest with page and board mappings.
- Preview publish changes without writing.

### Must Not Do

- Write graph data.
- Publish externally without user confirmation.
- Assume documentation or board tooling exists.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads require available graph tooling.
- Documentation publishing requires available documentation connector tooling.
- Board file creation requires writable board paths.
- Manifest writes require workspace permissions and confirmation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph access, documentation tooling, target config, paths,
  or confirmation are missing.
- Use `FAILED` when a publish or board operation returns failing evidence.
- Use `PARTIALLY_VERIFIED` when some pages or boards publish but others cannot
  be checked.
- Use `NOT_RUN` for preview-only operations.
- Use `UNVERIFIED` when external target state cannot be read back.

## Source Comparison

- Source Claude skill path: `../../nacl-publish/SKILL.md`

### Preserved Methodology

- Graph-derived Markdown publishing.
- Board generation and linking workflow.
- Manifest-driven create/update behavior.
- Preview before external writes.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph and documentation tool names.
- Source status labels outside the closed vocabulary.
- Model routing fields.
- Assumed external connector availability.

### Codex Replacement Behavior

- Treat graph, documentation, and board tooling as conditional.
- Require confirmation before external writes.
- Use render skill behavior for Markdown generation.
- Report publish evidence with the closed verification vocabulary.
