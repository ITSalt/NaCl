---
name: nacl-sa-ui
description: |
  Design and verify NaCl UI architecture in the SA graph: form-domain mapping,
  component catalog, and navigation components. Use when verifying forms,
  creating UI components, defining navigation, or says `/nacl-sa-ui`.
---

# NaCl SA UI For Codex

Work with UI architecture as graph data: `Form`, `FormField`, `Component`, and
their relationships to use cases and domain attributes. Russian is the default
language for user-facing SA descriptions unless the user explicitly requests
another supported language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Commands:

- `verify [module]`: read forms and fields, then check that every input field
  has `MAPS_TO` a domain attribute.
- `components [module]`: identify repeated UI patterns and create reusable
  `Component` nodes with `USED_IN` edges.
- `navigation`: define menu, route, role access, ordering, and parent menu as
  navigation components.
- `full [module]`: run verify, components, and navigation in order.

`verify` flow:

1. Load forms, fields, linked use cases, modules, field categories, and existing
   domain mappings.
2. Report orphaned forms and unmapped input fields.
3. Propose fixes: add missing `MAPS_TO`, mark a field as `display` or `action`,
   or create a missing domain attribute through the domain skill.
4. Stop before any write; run only read-only checks unless the user confirms a
   fix path.

`components` flow:

1. Analyze forms and fields for repeated patterns such as tables, filters, form
   layouts, file upload blocks, status badges, and feedback areas.
2. Propose `Component` nodes with type, description, props, and affected forms.
3. Stop before writing `Component` nodes and `USED_IN` edges.
4. Read back component usage after confirmed writes.

`navigation` flow:

1. Read modules, use cases, roles, forms, and actor edges.
2. Propose menu hierarchy, routes, role access, order, and parent menu.
3. Store navigation as `Component` nodes with navigation properties when
   confirmed.
4. Verify routes point to existing forms or use cases and role access matches UC
   actors.

Do not introduce labels that are absent from the SA schema. Navigation is a
component pattern unless the project schema explicitly defines another label.

## Capabilities

### May Do

- Read forms, fields, use cases, roles, components, and domain mappings.
- Verify form-domain traceability and propose repairs.
- Create or update components and navigation components after confirmation.
- Preserve the trace chain from BA workflow step to UC, form field, domain
  attribute, and BA entity when available.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Write graph data without confirmation.
- Create UI labels or relationship types not supported by the schema.
- Treat display or action fields as data inputs unless the graph marks them so.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Graph reads and writes require available graph tooling.
- Schema checks require graph introspection or readable schema files.
- Domain repairs may require the domain skill or a confirmed direct graph write.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, schema, forms, domain attributes, role data,
  or confirmation is missing.
- Use `PARTIALLY_VERIFIED` when UI writes complete but only some mappings or
  route checks can be read back.
- Use `UNVERIFIED` when UI traceability cannot be checked against graph state.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-ui/SKILL.md`

### Preserved Methodology

- `verify`, `components`, `navigation`, and `full` commands.
- FormField to DomainAttribute mapping checks.
- Component catalog and `USED_IN` relationships.
- Navigation represented in graph data.
- Confirmation gates before writes.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Slash-command-only invocation wording.
- Source runtime assumptions as active instructions.

### Codex Replacement Behavior

- Treat graph and schema access as conditional.
- Use schema-supported UI graph shapes only.
- Stop for confirmation before component or mapping writes.
- Report validation through the closed vocabulary.
