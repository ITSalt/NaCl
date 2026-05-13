---
name: nacl-sa-domain
description: |
  Create or update the NaCl system-analysis domain model in the graph:
  DomainEntity, DomainAttribute, Enumeration, relationships, and BA-to-SA
  traceability. Use when importing BA entities, creating a domain entity,
  modifying attributes, building a module domain model, or compatibility with
  `/nacl-sa-domain`.
---

# NaCl SA Domain For Codex

Manage the SA domain model while preserving BA-to-SA traceability. SA artifacts
remain Russian by default unless the user explicitly requests another supported
output language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing the workflow.

## Modes

| Mode | Purpose |
|---|---|
| `IMPORT_BA` | Import uncovered BA business entities as domain candidates. |
| `CREATE` | Create one new domain entity interactively. |
| `MODIFY` | Modify an existing domain entity, attributes, relationships, or enumerations. |
| `FULL` | Build a complete module domain model. |

## Workflow

### Step 1: Discover Scope

Resolve mode and target module or entity. Read graph data only when graph tools
are available. If required source data is unavailable, report `BLOCKED` with the
reason.

### Step 2: Propose Domain Mapping

Map BA entities and attributes into SA entities, attributes, enumerations, and
relationships. Use English technical names for domain identifiers where the NaCl
methodology requires them, while keeping user-facing artifact descriptions in
Russian by default.

### Step 3: Confirm Mapping

Present proposed entities, attributes, enum values, relationships, module
ownership, and BA traceability. Stop and ask for explicit confirmation before
writing graph data.

### Step 4: Persist And Verify

When graph write tooling is available and the user confirms, write
`DomainEntity`, `DomainAttribute`, `Enumeration`, relationship, and traceability
records. Then read back the written records when possible and report status with
the closed vocabulary.

## Graph Contract

Use canonical SA labels only: `DomainEntity`, `DomainAttribute`, `Enumeration`,
and `EnumValue`. Use `Module -[:CONTAINS_ENTITY]-> DomainEntity`,
`DomainEntity -[:HAS_ATTRIBUTE]-> DomainAttribute`,
`DomainEntity -[:RELATES_TO {rel_type, cardinality}]-> DomainEntity`,
`DomainEntity -[:HAS_ENUM]-> Enumeration`, and
`Enumeration -[:HAS_VALUE]-> EnumValue`.

BA-to-SA traceability must use `BusinessEntity -[:REALIZED_AS]-> DomainEntity`
and `EntityAttribute -[:TYPED_AS]-> DomainAttribute`. A domain entity or
attribute created from BA data must identify its BA source before writes; if BA
data is unavailable for `IMPORT_BA` or `FULL`, report `BLOCKED`.

Before writes, present the module owner, entity ids, attribute ids and data
types, enum ids and values, relationship cardinalities, and traceability edges.
After confirmed writes, read back with `sa_domain_model`,
`sa_module_overview`, handoff entity coverage, or equivalent graph reads.

## Capabilities

### May Do

- Read BA and SA graph data when graph tools are available.
- Propose domain entities, attributes, relationships, and enumerations.
- Write SA domain graph data after explicit confirmation.
- Preserve BA-to-SA traceability edges.

### Must Not Do

- Write graph data without confirmation.
- Invent BA source facts not provided by the user or graph.
- Break BA/SA/TL artifact boundaries.
- Select or constrain the runtime model.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema inspection requires available schema files or graph introspection.
- File reads require workspace access.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, module data, BA source data, or confirmation
  is missing.
- Use `PARTIALLY_VERIFIED` when writes succeed but only some read-back checks are
  available.
- Use `UNVERIFIED` when the domain mapping cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-domain/SKILL.md`

### Preserved Methodology

- Four domain modes: `IMPORT_BA`, `CREATE`, `MODIFY`, `FULL`.
- Graph-first SA domain persistence.
- BA-to-SA traceability.
- Russian SA artifact language by default.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability as a guarantee.
- Source framework invocation assumptions.

### Codex Replacement Behavior

- Gate graph writes on both tool availability and user confirmation.
- Use explicit blocked and unverified reporting.
- Keep mode behavior concise and contract-focused for the pilot.
