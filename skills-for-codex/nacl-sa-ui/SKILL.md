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
4. **For every Form whose UseCase has `actor != SYSTEM`, capture each
   inbound nav-action site as a `HAS_INBOUND_ACTION` edge from the source
   Component to the Form (see "Form Spec Template" and "Graph Rule — UI
   Reachability" below).**
5. Verify routes point to existing forms or use cases and role access matches UC
   actors. Run the reachability query
   (`nacl-sa-ui/references/reachability.cypher` § 4 — `ui_reachability_blockers`)
   and refuse to leave this phase while any actor-triggered UC has no
   inbound nav-action from a reachable Component.

Do not introduce labels that are absent from the SA schema. Navigation is a
component pattern unless the project schema explicitly defines another label.

## Form Spec Template

Every Form node carries these required sections. The first three are
created by upstream skills; the fourth — Nav Actions — is the W7
addition and is required for any Form whose UseCase has
`actor != SYSTEM`.

| Section | Status | Edge | Owner |
|---------|--------|------|-------|
| Fields | required | `HAS_FIELD` | `nacl-sa-uc detail` |
| Domain mapping | required | `MAPS_TO` | `nacl-sa-uc detail` / `verify` here |
| Used-In Components | required | `USED_IN` | `components` here |
| **Nav Actions** | **required if actor != SYSTEM** | **`HAS_INBOUND_ACTION`** | **`navigation` here, Phase 3.3** |

### Nav Actions — required for actor-triggered UCs

For every Form whose UseCase has `actor != SYSTEM`, enumerate the
inbound action sites that expose it to the user: which screen, nav
item, global menu point, or sibling-page CTA carries the user-visible
affordance that opens this Form.

Each affordance is one `HAS_INBOUND_ACTION` edge from the source
`Component` to the `Form`, with properties:

- `affordance` — short kind label (`primary CTA`, `menu item`,
  `row-link`, `empty-state CTA`, etc.).
- `label` — exact visible text on the affordance (e.g. `New upload`).
- `updated` — write timestamp.

#### Worked example — transcriber missing-upload-button

Transcriber UC-100 ("Upload audio") had a complete Form
(`FORM-Upload`) with fields, domain mappings, and `USED_IN` edges to a
rendering Component for `/upload`. Yet on production the catalog page
at `/catalog` had no upload button: the only way to reach `/upload`
was to type the URL. The Form spec was page-local and silent on
inbound nav-actions, so the reviewer could not see the missing button
from a diff.

The methodology fix: UC-100's Form spec must declare every inbound
affordance. For UC-100 the captured edges would be:

```
HAS_INBOUND_ACTION:
  - CMP-CatalogPage   →  FORM-Upload   affordance="primary CTA"        label="New upload"
  - CMP-NavSidebar    →  FORM-Upload   affordance="menu item"          label="Upload"
  - CMP-EmptyState    →  FORM-Upload   affordance="empty-state CTA"    label="Upload your first audio"
```

With those edges in the graph, the rule below would have caught the
missing button before the page shipped.

### Graph Rule — UI Reachability

An actor-triggered UseCase (actor != SYSTEM) without a
`HAS_INBOUND_ACTION` edge from a reachable Component is a blocker. A
reachable Component is one transitively reachable from any navigation
root via `parent_menu` / route mounting.

The Cypher template for the blocker query and the reachable-component
traversal lives at `nacl-sa-ui/references/reachability.cypher`. The
template publishes two queries:

1. `ui_reachability_blockers` — returns every (UC, Form) pair where
   actor != SYSTEM and the Form has no inbound `HAS_INBOUND_ACTION`
   from a reachable Component. Each row carries
   `reason ∈ { 'no-form', 'no-inbound-action', 'unreachable-component' }`.
2. `reachable_components_form_a` / `_form_b` — returns the transitive
   set of Components reachable from any navigation root.

This skill (sa-ui, Codex flavor) declares the rule and ships the
Cypher template. Consumers are out of scope here and unchanged by
this wave:

- `nacl-sa-validate` runs `ui_reachability_blockers` as an internal
  validator check; non-empty result forces validator `BLOCKED`.
  Override requires a signed exception (W4).
- `nacl-tl-review` (primary-owner exception declared in W7 scope_in)
  runs the same query scoped to the affected UCs and refuses
  APPROVED when any affected UC appears in the result.

Exemption flags recognised by sa-validate (consumer-side, not
implemented here):

- `UseCase.actor = 'SYSTEM'` — excluded by the query.
- `UseCase.has_ui = false` — no Form; rule does not apply.
- `UseCase.entrypoint_type IN ['deep-link-only', 'embed-only']` —
  intentional URL-only access (invitation links, third-party iframes);
  each requires a signed exception.

## Graph Contract

Use only schema-supported UI records: `Form`, `FormField`, `Component`,
`Form -[:HAS_FIELD]-> FormField`, `FormField -[:MAPS_TO]-> DomainAttribute`,
`Component -[:USED_IN]-> Form`,
`Component -[:HAS_INBOUND_ACTION { affordance, label, updated }]-> Form`,
and existing UC/form/role relationships. Do not create `Screen`,
`NavigationRoute`, or other unsupported labels. The
`HAS_INBOUND_ACTION` edge is the W7 addition required for actor !=
SYSTEM forms; see "Form Spec Template" below.

`verify` is read-only until the user confirms a repair. It must distinguish
input fields from display and action fields using `field_category`; missing
`field_category` should be reported as a validation metadata issue rather than
silently ignored.

`components` and `navigation` must show component ids, component types,
properties, route/menu metadata, linked forms, and role-access evidence before
writes. After confirmed writes, read back component usage and route targets, and
verify role access against `UseCase -[:ACTOR]-> SystemRole` where available.

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
