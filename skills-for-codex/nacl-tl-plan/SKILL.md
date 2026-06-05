---
name: nacl-tl-plan
description: |
  Create NaCl TL implementation plans from graph SA specifications, including
  waves, backend and frontend tasks, technical tasks, API contracts, and TL
  tracking files. Use when planning implementation from graph scope, generating
  tasks, or when the user says `/nacl-tl-plan`.
---

# NaCl TL Plan For Codex

Read `../nacl-tl-core/SKILL.md` and `../nacl-tl-core/references/tl-codex-contract.md` before executing this workflow.

Planning creates implementation artifacts from SA graph data. Read
`../nacl-core/SKILL.md` and `../nacl-tl-core/SKILL.md` first.

## Workflow

1. Resolve planning scope: full graph, module, use case list, feature request,
   or wave start.
2. Check that SA graph data exists and has enough module, use case, entity, form,
   and dependency context.
3. **External Contracts Gate** (W6 consumer-side, primary-owner exception):
   for every UC in scope, refuse to generate tasks when the UC references an
   external provider/protocol whose `.tl/external-contracts/<slug>.md` is
   absent on disk OR has empty required sections. See **External Contracts
   Gate** below.
4. Build an execution wave plan from dependencies and priorities.
5. Present the planned files, graph writes, and wave structure.
6. Stop for confirmation before writing `.tl/` files or graph TL nodes.
7. Generate self-sufficient task files, API contracts, master plan, status, and
   changelog entries from templates.
8. Verify file structure and graph task counts when possible.

## External Contracts Gate

This is a consumer-side read of the artifact written by `nacl-sa-architect`
during its External Contracts phase (W6 plan brief; declared primary-owner
exception). Strict-only — no inline `--skip-external-contract` flag, no
`gate_mode: legacy`, no `project_kind: prototype` carve-out.

### Why this gate exists

13 of ~60 postmortem signals across two NaCl projects were external-API or
wire-protocol gaps (kie.ai in both projects, TUS upload, base_url
divergence, reverse-proxy URL scheme, ffmpeg/ffprobe runtime — see
`docs/retrospectives/project-beta-runtime-baseline.md`). Local tests passed;
the product did not work. `nacl-tl-sync`'s Wire-Evidence Gate (W2) already
downgrades sync to `UNVERIFIED` when wire-evidence is absent. W6 makes the
artifact concrete upstream so the gate has something to point at.

### Steps

1. **Discover.** For every UC in scope, query the graph:

   ```cypher
   MATCH (uc:UseCase) WHERE uc.id IN $uc_ids
   OPTIONAL MATCH (uc)-[:REQUIRES_EXTERNAL]->(ec:ExternalContract)
   OPTIONAL MATCH (m:Module)-[:CONTAINS_UC]->(uc)
   OPTIONAL MATCH (m)-[:DEPENDS_ON_EXTERNAL]->(mec:ExternalContract)
   RETURN uc.id AS uc_id,
          collect(DISTINCT {id: ec.id, name: ec.name, kind: ec.kind,
                            file_path: ec.file_path}) AS uc_direct,
          collect(DISTINCT {id: mec.id, name: mec.name, kind: mec.kind,
                            file_path: mec.file_path}) AS via_module
   ```

   The union of `uc_direct` and `via_module` is the set of external
   contracts the UC's tasks must reference.

2. **Existence check.** For each contract row, the file at
   `ec.file_path` must exist on disk.
   - Absent → record `external-contract-missing` for `(uc_id, contract_id)`.

3. **Stub check.** For each contract row, the file's required sections
   must be filled with non-stub content. Required sections are 1–8 and 10–11
   of `.tl/external-contracts/_template.md`. Section 9 (Model namespace) is
   required when `ec.kind == 'provider'`. Section 7 (File URL reachability)
   must be filled OR explicitly marked `N/A — no file URLs`.
   - Any required section missing or "TBD" → record
     `external-contract-stub` for `(uc_id, contract_id, missing_sections)`.

4. **Refuse.** If any violation was recorded, surface every violation,
   refuse to write any TL graph node, any `.tl/tasks/*` file, or any
   `.tl/status.json` / `.tl/master-plan.md` / `.tl/changelog.md` entry.
   Emit:

   - `Status: BLOCKED` workflow detail `external-contract-missing` (when
     any file is absent), OR
   - `Status: BLOCKED` workflow detail `external-contract-stub` (when all
     files exist but at least one has missing required sections).

5. **Remedy.** Either complete the contract via
   `/nacl-sa-architect` External Contracts phase, OR file a signed
   exception under the W4 schema covering every `(uc_id, contract_id)`
   tuple. There is no inline override.

### Example logic

```text
violations = []
for uc in scope:
  for contract in graph_query(uc.id):
    if not file_exists(contract.file_path):
      violations.append((uc, contract, "external-contract-missing"))
      continue
    missing = sections_unfilled(contract.file_path, contract.kind)
    if missing:
      violations.append((uc, contract, "external-contract-stub", missing))
if violations:
  report_every(violations)
  return Status.BLOCKED  # workflow detail per most-severe violation kind
```

### Worked example — UC-300 referencing kie.ai

- Graph: `UC-300 -[:REQUIRES_EXTERNAL]-> (ExternalContract {id: 'ext-kie',
  name: 'kie.ai', kind: 'provider', file_path:
  '.tl/external-contracts/kie.md'})`.
- File present, all required sections filled → gate PASSES; UC-300 tasks
  generated.
- File absent → `Status: BLOCKED workflow-detail external-contract-missing`;
  remedy: `/nacl-sa-architect` External Contracts phase OR W4 signed
  exception.
- File present, Section 9 (Model namespace) is "TBD" → `Status: BLOCKED
  workflow-detail external-contract-stub`; remedy: complete Section 9 OR W4
  signed exception.

## Source-Parity Requirements

- Use `graph-infra/schema/tl-schema.cypher` and
  `graph-infra/queries/tl-queries.cypher` as the source for TL labels,
  relationships, properties, and named query expectations.
- Preserve the SA-to-TL handoff: each generated `Task` must trace back from a
  `UseCase -[:GENERATES]-> Task` edge when graph writes are in scope.
- Preserve `Task`, `Wave`, and `APIEndpoint` creation semantics, including
  `IN_WAVE`, `DEPENDS_ON`, `IMPLEMENTS`, `CONSUMES`, and `PRODUCES`.
- Re-planning is idempotent and incremental by default (full overwrite only on
  explicit `--overwrite`). When Task/Wave nodes already exist, detect the narrow
  changed set — UCs where `coalesce(uc.spec_version,0) > coalesce(t.planned_from_version,-1)`,
  UCs a `FeatureRequest -[:INCLUDES_UC {kind:'modified'}]->` flags, or UCs/Tasks
  carrying `review_status='stale'` — and regenerate only those, leaving other UCs'
  tasks and dev state untouched. `MERGE` Task nodes by stable id (`UC###-BE/FE`):
  no duplicates. On each regen, set `Task.planned_from_version = uc.spec_version`
  and clear `review_status`/`stale_*` on the Task and its source UC (the only
  sanctioned way a node leaves `stale`).
- Resolve `--feature FR-NNN` scope from the graph (`(:FeatureRequest)-[:INCLUDES_UC]->`,
  with `kind` splitting new vs modified), falling back to the markdown file only
  if the FR node is absent.
- Read `ExternalContract` graph nodes and `REQUIRES_EXTERNAL` /
  `DEPENDS_ON_EXTERNAL` edges to drive the External Contracts Gate.
- Write `.tl/tasks/<TASK_ID>/` files, `.tl/master-plan.md`, `.tl/status.json`,
  or graph nodes only after a presented plan, explicit user confirmation,
  and a passing External Contracts Gate.
- After any confirmed write, read back the generated task files and graph nodes;
  if read-back cannot run, report `Status: UNVERIFIED` or `Status: BLOCKED`.
- In fallback-only mode, do not claim graph completeness or SA coverage.

## Capabilities

### May Do

- Read SA graph context for planning.
- Generate `.tl/tasks/`, `.tl/master-plan.md`, `.tl/status.json`, and related
  planning artifacts.
- Create TL Wave and Task graph nodes when confirmed and graph tooling exists.
- Preserve self-sufficient task file contracts for downstream dev skills.

### Must Not Do

- Plan from incomplete SA graph data without reporting the gap.
- Write files or graph nodes without confirmation.
- Leave task files dependent on external SA docs for required implementation
  context.
- Modify root-level source skill folders.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- File generation requires writable workspace access and confirmation.
- Feature request scope requires readable feature request artifacts.
- Validation requires access to generated files and optional graph readback.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when SA graph data, templates, permissions, or confirmation are
  missing.
- Use `BLOCKED` workflow detail `external-contract-missing` when the External
  Contracts Gate fails because a referenced `.tl/external-contracts/<slug>.md`
  is absent on disk.
- Use `BLOCKED` workflow detail `external-contract-stub` when the External
  Contracts Gate fails because a referenced file exists but has empty or
  "TBD" required sections.
- Use `FAILED` when generated artifacts violate required structure.
- Use `PARTIALLY_VERIFIED` when files are generated but graph readback is
  unavailable, or the reverse.
- Use `NOT_RUN` for dry-run writes.
- Use `UNVERIFIED` when dependency ordering or generated scope cannot be checked.

## Source Comparison

- Source Claude skill path: `../../nacl-tl-plan/SKILL.md`

### Preserved Methodology

- Graph-based planning from SA specifications.
- Wave planning by dependencies and priority.
- Self-sufficient backend, frontend, technical, and API contract task files.
- TL graph Task and Wave awareness.

### Removed Claude Mechanics

- Guaranteed runtime-specific graph tool names.
- Source status labels outside the closed vocabulary.
- Self-referential old/new comparison wording.
- Model routing fields.

### Codex Replacement Behavior

- Treat graph and file writes as conditional and confirmed.
- Use TL core templates as artifact contracts.
- Verify generated artifacts when possible.
- Report scope or dependency uncertainty explicitly.
