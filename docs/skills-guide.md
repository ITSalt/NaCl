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
│   └── /nacl-tl-fix "what's broken"
│
├── Got multiple requests (features + bugs + tasks)?
│   └── /nacl-tl-intake → /nacl-tl-conductor --items ...
│
├── Need to ship code?
│   └── /nacl-tl-ship (commit + push + PR)
│       └── /nacl-tl-deliver (CI + staging + health check)
│           └── /nacl-tl-release (production)
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

| Situation | Skill |
|-----------|-------|
| Full BA from scratch | `/nacl-ba-full` |
| Import client document | `/nacl-ba-from-board import doc.docx` |
| Define system boundaries | `/nacl-ba-context` |
| Map business processes | `/nacl-ba-process` |
| Decompose process into steps | `/nacl-ba-workflow` |
| Catalog business entities | `/nacl-ba-entities` |
| Identify business roles | `/nacl-ba-roles` |
| Build glossary | `/nacl-ba-glossary` |
| Extract business rules | `/nacl-ba-rules` |
| Validate BA model | `/nacl-ba-validate` |
| Prepare handoff to SA | `/nacl-ba-handoff` |

### System Analysis

| Situation | Skill |
|-----------|-------|
| Full SA from scratch | `/nacl-sa-full` |
| Add a feature incrementally | `/nacl-sa-feature` |
| Design modules (bounded contexts) | `/nacl-sa-architect` |
| Create domain model | `/nacl-sa-domain` |
| Define use cases | `/nacl-sa-uc` |
| Define system roles | `/nacl-sa-roles` |
| Design UI architecture | `/nacl-sa-ui` |
| Validate specification | `/nacl-sa-validate` |
| Finalize specification | `/nacl-sa-finalize` |

### Development

| Situation | Skill |
|-----------|-------|
| Full lifecycle (BE+FE+QA+docs) | `/nacl-tl-full --task UC001` |
| Backend TDD | `/nacl-tl-dev-be UC001` |
| Frontend TDD | `/nacl-tl-dev-fe UC001` |
| TECH/infrastructure task | `/nacl-tl-dev TECH001` |
| Code review | `/nacl-tl-review UC001 --be` or `--fe` |
| E2E testing | `/nacl-tl-qa UC001` |
| Verify BE/FE sync | `/nacl-tl-sync UC001` |
| Check for stubs/mocks | `/nacl-tl-stubs` |
| Update docs after dev | `/nacl-tl-docs UC001` |

### Shipping & Deployment

| Situation | Skill |
|-----------|-------|
| Commit + push + PR | `/nacl-tl-ship` |
| Full delivery (push → CI → staging → verify) | `/nacl-tl-deliver` |
| Monitor CI/CD deployment | `/nacl-tl-deploy` |
| Release to production | `/nacl-tl-release` |

### Planning & Status

| Situation | Skill |
|-----------|-------|
| Create development plan from SA | `/nacl-tl-plan` |
| Triage user requests | `/nacl-tl-intake` |
| Full batch workflow | `/nacl-tl-conductor` |
| Project status | `/nacl-tl-status` |
| Next task recommendation | `/nacl-tl-next` |

### Fix & Recovery

| Situation | Skill |
|-----------|-------|
| Fix a bug (spec-first) | `/nacl-tl-fix "description"` |
| Fix reopened tasks (QA failures) | `/nacl-tl-reopened` |
| Diagnose project health | `/nacl-tl-diagnose` |
| Reconcile docs with code | `/nacl-tl-reconcile` |
| Verify implementation correctness | `/nacl-tl-verify-code UC001` |

### Visualization & Publishing

| Situation | Skill |
|-----------|-------|
| Render graph to Markdown/Excalidraw | `/nacl-render` |
| Publish to Docmost | `/nacl-publish` |

## Next Steps

- [Skills Reference](skills-reference.md) — complete catalog with descriptions
- [Workflows](workflows.md) — end-to-end scenarios
