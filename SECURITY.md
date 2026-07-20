# Security Policy

## Reporting vulnerabilities

Report suspected security vulnerabilities privately through
[GitHub Security Advisories](https://github.com/ITSalt/NaCl/security/advisories/new).

Do **not** open a public issue for a vulnerability. Include only the minimum
evidence needed to reproduce the problem, and remove credentials, private keys,
project data, personal information, and production logs.

## Supported versions

| Version | Supported |
|---|---|
| Latest released version | Yes |
| Unreleased branches and older releases | Best effort |

The draft Codex Skills-only artifact is not a supported release until its exact
source revision and archive digest are published.

## Secret handling

- Treat every `SKILL.md`, bundled script, template, and uploaded Skills-only
  file as public code. Never place credentials, API keys, passwords, private
  certificates, or production data in them.
- The Codex project `.codex/config.toml` must contain only the generated launcher
  and binary paths and non-secret connection parameters. Do not put the Neo4j
  password in `command`, `args`, `env`, or another MCP configuration field.
- The local bootstrap generates a unique project password in the gitignored
  `graph-infra/.env`. `graph-infra/.env.example` must keep the password empty.
- On POSIX systems, keep `graph-infra/.env` at mode `0600`. On Windows, restrict
  it to the current user. The project-local launcher rejects a symlink,
  non-regular file, malformed content, and overly broad POSIX permissions.
- The launcher supplies the password only to the child `neo4j-mcp` process
  environment. Do not pass secrets in process arguments, logs, tool results,
  screenshots, issue reports, or support bundles.
- Keep private-CA, mTLS, and other credentials for optional remote graphs in
  their documented local secret locations. Revoke and reissue credentials when
  a machine, developer, or server access grant is compromised.

## Local and remote graph security

- Use a separate Neo4j Community container and durable volumes for each
  project. A local graph must publish HTTP and Bolt only on loopback.
- Treat Docker administrator access as equivalent to local root access: a
  Docker administrator can inspect containers, files, environment values, and
  volumes.
- For a remote graph, use the documented private transport and server access
  lifecycle. Access to a server currently authorizes its registered project
  graphs; project routing metadata is not an access grant.
- Preserve backups before destructive graph or schema operations and verify
  restores before deleting the previous usable copy.
- Updating or uninstalling a skill/plugin does not remove project graph data,
  project MCP configuration, credentials, or backups. Remove them only through
  an explicit, reviewed infrastructure procedure.

## Dependencies and downloads

The Skills-only bootstrap must use the bundled `neo4j-mcp` version and verify
its release asset with the bundled SHA-256 checksum. Do not override the
bootstrap with `latest` or bypass checksum verification. Review the exact
Docker image reference, dependency inventory, and artifact digest for each
release.

If a download fails or its checksum does not match, stop. Do not execute the
asset, substitute an unreviewed mirror, or weaken the check.

## Safe reporting and diagnostics

Before sharing diagnostic output, remove at least:

- passwords, tokens, private keys, and certificates;
- project content and graph query results;
- local usernames, home-directory paths, IP addresses, and server inventory;
- `.env` contents and MCP process environments.

The public issue tracker is appropriate for non-sensitive bugs and feature
requests. Security-sensitive reports belong in GitHub Security Advisories.
