<!-- Instructions in English for optimal AI performance. User communicates in their preferred language. -->

# {{PROJECT_NAME}}

## Project Overview

- **Name:** {{PROJECT_NAME}}
- **Stack:** {{TECH_STACK}}
- **Description:** {{PROJECT_DESCRIPTION}}

## Development Workflow

Full project lifecycle:

1. **Business Analysis** → /nacl-ba-full (processes, entities, roles, rules)
2. **Design** → /nacl-sa-full (architecture, UC, domain model, interfaces)
3. **Planning** → /nacl-tl-plan (tasks, waves, dependencies, api-contracts)
4. **Development** → /nacl-tl-full or /nacl-tl-dev-be + /nacl-tl-dev-fe (TDD, code review)
5. **Bug Fixing** → /nacl-tl-fix "problem description" (spec-first)
6. **Diagnostics** → /nacl-tl-diagnose (for systemic issues)
7. **Reconciliation** → /nacl-tl-reconcile (for large-scale docs/code drift)
8. **QA** → /nacl-tl-qa UC### (E2E testing)

## Bug Fix Protocol

When a bug is discovered:
1. Run `/nacl-tl-fix "problem description"`
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
| **Batch of changes / mixed requests** | **/nacl-tl-intake "description"** | **Triage: split into features/bugs/tasks, auto-execute** |
| Business analysis from scratch | /nacl-ba-full | Full BA cycle (processes, entities, roles, rules) |
| Business process | /nacl-ba-process | Business process mapping |
| Business entities | /nacl-ba-entities | Business object descriptions |
| Business rules | /nacl-ba-rules | Catalog of constraints, calculations, invariants |
| BA validation | /nacl-ba-validate | BA artifact validation (L1-L8) |
| Design from scratch | /nacl-sa-full | Full specification (architecture, UC, domain) |
| **Add feature** | **/nacl-sa-feature "description"** | **Incremental feature spec + FeatureRequest for TL** |
| Use Case | /nacl-sa-uc UC### | UC detail: activity diagram, forms, requirements |
| Domain Model | /nacl-sa-domain | Entities, relationships, statuses, business rules |
| Architecture | /nacl-sa-architect | Modules, bounded contexts, NFR |
| Interfaces | /nacl-sa-ui | Navigation, components, layout |
| SA validation | /nacl-sa-validate | Specification validation (L1-L6, XL6-XL9) |
| Development plan | /nacl-tl-plan | Tasks, waves, dependencies, api-contracts |
| Full dev cycle | /nacl-tl-full | Autonomous orchestration BE+FE+review+QA |
| Backend development | /nacl-tl-dev-be UC### | TDD backend |
| Frontend development | /nacl-tl-dev-fe UC### | TDD frontend |
| Infrastructure | /nacl-tl-dev TECH### | TECH tasks |
| **Bug** | **/nacl-tl-fix "description"** | **Spec-first bug fixing with docs sync** |
| **Everything is broken** | **/nacl-tl-diagnose** | **Project state diagnostics** |
| **Docs/code drift** | **/nacl-tl-reconcile** | **Emergency alignment of docs and code** |
| Code review | /nacl-tl-review UC### --be/--fe | BE/FE review |
| Project status | /nacl-tl-status | Progress, blockers, waves |
| Next task | /nacl-tl-next | Recommendation based on waves and dependencies |
| Release preparation | /nacl-tl-stubs --final | Check for stubs, mocks, placeholders |
| QA | /nacl-tl-qa UC### | E2E testing via MCP Playwright |
| Task documentation | /nacl-tl-docs UC### | Update docs after implementation |

## Documentation Rules

1. **Documentation = source of truth.** When docs and code diverge — the code is wrong.
2. **Docs are changed ONLY through skills:** /nacl-sa-uc, /nacl-sa-domain, /nacl-tl-fix, /nacl-tl-reconcile, /nacl-tl-docs.
3. **Spec-first:** When fixing a bug that changes behavior (L2/L3) — docs FIRST, THEN code.
4. **No ad-hoc docs:** If no task exists in .tl/ — CREATE a task instead of bypassing the workflow.
5. **Artifact hierarchy:** BA → SA → TL → Code. Each level follows the previous one.

## Architecture Conventions

{{ARCHITECTURE_SECTION}}

## Deployment

{{DEPLOYMENT_SECTION}}

## /goal command — local rules

The `/goal` command (Claude Code 2.1.139+) sets a session-scoped objective evaluated by a transcript-only sub-model. Use it only with skills that have a `## Use with /goal` section in their SKILL.md. Skills with `## NOT for /goal` sections will refuse the wrapper at invocation time.

**Supported aliases for this project** (check `nacl-goal/aliases.md` for the current list):

| Alias | Skill | Tier | When to use |
|-------|-------|------|-------------|
| `wave:<N>` | /nacl-tl-full | M | Drive an entire development wave to completion |
| `feature:<FR-NNN>` | /nacl-tl-conductor | L | Deploy a single feature request end-to-end |
| `batch:<list>` | /nacl-tl-conductor | L | Deploy a comma-separated list of FR/task IDs |
| `reopened-drain` | /nacl-tl-reopened | M | Drain the Reopened column to empty |
| `validate:module:<MOD-ID>` | /nacl-sa-validate | S | Run all SA checks for one module |
| `fix:<BUG-NNN>` | /nacl-tl-fix | S | Drive a single bug fix to RED→GREEN |

**Tiers (soft limits):** S = 150 turns / 2h / 3M tokens, M = 500 / 6h / 8M, L = 1200 / 16h / 20M.

**Never wrap with /goal:**
- `/nacl-ba-full` — BA→SA handoff gate requires human review (`REFUSE_HUMAN_GATE_BA_SA_HANDOFF`)
- `/nacl-sa-full` — every phase boundary requires domain expert confirmation (`REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION`)
- `/nacl-tl-hotfix` — production branch decisions require operator presence (`REFUSE_HOTFIX_JUDGMENT`)

**Check scripts** live in `nacl-goal/checks/`. Each script exits 0 and prints a `GOAL_PROOF` / `END_GOAL_PROOF` block to stdout. The `/goal` evaluator reads the block; the primary session prints it to the transcript at the end of every turn.

**Reference:** `docs/guides/goal-command.md`
