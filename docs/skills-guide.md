[Home](../README.md) > Skills Guide

🇷🇺 [Русская версия](skills-guide.ru.md)

# Skills Guide

Not sure which skill to use? Follow this decision tree.

## Quick Decision Tree

```
What do you need?
│
├── Starting a new project?
│   └── /nacl-init "Name" → /nacl-ba-full → /nacl-sa-full → /nacl-tl-conductor
│
├── Have a client document to analyze?
│   └── /nacl-ba-from-board import /path/to/doc.docx
│
├── Need to add a feature?
│   └── /nacl-sa-feature "description"
│       └── /nacl-tl-conductor --items FR-001
│
├── Something is broken?
│   ├── Regular fix → /nacl-tl-fix "what's broken"
│   └── Critical production issue? → /nacl-tl-fix → /nacl-tl-hotfix --apply
│
├── Got multiple requests (features + bugs + tasks)?
│   └── /nacl-tl-intake → /nacl-tl-conductor --items ...
│
├── Need to ship code?
│   └── /nacl-tl-ship (commit + push + PR)
│       └── /nacl-tl-deliver (CI + staging + health check)
│           └── /nacl-tl-release (merge PRs + deploy verify + tag + notify)
│
├── Everything is broken / docs are outdated?
│   └── /nacl-tl-diagnose → /nacl-tl-reconcile
│
├── Want to check project status?
│   └── /nacl-tl-status
│
└── What should I work on next?
    └── /nacl-tl-next
```

## By Phase

### Business Analysis

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Full BA from scratch | `/nacl-ba-full` | |
| Import client document | `/nacl-ba-from-board import doc.docx` | Also: `new`, `analyze`, `sync`, `full` |
| Define system boundaries | `/nacl-ba-context` | |
| Map business processes | `/nacl-ba-process` | |
| Decompose process into steps | `/nacl-ba-workflow` | |
| Catalog business entities | `/nacl-ba-entities` | `mode=FULL\|CREATE\|MODIFY\|COLLECT` |
| Identify business roles | `/nacl-ba-roles` | |
| Build glossary | `/nacl-ba-glossary` | |
| Extract business rules | `/nacl-ba-rules` | `scope=full\|add` |
| Validate BA model | `/nacl-ba-validate` | Modes: `internal`, `cross`, `full` |
| Prepare handoff to SA | `/nacl-ba-handoff` | |

### System Analysis

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Full SA from scratch | `/nacl-sa-full` | |
| Add a feature incrementally | `/nacl-sa-feature` | |
| Design modules (bounded contexts) | `/nacl-sa-architect` | |
| Create domain model | `/nacl-sa-domain IMPORT_BA` | Modes: `IMPORT_BA`, `CREATE`, `MODIFY`, `FULL` |
| Define use cases | `/nacl-sa-uc stories` | Also: `detail UC-ID`, `list` |
| Define system roles | `/nacl-sa-roles IMPORT_BA` | Modes: `IMPORT_BA`, `CREATE`, `MODIFY`, `FULL` |
| Design UI architecture | `/nacl-sa-ui verify` | Also: `components`, `navigation`, `full` |
| Validate specification | `/nacl-sa-validate` | Modes: `internal`, `ba-cross`; `--scope` |
| Finalize specification | `/nacl-sa-finalize` | Modes: `full`, `module`, `stats-only` |

### Development

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Full lifecycle (BE+FE+QA+docs) | `/nacl-tl-full --task UC001` | `--wave`, `--feature`, `--skip-plan`, `--skip-qa`, `--yes` |
| Backend TDD | `/nacl-tl-dev-be UC001` | `--continue`, `--dry-run` |
| Frontend TDD | `/nacl-tl-dev-fe UC001` | `--continue`, `--dry-run` |
| TECH/infrastructure task | `/nacl-tl-dev TECH001` | `--continue`, `--dry-run` |
| Code review | `/nacl-tl-review UC001 --be` | `--be` or `--fe` (required for UC) |
| E2E testing | `/nacl-tl-qa UC001` | |
| Verify BE/FE sync | `/nacl-tl-sync UC001` | |
| Check for stubs/mocks | `/nacl-tl-stubs UC001` | `--final` (full `src/` scan) |
| Update docs after dev | `/nacl-tl-docs UC001` | |

### Shipping & Deployment

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Commit + push + PR | `/nacl-tl-ship` | `--deploy`, `--feature` |
| Emergency hotfix to production | `/nacl-tl-hotfix --apply` | `--cherry-pick`, `--force-push`, `--rebase-feature`, `--dry-run`, `--yes` |
| Full delivery (push → CI → staging → verify) | `/nacl-tl-deliver` | `--feature`, `--env`, `--skip-verify`, `--skip-deploy` |
| Monitor CI/CD deployment | `/nacl-tl-deploy` | `--staging`, `--production`, `--watch` |
| Merge PRs + deploy verify + release tag | `/nacl-tl-release` | `--major\|--minor\|--patch`, `--skip-merge`, `--pr N,N`, `--dry-run`, `--yes` |

### Planning & Status

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Create development plan from SA | `/nacl-tl-plan` | `--feature FR-NNN` |
| Triage user requests | `/nacl-tl-intake` | |
| Full batch workflow | `/nacl-tl-conductor` | `--items`, `--feature`, `--skip-deliver`, `--skip-qa`, `--yes` |
| Project status | `/nacl-tl-status` | `--waves`, `--be\|--fe\|--tech`, `--qa`, `--blocked`, `--compact` |
| Next task recommendation | `/nacl-tl-next` | `--be\|--fe\|--tech`, `--wave N`, `--list`, `--review\|--sync\|--qa` |

### Fix & Recovery

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Fix a bug (spec-first) | `/nacl-tl-fix "description"` | `--dry-run`, `--l1`, `--auto-ship` |
| Emergency hotfix (bypass feature branch) | `/nacl-tl-hotfix` | `--apply`, `--cherry-pick`, `--force-push` |
| Fix reopened tasks (QA failures) | `/nacl-tl-reopened` | `--task`, `--all`, `--yes`, `--auto-ship`, `--dry-run` |
| Diagnose project health | `/nacl-tl-diagnose` | `--since`, `--focus` |
| Reconcile docs with code | `/nacl-tl-reconcile` | `--report`, `--scope`, `--dry-run`, `--force` |
| Verify implementation correctness | `/nacl-tl-verify-code UC001` | `--task`, `--files` |

### Visualization & Publishing

| Situation | Skill | Key modifiers |
|-----------|-------|---------------|
| Render graph to Markdown/Excalidraw | `/nacl-render md uc UC-101` | Namespaces: `md`, `excalidraw`; `--output` |
| Publish to Docmost | `/nacl-publish docmost` | Also: `boards`, `full`, `docmost-incremental` |

## Next Steps

- [Skills Reference](skills-reference.md) — complete catalog with descriptions
- [Skill Modifiers Reference](skill-modifiers.md) — full documentation of all flags, modes, and subcommands
- [Workflows](workflows.md) — end-to-end scenarios
