🇷🇺 [Русская версия](README.ru.md)

# NaCl

**NaCl** (Na + Cl) is a set of 55 slash-command skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that cover the entire software development lifecycle -- from business analysis and system specification to TDD development, code review, QA, and release. Business and system analysis artifacts live in a Neo4j graph database, so every requirement is queryable, traceable, and never lost in a wall of Markdown.

## How It Works

```
/nacl-init "My Project"
     |
     v
/nacl-ba-full                 Business Analysis --> Neo4j graph
     |
     v
/nacl-sa-full                 System Specification --> Neo4j graph
     |
     v
/nacl-tl-conductor            Planning + Development orchestration
     |--- /nacl-tl-plan       Create tasks from graph
     |--- /nacl-tl-dev-be           Backend TDD
     |--- /nacl-tl-dev-fe           Frontend TDD
     |--- /nacl-tl-review           Code review
     |--- /nacl-tl-qa               E2E testing (Playwright)
     |--- /nacl-tl-ship             Commit, push, PR
     |
     v
/nacl-tl-deliver --> /nacl-tl-release    Staging --> Production
```

Each use case is committed atomically. QA runs at two levels: locally during development and on staging after push.

## Key Concepts

- **Graph-first analysis.** Business processes, entities, roles, and rules are stored as Neo4j nodes and edges -- not flat files. This makes impact analysis, traceability, and validation a matter of Cypher queries rather than manual cross-referencing.

- **Skill language controls output language.** BA and SA skill prompts are written in Russian, so Claude produces Russian-language artifacts. TL skills are in English and produce English output. This is intentional -- analysis documents are for stakeholders, code is for developers.

- **Atomic commits per use case.** Each UC (use case) is developed, tested, reviewed, and shipped as a single unit. No half-done features in the repository.

- **Two-level QA.** `/nacl-tl-verify-code` runs static analysis locally during development. `/nacl-tl-qa` runs E2E tests via Playwright on staging after push.

- **Config-driven workflow.** Each project has a `config.yaml` that controls git strategy (direct vs feature-branch), Neo4j connection, Docmost space, YouGile board, and other project-specific settings.

## What's Inside

All skills use the `nacl-{layer}-{action}` naming convention: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead.

| Category | Prefix | Count | Description |
|---|---|---|---|
| **Business Analysis** | `nacl-ba-*` | 14 | Business processes, entities, roles, rules, glossary, validation. Output in Russian. |
| **System Analysis** | `nacl-sa-*` | 9 | Architecture, domain model, use cases, UI, roles, validation. Output in Russian. |
| **TeamLead** | `nacl-tl-*` | 25 | Full dev lifecycle: planning, TDD (BE/FE), code review, QA, deploy, release, hotfix, diagnostics. |
| **Utilities** | `nacl-*` | 4 | `nacl-core` (Cypher helpers), `nacl-render` (export), `nacl-publish` (Docmost sync), `nacl-init` (scaffolding). |
| **Migration** | `nacl-migrate-*` | 3 | Deterministic Markdown → Neo4j graph migration with adapter pattern. |
| | | **55** | |

## Prerequisites

- **Claude Code** -- [installation guide](https://docs.anthropic.com/en/docs/claude-code) (CLI, Desktop app, or IDE extension)
- **Docker** and **Docker Compose** -- for Neo4j and Excalidraw containers
- **Git** 2.30+
- **Node.js** 18+

### Optional integrations

- **Docmost** -- wiki for publishing analysis and specification artifacts (`nacl-publish`)
- **YouGile** -- project management board for task tracking (`yougile-setup`)

### Platform compatibility

NaCl skills work on all **local** Claude Code platforms: CLI (terminal), Desktop app (Mac/Windows), and IDE extensions (VS Code, JetBrains). All share the same `~/.claude/skills/` directory -- skills installed once are available everywhere.

> Skills do **not** work on claude.ai/code (web app) because it runs in a sandbox without local filesystem access.

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/itsalt/NaCl.git
   cd NaCl
   ```

2. **Start infrastructure**

   ```bash
   docker compose -f graph-infra/docker-compose.yml up -d    # Neo4j + Excalidraw
   ```

3. **Install skills into Claude Code**

   ```bash
   # From the NaCl directory
   claude install-skills .
   ```

   > This CLI command links skills to `~/.claude/skills/`. If you use the Desktop app or IDE extension without the CLI, see [manual linking](docs/quickstart.md#step-2-link-skills-to-claude-code).

4. **Initialize your project**

   Open Claude Code in your target project directory (CLI: `claude`, or open the project in Desktop app / IDE extension), then run:

   ```
   /nacl-init "My Project"
   ```

5. **Run the pipeline**

   Start with business analysis, then proceed through the workflow:

   ```
   > /nacl-ba-full           # analyze business domain
   > /nacl-sa-full           # create system specification
   > /nacl-tl-conductor      # plan and develop
   ```

   Each orchestrator skill (`*_full`, `*_conductor`) guides you through its phases with confirmation gates -- you stay in control at every step.

See [docs/quickstart.md](docs/quickstart.md) for a detailed walkthrough.

## Agent Architecture

NaCl routes each skill to one of 6 cognitive agents, matching task complexity to the right Claude model:

| Agent | Model | Skills | Responsibility |
|---|---|---|---|
| **strategist** | Opus | 12 | Architecture, validation, deep review |
| **analyst** | Sonnet | 13 | Domain modeling, structured content, migration parsing |
| **developer** | Sonnet | 6 | TDD code generation, bug fixes |
| **verifier** | Sonnet | 5 | Testing, verification, contract matching |
| **operator** | Sonnet | 8 | Git operations, CI/CD, publishing, migration orchestration |
| **scout** | Haiku | 6 | Fast lookups, status queries |

Agent definitions live in `.claude/agents/`. See [docs/agents.md](docs/agents.md) for the full model selection rationale.

## Migration from Markdown

Already have a project with Markdown-based BA/SA documentation? The migration pipeline converts it into the graph:

```
/nacl-migrate [project_path]
```

The migration uses deterministic Python parsing (no LLM) with an adapter pattern for different Markdown formats. See [docs/migration.md](docs/migration.md) for details.

## Handover

Transferring a project's Neo4j graph between machines is a one-shot, encrypted export/import. Useful when handing the project over to another developer or moving to a new workstation. See [docs/HANDOVER.md](docs/HANDOVER.md).

## Documentation

| Document | Description |
|---|---|
| [docs/quickstart.md](docs/quickstart.md) | Step-by-step setup and first run |
| [docs/HANDOVER.md](docs/HANDOVER.md) | Runbook for exporting and importing a graph between machines |
| [docs/architecture.md](docs/architecture.md) | Graph schema, skill interaction model, data flow |
| [docs/skills-reference.md](docs/skills-reference.md) | Full catalog of all 55 skills with parameters and examples |
| [docs/graph-schema.md](docs/graph-schema.md) | Neo4j node/edge types, constraints, indexes |
| [docs/configuration.md](docs/configuration.md) | `config.yaml` reference and environment variables |
| [docs/methodology/](docs/methodology/) | BA/SA methodology deep dive: graph philosophy, validation, traceability |
| [docs/contributing.md](docs/contributing.md) | How to add or modify skills |
| [docs/faq.md](docs/faq.md) | Common questions and troubleshooting |

## Project Structure

```
NaCl/
  .claude/agents/     6 cognitive agent definitions (strategist, analyst, developer, ...)
  nacl-ba-*/          14 business analysis skills
  nacl-sa-*/           9 system analysis skills
  nacl-tl-*/          25 development lifecycle skills
  nacl-migrate-*/      3 Markdown → Graph migration skills
  nacl-core/          shared Cypher helpers and graph utilities
  nacl-render/        Markdown and Excalidraw rendering
  nacl-publish/       Docmost publishing
  nacl-init/          project scaffolding
  nacl-tl-core/       shared TL templates and references
  graph-infra/        Neo4j + Excalidraw Docker infrastructure
  docs/               documentation
```

## Contributing

Contributions are welcome. Please read [docs/contributing.md](docs/contributing.md) before opening a pull request.

## License

[MIT](LICENSE) -- Copyright 2026 ITSalt
