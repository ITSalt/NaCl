---
name: nacl-fix
description: Diagnose and repair a bounded NaCl defect with spec-first classification, a regression test, verification, and honest status propagation.
---

# NaCl Fix

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the fix workflow](../../resources/workflows/nacl-tl-fix/SKILL.md), and
[the TL contract](../../resources/workflows/nacl-tl-core/references/tl-codex-contract.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary; otherwise return
`BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to `nacl-init`.

Use the narrower hotfix/reopened/regression leaf only when its trigger applies.
Use only project-local Neo4j MCP tools and preserve diagnostic/spec versus
implementation/review separation, Task claim/fence/revision/idempotency,
`APPROVE_TL_WRITE`, RED-to-GREEN evidence, read-back and release. Missing proof
or a required primitive stays `BLOCKED`.
