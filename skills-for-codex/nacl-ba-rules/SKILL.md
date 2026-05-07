---
name: nacl-ba-rules
description: |
  Catalog NaCl business rules in the graph: constraints, calculations,
  invariants, authorization rules, and traceability. Use when extracting or
  adding BA rules or for compatibility with `/nacl-ba-rules`.
---

# NaCl BA Rules For Codex

Maintain the BA business-rule catalog in the graph. Rule artifacts remain
Russian by default unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`, and
`../references/verification-vocabulary.md` before executing the workflow.

## Operating Forms

| Form | Purpose |
|---|---|
| `full` | Scan graph data, classify candidate rules, trace them, and write a catalog. |
| `add` | Add one confirmed business rule. |

## Rule Types

| Type | Meaning |
|---|---|
| `constraint` | Restriction on data or process behavior. |
| `calculation` | Formula or computation rule. |
| `invariant` | Condition that must always hold. |
| `authorization` | Permission rule for a business action. |

## Workflow

1. Pre-check graph data for entities, attributes, workflow decisions, process
   conditions, and existing rules.
2. For `full`, extract candidates from graph context and present them for user
   confirmation.
3. Classify each confirmed rule and ask the user to approve classification.
4. Link rules to constrained entities, attributes, workflow steps, processes, or
   roles where graph evidence supports the link.
5. Generate `BRQ-NNN` IDs and write confirmed `BusinessRule` nodes and
   traceability relationships when graph write tools are available.
6. Query the graph to generate the catalog table and coverage notes.

Stop before classification, traceability, and graph writes unless the user has
confirmed the previous output.

## Rule Constraints

- Rules must have a name, type, formulation, source, and traceability target
  where available.
- Do not create duplicate rules with the same formulation and target.
- Candidate extraction can suggest rules, but the user confirms final wording.
- Rules belong in the graph, not in generated project files.

## Capabilities

### May Do

- Scan graph nodes and relationships for rule candidates.
- Propose rule type and traceability from graph context.
- Ask clarifying questions for ambiguous formulations.
- Write confirmed rule nodes and relationships when graph write tools are
  available.
- Generate a rule catalog from graph reads.

### Must Not Do

- Invent rules absent from graph evidence or user input.
- Write unconfirmed rule formulations.
- Duplicate existing rules.
- Modify project files.
- Claim catalog completeness without graph read evidence.

### Conditional Tools And Actions

- Candidate extraction requires graph read tools.
- Rule writes require graph write tools and explicit confirmation.
- Catalog generation requires graph read tools after writes.
- Single-rule addition requires a user-provided formulation.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, source nodes, rule formulation, or
  confirmation is missing.
- Use `PARTIALLY_VERIFIED` when some traceability links cannot be checked.
- Use `UNVERIFIED` when a proposed rule cannot be checked against graph context.
- Use `FAILED` with a reason when graph read-back contradicts confirmed rule
  writes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-rules/SKILL.md`

### Preserved Methodology

- Graph-sourced business-rule extraction.
- Rule classification and traceability.
- `BRQ-NNN` identifiers and catalog generation.
- User confirmation for formulation, type, and links.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool availability.
- Platform-specific execution wording.
- Unconditional catalog writes.

### Codex Replacement Behavior

- Treat reads, writes, and verification as conditional.
- Gate rule creation with explicit confirmation.
- Use closed verification statuses for missing or partial evidence.
- Keep slash command text as compatibility trigger text.
