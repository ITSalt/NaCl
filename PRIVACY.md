# Privacy Policy — NaCl Framework and the `nacl` Claude Code Plugin

Effective date: 2026-07-15. This policy covers the NaCl framework distributed
from this repository, including the `nacl` Claude Code plugin (installed via
`/plugin marketplace add ITSalt/NaCl` or the community marketplace).

## The short version

NaCl runs entirely on your machine (or on infrastructure you own). It has no
backend, collects no analytics or telemetry, and sends nothing to the plugin
author. We (ITSalt) never see your data.

## What data NaCl handles, and where it stays

- **Project specifications** (business processes, entities, use cases,
  requirements, tasks) are stored in a Neo4j database that you run yourself:
  either a local Docker container created per project, or a remote Neo4j on a
  server you control (connected over mTLS with certificates stored locally in
  `~/.nacl/certs/`). NaCl never copies this data anywhere else.
- **Configuration and credentials** (`config.yaml`, `.mcp.json`,
  `graph-infra/.env`) live inside your project directory or your home
  directory. Database passwords stay in local files that the setup scripts
  mark for gitignore.
- **Logs** produced by NaCl tooling (sidecar tunnel logs, container logs) are
  written only to your local disk (`~/.nacl/`, Docker logs).

## Network access the framework itself performs

- During project initialization, NaCl downloads the official `neo4j-mcp`
  binary from GitHub releases (`github.com` / `objects.githubusercontent.com`),
  pinned to a specific version and verified by SHA-256 checksum. Telemetry in
  that binary is explicitly disabled (`NEO4J_TELEMETRY=false`).
- During project initialization, NaCl also pulls the `neo4j:5-community` Docker
  image from Docker Hub the first time it starts your project's graph
  container. This is a routine image pull, not telemetry — it carries no
  project or usage data.
- Nothing else. No update pings, no usage reporting, no crash reporting.

## Optional integrations you configure yourself

Some skills can talk to third-party services — GitHub (via your `gh` CLI),
YouGile, Docmost, your own deployment targets. These are disabled until you
configure them in `config.yaml` with your own credentials, and data goes only
to the services you configured, under those services' own privacy terms.

## What the plugin author collects

Nothing. There is no account, no registration, no telemetry endpoint. The only
personal data we ever receive is what you choose to send us directly (for
example, a GitHub issue or an email).

## Claude Code and Anthropic

The plugin runs inside Claude Code. Your prompts, project files, and graph
query results are processed by Claude under Anthropic's own terms and privacy
policy (https://www.anthropic.com/legal/privacy), which are outside this
project's control.

## Changes and contact

Changes to this policy are published in this repository; the effective date
above is updated with each change. Questions: open an issue at
https://github.com/ITSalt/NaCl/issues or email magznikitin@gmail.com.
