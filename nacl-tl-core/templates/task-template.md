# Task File Template

## File Name

`task.md`

Located in: `.tl/tasks/{{task_id}}/task.md`

Example: `.tl/tasks/UC001/task.md`

## Purpose

The primary task description file. Contains ALL information needed to understand WHAT to implement. This file must be **self-sufficient** - the development agent reads ONLY this file, never the original SA artifacts.

## Created By

`nacl-tl-plan` skill

## Read By

`nacl-tl-dev` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "{{title}}"
source_uc: {{path_to_source_uc}}
status: pending
priority: {{high|medium|low}}
module: {{module_name}}
actor: {{actor_role}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
depends_on: [{{dependency_task_ids}}]
blocks: [{{blocked_task_ids}}]
tags: [{{module}}, {{priority}}, {{type}}]
---

# {{task_id}}. {{Title}}

## Description

{{Brief description of what this task implements.}}
{{Derived from: Use case main flow description.}}

## Actor

{{Primary user role performing this action from roles matrix.}}

## Preconditions

- {{System state requirement 1}}
- {{Required permissions/roles}}
- {{Data prerequisites}}

## Input Data

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| {{field_name}} | {{type}} | {{Yes/No}} | {{validation_rules}} | {{description}} |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| {{field_name}} | {{type}} | {{description}} |

## Main Flow

1. {{Step 1: User action or system action}}
2. {{Step 2: Next action}}
3. {{Step 3: Continue flow}}
4. {{Step N: Final action}}

## Alternative Flows

### A1. {{Alternative scenario name}}

**Trigger:** {{When this scenario occurs}}

**Actions:**
1. {{Step 1}}
2. {{Step 2}}

**Result:** {{How it ends}}

### A2. {{Another alternative scenario}}

**Trigger:** {{Condition}}

**Actions:**
1. {{Step 1}}

**Result:** {{Outcome}}

## Context Extract

### Related Entities

**Entity: {{EntityName}}**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| {{attribute}} | {{type}} | {{Yes/No}} | {{description}} |

**Entity: {{AnotherEntity}}**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| {{attribute}} | {{type}} | {{Yes/No}} | {{description}} |

### Status Values

```
{{StatusEnum}}:
- {{STATE1}} -> {{STATE2}} -> {{STATE3}}
- {{STATE1}} -> {{CANCELLED}}
```

### Business Rules

- BR01: {{Business rule description}}
- BR02: {{Another business rule}}
- BR03: {{Additional rule}}

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Entity: {{path_to_entity}}
- Form: {{path_to_form}}
- Requirements: {{path_to_requirements}}
```

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Task created, not started |
| `in_progress` | Development in progress |
| `ready_for_review` | Development complete |
| `in_review` | Code review in progress |
| `review_rejected` | Review failed, needs rework |
| `approved` | Review passed |
| `done` | Documentation complete |
| `blocked` | Waiting on dependency |

## Status Transitions

```
pending -> in_progress -> ready_for_review -> in_review
                                                 |
                              approved <---------+
                                 |               |
                               done    review_rejected -> in_progress
```

## Quality Checklist

Before committing a task.md file, verify:

- [ ] Frontmatter complete (task_id, title, status, priority)
- [ ] Description clear and self-contained
- [ ] Input/Output tables complete with types and validation
- [ ] Main flow steps numbered
- [ ] Alternative flows documented
- [ ] Context extract includes all relevant entities
- [ ] Business rules listed
- [ ] NO external references for dev agent (SA refs for humans only)
