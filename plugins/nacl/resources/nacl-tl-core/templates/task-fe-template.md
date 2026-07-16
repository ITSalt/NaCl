# Frontend Task File Template

## File Name

`task-fe.md`

Located in: `.tl/tasks/{{task_id}}/task-fe.md`

Example: `.tl/tasks/UC001/task-fe.md`

## Purpose

The frontend task description file. Contains ALL information needed to understand WHAT to implement on the **frontend**: pages, routes, components, forms, state management, user interactions. This file must be **self-sufficient** — the development agent reads ONLY this file, never the original SA artifacts.

For backend implementation, see the paired file `task-be.md`.

## Created By

`nacl-tl-plan` skill

## Read By

`nacl-tl-dev-fe` skill

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
tags: [{{module}}, {{priority}}, fe]
---

# {{task_id}}. {{Title}} (Frontend)

## Description

{{Brief description of what this task implements on the frontend.}}
{{Derived from: Use case main flow description.}}

## Actor

{{Primary user role performing this action from roles matrix.}}

## Pages / Routes

| Route | Component | Layout | Description |
|-------|-----------|--------|-------------|
| `{{/path/to/page}}` | `{{PageComponent}}` | `{{LayoutName}}` | {{Page purpose}} |
| `{{/path/to/page/[id]}}` | `{{DetailPageComponent}}` | `{{LayoutName}}` | {{Detail page purpose}} |

## Components

| Name | Type | Props | Purpose |
|------|------|-------|---------|
| `{{ComponentName}}` | {{page / feature / ui}} | `{{PropsInterface}}` | {{What it renders}} |
| `{{FormComponent}}` | feature | `{{FormProps}}` | {{Form purpose}} |
| `{{ListComponent}}` | feature | `{{ListProps}}` | {{List purpose}} |
| `{{CardComponent}}` | ui | `{{CardProps}}` | {{Card purpose}} |

### Component Hierarchy

```
{{PageComponent}}
├── {{HeaderComponent}}
├── {{FilterComponent}}
├── {{ListComponent}}
│   └── {{CardComponent}} (per item)
│       ├── {{StatusBadge}}
│       └── {{ActionButtons}}
└── {{PaginationComponent}}
```

## Forms

### Form: {{FormName}}

**Component:** `{{FormComponent}}`

**Zod Schema:**
```typescript
const {{schemaName}} = z.object({
  {{field1}}: z.string().min({{min}}, '{{error_message}}').max({{max}}, '{{error_message}}'),
  {{field2}}: z.number().positive('{{error_message}}'),
  {{field3}}: z.enum([{{values}}], { errorMap: () => ({ message: '{{error_message}}' }) }),
  {{field4}}: z.string().optional(),
});

type {{FormDataType}} = z.infer<typeof {{schemaName}}>;
```

**Fields:**

| Field | Type | Required | Validation | UI Element |
|-------|------|----------|------------|------------|
| `{{field_name}}` | `{{type}}` | {{Yes/No}} | {{validation_rules}} | {{input / select / textarea / checkbox}} |

**Default Values:**
```typescript
const defaultValues: Partial<{{FormDataType}}> = {
  {{field}}: {{default_value}},
};
```

## State Management

### Server State (TanStack Query)

| Hook | Query Key | API Endpoint | Purpose |
|------|-----------|-------------|---------|
| `use{{Entity}}List` | `['{{entities}}', filters]` | `GET /api/{{entities}}` | {{Fetch list}} |
| `use{{Entity}}` | `['{{entities}}', id]` | `GET /api/{{entities}}/:id` | {{Fetch single}} |
| `useCreate{{Entity}}` | mutation | `POST /api/{{entities}}` | {{Create}} |
| `useUpdate{{Entity}}` | mutation | `PATCH /api/{{entities}}/:id` | {{Update}} |
| `useDelete{{Entity}}` | mutation | `DELETE /api/{{entities}}/:id` | {{Delete}} |

### Client State (Zustand)

| Store | State Fields | Purpose |
|-------|-------------|---------|
| `{{storeName}}` | `{{field1}}: {{type}}, {{field2}}: {{type}}` | {{What UI state it manages}} |

```typescript
interface {{StoreState}} {
  {{field1}}: {{Type}};
  {{field2}}: {{Type}};
  set{{Field1}}: (value: {{Type}}) => void;
  reset: () => void;
}
```

## User Interactions

### Main Flow (UI)

1. **{{Step 1}}:** {{User navigates to page / clicks button / fills form}}
2. **{{Step 2}}:** {{System shows loading skeleton / fetches data}}
3. **{{Step 3}}:** {{User interacts with component}}
4. **{{Step N}}:** {{System shows success toast / redirects / updates list}}

### Alternative Flows (UI)

#### A1. {{Alternative scenario name}}

**Trigger:** {{User action or condition}}

**UI Behavior:**
1. {{Step 1: UI reaction}}
2. {{Step 2: UI update}}

**Result:** {{What user sees}}

#### A2. {{Another alternative scenario}}

**Trigger:** {{Condition}}

**UI Behavior:**
1. {{Step 1}}

**Result:** {{Outcome}}

### Error States

| Error | UI Behavior | User Message |
|-------|------------|--------------|
| {{Network error}} | {{Show error banner}} | {{User-friendly message}} |
| {{Validation error}} | {{Highlight fields, show per-field errors}} | {{Field-specific message}} |
| {{404 Not Found}} | {{Show NotFound component}} | {{Resource not found message}} |
| {{403 Forbidden}} | {{Redirect to access denied}} | {{No access message}} |

### Loading States

| State | Component | Behavior |
|-------|-----------|----------|
| Page loading | `{{PageSkeleton}}` | {{Skeleton layout matching page structure}} |
| List loading | `{{ListSkeleton}}` | {{N skeleton cards}} |
| Submit loading | Button `disabled` | {{Button text changes to "Saving..."}} |
| Refetch | {{Subtle spinner / no change}} | {{Background refetch, no layout shift}} |

## Related API Endpoints

> Full API contract defined in `api-contract.md`. Below is summary for FE reference.

| Method | Endpoint | Request Body | Response | Purpose |
|--------|----------|-------------|----------|---------|
| `{{GET}}` | `{{/api/path}}` | {{-}} | `{{ResponseType}}` | {{Description}} |
| `{{POST}}` | `{{/api/path}}` | `{{RequestType}}` | `{{ResponseType}}` | {{Description}} |
| `{{PATCH}}` | `{{/api/path/:id}}` | `{{UpdateType}}` | `{{ResponseType}}` | {{Description}} |
| `{{DELETE}}` | `{{/api/path/:id}}` | {{-}} | `void` | {{Description}} |

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

### Business Rules (UI-relevant)

- BR01: {{Business rule affecting UI display or interaction}}
- BR02: {{Another business rule}}
- BR03: {{Additional rule}}

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Entity: {{path_to_entity}}
- Form: {{path_to_form}}
- UI Mockup: {{path_to_mockup}}
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

Before committing a task-fe.md file, verify:

- [ ] Frontmatter complete (task_id, title, status, priority)
- [ ] Description clear and self-contained
- [ ] Pages/Routes table with all routes and layouts
- [ ] Components table with types, props, and purpose
- [ ] Component hierarchy tree documented
- [ ] Forms with Zod schemas and field tables
- [ ] State management: server state (TanStack Query hooks) and client state (Zustand stores)
- [ ] User interactions: main flow, alternative flows, error states, loading states
- [ ] Related API endpoints summarized
- [ ] Context extract includes all relevant entities
- [ ] Business rules (UI-relevant) listed
- [ ] NO external references for dev agent (SA refs for humans only)
