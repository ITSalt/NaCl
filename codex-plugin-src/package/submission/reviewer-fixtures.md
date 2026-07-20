# NaCl Skills-only reviewer fixtures

Status: `LOCAL_CONTRACT_ONLY`

Submission type: `SKILLS_ONLY`. There is no public MCP endpoint, OAuth flow,
hosted data plane, or reviewer credential. The skill bundle bootstraps a
project-local Neo4j Community container and project-local Neo4j MCP only after
the user confirms the exact project plan.

The machine-readable source is `reviewer-fixtures.json`. It contains exactly
five positive and three negative cases:

1. Pre-bootstrap dry-run inspection.
2. Confirmed local graph and project `nacl_neo4j` MCP bootstrap through project
   `.codex/config.toml`.
3. New-task project MCP read canary.
4. BA write plan stopped at its confirmation gate.
5. Idempotent no-clobber re-run.
6. Non-init entry before MCP: `BLOCKED/PROJECT_MCP_NOT_CONFIGURED`.
7. Missing exact init confirmation: `BLOCKED/CONFIRMATION_REQUIRED`.
8. Conflicting/unsafe project state: fail closed with existing bytes intact.

Live portal/reviewer execution remains `NOT_RUN` until the exact deterministic
Skills-only bundle is uploaded and exercised on a clean reviewer machine.
