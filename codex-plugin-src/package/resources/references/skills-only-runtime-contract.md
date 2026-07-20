# NaCl Skills-only runtime contract

This contract is authoritative for public NaCl skills installed through the
OpenAI **Skills only** path. It supersedes package-MCP preflights in older
internal workflow text.

## Runtime states

1. **Pre-bootstrap** — the active project has no usable
   `[mcp_servers.nacl_neo4j]` entry in `.codex/config.toml`. `nacl-init` may
   produce a read-only plan. `nacl-diagnose` may run only the bundle-relative
   file-only local-state inspection and report `UNINITIALIZED`, `BLOCKED`, or
   initialized local files. Every other public entry returns
   `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and routes the user to `nacl-init`.
2. **Restart required** — bootstrap returned
   `PARTIALLY_VERIFIED/RESTART_REQUIRED` with `bootstrap=VERIFIED` and
   `initialization=NOT_RUN`. Stop and ask the user to open a new task for the
   same project. Do not claim the newly written MCP is visible in the current
   task.
3. **Project MCP discovered** — the new task exposes the project `nacl_neo4j`
   MCP after real initialize/tools-list discovery. This is not yet overall
   initialization success.
4. **Initialization verified** — graph health, the exact current schema ledger
   and constraints, one bundled named read, and a freshly confirmed
   parameterized write canary with separate read-back all succeed. Only now may
   overall initialization be `VERIFIED` and ordinary public workflows proceed.

Never call `nacl_installation_doctor` or any `nacl_*` package gateway tool.
Those tools belong to the backward-compatible full local plugin and are not a
dependency of the Skills-only product.

## Bundle path rule

Resolve resources from links in the active `SKILL.md`. Never search a source
checkout, `~/.claude`, another installed skill, or a developer-specific path.
The submission build rewrites each public entry to its own `resources/`
directory and copies the complete runtime closure inside the same skill.

## Bootstrap contract

Before mutation, use only `resources/bootstrap/plan-project-graph.mjs`. It
canonicalizes the explicit project root and emits the project ID, database,
selected loopback ports and their apply-preflight policy, immutable Neo4j image
and bundled plugin digest, exact
platform-specific neo4j-mcp release/archive/binary digests, intended
files/Docker resources, current config/env/launcher/receipt/gitignore state
digests or absence, rollback policy, bundle policy version, `planHash`, and
confirmation token. This plan command performs zero mutation, network, and
Docker calls.

Present the exact graph plan and stop for:

```text
INIT_LOCAL_GRAPH:<project-id>:<sha256>
```

The token is a content-addressed snapshot, not a reusable static approval.
Creating or migrating a missing `project.id` remains a separate presented file
change and confirmation, followed by a new graph plan.

After that exact confirmation, run only one bundle-relative command:

- POSIX: `resources/bootstrap/setup-project-graph.sh`
- Windows: `resources/bootstrap/setup-project-graph.ps1`

Pass the explicit absolute project root, project ID, database, loopback
Bolt/HTTP ports, and exact token. Never pass a password or secret argument.
The runner recomputes the same plan immediately before its first mutation.
Any changed root, port, policy input, or bound file state returns
`BLOCKED/PLAN_TOKEN_STALE` with zero mutation. The old static token is invalid.

The deterministic runner:

- creates copy-only-if-missing project `graph-infra` assets;
- generates or reuses one project secret only in gitignored mode-0600
  `graph-infra/.env` and writes an empty value to `.env.example`;
- resolves the checksum-pinned official `neo4j-mcp` binary into project-local
  gitignored storage and verifies its recorded binary digest on every reuse;
- installs a project-local strict secret launcher;
- appends a marked, secret-free `[mcp_servers.nacl_neo4j]` section to project
  `.codex/config.toml` while preserving unrelated TOML bytes and rejecting any
  malformed, ambiguous, duplicate, or conflicting managed section;
- starts a loopback-only, per-project Neo4j Community Compose stack and volume;
- applies the packaged BA/SA/TL and concurrency migrations and reads them back;
- verifies a bootstrap read canary and the generated MCP configuration;
- returns only `PARTIALLY_VERIFIED/RESTART_REQUIRED`, never overall
  initialization `VERIFIED` in the current task.

Any conflict, malformed file, symlink, broad secret-file permission, missing
dependency, checksum mismatch, port collision, Docker failure, schema failure,
or read-back failure is a closed non-success. Never repair or overwrite it by
guessing.

## Post-bootstrap initialization verification

In a new task, use only the project MCP whose server key is `nacl_neo4j`. Discover
its read/write Cypher tools from the host inventory; current hosts normally
render them under `mcp__nacl_neo4j__*`. Use packaged query/schema files and the
selected internal workflow as methodology, but ignore any older instruction
to call a `nacl_*` package tool.

Overall initialization requires actual MCP initialize/tools-list evidence,
connectivity health, all three checksum-matching `nacl-graph-gateway` migration
ledger entries, required constraints, the unchanged bundled named read
`sa_statistics_extensions`, and a separate write/read-back ceremony. Generate
that write plan with `plan-project-graph.mjs --verification-plan`; it creates a
fresh idempotency key and exact
`VERIFY_NACL_INITIALIZATION:<project-id>:<sha256>` approval. After the user
repeats it, invoke the project MCP write tool once with the exact parameterized
statement and parameters, then invoke the read tool separately and compare
project ID, idempotency key, and revision. Never accept a static, stale, or
reconstructed verification token and never automatically retry the write. A
failure requires a new plan, idempotency key, token, and fresh confirmation. A
generic read canary alone is never sufficient.

All graph writes still require the selected workflow's explicit user approval,
parameterized Cypher, project identity, leases/fencing/revision where required,
one transaction or idempotency key, and separate read-back. A missing required
primitive is `BLOCKED`; it is never replaced by an unfenced or interpolated
write. Local files never override graph truth when the graph is required.
