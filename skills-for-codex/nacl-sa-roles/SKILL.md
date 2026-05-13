---
name: nacl-sa-roles
description: |
  Define NaCl system roles and permissions in the SA graph: import BA roles,
  create or modify roles, CRUD permissions, data scope, and UC actors. Use when
  defining roles, permissions, access matrix, BA role mapping, or says
  `/nacl-sa-roles`.
---

# NaCl SA Roles For Codex

Build and maintain system roles and permissions in the graph while preserving
BA-to-SA role traceability. User-facing SA artifact text is Russian by default
unless the user explicitly requests another supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Modes:

- `IMPORT_BA`: import `BusinessRole` nodes as `SystemRole` candidates with
  N:M `MAPPED_TO` edges.
- `CREATE`: create one new system role with permissions.
- `MODIFY`: adjust an existing role, mappings, permissions, or actors.
- `FULL`: build the complete role and permission structure.

Steps:

1. Pre-check: load `DomainEntity`, existing `SystemRole`, BA role mappings, and
   unmapped BA roles. Stop if domain entities are missing.
2. Identify roles: propose role names, descriptions, responsibilities, type, and
   BA mappings. Stop for confirmation before writing `SystemRole` nodes or
   `MAPPED_TO` edges.
3. CRUD permissions: propose role-by-entity permissions using BA interactions
   when available. Stop for confirmation before writing `HAS_PERMISSION` edges.
4. Data scope: define `all`, `own`, `department`, or `assigned` scope and human
   rules for restricted permissions. Stop before updates.
5. Workflow permissions: infer or propose `UseCase` to `SystemRole` `ACTOR`
   edges and status-transition authorization notes. Stop before writes.
6. Verify: read back role mappings, permissions, restricted scopes, and actor
   coverage. Report with the closed verification vocabulary.

Keep roles distinct by module or access level. Prefer a small role set; if the
proposal grows beyond seven roles, ask whether decomposition or role grouping
should be revisited.

## Graph Contract

Use `BusinessRole -[:MAPPED_TO]-> SystemRole` for BA-to-SA role traceability,
`SystemRole -[:HAS_PERMISSION {crud}]-> DomainEntity` for CRUD access, and
`UseCase -[:ACTOR]-> SystemRole` for UC actors. Do not collapse
`BusinessRole` and `SystemRole`; they are separate layers.

Permission CRUD strings must be explicit and limited to actual access such as
`C`, `R`, `U`, `D`, or combinations. Do not create `HAS_PERMISSION` edges for
no-access matrix cells. Restricted permissions must preserve data-scope notes
as properties or requirements only when the schema and user confirmation allow.

Before writes, show role ids, BA mappings, permission matrix, data-scope rules,
actor edges, and any infrastructure-only roles with `system_only` rationale.
After confirmed writes, read back mapped roles, permissions, actor coverage, and
unmapped BA roles before reporting success.

## Capabilities

### May Do

- Read BA roles, workflow participation, domain entities, use cases, and
  existing permissions.
- Propose N:M BA-to-SA role mappings.
- Write system roles, mappings, permissions, scopes, and actor edges after
  confirmation.
- Verify permission and actor coverage from the graph.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without confirmation.
- Create permissions for no-access pairs.
- Treat infrastructure roles as BA mapped unless the graph or user confirms it.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema checks require graph introspection or readable schema files.
- Complex status-transition rules may be recorded as requirement text only when
  graph schema support is unavailable.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when domain entities, graph tooling, role identity, BA source
  data for import, or confirmation is missing.
- Use `PARTIALLY_VERIFIED` when role writes succeed but actor or permission
  coverage cannot fully be read back.
- Use `UNVERIFIED` when role coverage cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-roles/SKILL.md`

### Preserved Methodology

- `IMPORT_BA`, `CREATE`, `MODIFY`, and `FULL` modes.
- N:M BA role to system role mapping.
- CRUD permission matrix and data scope constraints.
- UseCase actor coverage.
- Confirmation gates at each phase.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Slash-command-only invocation wording.
- Source runtime assumptions as active instructions.

### Codex Replacement Behavior

- Use graph tools only when available.
- Ask before role, permission, or actor writes.
- Mark infrastructure-only roles with explicit metadata instead of assuming BA
  coverage.
- Report verification through the closed vocabulary.
