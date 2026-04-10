[Home](../README.md) > Skills Reference

:ru: [Русская версия](skills-reference.ru.md)

# Skills Reference

NaCl provides **57 skills** organized by layer and function. Skills are invoked as slash commands (e.g. `/tl-fix`, `/graph_ba_full`) and can delegate to each other through sub-agent orchestration.

---

## Orchestrators (top-level entry points)

These skills manage multi-step workflows end-to-end. Start here for batch operations.

| Skill | Description | Typical invocation |
|-------|-------------|-------------------|
| `tl-conductor` | Process manager for the full development workflow: intake to staging. Creates feature branches, dispatches sub-agents for each task, commits per UC atomically, then delivers via tl-deliver. | `/tl-conductor` |
| `tl-full` | Autonomous full lifecycle orchestrator. Coordinates planning, development (BE+FE), sync, stubs, review, QA, and docs across execution waves with minimal user interaction. | `/tl-full` |
| `graph_tl_conductor` | Graph-aware batch process manager: intake to staging. Delegates planning to graph_tl_plan, dev to graph_tl_full. Graph-first equivalent of tl-conductor. | `/graph_tl_conductor` |
| `graph_tl_full` | Graph-aware full lifecycle orchestrator. Reads waves/tasks from Neo4j, updates phase status in graph. Delegates to standard dev skills. | `/graph_tl_full` |
| `graph_ba_full` | Full BA model creation in Neo4j via 10-phase orchestration. Chains all graph_ba_* skills sequentially with user confirmation gates. | `/graph_ba_full` |
| `graph_sa_full` | Full SA specification in Neo4j via 10-phase orchestration. Chains all graph_sa_* skills with user confirmation gates. | `/graph_sa_full` |

---

## Graph BA Skills (14)

Business analysis skills that store all artifacts as Neo4j graph nodes and edges. These skills produce output in Russian by design.

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `graph_ba_full` | Full BA model creation in Neo4j via 10-phase orchestration with user confirmation gates. | `/graph_ba_full` |
| `graph_ba_from_board` | Orchestrator: unified BA-board workflow combining import_doc + analyze + sync. Creates boards, imports client documents, analyzes completeness, syncs to Neo4j. | `/graph_ba_from_board create "Project Name"` |
| `graph_ba_import_doc` | Parse a client document (DOCX/PDF/XLSX/text) and place extracted business-process elements onto an Excalidraw board with swimlanes and confidence colors. | `/graph_ba_import_doc path/to/file.docx` |
| `graph_ba_analyze` | Analyze Excalidraw board: completeness, diff with snapshot, comparison with Neo4j graph. | `/graph_ba_analyze` |
| `graph_ba_sync` | Synchronize Excalidraw board with Neo4j graph: board elements become nodes and edges. | `/graph_ba_sync` |
| `graph_ba_context` | Define system boundaries in Neo4j: scope, stakeholders, external entities, data flows. | `/graph_ba_context` |
| `graph_ba_process` | Build business process map in Neo4j: process groups, processes, links, roles. | `/graph_ba_process` |
| `graph_ba_workflow` | Build activity diagrams for business processes in Neo4j: workflow steps, performers, documents, decisions. 3-swimlane decomposition. | `/graph_ba_workflow` |
| `graph_ba_entities` | Catalog business entities in Neo4j: stereotypes, attributes, states, CRUD matrix. | `/graph_ba_entities` |
| `graph_ba_roles` | Identify and describe business roles in Neo4j: departments, responsibilities, role-process matrix. | `/graph_ba_roles` |
| `graph_ba_rules` | Catalog business rules in Neo4j: constraints, calculations, invariants, authorization. | `/graph_ba_rules` |
| `graph_ba_glossary` | Build ubiquitous language glossary in Neo4j: terms, definitions, synonyms, links. | `/graph_ba_glossary` |
| `graph_ba_validate` | Validate BA model consistency via Cypher: L1-L8 internal checks, XL1-XL5 cross-validation with SA layer. Read-only. | `/graph_ba_validate` |
| `graph_ba_handoff` | Generate BA to SA handoff package from Neo4j: traceability matrix, automation scope, module suggestions, coverage stats. | `/graph_ba_handoff` |

---

## Graph SA Skills (9)

System analysis skills that produce technical specifications as Neo4j graph structures. These skills produce output in Russian by design.

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `graph_sa_full` | Full SA specification in Neo4j via 10-phase orchestration with user confirmation gates. | `/graph_sa_full` |
| `graph_sa_architect` | System decomposition into modules (Bounded Contexts), Context Map, and NFR. Reads BA data from Neo4j, writes Module/Requirement nodes. | `/graph_sa_architect` |
| `graph_sa_domain` | Domain Model through Neo4j: DomainEntity, DomainAttribute, Enumeration, relationships. Modes: IMPORT_BA, CREATE, MODIFY, FULL. | `/graph_sa_domain IMPORT_BA` |
| `graph_sa_uc` | Use Case registry from BA automation scope + UC detail (Activity, forms, requirements) via Neo4j graph. | `/graph_sa_uc` |
| `graph_sa_roles` | System roles and permission matrix through Neo4j: SystemRole, HAS_PERMISSION, MAPPED_TO. Modes: IMPORT_BA, CREATE, MODIFY, FULL. | `/graph_sa_roles IMPORT_BA` |
| `graph_sa_ui` | UI architecture through Neo4j: navigation, components, form-domain mapping verification. | `/graph_sa_ui` |
| `graph_sa_feature` | Incremental feature specification via Neo4j. Impact analysis through Cypher traversal, selective SA skill invocation, FeatureRequest artifact. | `/graph_sa_feature "Add payment support"` |
| `graph_sa_validate` | Validate specification consistency through Cypher queries. Internal (L1-L6) and cross-validation BA to SA (XL6-XL9). | `/graph_sa_validate` |
| `graph_sa_finalize` | Finalize specification via Neo4j: statistics, glossary, ADR, traceability matrix, readiness assessment. | `/graph_sa_finalize` |

---

## Graph TL Skills (6)

TeamLead skills that leverage the Neo4j graph for planning and status tracking.

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `graph_tl_conductor` | Graph-aware batch process manager: intake to staging. Delegates planning to graph_tl_plan, dev to graph_tl_full. | `/graph_tl_conductor` |
| `graph_tl_full` | Graph-aware full lifecycle orchestrator. Reads waves/tasks from Neo4j, updates phase status in graph. | `/graph_tl_full` |
| `graph_tl_plan` | Graph-based development planning from SA specifications in Neo4j. One Cypher query per UC instead of reading ~70 markdown files. Creates paired BE+FE tasks, TECH tasks, api-contracts, and execution waves. | `/graph_tl_plan` |
| `graph_tl_intake` | Graph-aware request triage: queries Neo4j to disambiguate features vs bugs. Routes features to graph_sa_feature, bugs to tl-fix, tasks to tl-dev. | `/graph_tl_intake` |
| `graph_tl_next` | Graph-aware next task recommendation with SA context enrichment. Reads Task/Wave from Neo4j, enriches with UC entity/form names. | `/graph_tl_next` |
| `graph_tl_status` | Graph-aware project status with SA coverage metrics. Reads Task/Wave nodes from Neo4j, falls back to status.json. | `/graph_tl_status` |

---

## Graph Infrastructure (3)

Shared libraries and rendering utilities used by all graph_* skills.

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `graph_core` | Shared references, templates, and utilities for all graph_* skills. Provides Neo4j connection conventions, schema references, ID format rules, and Excalidraw standards. | *(not directly invocable)* |
| `graph_render` | Convert Neo4j graph data into Markdown documents with Mermaid diagrams and Excalidraw visual boards. | `/graph_render` |
| `graph_publish` | Publish graph to Docmost and generate Excalidraw boards. | `/graph_publish` |

---

## TL Development Skills (24)

TeamLead skills for the full development lifecycle -- from planning through release.

### Planning

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-plan` | Development planning from SA specifications. Creates paired BE+FE tasks, TECH tasks, api-contracts, and execution waves. | `/tl-plan` |
| `tl-next` | Wave-aware next task recommendation with phase-level priorities. Understands execution waves, BE/FE dependencies, sync/stubs/qa phases, and critical path analysis. | `/tl-next` |
| `tl-status` | Project status reporting with per-phase progress tracking. Displays BE/FE progress per UC, TECH tasks, waves, stubs summary, QA results, sync status. | `/tl-status` |
| `tl-intake` | Triage and decompose user requests into features, bugs, and tasks. Classifies, groups by cohesion, validates with INVEST, then auto-executes the appropriate skill. | `/tl-intake` |

### Development

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-dev` | Infrastructure and TECH task development using TDD workflow. For Docker, CI/CD, migrations, and other infrastructure tasks. | `/tl-dev TECH001` |
| `tl-dev-be` | Backend TDD development from task specifications. Services, controllers, repositories, DTOs, database operations. | `/tl-dev-be UC101` |
| `tl-dev-fe` | Frontend TDD development from task specifications using React/Next.js. Components, pages, hooks, forms. | `/tl-dev-fe UC101` |

### Quality

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-review` | Code review for completed tasks (BE, FE, or TECH). | `/tl-review UC101 --be` |
| `tl-sync` | Verifies BE/FE synchronization for a UC task. Checks API contract compliance, shared types, endpoint matching, DTO consistency. | `/tl-sync UC101` |
| `tl-stubs` | Scans codebase for stubs, mocks, and placeholder code. Maintains stub-registry.json with severity tracking. | `/tl-stubs UC101` |
| `tl-verify` | Verification orchestrator: code analysis + E2E testing + YouGile reporting. Runs tl-verify-code first, then tl-qa if needed. | `/tl-verify` |
| `tl-verify-code` | Static code analysis to verify implementation correctness. Traces data flow: DB -> service -> route -> hook -> component -> UI. Returns PASS / PASS_NEEDS_E2E / FAIL. | `/tl-verify-code` |
| `tl-qa` | E2E QA testing for UC tasks using MCP Playwright. Acts as a real user: navigates pages, fills forms, clicks buttons, verifies results. | `/tl-qa UC101` |

### Shipping

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-ship` | Commit, push, create PR, and update YouGile after development. Reads git strategy from config.yaml (direct vs feature-branch). | `/tl-ship` |
| `tl-deploy` | Monitor CI/CD deployment (GitHub Actions), run health checks, update YouGile. Deployment is triggered by git push (tl-ship), this skill monitors the result. | `/tl-deploy` |
| `tl-deliver` | Delivery orchestrator: push feature branch, wait for CI, verify on staging, health check. Chains tl-ship, tl-verify, and tl-deploy into a single continuous pipeline. | `/tl-deliver` |
| `tl-release` | Version bump, git tag, changelog aggregation, release notes, YouGile notification. Run after successful production deployment. | `/tl-release` |

### Fix & Recovery

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-fix` | Spec-first bug fixing with automatic documentation sync. Auto-detects affected UC/TECH, classifies fix level (L0-L3), updates docs BEFORE code. | `/tl-fix "Login button returns 500"` |
| `tl-reopened` | Process tasks from YouGile Reopened column (failed verification/QA). Reads tester feedback, diagnoses root cause, fixes via tl-fix, ships via tl-ship. | `/tl-reopened` |
| `tl-diagnose` | Project health diagnostic -- analyzes git history, documentation drift, code health, and regression patterns. Produces DIAGNOSTIC-REPORT.md. | `/tl-diagnose` |
| `tl-reconcile` | Emergency documentation-code reconciliation. Brings all docs in sync with current code state using tl-diagnose report and SA skills. | `/tl-reconcile` |

### Documentation

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-docs` | Documentation updates for approved tasks. | `/tl-docs UC101` |

### Orchestration

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `tl-full` | Autonomous full lifecycle orchestrator. Coordinates planning, development (BE+FE), sync, stubs, review, QA, and docs across execution waves. | `/tl-full` |
| `tl-conductor` | Process manager for the full development workflow: intake to staging. Creates feature branches, dispatches sub-agents, commits per UC atomically. | `/tl-conductor` |

---

## Project Init (1)

| Skill | Description | Example invocation |
|-------|-------------|-------------------|
| `project-init` | Initialize a new project with CLAUDE.md containing development rules, skill routing, bug fix protocol, and documentation discipline. | `/project-init` |

---

## Next Steps

- [Quickstart Guide](quickstart.md) -- get up and running in minutes
- [Workflows](workflows.md) -- end-to-end workflow descriptions
- [Skills Guide](skills-guide.md) -- detailed usage patterns and best practices
