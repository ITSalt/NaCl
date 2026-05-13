---
name: nacl-sa-uc
description: |
  Create and detail NaCl use cases in the SA graph from BA automation scope:
  registry, activity steps, forms, form fields, mappings, and requirements.
  Use when creating UC stories, detailing a UC, listing UCs, or for
  compatibility with `/nacl-sa-uc`.
---

# NaCl SA UC For Codex

Create and detail use cases in the graph. The graph is the SA artifact; Russian
is the default language for user-facing SA descriptions unless the user
explicitly requests another supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Commands:

- `stories`: create a UC registry from BA `WorkflowStep` nodes marked for
  automation and not yet connected by `AUTOMATES_AS`.
- `detail <UC-ID>`: detail one use case with activity steps, forms, form
  fields, mappings, and requirements.
- `list`: read-only UC registry view with detail coverage.

`stories` flow:

1. Read uncovered automated workflow steps, existing modules, existing roles,
   and existing UC ranges.
2. Propose UC candidates, module placement, primary actor, priority, and
   BA-to-SA `AUTOMATES_AS` edges.
3. Stop for explicit confirmation.
4. Write `UseCase`, `CONTAINS_UC`, `AUTOMATES_AS`, and optional `ACTOR` edges.
5. Read back created UCs and report status.

`detail` flow:

1. Load UC, actor, module, BA workflow context, BA rules, related BA entities,
   realized domain entities, and existing detail counts.
2. If detail already exists, show counts and stop for confirmation before
   updating.
3. Propose activity steps, alternative flows, and form references. Stop before
   writing `ActivityStep` nodes and `HAS_STEP` edges.
4. Propose forms and fields. Every data-bearing `FormField` must map to a
   `DomainAttribute`; display and action fields must be categorized explicitly.
   Stop before writing `Form`, `FormField`, `USES_FORM`, `HAS_FIELD`, and
   `MAPS_TO`.
5. Propose requirements derived from BA rules, validation needs, and behavior.
   Stop before writing `Requirement`, `HAS_REQUIREMENT`, and `IMPLEMENTED_BY`.
6. Verify the full UC subgraph, including steps, forms, mapped data fields,
   requirements, actors, and BA traceability.

Use SA id conventions from the graph or schema: `UC-NNN`, `{UC}-ASNN`,
`FORM-*`, `{FORM}-FNN`, and `RQ-NNN`.

## Graph Contract

`stories` must derive candidates from
`BusinessProcess -[:HAS_STEP]-> WorkflowStep` records where
`WorkflowStep.stereotype='Автоматизируется'` and no
`WorkflowStep -[:AUTOMATES_AS]-> UseCase` edge exists. Existing modules, UC
ranges, and roles must be read before proposing ids or actors.

`detail` must preserve the BA-to-SA chain:
`WorkflowStep -[:AUTOMATES_AS]-> UseCase -[:USES_FORM]-> Form -[:HAS_FIELD]-> FormField -[:MAPS_TO]-> DomainAttribute`.
BA rules become requirements through `BusinessRule -[:IMPLEMENTED_BY]-> Requirement`
and `UseCase -[:HAS_REQUIREMENT]-> Requirement`.

Canonical writes are `UseCase`, `ActivityStep`, `Form`, `FormField`,
`Requirement`, `CONTAINS_UC`, `AUTOMATES_AS`, `ACTOR`, `DEPENDS_ON`,
`HAS_STEP`, `USES_FORM`, `HAS_FIELD`, `MAPS_TO`, `HAS_REQUIREMENT`, and
`IMPLEMENTED_BY`. Before each write batch, show the proposed ids, properties,
source BA evidence, and relationship targets; after writes, read back with
`sa_uc_full_context` and form-domain mapping checks.

## Capabilities

### May Do

- Read BA automation scope, roles, entities, rules, and existing SA graph data.
- Propose UC registry entries and detailed UC subgraphs.
- Write UC, activity, form, field, mapping, requirement, actor, and traceability
  data after confirmation.
- Verify data-field `MAPS_TO` completeness for detailed UCs.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without confirmation.
- Create data-bearing fields without a domain attribute mapping unless the user
  explicitly marks them as non-input or defers the gap.
- Treat markdown files as the SA source of truth.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema and query inspection require readable project files.
- Detailing may be `BLOCKED` when the domain structure or role mapping needed
  for traceability is absent.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, UC identity, BA source data, domain
  attributes, role mappings, or confirmation is missing.
- Use `PARTIALLY_VERIFIED` when the UC subgraph is written but only part of the
  traceability read-back runs.
- Use `UNVERIFIED` when UC completeness cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-uc/SKILL.md`

### Preserved Methodology

- `stories`, `detail`, and `list` commands.
- Russian SA artifact language by default.
- BA automation scope to UseCase registry.
- Activity, form, field, requirement, and actor subgraph detailing.
- Critical `FormField` to `DomainAttribute` traceability.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Slash-command-only invocation wording.
- Source runtime assumptions as active instructions.

### Codex Replacement Behavior

- Make graph access conditional and explicit.
- Stop at each write boundary for confirmation.
- Use closed verification vocabulary for UC read-back.
- Keep graph data as source of truth.
