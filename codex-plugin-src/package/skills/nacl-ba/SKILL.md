---
name: nacl-ba
description: Route NaCl business analysis across context, processes, entities, roles, rules, workflows, validation, sync, and handoff. Use for graph-first BA work.
---

# NaCl Business Analysis

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the BA contract](../../resources/workflows/references/ba-codex-contract.md), and
[the core methodology](../../resources/workflows/nacl-core/SKILL.md).

Require a loaded project `nacl_neo4j` MCP and verified read canary. Otherwise return
`BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to `nacl-init`.

Choose exactly one relevant packaged leaf under `../../resources/workflows/`:
`nacl-ba-full`, `nacl-ba-context`, `nacl-ba-import-doc`,
`nacl-ba-from-board`, `nacl-ba-roles`, `nacl-ba-process`, `nacl-ba-entities`,
`nacl-ba-rules`, `nacl-ba-glossary`, `nacl-ba-workflow`, `nacl-ba-analyze`,
`nacl-ba-validate`, `nacl-ba-sync`, or `nacl-ba-handoff`. State the leaf.

Use only project-local Neo4j MCP Cypher tools. Preserve explicit project
identity, BA write approval, parameterization, lease/fence/revision rules,
transaction/idempotency, and read-back from the leaf and runtime contract.
Missing graph primitives stay `BLOCKED`; confirmed file-only preparation may
report only its own honest status.
