---
name: nacl-goal
description: Plan or conduct a bounded NaCl objective with explicit checks and closed statuses. Use for multi-step goals and resumable orchestration.
---

# NaCl Goal

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the goal workflow](../../resources/workflows/nacl-goal/SKILL.md), and
[the goal contract](../../resources/workflows/references/goal-codex-contract.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary for graph-backed
work; otherwise return `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to
`nacl-init`.

Select one bounded alias/leaf and state its checks. Use only project-local
Neo4j MCP tools. Preserve preview, proof, refusal, confirmation, identity,
lease/fence/revision and read-back gates. A goal never promotes a child
non-success into `VERIFIED`.
