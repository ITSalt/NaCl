[Home](../README.md) > Skills Guide

🇷🇺 [Русская версия](skills-guide.ru.md)

# Skills Guide

Not sure which skill to use? Follow this decision tree.

## Quick Decision Tree

```
What do you need?
│
├── Starting a new project?
│   └── /project-init "Name" → /graph_ba_full → /graph_sa_full → /graph_tl_conductor
│
├── Have a client document to analyze?
│   └── /graph_ba_from_board import /path/to/doc.docx
│
├── Need to add a feature?
│   └── /graph_sa_feature "description"
│       └── /graph_tl_conductor --items FR-001
│
├── Something is broken?
│   └── /tl-fix "what's broken"
│
├── Got multiple requests (features + bugs + tasks)?
│   └── /graph_tl_intake → /graph_tl_conductor --items ...
│
├── Need to ship code?
│   └── /tl-ship (commit + push + PR)
│       └── /tl-deliver (CI + staging + health check)
│           └── /tl-release (production)
│
├── Everything is broken / docs are outdated?
│   └── /tl-diagnose → /tl-reconcile
│
├── Want to check project status?
│   └── /graph_tl_status
│
└── What should I work on next?
    └── /graph_tl_next
```

## By Phase

### Business Analysis

| Situation | Skill |
|-----------|-------|
| Full BA from scratch | `/graph_ba_full` |
| Import client document | `/graph_ba_from_board import doc.docx` |
| Define system boundaries | `/graph_ba_context` |
| Map business processes | `/graph_ba_process` |
| Decompose process into steps | `/graph_ba_workflow` |
| Catalog business entities | `/graph_ba_entities` |
| Identify business roles | `/graph_ba_roles` |
| Build glossary | `/graph_ba_glossary` |
| Extract business rules | `/graph_ba_rules` |
| Validate BA model | `/graph_ba_validate` |
| Prepare handoff to SA | `/graph_ba_handoff` |

### System Analysis

| Situation | Skill |
|-----------|-------|
| Full SA from scratch | `/graph_sa_full` |
| Add a feature incrementally | `/graph_sa_feature` |
| Design modules (bounded contexts) | `/graph_sa_architect` |
| Create domain model | `/graph_sa_domain` |
| Define use cases | `/graph_sa_uc` |
| Define system roles | `/graph_sa_roles` |
| Design UI architecture | `/graph_sa_ui` |
| Validate specification | `/graph_sa_validate` |
| Finalize specification | `/graph_sa_finalize` |

### Development

| Situation | Skill |
|-----------|-------|
| Full lifecycle (BE+FE+QA+docs) | `/tl-full --task UC001` |
| Backend TDD | `/tl-dev-be UC001` |
| Frontend TDD | `/tl-dev-fe UC001` |
| TECH/infrastructure task | `/tl-dev TECH001` |
| Code review | `/tl-review UC001 --be` or `--fe` |
| E2E testing | `/tl-qa UC001` |
| Verify BE/FE sync | `/tl-sync UC001` |
| Check for stubs/mocks | `/tl-stubs` |
| Update docs after dev | `/tl-docs UC001` |

### Shipping & Deployment

| Situation | Skill |
|-----------|-------|
| Commit + push + PR | `/tl-ship` |
| Full delivery (push → CI → staging → verify) | `/tl-deliver` |
| Monitor CI/CD deployment | `/tl-deploy` |
| Release to production | `/tl-release` |

### Planning & Status

| Situation | Skill |
|-----------|-------|
| Create development plan from SA | `/graph_tl_plan` |
| Triage user requests | `/graph_tl_intake` |
| Full batch workflow | `/graph_tl_conductor` |
| Project status | `/graph_tl_status` |
| Next task recommendation | `/graph_tl_next` |

### Fix & Recovery

| Situation | Skill |
|-----------|-------|
| Fix a bug (spec-first) | `/tl-fix "description"` |
| Fix reopened tasks (QA failures) | `/tl-reopened` |
| Diagnose project health | `/tl-diagnose` |
| Reconcile docs with code | `/tl-reconcile` |
| Verify implementation correctness | `/tl-verify-code UC001` |

### Visualization & Publishing

| Situation | Skill |
|-----------|-------|
| Render graph to Markdown/Excalidraw | `/graph_render` |
| Publish to Docmost | `/graph_publish` |

## Next Steps

- [Skills Reference](skills-reference.md) — complete catalog with descriptions
- [Workflows](workflows.md) — end-to-end scenarios
