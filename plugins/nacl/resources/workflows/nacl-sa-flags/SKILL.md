---
name: nacl-sa-flags
description: |
  Audit and backfill SA validation exemption properties such as has_ui,
  system_only, shared, internal, and field_category. Use when validation reports
  missing exemption flags, after SA migration, after manual graph edits, or says
  `/nacl-sa-flags`.
---

# NaCl SA Flags For Codex

Manage validator metadata only. This skill fills or overrides exemption
properties used by validation checks; it does not change domain semantics,
relationships, or business properties.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before using this workflow.

## Workflow

Commands:

- `audit`: read-only count of missing exemption properties.
- `backfill-all --dry-run`: preview idempotent defaults.
- `backfill-all`: set missing defaults after confirmation.
- `backfill-all --detect-internal`: additionally mark likely internal
  attributes by conservative name patterns.
- `set-has-ui`, `set-system-only`, `set-shared`, `set-internal`,
  `set-field-category`: set one property on one node after confirmation.
- `set-batch`: apply user-curated overrides from a YAML or JSON file after
  reading and summarizing the planned changes.

Managed properties:

| Property | Node | Meaning |
|---|---|---|
| `has_ui` | `UseCase` | Whether a UC should have forms. |
| `system_only` | `SystemRole` | Whether a role intentionally has no BA role mapping. |
| `shared` | `DomainEntity` | Whether cross-module use is intentional. |
| `internal` | `DomainAttribute` | Whether a field can be omitted from UI mapping checks. |
| `field_category` | `FormField` | `input`, `display`, or `action`; only `input` must map to a domain attribute. |

Default backfill is conservative: missing `has_ui` is derived from `USES_FORM`;
missing `system_only`, `shared`, and `internal` default to `false`; missing
`field_category` defaults to `input`. Manual overrides are authoritative.

## Graph Contract

This skill writes only metadata properties on existing nodes:
`UseCase.has_ui`, `SystemRole.system_only`, `DomainEntity.shared`,
`DomainAttribute.internal`, and `FormField.field_category`. It must not create
or delete nodes, relationships, permissions, requirements, forms, fields, or
domain semantics.

Every mutating command has three steps: audit current values, show the exact
node ids and property deltas, then stop for confirmation. After confirmed
writes, rerun the audit or targeted read-back and report updated missing counts.

`set-batch` must reject ambiguous ids and unsupported properties. If a batch
file cannot be read or contains changes outside the managed property set, report
`Status: BLOCKED` and do not apply partial writes unless the user explicitly
approves a narrowed batch.

## Capabilities

### May Do

- Audit missing validation exemption properties.
- Preview and write idempotent metadata defaults after confirmation.
- Apply per-node and batch overrides after showing the delta.
- Recommend rerunning SA validation after metadata changes.

### Must Not Do

- Modify root-level `nacl-*` source folders.
- Create or delete graph nodes or relationships.
- Change business properties such as names, descriptions, data types, priority,
  permissions, or requirements.
- Infer project-specific semantics beyond conservative defaults.
- Select or constrain the runtime.

### Conditional Tools And Actions

- Audits require graph read tooling.
- Backfill and setters require graph write tooling and explicit confirmation.
- Batch overrides require file read access and must be summarized before writes.
- Follow-up validation requires validation tooling or graph read checks.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, batch file access, node identity, or
  confirmation is missing.
- Use `PARTIALLY_VERIFIED` when writes run but only some post-write audits can
  be checked.
- Use `UNVERIFIED` when metadata state cannot be checked against graph data.

## Source Comparison

- Source Claude skill path: `../../nacl-sa-flags/SKILL.md`

### Preserved Methodology

- Audit, dry-run, backfill, per-node setters, and batch override flows.
- Conservative default values for exemption properties.
- Metadata-only boundary.
- Integration with validation checks for L4 through L7 style coverage.

### Removed Claude Mechanics

- Runtime routing fields in frontmatter.
- Hard-coded graph tool availability.
- Source-environment tier labels.
- Slash-command-only invocation wording.

### Codex Replacement Behavior

- Treat graph access as conditional.
- Require confirmation before metadata writes.
- Summarize exact deltas before batch writes.
- Report audit and write verification with the closed vocabulary.
