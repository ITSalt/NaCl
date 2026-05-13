---
name: nacl-ba-glossary
description: |
  Build or update the NaCl BA glossary in the graph: terms, definitions,
  aliases, and links to defined BA nodes. Use when creating glossary terms,
  defining ubiquitous language, updating definitions, or for compatibility with
  `/nacl-ba-glossary`.
---

# NaCl BA Glossary For Codex

Maintain a graph-backed glossary for BA terminology. Glossary artifacts remain
Russian by default unless the user explicitly requests another supported output
language.

Read `../nacl-core/SKILL.md`, `../references/migration-rules.md`,
`../references/verification-vocabulary.md`, and
`../references/ba-codex-contract.md` before executing the workflow.

## Mandatory Graph Execution Contract

This is a graph writer. Apply the BA graph writer contract before glossary
writes: resolve configuration, inspect schema/query references, check graph
tooling, count existing `GlossaryTerm` records, load candidate source nodes, and
show the term, definition, alias, and source-link plan. If graph tools or source
nodes are missing, report `BLOCKED`.

Full rebuild is destructive and requires explicit confirmation before deleting
or replacing existing terms. After writes, read back term counts, `DEFINES`
links, `ALIAS_OF` links, and coverage evidence.

## Operating Forms

| Form | Purpose |
|---|---|
| `full` | Scan all named BA nodes and rebuild glossary terms after confirmation. |
| `incremental` | Add terms for BA nodes that are not yet defined. |

## Workflow

1. Check graph availability and count existing `GlossaryTerm` nodes.
2. For `full`, warn about replacing existing terms and stop for confirmation.
3. Collect candidates from `BusinessEntity`, `BusinessRole`, `BusinessProcess`,
   `WorkflowStep`, and `BusinessRule` nodes.
4. Present candidates grouped by source type and ask the user to confirm
   exclusions and additions.
5. For each confirmed term, propose a definition from graph context when
   possible; otherwise ask the user.
6. Identify possible aliases, propose canonical terms, and ask for confirmation.
7. Write confirmed `GlossaryTerm`, `DEFINES`, and `ALIAS_OF` graph data when
   graph write tools are available.
8. Verify by graph read and report counts.

The source phase order is mandatory: collection, definition, deduplication and
alias confirmation, linking, verification.

## Definition Rules

- Definitions are one or two sentences and understandable without hidden
  context.
- Do not define by negation.
- Avoid circular definitions.
- Record the source graph ID for each term whenever available.
- SA terminology may be referenced only as an alignment hint; BA definitions
  remain grounded in BA graph context and user input.
- `GlossaryTerm` nodes link to BA nodes through `DEFINES`; aliases use
  `ALIAS_OF` and require user confirmation.

## Capabilities

### May Do

- Scan graph nodes for term candidates.
- Propose definitions from descriptions, attributes, triggers, results, and
  responsibilities already present in the graph.
- Ask the user to confirm definitions and aliases.
- Write confirmed glossary terms and relationships when graph write tools are
  available.
- Report glossary coverage and unresolved terms.

### Must Not Do

- Invent meanings absent from graph context or user input.
- Delete or replace existing glossary terms without explicit confirmation.
- Treat aliases as confirmed without user approval.
- Modify project files.
- Claim glossary coverage without graph read evidence.

### Conditional Tools And Actions

- Candidate collection requires graph read tools.
- Full rebuild requires graph write tools and explicit confirmation.
- Incremental linking requires existing source nodes in the graph.
- Verification requires graph read tools after writes.

### Blocked Or Unverified Reporting

- Use `BLOCKED` when graph tooling, source nodes, or required confirmation is
  unavailable.
- Use `PARTIALLY_VERIFIED` when writes complete but some coverage checks cannot
  run.
- Use `UNVERIFIED` when definitions cannot be checked against graph context.
- Use `FAILED` with a reason when read-back verification contradicts confirmed
  glossary changes.

## Source Comparison

- Source Claude skill path: `../../nacl-ba-glossary/SKILL.md`

### Preserved Methodology

- Graph-sourced term collection.
- Interactive definition and alias confirmation.
- `GlossaryTerm`, `DEFINES`, and `ALIAS_OF` graph semantics.
- Full and incremental forms.

### Removed Claude Mechanics

- Non-Codex frontmatter fields.
- Assumed graph tool names as guaranteed execution capability.
- Platform-specific execution wording.
- Unconditional destructive rebuild behavior.

### Codex Replacement Behavior

- Require confirmation before full replacement.
- Treat graph reads and writes as conditional.
- Use closed verification statuses for skipped or partial evidence.
- Keep slash command text as compatibility trigger text.
