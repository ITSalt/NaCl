[Home](../README.md) > Architecture

🇷🇺 [Русская версия](architecture.ru.md)

# Architecture

NaCl implements a three-layer pipeline where each layer transforms artifacts from the previous one. A Neo4j knowledge graph provides cross-layer traceability and impact analysis.

## The Pipeline

```
Graph BA (Business Analysis)     Graph SA (System Analysis)      TL (Development)
─────────────────────────────    ──────────────────────────      ─────────────────
Stakeholders, processes,         Modules, domain model,          Tasks, waves,
entities, roles, glossary,       use cases, forms, roles,        TDD code, review,
rules, workflows                 API contracts, UI               QA, ship, deploy
        │                                │                              │
        ▼                                ▼                              ▼
   Neo4j Graph                      Neo4j Graph                   Files + Git
   (BA layer nodes)                 (SA layer nodes)              (src/, docs/, .tl/)
```

Each layer has:
- **An orchestrator** that runs all steps automatically (`graph_ba_full`, `graph_sa_full`, `graph_tl_conductor`)
- **Individual skills** that can be invoked manually for specific tasks

## Neo4j as Knowledge Graph

All business and system analysis data lives in Neo4j as typed nodes and relationships:

```
(:BusinessProcess)-[:HAS_STEP]->(:WorkflowStep)
(:WorkflowStep)-[:PRODUCES]->(:BusinessEntity)
(:BusinessEntity)-[:MAPPED_TO]->(:DomainEntity)
(:DomainEntity)-[:USED_IN]->(:UseCase)
(:UseCase)-[:HAS_FORM]->(:Form)
```

This enables:
- **Cross-layer traceability**: trace a UI form back to the business process that requires it
- **Impact analysis**: change a business entity and instantly see all affected UCs, forms, and modules
- **Consistency validation**: Cypher queries detect orphaned nodes, missing relationships, naming conflicts

## Orchestration Hierarchy

```
Level 4: graph_tl_conductor          (full pipeline: intake → dev → staging)
Level 3: graph_ba_full / graph_sa_full / tl-full   (layer orchestrators)
Level 2: graph_ba_context / tl-dev-be / tl-qa      (individual skills)
Level 1: graph_core / tl-core                       (shared references)
```

**Level 4** orchestrates the entire workflow — from user requests to deployed code.
**Level 3** orchestrators chain all skills within their layer.
**Level 2** skills perform specific tasks (create a domain model, run tests, etc.).
**Level 1** provides shared templates, conventions, and utilities.

## Artifact Flow

```
User input (interviews, documents)
    ↓
graph_ba_* → Neo4j BA nodes (processes, entities, roles, rules)
    ↓
graph_sa_* → Neo4j SA nodes (modules, domain, UCs, forms, API contracts)
    ↓
graph_tl_plan → .tl/tasks/ (task files with specs from graph)
    ↓
tl-dev-be → src/ backend code (TDD: test first, then implementation)
tl-dev-fe → src/ frontend code (TDD: same approach)
    ↓
tl-ship → git commit + push + PR
tl-deploy → CI/CD → staging
tl-release → production
```

## Skill Anatomy

Each skill is a directory with a `SKILL.md` file:

```
graph_ba_context/
└── SKILL.md          # YAML frontmatter + prompt instructions
```

The SKILL.md contains:
1. **YAML frontmatter** — `name` and `description` (used for skill discovery)
2. **Role declaration** — who the AI agent pretends to be
3. **Workflow phases** — numbered steps with user interaction gates
4. **Templates and rules** — output format specifications
5. **References** — links to shared resources in `graph_core/` or `tl-core/`

## config.yaml

Every target project has a `config.yaml` at root with project-specific settings:

```yaml
project:
  name: "My Project"
  stack: "Next.js + Fastify + PostgreSQL"

git:
  strategy: "feature-branch"    # or "direct"
  main_branch: "main"

modules:
  frontend:
    path: "frontend"
    test_cmd: "npm test"
  backend:
    path: "backend"
    test_cmd: "npm test"

graph:                          # only if using graph skills
  neo4j_bolt_port: 3587
  neo4j_http_port: 3574
  neo4j_password: "neo4j_graph_dev"
  excalidraw_port: 3580
  container_prefix: "my-project"
  boards_dir: "graph-infra/boards"
```

Skills read `config.yaml` at runtime to adapt behavior to the project.

## Next Steps

- [Skills Reference](skills-reference.md) — complete catalog of all 56 skills
- [Workflows](workflows.md) — end-to-end scenarios
- [Quick Start](quickstart.md) — get started in 10 minutes
