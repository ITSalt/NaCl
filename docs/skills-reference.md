[Home](../README.md) > Skills Reference

:ru: [Русская версия](skills-reference.ru.md)

# Skills Reference

NaCl provides **55 skills** organized by layer and function. All skills follow the `nacl-{layer}-{action}` naming convention: **BA** = Business Analysis, **SA** = System Analysis, **TL** = TeamLead. Skills are invoked as slash commands (e.g. `/nacl-tl-fix`, `/nacl-ba-full`) and can delegate to each other through sub-agent orchestration.

> **See also:** [Skill Modifiers Reference](skill-modifiers.md) — full documentation of all flags, modes, and subcommands.

---

## Orchestrators (top-level entry points)

These skills manage multi-step workflows end-to-end. Start here for batch operations.

| Skill | Description | Typical invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-ba-full` | Full BA model creation in Neo4j via 10-phase orchestration. Chains all nacl-ba-* skills sequentially with user confirmation gates. | `/nacl-ba-full` | — |
| `nacl-sa-full` | Full SA specification in Neo4j via 10-phase orchestration. Chains all nacl-sa-* skills with user confirmation gates. | `/nacl-sa-full` | — |
| `nacl-tl-conductor` | Batch process manager: intake to staging. Delegates planning to nacl-tl-plan, dev to nacl-tl-full. Reads waves/tasks from Neo4j. | `/nacl-tl-conductor` | `--items`, `--feature`, `--skip-deliver`, `--yes` |
| `nacl-tl-full` | Full lifecycle orchestrator. Reads waves/tasks from Neo4j, coordinates planning, development (BE+FE), sync, stubs, review, QA, and docs across execution waves. | `/nacl-tl-full` | `--wave`, `--task`, `--feature`, `--skip-plan`, `--yes` |

---

## BA Skills — Business Analysis (14)

Business analysis skills that store all artifacts as Neo4j graph nodes and edges. These skills produce output in Russian by design.

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-ba-full` | Full BA model creation in Neo4j via 10-phase orchestration with user confirmation gates. | `/nacl-ba-full` | — |
| `nacl-ba-from-board` | Orchestrator: unified BA-board workflow combining import_doc + analyze + sync. Creates boards, imports client documents, analyzes completeness, syncs to Neo4j. | `/nacl-ba-from-board import doc.docx` | Subcommands: `new`, `import`, `analyze`, `sync`, `full` [+4](skill-modifiers.md#nacl-ba-from-board) |
| `nacl-ba-import-doc` | Parse a client document (DOCX/PDF/XLSX/text) and place extracted business-process elements onto an Excalidraw board with swimlanes and confidence colors. | `/nacl-ba-import-doc path/to/file.docx` | — |
| `nacl-ba-analyze` | Analyze Excalidraw board: completeness, diff with snapshot, comparison with Neo4j graph. | `/nacl-ba-analyze` | — |
| `nacl-ba-sync` | Synchronize Excalidraw board with Neo4j graph: board elements become nodes and edges. | `/nacl-ba-sync` | — |
| `nacl-ba-context` | Define system boundaries in Neo4j: scope, stakeholders, external entities, data flows. | `/nacl-ba-context` | — |
| `nacl-ba-process` | Build business process map in Neo4j: process groups, processes, links, roles. | `/nacl-ba-process` | — |
| `nacl-ba-workflow` | Build activity diagrams for business processes in Neo4j: workflow steps, performers, documents, decisions. 3-swimlane decomposition. | `/nacl-ba-workflow` | — |
| `nacl-ba-entities` | Catalog business entities in Neo4j: stereotypes, attributes, states, CRUD matrix. | `/nacl-ba-entities mode=FULL` | Modes: `FULL`, `CREATE`, `MODIFY`, `COLLECT` |
| `nacl-ba-roles` | Identify and describe business roles in Neo4j: departments, responsibilities, role-process matrix. | `/nacl-ba-roles` | — |
| `nacl-ba-rules` | Catalog business rules in Neo4j: constraints, calculations, invariants, authorization. | `/nacl-ba-rules scope=full` | Modes: `full`, `add` |
| `nacl-ba-glossary` | Build ubiquitous language glossary in Neo4j: terms, definitions, synonyms, links. | `/nacl-ba-glossary` | — |
| `nacl-ba-validate` | Validate BA model consistency via Cypher: L1-L8 internal checks, XL1-XL5 cross-validation with SA layer. Read-only. | `/nacl-ba-validate` | Modes: `internal`, `cross`, `full` |
| `nacl-ba-handoff` | Generate BA to SA handoff package from Neo4j: traceability matrix, automation scope, module suggestions, coverage stats. | `/nacl-ba-handoff` | — |

---

## SA Skills — System Analysis (9)

System analysis skills that produce technical specifications as Neo4j graph structures. These skills produce output in Russian by design.

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-sa-full` | Full SA specification in Neo4j via 10-phase orchestration with user confirmation gates. | `/nacl-sa-full` | — |
| `nacl-sa-architect` | System decomposition into modules (Bounded Contexts), Context Map, and NFR. Reads BA data from Neo4j, writes Module/Requirement nodes. | `/nacl-sa-architect` | — |
| `nacl-sa-domain` | Domain Model through Neo4j: DomainEntity, DomainAttribute, Enumeration, relationships. Modes: IMPORT_BA, CREATE, MODIFY, FULL. | `/nacl-sa-domain IMPORT_BA` | Modes: `IMPORT_BA`, `CREATE`, `MODIFY`, `FULL` |
| `nacl-sa-uc` | Use Case registry from BA automation scope + UC detail (Activity, forms, requirements) via Neo4j graph. | `/nacl-sa-uc stories` | Subcommands: `stories`, `detail`, `list` |
| `nacl-sa-roles` | System roles and permission matrix through Neo4j: SystemRole, HAS_PERMISSION, MAPPED_TO. Modes: IMPORT_BA, CREATE, MODIFY, FULL. | `/nacl-sa-roles IMPORT_BA` | Modes: `IMPORT_BA`, `CREATE`, `MODIFY`, `FULL` |
| `nacl-sa-ui` | UI architecture through Neo4j: navigation, components, form-domain mapping verification. | `/nacl-sa-ui verify` | Subcommands: `verify`, `components`, `navigation`, `full` |
| `nacl-sa-feature` | Incremental feature specification via Neo4j. Impact analysis through Cypher traversal, selective SA skill invocation, FeatureRequest artifact. | `/nacl-sa-feature "Add payment support"` | — |
| `nacl-sa-validate` | Validate specification consistency through Cypher queries. Internal (L1-L6) and cross-validation BA to SA (XL6-XL9). | `/nacl-sa-validate` | Modes: `internal`, `ba-cross`; `--scope` |
| `nacl-sa-finalize` | Finalize specification via Neo4j: statistics, glossary, ADR, traceability matrix, readiness assessment. | `/nacl-sa-finalize` | Modes: `full`, `module`, `stats-only` |

---

## Utilities (4)

Shared libraries, rendering, and project scaffolding.

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-core` | Shared references, templates, and utilities for all nacl-* skills. Provides Neo4j connection conventions, schema references, ID format rules, and Excalidraw standards. | *(not directly invocable)* | — |
| `nacl-render` | Convert Neo4j graph data into Markdown documents with Mermaid diagrams and Excalidraw visual boards. | `/nacl-render md uc UC-101` | Namespaces: `md`, `excalidraw`; `--output` |
| `nacl-publish` | Publish graph to Docmost and generate Excalidraw boards. | `/nacl-publish docmost` | Subcommands: `docmost`, `boards`, `full` [+3](skill-modifiers.md#nacl-publish) |
| `nacl-init` | Initialize a new project with CLAUDE.md containing development rules, skill routing, bug fix protocol, and documentation discipline. | `/nacl-init "Name"` | `--from=.`, `--dry-run` |

---

## TL Skills — TeamLead (25)

TeamLead skills for the full development lifecycle -- from planning through release.

### Planning

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-plan` | Development planning from SA specifications. Creates paired BE+FE tasks, TECH tasks, api-contracts, and execution waves. | `/nacl-tl-plan` | `scope=`, `--feature FR-NNN` |
| `nacl-tl-next` | Wave-aware next task recommendation with phase-level priorities. Understands execution waves, BE/FE dependencies, sync/stubs/qa phases, and critical path analysis. | `/nacl-tl-next` | `--be`, `--fe`, `--tech`, `--wave N`, `--list` [+3](skill-modifiers.md#nacl-tl-next) |
| `nacl-tl-status` | Project status reporting with per-phase progress tracking. Displays BE/FE progress per UC, TECH tasks, waves, stubs summary, QA results, sync status. | `/nacl-tl-status` | `--waves`, `--be`, `--fe`, `--tech`, `--qa`, `--blocked`, `--compact` [+1](skill-modifiers.md#nacl-tl-status) |
| `nacl-tl-intake` | Triage and decompose user requests into features, bugs, and tasks. Classifies, groups by cohesion, validates with INVEST, then auto-executes the appropriate skill. | `/nacl-tl-intake` | — |

### Development

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-dev` | Infrastructure and TECH task development using TDD workflow. For Docker, CI/CD, migrations, and other infrastructure tasks. | `/nacl-tl-dev TECH001` | `--continue`, `--dry-run` |
| `nacl-tl-dev-be` | Backend TDD development from task specifications. Services, controllers, repositories, DTOs, database operations. | `/nacl-tl-dev-be UC101` | `--continue`, `--dry-run` |
| `nacl-tl-dev-fe` | Frontend TDD development from task specifications using React/Next.js. Components, pages, hooks, forms. | `/nacl-tl-dev-fe UC101` | `--continue`, `--dry-run` |

### Quality

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-review` | Code review for completed tasks (BE, FE, or TECH). | `/nacl-tl-review UC101 --be` | `--be`, `--fe` |
| `nacl-tl-sync` | Verifies BE/FE synchronization for a UC task. Checks API contract compliance, shared types, endpoint matching, DTO consistency. | `/nacl-tl-sync UC101` | — |
| `nacl-tl-stubs` | Scans codebase for stubs, mocks, and placeholder code. Maintains stub-registry.json with severity tracking. | `/nacl-tl-stubs UC101` | `--final` |
| `nacl-tl-verify` | Verification orchestrator: code analysis + E2E testing + YouGile reporting. Runs nacl-tl-verify-code first, then nacl-tl-qa if needed. | `/nacl-tl-verify UC101` | `--task`, `--all` |
| `nacl-tl-verify-code` | Static code analysis to verify implementation correctness. Traces data flow: DB -> service -> route -> hook -> component -> UI. Returns PASS / PASS_NEEDS_E2E / FAIL. | `/nacl-tl-verify-code UC101` | `--task`, `--files` |
| `nacl-tl-qa` | E2E QA testing for UC tasks using MCP Playwright. Acts as a real user: navigates pages, fills forms, clicks buttons, verifies results. | `/nacl-tl-qa UC101` | — |

### Shipping

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-ship` | Commit, push, create PR, and update YouGile after development. Reads git strategy from config.yaml (direct vs feature-branch). | `/nacl-tl-ship` | `--deploy`, `--feature` |
| `nacl-tl-deploy` | Monitor CI/CD deployment (GitHub Actions), run health checks, update YouGile. Deployment is triggered by git push (nacl-tl-ship), this skill monitors the result. | `/nacl-tl-deploy` | `--staging`, `--production`, `--watch` |
| `nacl-tl-deliver` | Delivery orchestrator: push feature branch, wait for CI, verify on staging, health check. Chains nacl-tl-ship, nacl-tl-verify, and nacl-tl-deploy into a single continuous pipeline. | `/nacl-tl-deliver` | `--feature`, `--env`, `--skip-verify`, `--skip-deploy` |
| `nacl-tl-release` | Version bump, git tag, changelog aggregation, release notes, YouGile notification. Run after successful production deployment. | `/nacl-tl-release` | `--major`, `--minor`, `--patch`, `--skip-merge`, `--dry-run`, `--yes` |

### Fix & Recovery

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-fix` | Spec-first bug fixing with automatic documentation sync. Auto-detects affected UC/TECH, classifies fix level (L0-L3), updates docs BEFORE code. | `/nacl-tl-fix "Login button returns 500"` | `--dry-run`, `--l1`, `--auto-ship` |
| `nacl-tl-reopened` | Process tasks from YouGile Reopened column (failed verification/QA). Reads tester feedback, diagnoses root cause, fixes via nacl-tl-fix, ships via nacl-tl-ship. | `/nacl-tl-reopened` | `--task`, `--all`, `--yes`, `--auto-ship`, `--dry-run` |
| `nacl-tl-diagnose` | Project health diagnostic -- analyzes git history, documentation drift, code health, and regression patterns. Produces DIAGNOSTIC-REPORT.md. | `/nacl-tl-diagnose` | `--since`, `--focus` |
| `nacl-tl-hotfix` | Emergency hotfix to main: stash/cherry-pick changes, create hotfix branch from main, validate, open PR with auto-merge, restore source branch. | `/nacl-tl-hotfix --apply` | `--apply`, `--cherry-pick`, `--force-push`, `--rebase-feature`, `--dry-run`, `--yes` |
| `nacl-tl-reconcile` | Emergency documentation-code reconciliation. Brings all docs in sync with current code state using nacl-tl-diagnose report and SA skills. | `/nacl-tl-reconcile` | `--report`, `--scope`, `--dry-run`, `--force` |

### Documentation

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-docs` | Documentation updates for approved tasks. | `/nacl-tl-docs UC101` | — |

### Orchestration

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-tl-full` | Autonomous full lifecycle orchestrator. Coordinates planning, development (BE+FE), sync, stubs, review, QA, and docs across execution waves. | `/nacl-tl-full --task UC001` | `--wave`, `--task`, `--feature`, `--skip-plan`, `--skip-qa`, `--yes` |
| `nacl-tl-conductor` | Process manager for the full development workflow: intake to staging. Creates feature branches, dispatches sub-agents, commits per UC atomically. | `/nacl-tl-conductor --items FR-001` | `--items`, `--feature`, `--branch`, `--skip-deliver`, `--skip-qa`, `--yes` |

---

## Migration Skills (3)

Skills for migrating existing projects from markdown-based specs into the NaCl graph format.

| Skill | Description | Example invocation | Key modifiers |
|-------|-------------|-------------------|---------------|
| `nacl-migrate` | Orchestrator for migrating an existing project's markdown specifications into Neo4j graph format. Chains nacl-migrate-ba and nacl-migrate-sa with user confirmation gates. | `/nacl-migrate` | — |
| `nacl-migrate-ba` | Extract and import BA artifacts (processes, entities, roles, rules) from existing markdown documents into Neo4j BA layer nodes. | `/nacl-migrate-ba path/to/docs` | — |
| `nacl-migrate-sa` | Extract and import SA artifacts (modules, use cases, domain model, forms) from existing markdown documents into Neo4j SA layer nodes. | `/nacl-migrate-sa path/to/docs` | — |

---

## Next Steps

- [Quickstart Guide](quickstart.md) -- get up and running in minutes
- [Workflows](workflows.md) -- end-to-end workflow descriptions
- [Skills Guide](skills-guide.md) -- detailed usage patterns and best practices
- [Skill Modifiers Reference](skill-modifiers.md) -- complete documentation of all flags, modes, and subcommands
