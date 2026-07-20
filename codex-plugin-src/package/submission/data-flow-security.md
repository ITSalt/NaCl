# NaCl Skills-only data flow and security

NaCl is submitted as **Skills only**. It has no public MCP endpoint, OAuth
provider, hosted NaCl data plane, reviewer credential, or author analytics.

After explicit confirmation, `nacl-init` creates one project-local Neo4j
Community container and volume, downloads the checksum-pinned official
`neo4j-mcp`, and appends a secret-free managed `[mcp_servers.nacl_neo4j]`
section to project `.codex/config.toml`. The generated graph
password exists only in gitignored `graph-infra/.env`; on POSIX its mode is
0600. A project-local launcher validates the file, reads the secret, and passes
it only through the child MCP process environment. It never appears in the
bundle, repository, `.codex/config.toml`, `.env.example`, logs, or process arguments.

The machine-specific `.codex/config.toml`, project-local MCP binary, strict
receipt, and `graph-infra/.env` are gitignored. Project caches are never trusted
as a binary source. A clean second machine
runs the already-installed `nacl-init` bootstrap again; it does not install a
second NaCl package from GitHub.

Neo4j HTTP and Bolt ports bind to loopback. The image uses exact tag
`5.24.2-community` plus an immutable OCI index digest. The launcher verifies
the canonical project-local binary path, strict receipt, and pinned binary
digest before every spawn, then passes only five allowlisted environment keys.
The pinned image embeds APOC Core 5.24.2. Its entrypoint copies that
image-bound JAR locally rather than downloading it; bootstrap verifies the
copied JAR SHA-256 and runtime version/meta capability before success. Bundled
NaCl named queries use core Cypher only; APOC is present solely because the
pinned `neo4j-mcp` runtime requires its meta component.
Existing TOML is parsed by a pinned real TOML parser before an atomic managed
append. Failed fresh bootstrap runs remove only their new Docker/filesystem
resources and restore prior config bytes; pre-existing volumes are preserved
and explicitly reported when graph rollback is not safe. Project data remains in the user's
project and Docker volume. Normal graph access flows locally from Codex through
the project stdio MCP to the project container. The only expected first-run
external downloads are the pinned Neo4j MCP release asset and pinned Neo4j
Community image.

The exact machine-readable disclosure is `data-flow-security.json`. Portal and
clean reviewer-machine execution remain `NOT_RUN` until submission.
