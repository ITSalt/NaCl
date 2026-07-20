---
name: nacl-diagnose
description: Diagnose NaCl project health, drift, status, reconciliation, or next work using read-only evidence and actionable closed outcomes.
---

# NaCl Diagnose

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md).
Before requiring MCP, invoke the bundle-relative
[plan runner](../../resources/bootstrap/plan-project-graph.mjs) once with
`--diagnose-only` and the explicit absolute project root. This inspection is
file-only: never call Docker, use the network, mutate a file, or infer graph
truth.

Preserve its exact `status`, `code`, `initializationState`, canonical root, and
per-file digest/absence evidence:

- `NOT_RUN/PROJECT_MCP_NOT_CONFIGURED` + `UNINITIALIZED`: report the local
  state and route to `nacl-init`; do not turn it into an error.
- `BLOCKED/*` + `BLOCKED`: stop on malformed, unsafe, or partial local state.
- `PARTIALLY_VERIFIED/PROJECT_MCP_VERIFICATION_REQUIRED` +
  `INITIALIZED_LOCAL_FILES`: report that files exist but graph truth and
  overall initialization remain unverified. If the project MCP is absent, ask
  for a new task and stop without replacing this with
  `BLOCKED/PROJECT_MCP_NOT_CONFIGURED`.

Only after local initialized files and a loaded project `nacl_neo4j` MCP are
both present, read
[the diagnostic workflow](../../resources/workflows/nacl-tl-diagnose/SKILL.md)
and [the evidence taxonomy](../../resources/workflows/references/verification-evidence.md).
Use MCP reads for graph truth. If the initialization ceremony in `nacl-init`
has not completed, route there before ordinary diagnosis.

Route to one packaged diagnostic leaf. Keep the run read-only unless the user
separately requests an artifact. Use only project-local Neo4j MCP reads and
preserve exact graph status. Never infer graph truth from a stale local status
file; missing named evidence is an honest closed non-success.
