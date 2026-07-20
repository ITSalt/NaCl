---
name: nacl-verify
description: Verify NaCl code, tests, QA, synchronization, review evidence, or stubs without converting missing runtime proof into success.
---

# NaCl Verify

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the verification workflow](../../resources/workflows/nacl-tl-verify/SKILL.md),
and [the evidence taxonomy](../../resources/workflows/references/verification-evidence.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary for graph-backed
verification; otherwise return `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route
to `nacl-init`.

Select one verification leaf and report its exact commands and exit codes. Use
only project-local Neo4j MCP tools. Verification stays read-only except for an
explicit evidence artifact or confirmed Task evidence update with claim,
fence/revision, same-mutation evidence, read-back and release. Missing runtime
or graph proof never becomes a vacuous pass.
