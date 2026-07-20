---
name: nacl-tl
description: Route NaCl team-lead work across intake, planning, development, review, QA, status, release, and deployment. Use for graph-aware delivery work.
---

# NaCl Team Lead

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the TL core](../../resources/workflows/nacl-tl-core/SKILL.md), and
[the TL contract](../../resources/workflows/nacl-tl-core/references/tl-codex-contract.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary; otherwise return
`BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to `nacl-init`.

Select one packaged TL leaf and load no unrelated leaf. Use only project-local
Neo4j MCP Cypher tools. Protected Task work keeps the exact project and worker
identity, allocate-or-claim, heartbeat, live fence, expected revision,
`APPROVE_TL_WRITE`, idempotency, same-mutation evidence, read-back and release
or explicit handoff. Missing concurrency or Task evidence is `BLOCKED`, never
an unfenced write or local-status fallback.
