🇷🇺 [Русская версия](README.ru.md)

# NaCl

**NaCl** (Na + Cl) is a set of 56 slash-command skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that cover the entire software development lifecycle -- from business analysis and system specification to TDD development, code review, QA, and release. Business and system analysis artifacts live in a Neo4j graph database, so every requirement is queryable, traceable, and never lost in a wall of Markdown.

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

- **Skill language controls output language.** Graph BA and Graph SA skill prompts are written in Russian, so Claude produces Russian-language artifacts. TL skills are in English and produce English output. This is intentional -- analysis documents are for stakeholders, code is for developers.

- **Atomic commits per use case.** Each UC (use case) is developed, tested, reviewed, and shipped as a single unit. No half-done features in the repository.

- **Two-level QA.** `/nacl-tl-verify-code` runs static analysis locally during development. `/nacl-tl-qa` runs E2E tests via Playwright on staging after push.

- **Config-driven workflow.** Each project has a `config.yaml` that controls git strategy (direct vs feature-branch), Neo4j connection, Docmost space, YouGile board, and other project-specific settings.

## What's Inside

All skills use the `nacl-{layer}-{action}` naming convention: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead.

| Category | Prefix | Count | Description |
|---|---|---|---|
| **Business Analysis** | `nacl-ba-*` | 14 | Business processes, entities, roles, rules, glossary, validation. Output in Russian. |
| **System Analysis** | `nacl-sa-*` | 9 | Architecture, domain model, use cases, UI, roles, validation. Output in Russian. |
| **TeamLead** | `nacl-tl-*` | 24 | Full dev lifecycle: planning, TDD (BE/FE), code review, QA, deploy, release, diagnostics. |
| **Utilities** | `nacl-*` | 4 | `nacl-core` (Cypher helpers), `nacl-render` (export), `nacl-publish` (Docmost sync), `nacl-init` (scaffolding). |
| | | **51** | |

## Prerequisites

- **Claude Code CLI** -- [installation guide](https://docs.anthropic.com/en/docs/claude-code)
- **Docker** and **Docker Compose** -- for Neo4j and Excalidraw containers
- **Git** 2.30+
- **Node.js** 18+

### Optional integrations

- **Docmost** -- wiki for publishing analysis and specification artifacts (`nacl-publish`)
- **YouGile** -- project management board for task tracking (`yougile-setup`)

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/itsalt/NaCl.git
   cd NaCl
   ```

2. **Start infrastructure**

   ```bash
   docker compose up -d    # Neo4j + Excalidraw
   ```

3. **Install skills into Claude Code**

   ```bash
   # From the NaCl directory
   claude install-skills .
   ```

4. **Initialize your project**

   ```bash
   cd /path/to/your-project
   claude
   > /nacl-init "My Project"
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

## Documentation

| Document | Description |
|---|---|
| [docs/quickstart.md](docs/quickstart.md) | Step-by-step setup and first run |
| [docs/architecture.md](docs/architecture.md) | Graph schema, skill interaction model, data flow |
| [docs/skills-reference.md](docs/skills-reference.md) | Full catalog of all 56 skills with parameters and examples |
| [docs/graph-schema.md](docs/graph-schema.md) | Neo4j node/edge types, constraints, indexes |
| [docs/configuration.md](docs/configuration.md) | `config.yaml` reference and environment variables |
| [docs/contributing.md](docs/contributing.md) | How to add or modify skills |
| [docs/faq.md](docs/faq.md) | Common questions and troubleshooting |

## Project Structure

```
NaCl/
  nacl-ba-*/          14 business analysis skills
  nacl-sa-*/           9 system analysis skills
  nacl-tl-*/          24 development lifecycle skills
  nacl-core/          shared Cypher helpers and graph utilities
  nacl-render/        Markdown and Excalidraw rendering
  nacl-publish/       Docmost publishing
  nacl-init/          project scaffolding
  nacl-tl-core/       shared TL templates and references
  docs/                documentation
  docker-compose.yml   Neo4j + Excalidraw infrastructure
```

## Contributing

Contributions are welcome. Please read [docs/contributing.md](docs/contributing.md) before opening a pull request.

## License

[MIT](LICENSE) -- Copyright 2026 ITSalt
