# NaCl Skills-only runtime contract

This contract is authoritative for public NaCl skills installed through the
OpenAI **Skills only** path. It supersedes package-MCP preflights in older
internal workflow text.

## Runtime states

1. **Pre-bootstrap** — the active project has no usable
   `[mcp_servers.nacl_neo4j]` entry in `.codex/config.toml`. Only `nacl-init`
   may continue. Every other public entry returns
   `BLOCKED/PROJECT_MCP_NOT_CONFIGURED` and routes the user to `nacl-init`.
2. **Restart required** — bootstrap returned
   `NACL_SKILLS_ONLY_BOOTSTRAP: status=VERIFIED`. Stop and ask the user to open
   a new task for the same project. Do not claim the newly written MCP is
   visible in the current task.
3. **Project MCP ready** — the new task exposes the project `nacl_neo4j` MCP and a
   read canary succeeds. Public workflows may use that MCP.

Never call `nacl_installation_doctor` or any `nacl_*` package gateway tool.
Those tools belong to the backward-compatible full local plugin and are not a
dependency of the Skills-only product.

## Bundle path rule

Resolve resources from links in the active `SKILL.md`. Never search a source
checkout, `~/.claude`, another installed skill, or a developer-specific path.
The submission build rewrites each public entry to its own `resources/`
directory and copies the complete runtime closure inside the same skill.

## Bootstrap contract

Before mutation, inspect the explicit absolute project root, `config.yaml`,
`graph-infra/`, `.codex/config.toml`, `.gitignore`, Docker availability, ports, and
existing files. Derive a stable 3–64 character lowercase project ID from the
existing `project.id`; creating or migrating that ID remains a separate
presented file change and confirmation.

Present the exact graph plan and stop for:

```text
INIT_LOCAL_GRAPH:<project-id>
```

After that exact confirmation, run only one bundle-relative command:

- POSIX: `resources/bootstrap/setup-project-graph.sh`
- Windows: `resources/bootstrap/setup-project-graph.ps1`

Pass the explicit absolute project root, project ID, free loopback Bolt/HTTP
ports, and exact confirmation. Never pass a password or secret argument.

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
- verifies a real read canary and the generated MCP configuration.

Any conflict, malformed file, symlink, broad secret-file permission, missing
dependency, checksum mismatch, port collision, Docker failure, schema failure,
or read-back failure is a closed non-success. Never repair or overwrite it by
guessing.

## Post-bootstrap graph use

In a new task, use only the project MCP whose server key is `nacl_neo4j`. Discover
its read/write Cypher tools from the host inventory; current hosts normally
render them under `mcp__nacl_neo4j__*`. Use packaged query/schema files and the
selected internal workflow as methodology, but ignore any older instruction
to call a `nacl_*` package tool.

All graph writes still require the selected workflow's explicit user approval,
parameterized Cypher, project identity, leases/fencing/revision where required,
one transaction or idempotency key, and separate read-back. A missing required
primitive is `BLOCKED`; it is never replaced by an unfenced or interpolated
write. Local files never override graph truth when the graph is required.
