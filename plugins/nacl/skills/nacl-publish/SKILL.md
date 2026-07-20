---
name: nacl-publish
description: Render, package, ship, release, deploy, or publish NaCl outputs with explicit external-write authorization and verified evidence.
---

# NaCl Publish

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md),
[the publish workflow](../../resources/workflows/nacl-publish/SKILL.md), and
[the render workflow](../../resources/workflows/nacl-render/SKILL.md).
For graph-derived evidence, require a loaded project `nacl_neo4j` MCP and verified
read canary; otherwise return `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and route to
`nacl-init`.

Route to one packaged publish/release leaf. Use only project-local Neo4j MCP
tools. Preserve release lease/fence/revision, confirmation, read-back and
release. Every Git, deployment, documentation, messaging or other external
write requires separate explicit user authority. Missing graph evidence never
becomes release success.
