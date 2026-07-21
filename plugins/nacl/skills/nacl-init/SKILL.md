---
name: nacl-init
description: Inspect or initialize a NaCl project with a per-project Neo4j Community graph and project-local MCP. Use for first setup, bootstrap, and repair planning.
---

# NaCl Init

Read [the Skills-only runtime contract](../../resources/references/skills-only-runtime-contract.md).

This entry must work before any project MCP exists. Never call an installation
doctor, a package gateway, or a checkout-relative/global skill path.

Resolve one explicit absolute project root. For an empty new project without
`config.yaml`, invoke the bundle-relative
[project-creation planner](../../resources/bootstrap/plan-project-creation.mjs)
with the root, project name, optional one-line description, and optional stack.
It performs no writes. Present its exact `config.yaml`, `AGENTS.md`, Git action,
`planHash`, and `CREATE_NACL_PROJECT:<sha256>` confirmation, then stop.

After the user repeats that exact confirmation, invoke the bundle-relative
[project-creation applier](../../resources/bootstrap/apply-project-creation.mjs)
with the same inputs, `plan-hash`, and confirmation. It recomputes the plan
under a create lock before writing. For a genuinely empty non-Git directory it
creates `config.yaml` and concise repository-specific `AGENTS.md`, initializes
Git and commits only those initial artifacts. It preserves an existing
`AGENTS.md` and never auto-adopts a non-Git directory containing files or a
linked worktree. Stop on any non-success result.

`AGENTS.md` records durable project context, constraints, and verified commands;
keep it concise and use a closer nested `AGENTS.md` for directory-specific
rules. Never put credentials in it. For an existing `config.yaml` without a
stable `project.id`, present the exact add-only config change and stop for
confirmation before writing it; never derive identity during a read.

Before bootstrap, invoke the bundle-relative
[plan runner](../../resources/bootstrap/plan-project-graph.mjs) with the
explicit root, ID, database, and chosen loopback Bolt/HTTP ports. This command
is read-only: it performs no Docker call, network request, or mutation. Show
its exact plan fields, `planHash`, and fresh
`INIT_LOCAL_GRAPH:<project-id>:<sha256>` token, then stop. Never accept the old
static token or reconstruct a token manually.

After the user repeats that exact token, invoke the bundled POSIX or PowerShell
runner, respectively the
[POSIX runner](../../resources/bootstrap/setup-project-graph.sh) or
[PowerShell runner](../../resources/bootstrap/setup-project-graph.ps1), with
the same root, ID, database, ports, and token. Never pass a password. The
runner recomputes the plan immediately before its first mutation; stale or
mismatched state is `BLOCKED/PLAN_TOKEN_STALE` with zero mutation.

Preserve the runner's status/code. A successful runner returns
`PARTIALLY_VERIFIED/RESTART_REQUIRED` with `bootstrap=VERIFIED` and
`initialization=NOT_RUN`. Then stop and ask the user to open a new task in this
project so Codex loads the newly created project `.codex/config.toml`. The
current task must never report overall initialization `VERIFIED`.

In the new task, overall initialization is `VERIFIED` only after all of these
same-task gates succeed through the actual project `nacl_neo4j` MCP:

1. Record real MCP `initialize` and `tools/list` discovery, requiring the exact
   `read-cypher` and `write-cypher` tool names. Missing discovery is closed
   non-success.
2. Run graph connectivity health, read the complete
   `nacl-graph-gateway` schema ledger, require versions 1–3 with their packaged
   checksums, and read back every required constraint.
3. Execute the bundled named read `sa_statistics_extensions` unchanged and
   record its result. A generic `RETURN 1` alone is insufficient.
4. Invoke the plan runner with `--verification-plan`, show its random
   idempotency key, parameterized write/read-back statements, `planHash`, and
   exact `VERIFY_NACL_INITIALIZATION:<project-id>:<sha256>` token, then stop.
5. After the user freshly repeats that token, make exactly one parameterized
   write-canary call with the plan's statement/parameters, followed by a
   separate read call with the read-back statement. Require matching project
   ID, idempotency key, and integer revision. Never accept a static, old, or
   reconstructed verification token. Never automatically retry the write; any
   failure requires a new verification plan, new idempotency key, and fresh
   user confirmation.

Return these exact result fields: `status`, `code`, `initializationState`,
`mcpServerKey`, `mcpInitialize`, `mcpToolsList`, `readTool`, `writeTool`,
`graphHealth`, `schemaVersion`, `schemaChecksum`, `namedRead`, `writeCanary`,
and `writeReadback`. Set `status=VERIFIED`, `code=INITIALIZATION_VERIFIED`, and
`initializationState=VERIFIED` only when every field is verified; otherwise
preserve the closed failing status/code.

Optional agent profiles remain create-only and require a separate path-by-path
plan and confirmation. On `AGENT_PROFILE_CONFLICT`, never overwrite: ask the
user to move or back up the conflicting file, then produce a fresh plan before
any retry.
