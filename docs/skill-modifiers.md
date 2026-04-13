[Home](../README.md) > Skill Modifiers Reference

:ru: [Русская версия](skill-modifiers.ru.md)

# Skill Modifiers Reference

Modifiers are arguments that change how a skill behaves when invoked. They include flags (`--deploy`), modes (`IMPORT_BA`), subcommands (`sync`), and positional identifiers (`UC028`).

This document is the **central reference** for all modifiers across all NaCl skills.

---

## Conventions

NaCl skills use three invocation paradigms. Each paradigm fits a specific type of skill.

| Paradigm | When to Use | Syntax | Example |
|----------|------------|--------|---------|
| **Mode** (positional) | Skill has 2-5 mutually exclusive workflow branches | `/skill MODE` | `/nacl-sa-domain IMPORT_BA` |
| **Subcommand** | Skill groups 3+ distinct operations under one namespace | `/skill command [args]` | `/nacl-ba-from-board sync` |
| **Flag** | Skill has optional behavioral modifiers | `/skill [target] --flag [--key value]` | `/nacl-tl-ship UC028 --deploy` |

### Naming Rules

- **Flags:** kebab-case with double dashes: `--skip-verify`, `--dry-run`, `--auto-ship`
- **Mode values:** UPPER_CASE for CRUD-like workflow branches: `FULL`, `CREATE`, `MODIFY`, `IMPORT_BA`. Lowercase for utility modes: `full`, `module`, `stats-only`, `internal`
- **Subcommands:** lowercase: `sync`, `verify`, `stories`, `docmost`
- **Positional identifiers:** match the ID format of their layer: `UC028`, `FR-001`, `TECH003`, `ELE-644`

---

## Universal Flag Families

These flags appear across multiple TL skills. When designing a new skill, reuse these before inventing new ones.

### Task Type Filters

| Flag | Meaning | Used by |
|------|---------|---------|
| `--be` | Backend tasks only | `nacl-tl-review`, `nacl-tl-next`, `nacl-tl-status` |
| `--fe` | Frontend tasks only | `nacl-tl-review`, `nacl-tl-next`, `nacl-tl-status` |
| `--tech` | Infrastructure/TECH tasks only | `nacl-tl-next`, `nacl-tl-status` |

### Workflow Phase Filters

| Flag | Meaning | Used by |
|------|---------|---------|
| `--review` | Review-pending tasks only | `nacl-tl-next` |
| `--sync` | Sync-pending tasks only | `nacl-tl-next` |
| `--qa` | QA-pending tasks only | `nacl-tl-next` |

### Scope Selectors

| Flag | Meaning | Used by |
|------|---------|---------|
| `--wave N` | Limit to wave number N | `nacl-tl-next`, `nacl-tl-full` |
| `--feature FR-NNN` | Limit to a feature request | `nacl-tl-ship`, `nacl-tl-plan`, `nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-deliver` |
| `--task UC###` or `CODE` | Limit to a single task | `nacl-tl-full`, `nacl-tl-reopened`, `nacl-tl-verify`, `nacl-tl-verify-code` |
| `--pr N,N` | Specific PR numbers | `nacl-tl-release` |
| `--items X,Y,Z` | Comma-separated item list | `nacl-tl-conductor` |
| `--branch <name>` | Explicit branch name | `nacl-tl-conductor`, `nacl-tl-deliver` |
| `--all` | Process all available items | `nacl-tl-verify`, `nacl-tl-reopened` |

### Skip Flags

Skip a named workflow phase. Pattern: `--skip-{phase}`.

| Flag | Meaning | Used by |
|------|---------|---------|
| `--skip-verify` | Skip staging verification | `nacl-tl-deliver` |
| `--skip-deploy` | Skip health check / deploy | `nacl-tl-deliver` |
| `--skip-plan` | Skip planning phase | `nacl-tl-full` |
| `--skip-qa` | Skip E2E QA testing | `nacl-tl-full`, `nacl-tl-conductor` |
| `--skip-merge` | Skip PR merge steps | `nacl-tl-release` |
| `--skip-deliver` | Skip delivery step | `nacl-tl-conductor` |

### User Gate Controls

These are **semantic inverses** by design:

| Flag | Meaning | Used by |
|------|---------|---------|
| `--yes` | Skip confirmation gates (proceed automatically) | `nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-reopened`, `nacl-tl-hotfix`, `nacl-tl-release` |
| `--confirm` | Add confirmation gates (require explicit approval) | `nacl-tl-fix` |

### Safety Controls

| Flag | Meaning | Risk Level | Used by |
|------|---------|------------|---------|
| `--dry-run` | Show plan without executing | Safe | `nacl-tl-fix`, `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-hotfix`, `nacl-tl-release`, `nacl-tl-reopened`, `nacl-tl-reconcile`, `nacl-init` |
| `--force` | Override guards / skip confirmation | Medium | `nacl-tl-reconcile` |
| `--force-push` | Push directly to main (bypasses PR) | High | `nacl-tl-hotfix` |

### Auto-Chain Flags

Automatically invoke the next skill in the pipeline after completion.

| Flag | Meaning | Used by |
|------|---------|---------|
| `--deploy` | Chain into deployment after shipping | `nacl-tl-ship` |
| `--auto-ship` | Chain into shipping after fix | `nacl-tl-fix`, `nacl-tl-reopened` |

### Version Bump

| Flag | Meaning | Used by |
|------|---------|---------|
| `--major` | Force major version bump | `nacl-tl-release` |
| `--minor` | Force minor version bump | `nacl-tl-release` |
| `--patch` | Force patch version bump | `nacl-tl-release` |

### Output Controls

| Flag | Meaning | Used by |
|------|---------|---------|
| `--compact` | Two-line summary instead of full report | `nacl-tl-status` |
| `--list` | Show top candidates with scores | `nacl-tl-next` |
| `--final` | Full-scope scan of entire `src/` | `nacl-tl-stubs` |
| `--output <path>` | Write to file instead of terminal | `nacl-render` |

### Environment

| Flag | Meaning | Used by |
|------|---------|---------|
| `--env staging\|production` | Target deployment environment | `nacl-tl-deliver` |

### Development Flow

| Flag | Meaning | Used by |
|------|---------|---------|
| `--continue` | Re-work after review rejection (reads review.md) | `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` |

### Hotfix-Specific

| Flag | Meaning | Used by |
|------|---------|---------|
| `--apply` | Stash uncommitted changes for hotfix | `nacl-tl-hotfix` |
| `--cherry-pick <commit\|HEAD>` | Apply existing commit to hotfix branch | `nacl-tl-hotfix` |
| `--rebase-feature` | After hotfix, rebase source feature branch | `nacl-tl-hotfix` |

### Fix Classification

| Flag | Meaning | Used by |
|------|---------|---------|
| `--l1` | Force level-1 (code-only) fix, skip docs | `nacl-tl-fix` |

---

## Per-Skill Modifier Reference

### BA Skills

#### nacl-ba-entities

**Paradigm:** Mode (key=value)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-ba-entities mode=FULL` | FULL | Interactive description of all project entities |
| `/nacl-ba-entities mode=CREATE` | CREATE | Add a single new entity |
| `/nacl-ba-entities mode=MODIFY` | MODIFY | Modify existing entity with impact analysis |
| `/nacl-ba-entities mode=COLLECT` | COLLECT | Semi-automatic entity collection from workflow steps |

#### nacl-ba-rules

**Paradigm:** Mode (key=value)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-ba-rules scope=full` | full | Full catalog: extraction + classification + traceability |
| `/nacl-ba-rules scope=add` | add | Add one rule interactively |

#### nacl-ba-from-board

**Paradigm:** Subcommand

| Invocation | Command | Description |
|-----------|---------|-------------|
| `/nacl-ba-from-board new <project_name>` | new | Create new empty board |
| `/nacl-ba-from-board import <file_path>` | import | Import client document onto board |
| `/nacl-ba-from-board analyze [board_path]` | analyze | Analyze board completeness |
| `/nacl-ba-from-board sync [board_path]` | sync | Sync board elements to Neo4j |
| `/nacl-ba-from-board status [board_path]` | status | Show sync status |
| `/nacl-ba-from-board enrich [board_path]` | enrich | Enrich with entities/roles/rules |
| `/nacl-ba-from-board validate [board_path]` | validate | Run validation checks |
| `/nacl-ba-from-board handoff [board_path]` | handoff | Create BA-to-SA handoff package |
| `/nacl-ba-from-board full <file_path>` | full | Full pipeline (import + analyze + sync + enrich + validate + handoff) |

#### nacl-ba-validate

**Paradigm:** Mode (bare positional)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-ba-validate` | full | All levels: L1-L8 + XL1-XL5 (default) |
| `/nacl-ba-validate internal` | internal | L1-L8: BA-internal consistency checks only |
| `/nacl-ba-validate cross` | cross | XL1-XL5: BA-to-SA cross-layer validation only |

#### --lang flag (all BA skills)

All BA skills accept `--lang=en` to switch output to English. Default is `ru` (Russian).

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--lang` | `en`, `ru` | `ru` | Output language for all generated text and node properties |

See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md) for full resolution order and rules.

#### Other BA skills

`nacl-ba-context`, `nacl-ba-process`, `nacl-ba-workflow`, `nacl-ba-roles`, `nacl-ba-glossary`, `nacl-ba-handoff`, `nacl-ba-import-doc`, `nacl-ba-analyze`, `nacl-ba-sync`, `nacl-ba-full` — accept `--lang=en` flag; otherwise invoked with no arguments or a single positional argument (file path or process ID).

---

### SA Skills

#### nacl-sa-domain

**Paradigm:** Mode (bare positional)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-sa-domain IMPORT_BA` | IMPORT_BA | Import BA business entities as DomainEntity candidates |
| `/nacl-sa-domain CREATE <entity_name>` | CREATE | Create single new DomainEntity interactively |
| `/nacl-sa-domain MODIFY <entity_name>` | MODIFY | Modify existing DomainEntity |
| `/nacl-sa-domain FULL <module>` | FULL | Create complete domain model for a module |

#### nacl-sa-roles

**Paradigm:** Mode (bare positional)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-sa-roles IMPORT_BA` | IMPORT_BA | Import BA business roles as SystemRole candidates |
| `/nacl-sa-roles CREATE <role_name>` | CREATE | Create single new SystemRole interactively |
| `/nacl-sa-roles MODIFY <role_name>` | MODIFY | Modify existing SystemRole |
| `/nacl-sa-roles FULL` | FULL | Build complete role model |

#### nacl-sa-uc

**Paradigm:** Subcommand

| Invocation | Command | Description |
|-----------|---------|-------------|
| `/nacl-sa-uc stories` | stories | Create UC registry from BA automation scope |
| `/nacl-sa-uc detail <UC-ID>` | detail | Detail specific UC (activity, forms, requirements) |
| `/nacl-sa-uc list` | list | Show all UCs |

#### nacl-sa-ui

**Paradigm:** Subcommand

| Invocation | Command | Description |
|-----------|---------|-------------|
| `/nacl-sa-ui verify [module]` | verify | Verify form-domain mapping |
| `/nacl-sa-ui components [module]` | components | Identify shared components |
| `/nacl-sa-ui navigation` | navigation | Define navigation structure |
| `/nacl-sa-ui full [module]` | full | Run all phases |

#### nacl-sa-validate

**Paradigm:** Mode (bare positional) + Flag

| Invocation | Description |
|-----------|-------------|
| `/nacl-sa-validate` | Full validation (all levels, default) |
| `/nacl-sa-validate internal` | L1-L6 SA-internal consistency checks only |
| `/nacl-sa-validate ba-cross` | XL6-XL9 BA-to-SA cross-layer coverage only |
| `/nacl-sa-validate --scope intra-uc UC-NNN[,UC-NNN]` | Limit to specific UCs |
| `/nacl-sa-validate --scope intra-module mod-xxx` | Limit to specific module |

#### nacl-sa-finalize

**Paradigm:** Mode (bare positional)

| Invocation | Mode | Description |
|-----------|------|-------------|
| `/nacl-sa-finalize` | full | Full finalization (default): all five phases |
| `/nacl-sa-finalize module <module_id>` | module | Finalize single module (scoped statistics + readiness) |
| `/nacl-sa-finalize stats-only` | stats-only | Statistics and readiness only (no ADR, no glossary) |

#### --lang flag (all SA skills)

All SA skills accept `--lang=en` to switch output to English. Default is `ru` (Russian).

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--lang` | `en`, `ru` | `ru` | Output language for all generated text and node properties |

See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md) for full resolution order and rules.

#### Other SA skills

`nacl-sa-architect`, `nacl-sa-feature`, `nacl-sa-full` — accept `--lang=en` flag; otherwise no user-facing modifiers beyond a positional description argument.

---

### TL Skills

#### nacl-tl-plan

| Flag | Description |
|------|-------------|
| `scope=full` | Full planning (default) |
| `scope=module:<id>` | Plan for specific module only |
| `scope=uc:<id1>,<id2>` | Plan for specific UCs only |
| `--feature FR-NNN` | Plan only UCs from feature request FR-NNN |
| `wave-start=N` | Starting wave number (default: 0) |

#### nacl-tl-next

| Flag | Description |
|------|-------------|
| `--be` | Only BE development tasks |
| `--fe` | Only FE development tasks |
| `--tech` | Only TECH infrastructure tasks |
| `--review` | Only review-pending tasks |
| `--sync` | Only sync-pending tasks |
| `--qa` | Only QA-pending tasks |
| `--wave N` | Only tasks from wave N |
| `--list` | Show top 5 candidates with scores |

#### nacl-tl-status

| Flag | Description |
|------|-------------|
| `--waves` | Show wave-by-wave progress only |
| `--be` | Show only BE progress (dev + review phases) |
| `--fe` | Show only FE progress (dev + review phases) |
| `--tech` | Show only TECH tasks section |
| `--stubs` | Show detailed stubs report (by severity, marker, task) |
| `--qa` | Show QA results per task (pass/fail/pending) |
| `--blocked` | Show blockers with dependency chains |
| `--compact` | One-line compact summary |

#### nacl-tl-intake

No user-facing modifiers.

#### nacl-tl-dev

| Flag | Description |
|------|-------------|
| `--continue` | Re-work after review rejection |
| `--dry-run` | Show execution plan without making changes |

Invoked as: `/nacl-tl-dev TECH###`

#### nacl-tl-dev-be

| Flag | Description |
|------|-------------|
| `--continue` | Re-work after review rejection |
| `--dry-run` | Show plan without writing code |

Invoked as: `/nacl-tl-dev-be UC###`

#### nacl-tl-dev-fe

| Flag | Description |
|------|-------------|
| `--continue` | Re-work after review rejection |
| `--dry-run` | Show plan without writing code |

Invoked as: `/nacl-tl-dev-fe UC###`

#### nacl-tl-review

| Flag | Description |
|------|-------------|
| `--be` | Backend review mode (8-category checklist) |
| `--fe` | Frontend review mode (10-category checklist) |

Invoked as: `/nacl-tl-review UC### --be` or `/nacl-tl-review TECH###` (no flag needed for TECH).

#### nacl-tl-sync

No user-facing modifiers. Invoked as: `/nacl-tl-sync UC###`

#### nacl-tl-stubs

| Flag | Description |
|------|-------------|
| `--final` | Full-scope scan of entire `src/` directory |

Invoked as: `/nacl-tl-stubs UC###` or `/nacl-tl-stubs --final`

#### nacl-tl-verify

| Flag | Description |
|------|-------------|
| `--task CODE` | Verify by YouGile task code (e.g., `ELE-644`) |
| `--all` | Verify all tasks from YouGile ReadyToTest column |

Invoked as: `/nacl-tl-verify UC028`, `/nacl-tl-verify --task ELE-644`, or `/nacl-tl-verify --all`

#### nacl-tl-verify-code

| Flag | Description |
|------|-------------|
| `--task CODE` | Verify by YouGile task code |
| `--files <path>` | Verify specific files |

Invoked as: `/nacl-tl-verify-code UC028` or `/nacl-tl-verify-code --files src/routes/analytics.ts`

#### nacl-tl-qa

No user-facing modifiers. Invoked as: `/nacl-tl-qa UC###`

#### nacl-tl-ship

| Flag | Description |
|------|-------------|
| `--deploy` | Include staging deployment after shipping |
| `--feature FR-NNN` | Ship all tasks in a feature request |

Invoked as: `/nacl-tl-ship`, `/nacl-tl-ship UC###`, `/nacl-tl-ship --feature FR-001`, or `/nacl-tl-ship UC### --deploy`

#### nacl-tl-deploy

| Flag | Description |
|------|-------------|
| `--staging` | Monitor staging deploy (feature branch push) |
| `--production` | Monitor production deploy (main branch push) |
| `--watch` | Watch currently running pipeline/workflow |

#### nacl-tl-deliver

| Flag | Description |
|------|-------------|
| `--feature FR-NNN` | Deliver all UCs in the feature request |
| `--branch <name>` | Switch to specified branch |
| `--env staging\|production` | Target deployment environment (default: staging) |
| `--skip-verify` | Skip staging verification phase |
| `--skip-deploy` | Skip deploy health check phase |

#### nacl-tl-release

| Flag | Description |
|------|-------------|
| `--major` | Force major version bump |
| `--minor` | Force minor version bump |
| `--patch` | Force patch version bump |
| `--skip-merge` | Tag-only mode — skip PR merge steps |
| `--pr N,N` | Merge specific PR numbers (skip discovery) |
| `--dry-run` | Show plan without executing |
| `--yes` | Skip user confirmation gates |

#### nacl-tl-fix

| Flag | Description |
|------|-------------|
| `--dry-run` | Show execution plan without making changes |
| `--l1` | Force L1 classification (code-only fix, skip docs) |
| `--auto-ship` | Automatically ship after successful fix |

Invoked as: `/nacl-tl-fix "description"` or `/nacl-tl-fix --dry-run "description"`

#### nacl-tl-reopened

| Flag | Description |
|------|-------------|
| `--task CODE` | Process specific YouGile task (e.g., `ELE-644`) |
| `--all` | Process all tasks in Reopened column |
| `--yes` | Skip confirmation gates |
| `--auto-ship` | After fix, auto-ship (passes through to nacl-tl-fix) |
| `--dry-run` | Fetch + context + plan only, no changes |

#### nacl-tl-hotfix

| Flag | Description |
|------|-------------|
| `--apply` | Stash uncommitted changes for hotfix |
| `--cherry-pick <commit\|HEAD>` | Apply existing commit to hotfix branch |
| `--force-push` | Push directly to main (requires double confirmation) |
| `--rebase-feature` | After hotfix, rebase source feature branch from main |
| `--dry-run` | Analysis only, no git operations |
| `--yes` | Skip confirmation gates |

Invoked as: `/nacl-tl-hotfix --apply` or `/nacl-tl-hotfix --cherry-pick HEAD` or `/nacl-tl-hotfix "description"`

#### nacl-tl-diagnose

| Flag | Description |
|------|-------------|
| `--since=5d` or `--since=2026-03-21` | Specific time period (default: 7 days) |
| `--focus=<area>` | Focus on specific area (e.g., `interview`) |

Invoked as: `/nacl-tl-diagnose` or `/nacl-tl-diagnose "problem description"`

#### nacl-tl-reconcile

| Flag | Description |
|------|-------------|
| `--report=<path>` | Use existing diagnostic report (e.g., `DIAGNOSTIC-REPORT.md`) |
| `--scope=UC###` | Reconcile specific UC only |
| `--dry-run` | Plan only, no changes |
| `--force` | Skip user confirmation |

#### nacl-tl-docs

No user-facing modifiers. Invoked as: `/nacl-tl-docs UC###`

#### nacl-tl-full

| Flag | Description |
|------|-------------|
| `--wave N` | Execute only wave N |
| `--task UC###` | Full lifecycle for a single UC |
| `--feature FR-NNN` | Execute feature wave |
| `--skip-plan` | Skip planning phase (graph already populated) |
| `--skip-qa` | Skip E2E QA testing |
| `--yes` | Skip START GATE confirmation |

#### nacl-tl-conductor

| Flag | Description |
|------|-------------|
| `--items FR-001,FR-002,BUG-003` | Comma-separated list of items to process |
| `--feature FR-NNN` | Single feature request |
| `--branch <name>` | Explicit branch name |
| `--skip-deliver` | Skip delivery step |
| `--skip-qa` | Skip E2E testing |
| `--yes` | Skip confirmation gates |

---

### Utility Skills

#### nacl-render

**Paradigm:** Dual-namespace subcommand + flag

| Invocation | Description |
|-----------|-------------|
| `/nacl-render md entity <id>` | Render specific entity to Markdown |
| `/nacl-render md uc <id>` | Render specific UC to Markdown |
| `/nacl-render md form <id>` | Render specific form to Markdown |
| `/nacl-render md domain-model` | Render full domain model |
| `/nacl-render md traceability` | Render traceability matrix |
| `/nacl-render md ... --output <path>` | Write to file instead of terminal |
| `/nacl-render excalidraw <command> [args]` | Generate Excalidraw board |

#### nacl-publish

**Paradigm:** Subcommand

| Invocation | Command | Description |
|-----------|---------|-------------|
| `/nacl-publish docmost` | docmost | Generate Markdown from graph and publish to Docmost |
| `/nacl-publish docmost-incremental` | docmost-incremental | Publish only changed nodes |
| `/nacl-publish docmost-preview <type> <id>` | docmost-preview | Preview one page |
| `/nacl-publish boards` | boards | Generate Excalidraw boards |
| `/nacl-publish boards-link` | boards-link | Add board links to Docmost pages |
| `/nacl-publish full` | full | Complete pipeline |

#### nacl-init

| Invocation | Description |
|-----------|-------------|
| `/nacl-init "Project Name"` | New project (interactive) |
| `/nacl-init --from=.` | Retroactive setup for existing project |
| `/nacl-init --dry-run` | Show changes without applying |

---

## Cross-Skill Flag Matrix

Which flags work on which skills. Only flags appearing on 2+ skills are shown.

| Flag | ship | fix | dev | dev-be | dev-fe | next | review | full | conductor | deliver | release | reopened | hotfix | verify | verify-code | reconcile | stubs | status | deploy | diagnose | render | init |
|------|------|-----|-----|--------|--------|------|--------|------|-----------|---------|---------|----------|--------|--------|-------------|-----------|-------|--------|--------|----------|--------|------|
| `--be` | | | | | | x | x | | | | | | | | | | | x | | | | |
| `--fe` | | | | | | x | x | | | | | | | | | | | x | | | | |
| `--yes` | | | | | | | | x | x | | x | x | x | | | | | | | | | |
| `--dry-run` | | x | x | x | x | | | | | | x | x | x | | | x | | | | | | x |
| `--continue` | | | x | x | x | | | | | | | | | | | | | | | | | |
| `--feature` | x | | | | | | | x | x | x | | | | | | | | | | | | |
| `--task` | | | | | | | | x | | | | x | | x | x | | | | | | | |
| `--wave N` | | | | | | x | | x | | | | | | | | | | | | | | |
| `--skip-qa` | | | | | | | | x | x | | | | | | | | | | | | | |
| `--all` | | | | | | | | | | | | x | | x | | | | | | | | |
| `--branch` | | | | | | | | | x | x | | | | | | | | | | | | |
| `--auto-ship` | | x | | | | | | | | | | x | | | | | | | | | | |
| `--deploy` | x | | | | | | | | | | | | | | | | | | | | | |
| `--force` | | | | | | | | | | | | | | | | x | | | | | | |
| `--force-push` | | | | | | | | | | | | | x | | | | | | | | | |

### BA/SA Flags (not in TL column matrix)

| Flag | Applies to | Default | Description |
|------|------------|---------|-------------|
| `--lang` | All BA skills, all SA skills | `ru` | Switch output language: `en` or `ru`. See [nacl-core/lang-directive.md](../nacl-core/lang-directive.md). |

---

## Rationalization Notes

### Current Inconsistencies

These are documented for awareness. **No changes are planned in this release** — rationalization is a separate task.

1. **Mode parameter syntax varies:**
   - `mode=FULL` (nacl-ba-entities) — key=value
   - `scope=full` (nacl-ba-rules) — key=value, different key name
   - `IMPORT_BA` (nacl-sa-domain) — bare positional
   - Three syntaxes for the same concept. Recommendation for new skills: use **bare positional**.

2. **Mode value casing varies:**
   - UPPER_CASE: `FULL`, `CREATE`, `MODIFY`, `IMPORT_BA` (sa-domain, sa-roles, ba-entities)
   - lowercase: `full`, `add` (ba-rules), `full`, `module`, `stats-only` (sa-finalize), `internal`, `ba-cross` (sa-validate)
   - Convention: UPPER_CASE for CRUD-like workflow branches, lowercase for utility/filter modes.

3. **`--scope` syntax:**
   - `--scope intra-uc UC-NNN` (nacl-sa-validate) — flag syntax
   - No other skills currently use `--scope`
   - Recommendation for new skills: use **flag syntax** (`--scope`).

### Design Decisions (intentional, not bugs)

- **`--yes` vs `--confirm`** are semantic inverses: `--yes` removes gates, `--confirm` adds them. This is intentional.
- **Three paradigms coexist** because they serve different skill types. Mode for modeling, subcommand for multi-function tools, flag for lifecycle.
- **`full` appears in both subcommands and modes** — semantically consistent (run everything), paradigm differs by skill type.
