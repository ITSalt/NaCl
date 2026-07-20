# Privacy Policy — NaCl

Effective date: 2026-07-20

This policy covers the NaCl framework distributed from this repository,
including the Codex/OpenAI Skills-only distribution, the repository-backed
Codex compatibility distribution, and the Claude Code plugin.

## The short version

The NaCl maintainers do not operate a NaCl backend, analytics service, account
system, or telemetry endpoint. Project data is stored on the local machine or
on infrastructure selected and administered by the user. The AI host, download
providers, infrastructure operators, and optional integrations may process data
under their own terms as described below.

## Data stored by NaCl

NaCl may create and use the following data for a project:

- project specifications, requirements, use cases, tasks, evidence, and graph
  metadata in a Neo4j Community database operated by the user;
- a separate Docker container and durable volumes for each locally initialized
  project, or a project database on a Neo4j server chosen by the user;
- non-secret project configuration and generated runtime files;
- local Docker, MCP, tunnel, and framework logs; and
- credentials and private keys supplied or generated for the selected graph or
  an optional third-party integration.

For the Codex Skills-only bootstrap, the generated Neo4j password is stored in
the gitignored `graph-infra/.env`. On POSIX systems the bootstrap requires mode
`0600`; on Windows it attempts to restrict the file ACL to the current user.
The project-local launcher reads that file and passes the password to the child
MCP process through its environment.

The generated project `.codex/config.toml` contains the machine-local launcher
and binary paths plus non-secret connection parameters. It does **not** contain
the Neo4j password. The empty `graph-infra/.env.example` contains no usable
password. The bootstrap also adds `.codex/config.toml`, `graph-infra/.env`, and
the downloaded MCP binary directory to the initialized project's `.gitignore`.

Users remain responsible for the security, access controls, backups, logs, and
retention of their local machine, Docker installation, VPS, Neo4j server, and
project repository.

## AI host processing

When NaCl is used in Codex or another OpenAI/ChatGPT surface, prompts, files,
skill instructions, and tool results are processed by OpenAI according to the
[OpenAI Privacy Policy](https://openai.com/policies/privacy-policy/) and the
applicable [OpenAI Terms](https://openai.com/policies/terms-of-use/). Those
services are not operated by the NaCl maintainers.

When the Claude Code distribution is used, prompts, files, skill instructions,
and tool results are processed by Anthropic according to
[Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy). Anthropic
processing is specific to the Claude channel and is not part of the Codex
Skills-only runtime.

Your organization may have separate agreements and data controls with those
providers. Those agreements take precedence for the corresponding service.

## Bootstrap network access

The standard local Skills-only bootstrap performs two kinds of external
downloads after the user reviews and confirms the plan:

1. It downloads the bundled-version release asset for the official
   `neo4j-mcp` from
   `https://github.com/neo4j/mcp/releases/download/...`. The asset is checked
   against the SHA-256 value shipped with the skill. GitHub may serve that
   download through GitHub-operated redirect or CDN hosts.
2. It asks the user's Docker engine to pull the Neo4j Community image referenced
   by the installed bundle. With Docker's default registry configuration, the
   image reference resolves through Docker Hub (`docker.io/library/neo4j`). A
   user-configured Docker mirror or registry policy may change the contacted
   registry.

These providers receive ordinary network request information, such as the
requesting IP address and user agent, under their own privacy policies. NaCl
does not attach project specifications or graph contents to these downloads.
The bundle can verify a local archive against its pinned checksum without
network access or changing the project, but the standard bootstrap still
downloads the pinned archive itself. This release does not claim a separate
offline installation path.

The project-local `neo4j-mcp` is launched with its telemetry setting disabled.
This does not control telemetry or logs produced by the AI host, Docker engine,
operating system, network provider, or optional third-party services.

## Optional integrations and remote infrastructure

Some workflows can use services configured by the user, such as GitHub,
Docmost, YouGile, deployment targets, or a remote Neo4j server. NaCl sends data
to an optional service only when the user configures and invokes that workflow.
The service provider and the user's infrastructure operator govern their own
collection, retention, security, and deletion practices.

Access to a user-operated Neo4j server is currently the authorization boundary
for project graphs registered on that server. Server administrators and other
principals authorized for that server may therefore be able to access those
graphs. A different server requires separate access.

## What the maintainers receive

The NaCl maintainers receive no project data or usage analytics through the
software itself. They receive only information a user deliberately submits to
a maintainer-controlled channel, such as a GitHub issue, pull request, security
advisory, or repository discussion. Public reports should not include secrets,
private project data, or confidential logs.

## Retention and deletion

NaCl has no maintainer-operated service on which to retain or delete user
project data. Users control the lifecycle of project files, local logs, Docker
containers and volumes, backups, credentials, and remote infrastructure.
Updating, disabling, or uninstalling the Skills-only distribution does not by
itself delete those project-managed artifacts.

Information deliberately sent through GitHub is retained and deleted according
to GitHub's policies and the controls available to the submitting user.

## Changes and contact

Changes to this policy are published in this repository and the effective date
is updated when the policy changes. For privacy questions, open a
[GitHub issue](https://github.com/ITSalt/NaCl/issues) without including private
data or credentials. Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).
