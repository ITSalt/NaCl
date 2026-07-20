---
name: nacl-diagnose
description: Diagnose NaCl project health, drift, status, reconciliation, or next work using read-only evidence and actionable closed outcomes.
---

# NaCl Diagnose

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the diagnostic workflow](../../resources/workflows/nacl-tl-diagnose/SKILL.md),
and [the evidence taxonomy](../../resources/workflows/references/verification-evidence.md).
Require a loaded project `nacl_neo4j` MCP and verified read canary; otherwise return
`BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to `nacl-init`.

Route to one packaged diagnostic leaf. Keep the run read-only unless the user
separately requests an artifact. Use only project-local Neo4j MCP reads and
preserve exact graph status. Never infer graph truth from a stale local status
file; missing named evidence is an honest closed non-success.
