---
name: nacl-init
description: Inspect or initialize a NaCl project with a per-project Neo4j Community graph and project-local MCP. Use for first setup, bootstrap, and repair planning.
---

# NaCl Init

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md).

This entry must work before any project MCP exists. Never call an installation
doctor, a package gateway, or a checkout-relative/global skill path.

Resolve one explicit absolute project root. Inspect `config.yaml`,
`graph-infra/`, `.codex/config.toml`, `.gitignore`, Docker, and occupied ports. For a
missing stable `project.id`, present the exact add-only config change and stop
for confirmation before writing it; never derive identity during a read.

Present the deterministic graph bootstrap plan, including all files, the
project-specific container/volume, loopback ports, checksum-pinned binary,
secret handling, and no-clobber behavior. Stop for exact
`INIT_LOCAL_GRAPH:<project-id>` confirmation. Then invoke the bundled POSIX or
PowerShell runner, respectively the
[POSIX runner](../../resources/bootstrap/setup-project-graph.sh) or
[PowerShell runner](../../resources/bootstrap/setup-project-graph.ps1), with
the same root, ID, ports, and confirmation. Never pass a password.

Preserve the runner's status/code. Report graph bootstrap `VERIFIED` only from
its `NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED` read-back. Then stop and ask
the user to open a new task in this project so Codex loads the newly created
project `.codex/config.toml`. The current task must not claim the MCP is already loaded.

In the new task, verify the project-local `nacl_neo4j` MCP with one read canary before
continuing to ordinary NaCl work. Optional agent profiles remain create-only
and require a separate path-by-path plan and confirmation. On
`AGENT_PROFILE_CONFLICT`, never overwrite: ask the user to move or back up the
conflicting file, then produce a fresh plan before any retry.
