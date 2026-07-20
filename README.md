🇷🇺 [Русская версия](README.ru.md)

# NaCl

NaCl is a graph-first software-delivery framework for Claude Code and Codex. Business analysis, system specifications, delivery evidence, and traceability live in a Neo4j knowledge graph instead of a disconnected document pile.

<!-- doc-key: runtime-channels -->
## Choose the runtime channel

| Runtime | Ordinary installation | Status |
|---|---|---|
| Codex Desktop | One official **NaCl Skills-only** card from **Plugins** | Bootstrap-first bundle is being prepared; the official listing is not published yet |
| Claude Code Desktop | NaCl marketplace plugin | Supported by the current 2.24.0 package |
| Claude Code CLI | Repository-backed Claude skills | Supported compatibility channel |

After publication, the normal Codex path is one UI installation of the
Skills-only card. Its ten public conductors include `nacl-init`; packaged
scripts then create or connect the selected project's Neo4j Community stack
and project-local MCP configuration. GitHub remains a source, release, audit,
and support channel, not a mandatory second installation. The existing Git
marketplace/full-plugin and symlink layouts remain development and
compatibility channels. See [Codex installation](docs/setup/install-codex-plugin.md).

<!-- doc-key: codex-installation -->
## Install in Codex Desktop

When the official listing is published, open **Plugins**, select the verified
**NaCl Skills-only** card, install it once, grant only the permissions shown by
Codex, and open a new task in the project you want to initialize. Do not use a
saved package path from another computer.

The official card is not published yet. The immutable Git/full-plugin release
remains the verified pre-publication compatibility channel. Follow [the Codex
installation guide](docs/setup/install-codex-plugin.md) for the exact current
availability and do not install a similarly named third-party card.

<!-- doc-key: first-check -->
## Initialize the first Codex project

In a new Codex task opened at the intended project root, invoke `nacl-init`.
It first performs a read-only prerequisite check and presents the exact files,
Docker resources, downloads, ports, secret references, and
`.codex/config.toml` changes.
Denial must leave the project unchanged.

After explicit confirmation, the bundled scripts create or connect the
per-project graph, install the pinned checksum-verified `neo4j-mcp`, and merge
the project's `mcp_servers` entry in `.codex/config.toml` without overwriting
unrelated servers. The current task then stops: open a **new task in the same
project** so Codex can discover the newly created project MCP. Initialization
is `VERIFIED` only after MCP
handshake, graph/schema health, a named read, a separately confirmed write
canary, and read-back succeed.

The package-level `nacl_installation_doctor` belongs only to the Git/full-plugin
compatibility channel; it is not a prerequisite for the official Skills-only
journey. See the [Quick Start](docs/quickstart.md).

<!-- doc-key: graph-model -->
## Graph model

Each project gets its own Neo4j 5 Community container and durable volumes. `/nacl-init` can create it locally, connect to a project container on a reachable VPS, or register an existing connection. Local Docker remains the default.

The server is the current authorization boundary: a developer who has access
to a Neo4j server is treated as able to access every project database hosted
there. `project_scope` selects and records the logical project; it is routing
and provenance, not an authorization control. Access to another server must be
granted separately. NaCl does not provide a managed graph or public MCP
service.

<!-- doc-key: key-concepts -->
## Key concepts

- **Graph-first analysis.** Processes, entities, roles, rules, and use cases are Neo4j nodes and relationships, so impact analysis and traceability are queryable.
- **Configurable language.** An explicit `--lang=en` or `--lang=ru` wins, then `project.lang` in `config.yaml`, then the layer default. BA and SA default to Russian; TL defaults to English.
- **Atomic delivery.** Each use case is developed, tested, reviewed, and shipped as one bounded unit.
- **Two-level QA.** Local code verification precedes staging E2E verification.
- **Config-driven operation.** `config.yaml` controls Git strategy, graph connection, project identity, and optional integrations.

<!-- doc-key: release-and-strict-mode -->
## Release foundation and strict mode

The 2.10.0 goal-protocol foundation added `nacl-goal`, the `GOAL_PROOF` wire format, the `wave`, `fix`, `validate`, and `reopened-drain` aliases, structured refusals, and a permissions denylist. See the [goal command guide](docs/guides/goal-command.md).

Since 2.8.0, NaCl has used evidence-blocking gates instead of treating missing evidence as explanatory prose. Closure refuses terminal states in `{UNVERIFIED, BLOCKED, FAILED, NOT_RUN}`. Removed skip flags cannot bypass this rule; the retained `--skip-e2e` has explicit scope. Older projects should start with [`project-gap-closure.md`](nacl-tl-core/references/project-gap-closure.md) and use only signed exceptions or the bounded emergency procedure.

<!-- doc-key: root-inventory -->
## What's inside the framework

Root skills follow `nacl-{layer}-{action}`:

| Category | Prefix | Count | Responsibility |
|---|---|---:|---|
| Business analysis | `nacl-ba-*` | 14 | Processes, entities, roles, rules, glossary, and validation |
| System analysis | `nacl-sa-*` | 10 | Architecture, domain model, use cases, UI, roles, and validation |
| TeamLead | `nacl-tl-*` | 26 | Planning, TDD, review, QA, deployment, release, and recovery |
| Utilities | `nacl-*` | 6 | Core helpers, rendering, publishing, initialization, goals, and postmortems |
| Migration | `nacl-migrate-*` | 3 | Deterministic Markdown-to-graph migration |
| **Total** |  | **59** | Root Claude/repository inventory |

The host packages intentionally expose different surfaces: Claude Desktop has 53 invocable skills, while Codex has 10 public conductors over a generated 60-skill internal catalog.

<!-- doc-key: workflow -->
## Workflow

The ten Codex public skills are `nacl-ba`, `nacl-diagnose`, `nacl-fix`, `nacl-goal`, `nacl-init`, `nacl-migrate`, `nacl-publish`, `nacl-sa`, `nacl-tl`, and `nacl-verify`. They route work to the internal skill catalog rather than exposing implementation leaves as the primary UI.

```text
nacl-init → nacl-ba → nacl-sa → nacl-tl → nacl-verify
```

Strict mode is evidence-blocking: `BLOCKED`, `FAILED`, `NOT_RUN`, and `UNVERIFIED` halt closure. The only sanctioned exceptions are signed project exceptions and the bounded emergency process described in the strict-mode references.

<!-- doc-key: claude-channel -->
## Claude Code 2.24.0

The current Claude package remains fully supported. Claude Code Desktop installs the marketplace plugin from the app UI or Claude plugin commands; Claude Code CLI can use the repository-backed compatibility channel. Choose one Claude channel per machine so duplicate skills do not shadow one another. The 2.24.0 SessionStart check warns about a dual install.

Claude Desktop ships 53 invocable skills and seven agent profiles. Repository-backed Claude Code retains the complete 59 root skills. The `/goal` wrapper and repository-only migration/postmortem utilities remain outside the Desktop bundle where their host assumptions do not apply.

<!-- doc-key: optional-integrations -->
## Optional integrations

- **Docmost** publishes analysis and specification artifacts with `nacl-publish`.
- **YouGile** supplies an optional project-management board and task integration.

Neither integration replaces the Neo4j graph as the analysis source of truth.

<!-- doc-key: architecture -->
## Architecture and packages

NaCl keeps host-specific packaging separate from methodology:

- root `nacl-*` sources and `plugin/` build the Claude package;
- `plugins/nacl/` is the generated Git/full-plugin compatibility bundle;
- the dedicated Skills-only builder produces the self-contained public upload
  tree from Codex sources without a package-level MCP binding;
- `plugins/nacl/resources/package-index.json` remains the full-plugin Codex
  inventory contract;
- `graph-infra/` is copied per project by initialization;
- `docs/` contains the shared operational contract.

See [Architecture](docs/architecture.md), [Configuration](docs/configuration.md), and [Workflows](docs/workflows.md).

<!-- doc-key: agent-architecture -->
## Agent architecture

Claude packaging routes work to six cognitive profiles and one diagnostic sub-agent:

| Agent | Model | Responsibility |
|---|---|---|
| strategist | Opus | Architecture, validation, and deep review |
| analyst | Sonnet | Domain modelling and structured content |
| developer | Sonnet | TDD code generation and fixes |
| verifier | Sonnet | Testing and contract verification |
| operator | Sonnet | Git, CI/CD, publishing, and migration orchestration |
| scout | Haiku | Fast lookups and status queries |
| diagnostician | Opus | Diagnose-and-spec phase of bounded fixes |

The Codex package does not promise Claude model identities; its public conductors preserve the same responsibility boundaries. See [Agent Architecture](docs/agents.md).

<!-- doc-key: markdown-migration -->
## Migration from Markdown

Existing BA/SA Markdown can be converted into the graph through the public `nacl-migrate` conductor. The underlying migration uses deterministic parsing with adapters for supported document layouts; it does not ask an LLM to invent graph facts. See [Migration](docs/migration.md).

<!-- doc-key: graph-handover -->
## Graph handover

Moving a project graph to another machine is a one-shot encrypted export/import operation. It is separate from plugin installation and preserves the per-project graph boundary. See [Handover](docs/HANDOVER.md).

<!-- doc-key: analyst-tool -->
## NaCl Analyst Tool

The Analyst Tool is a local web application for boards in `graph-infra/boards/`. It shows graph synchronization state and provides **Regenerate**, **Sync**, and **Analyze** actions through `itsalt-pinch`. The old standalone `excalidraw` and `excalidraw-room` containers are no longer required.

A single daemon can serve multiple initialized projects registered in the NaCl project registry; the UI project selector changes the active project without restarting the daemon. See [Analyst Tool](docs/analyst-tool.md) and its [multi-project setup](docs/analyst-tool.md#multi-project-setup).

<!-- doc-key: project-structure -->
## Project structure

```text
NaCl/
  .claude/agents/       Claude cognitive profiles
  nacl-ba-*/            14 BA root skills
  nacl-sa-*/            10 SA root skills
  nacl-tl-*/            26 TL root skills
  nacl-migrate-*/       3 deterministic migration skills
  nacl-core/            shared graph and language helpers
  nacl-render/          Markdown and Mermaid rendering
  nacl-publish/         Docmost publishing
  nacl-init/            per-project initialization
  graph-infra/          Neo4j template copied per project
  plugin/               generated Claude Desktop artifact
  .claude-plugin/       Claude marketplace manifest
  plugins/nacl/         generated Codex Git/full-plugin compatibility artifact
  analyst-tool/         local board and graph UI
  docs/                 shared documentation
```

<!-- doc-key: inventory -->
## Inventory

The repository contains 59 root NaCl skills. The public Skills-only bundle
exposes 10 self-contained conductors and carries their required internal
workflow closure. The Git/full-plugin compatibility package contains the
generated 60-skill catalog and 25 package MCP tools; those package tools are
not a prerequisite or advertised runtime surface of the official Skills-only
journey. See [Skills Reference](docs/skills-reference.md).

<!-- doc-key: requirements -->
## Requirements

- Codex Desktop or Claude Code;
- Docker and Docker Compose for a local graph;
- access to a separately operated VPS when using a remote graph;
- Node.js 20+ for the Codex Skills-only project bootstrap;
- Git 2.30+ and Node.js 18+ for repository-backed development and tooling.

The ordinary Codex plugin install itself is a UI operation. A user should not need a source checkout, terminal command, local marketplace folder, or machine-specific path.

<!-- doc-key: documentation -->
## Documentation

| Document | Purpose |
|---|---|
| [Quick Start](docs/quickstart.md) | Installation choice, dry run, and first project |
| [Codex plugin](docs/codex-plugin.md) | Public surface, permissions, and limits |
| [Graph Setup](docs/setup/graph-setup.md) | Local and VPS Neo4j modes |
| [Skills Guide](docs/skills-guide.md) | Choose the correct public conductor |
| [Skills Reference](docs/skills-reference.md) | Exact public and internal inventory |
| [Configuration](docs/configuration.md) | `config.yaml`, routing, and secrets |
| [Migration](docs/migration.md) | Deterministic Markdown-to-graph migration |
| [Handover](docs/HANDOVER.md) | Encrypted graph transfer between machines |

<!-- doc-key: contributing -->
## Contributing and license

Read [Contributing](docs/contributing.md) before opening a pull request. NaCl is released under the [MIT License](LICENSE), copyright ITSalt 2026.
