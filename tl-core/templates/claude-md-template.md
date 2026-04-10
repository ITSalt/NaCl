<!-- Instructions in English for optimal AI performance. User communicates in their preferred language. -->

# {{PROJECT_NAME}}

## Project Overview

- **Name:** {{PROJECT_NAME}}
- **Stack:** {{TECH_STACK}}
- **Description:** {{PROJECT_DESCRIPTION}}

## Development Workflow

Full project lifecycle:

1. **Business Analysis** → /ba-full (processes, entities, roles, rules)
2. **Design** → /sa-full (architecture, UC, domain model, interfaces)
3. **Planning** → /tl-plan (tasks, waves, dependencies, api-contracts)
4. **Development** → /tl-full or /tl-dev-be + /tl-dev-fe (TDD, code review)
5. **Bug Fixing** → /tl-fix "problem description" (spec-first)
6. **Diagnostics** → /tl-diagnose (for systemic issues)
7. **Reconciliation** → /tl-reconcile (for large-scale docs/code drift)
8. **QA** → /tl-qa UC### (E2E testing)

## Bug Fix Protocol

When a bug is discovered:
1. Run `/tl-fix "problem description"`
2. The skill automatically identifies affected UCs, docs, and code
3. Level classification:
   - **L1 (Code-only):** docs are up to date, bug is in implementation → fix code only
   - **L2 (Spec-sync):** docs are outdated → update docs FIRST, then code
   - **L3 (Spec-create):** docs are missing → create spec FIRST, then code

### Spec-First Principle

Specification = source of truth. When docs and code diverge — the code is wrong.
For L2/L3 fixes: FIRST define the correct behavior in documentation,
THEN write code that conforms to that behavior.

### Prohibited Actions

- Fixing code without checking docs for accuracy
- Editing docs directly, bypassing SA/TL skills
- Creating "stubs" in docs (empty UCs, TODO specifications)
- Bypassing the .tl/ workflow ("no task exists, I'll just write it directly")
- Ignoring docs vs code discrepancies during a fix

## Skill Routing

| Situation | Skill | Description |
|-----------|-------|-------------|
| **Batch of changes / mixed requests** | **/tl-intake "description"** | **Triage: split into features/bugs/tasks, auto-execute** |
| Business analysis from scratch | /ba-full | Full BA cycle (processes, entities, roles, rules) |
| Business process | /ba-process | Business process mapping |
| Business entities | /ba-entities | Business object descriptions |
| Business rules | /ba-rules | Catalog of constraints, calculations, invariants |
| BA validation | /ba-validate | BA artifact validation (L1-L8) |
| Design from scratch | /sa-full | Full specification (architecture, UC, domain) |
| **Add feature** | **/sa-feature "description"** | **Incremental feature spec + FeatureRequest for TL** |
| Use Case | /sa-uc UC### | UC detail: activity diagram, forms, requirements |
| Domain Model | /sa-domain | Entities, relationships, statuses, business rules |
| Architecture | /sa-architect | Modules, bounded contexts, NFR |
| Interfaces | /sa-ui | Navigation, components, layout |
| SA validation | /sa-validate | Specification validation (L1-L6, XL6-XL9) |
| Development plan | /tl-plan | Tasks, waves, dependencies, api-contracts |
| Full dev cycle | /tl-full | Autonomous orchestration BE+FE+review+QA |
| Backend development | /tl-dev-be UC### | TDD backend |
| Frontend development | /tl-dev-fe UC### | TDD frontend |
| Infrastructure | /tl-dev TECH### | TECH tasks |
| **Bug** | **/tl-fix "description"** | **Spec-first bug fixing with docs sync** |
| **Everything is broken** | **/tl-diagnose** | **Project state diagnostics** |
| **Docs/code drift** | **/tl-reconcile** | **Emergency alignment of docs and code** |
| Code review | /tl-review UC### --be/--fe | BE/FE review |
| Project status | /tl-status | Progress, blockers, waves |
| Next task | /tl-next | Recommendation based on waves and dependencies |
| Release preparation | /tl-stubs --final | Check for stubs, mocks, placeholders |
| QA | /tl-qa UC### | E2E testing via MCP Playwright |
| Task documentation | /tl-docs UC### | Update docs after implementation |

## Documentation Rules

1. **Documentation = source of truth.** When docs and code diverge — the code is wrong.
2. **Docs are changed ONLY through skills:** /sa-uc, /sa-domain, /tl-fix, /tl-reconcile, /tl-docs.
3. **Spec-first:** When fixing a bug that changes behavior (L2/L3) — docs FIRST, THEN code.
4. **No ad-hoc docs:** If no task exists in .tl/ — CREATE a task instead of bypassing the workflow.
5. **Artifact hierarchy:** BA → SA → TL → Code. Each level follows the previous one.

## Architecture Conventions

{{ARCHITECTURE_SECTION}}

## Deployment

{{DEPLOYMENT_SECTION}}
