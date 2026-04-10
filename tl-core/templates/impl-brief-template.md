# Implementation Brief Template

## File Name

`impl-brief.md`

Located in: `.tl/tasks/{{task_id}}/impl-brief.md`

Example: `.tl/tasks/UC001/impl-brief.md`

## Purpose

Provides implementation guidance for the development agent. Contains HOW to implement the task: architecture decisions, file locations, code patterns to follow, and technical instructions. This file bridges the gap between WHAT (task.md) and testing (test-spec.md).

## Created By

`tl-plan` skill

## Read By

`tl-dev` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "Implementation Brief: {{title}}"
source_uc: {{path_to_source_uc}}
status: pending
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
architecture_type: {{layered|modular|microservice}}
tags: [implementation, {{module}}, {{task_id}}]
---

# Implementation Brief: {{task_id}}

## Overview

{{Brief description of the implementation approach.}}
{{Key technical decisions and rationale.}}

## Architecture Context

### Layer Structure

```
{{project_structure}}
├── src/
│   ├── {{layer1}}/        # {{Layer 1 description}}
│   │   └── {{component}}  # {{Component purpose}}
│   ├── {{layer2}}/        # {{Layer 2 description}}
│   └── {{layer3}}/        # {{Layer 3 description}}
└── tests/
    └── {{test_location}}  # {{Test structure}}
```

### Component Placement

| Component | Layer | Location | Purpose |
|-----------|-------|----------|---------|
| {{ComponentName}} | {{layer}} | `{{path}}` | {{purpose}} |
| {{ServiceName}} | {{layer}} | `{{path}}` | {{purpose}} |
| {{RepositoryName}} | {{layer}} | `{{path}}` | {{purpose}} |

## Files to Create

| File | Purpose | Template |
|------|---------|----------|
| `{{path/to/file.ts}}` | {{Purpose description}} | {{existing_similar_file}} |
| `{{path/to/another.ts}}` | {{Purpose description}} | {{template_reference}} |

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `{{path/to/existing.ts}}` | {{add/modify/extend}} | {{What to change}} |
| `{{path/to/routes.ts}}` | {{add}} | {{Add route for new endpoint}} |

## Code Patterns

### Pattern: {{PatternName}}

**Use When:** {{When to apply this pattern}}

**Reference Implementation:** `{{path/to/reference/file.ts}}`

```typescript
// Pattern example
{{code_pattern_example}}
```

### Pattern: {{AnotherPattern}}

**Use When:** {{Condition}}

**Reference Implementation:** `{{path}}`

```typescript
{{code_example}}
```

## Dependencies

### Internal Dependencies

| Module | Import From | Purpose |
|--------|-------------|---------|
| {{ModuleName}} | `{{import_path}}` | {{Why needed}} |
| {{ServiceName}} | `{{import_path}}` | {{Why needed}} |

### External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| {{package_name}} | `{{version}}` | {{Purpose}} |
| {{another_package}} | `{{version}}` | {{Purpose}} |

### New Dependencies Required

| Package | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| {{package}} | `{{version}}` | {{Purpose}} | `npm install {{package}}` |

## API Contract

### Endpoint: {{METHOD}} {{/api/path}}

**Request:**
```typescript
interface {{RequestInterface}} {
  {{field}}: {{Type}};
  {{optionalField}}?: {{Type}};
}
```

**Response:**
```typescript
interface {{ResponseInterface}} {
  {{field}}: {{Type}};
  {{nestedObject}}: {
    {{subField}}: {{Type}};
  };
}
```

**Error Responses:**
| Status | Code | Message |
|--------|------|---------|
| 400 | `{{ERROR_CODE}}` | {{Error description}} |
| 404 | `{{NOT_FOUND}}` | {{Not found description}} |
| 500 | `{{INTERNAL_ERROR}}` | {{Server error description}} |

## Data Flow

```
{{Actor}} -> {{Component1}} -> {{Component2}} -> {{DataStore}}
                  |                   |
                  v                   v
           {{Validation}}      {{Business Logic}}
```

### Step-by-Step Flow

1. **{{Step 1 Name}}:** {{Description of what happens}}
2. **{{Step 2 Name}}:** {{Description}}
3. **{{Step 3 Name}}:** {{Description}}
4. **{{Step N Name}}:** {{Final step description}}

## Error Handling Strategy

| Error Type | Handling | User Message |
|------------|----------|--------------|
| {{ValidationError}} | {{Return 400 with details}} | {{User-friendly message}} |
| {{NotFoundError}} | {{Return 404}} | {{User-friendly message}} |
| {{BusinessRuleError}} | {{Return 422 with code}} | {{User-friendly message}} |
| {{SystemError}} | {{Log and return 500}} | {{Generic error message}} |

## Database Changes

### New Tables/Collections

```sql
-- {{TableName}}
CREATE TABLE {{table_name}} (
  {{column1}} {{TYPE}} {{constraints}},
  {{column2}} {{TYPE}} {{constraints}},
  PRIMARY KEY ({{pk_column}})
);
```

### Migrations Required

| Migration | Description | Rollback |
|-----------|-------------|----------|
| `{{migration_name}}` | {{What it does}} | {{Rollback steps}} |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `{{ENV_VAR}}` | {{Yes/No}} | `{{default}}` | {{Purpose}} |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `{{FEATURE_FLAG}}` | `{{true/false}}` | {{What it controls}} |

## TDD Implementation Order

Follow this order during RED-GREEN-REFACTOR:

### Phase 1: RED (Write Failing Tests)

1. Write unit tests for {{ComponentName}}
2. Write validation tests for {{input validation}}
3. Write error handling tests for {{error scenarios}}

### Phase 2: GREEN (Minimal Implementation)

1. Create {{ComponentName}} with basic structure
2. Implement {{core method}} to pass UT01
3. Add {{validation logic}} to pass VT01
4. Implement {{error handling}} to pass ET01

### Phase 3: REFACTOR (Improve Quality)

1. Extract {{common logic}} to {{shared module}}
2. Apply {{PatternName}} pattern
3. Optimize {{performance concern}}
4. Add {{logging/monitoring}}

## Code Style Guidelines

- Follow existing patterns in `{{reference_file}}`
- Use {{naming_convention}} for {{element_type}}
- Apply {{specific_style_rule}}
- Reference: `tl-core/references/code-style.md`

## Verification Commands

```bash
# Run tests
{{test_command}}

# Type check
{{type_check_command}}

# Lint
{{lint_command}}

# Build
{{build_command}}
```

## SA References (For Human Review Only)

- Use Case: {{path_to_usecase}}
- Entity: {{path_to_entity}}
- Form: {{path_to_form}}
- Architecture: {{path_to_architecture_doc}}
```

## Architecture Types Reference

| Type | Description | Use Case |
|------|-------------|----------|
| `layered` | Traditional n-tier (controller/service/repository) | Most CRUD apps |
| `modular` | Feature-based modules with clear boundaries | Medium complexity |
| `microservice` | Distributed services with APIs | High scalability needs |

## Status Values Reference

| Status | Meaning |
|--------|---------|
| `pending` | Brief created, not started |
| `in_progress` | Development using this brief |
| `complete` | Implementation finished |

## Quality Checklist

Before committing an impl-brief.md file, verify:

- [ ] Frontmatter complete (task_id, title, status, architecture_type)
- [ ] Architecture context documented
- [ ] All files to create/modify listed
- [ ] Code patterns with references included
- [ ] Dependencies (internal and external) listed
- [ ] API contract defined (if applicable)
- [ ] Data flow documented
- [ ] Error handling strategy defined
- [ ] TDD implementation order specified
- [ ] Verification commands provided
- [ ] NO external references for dev agent (SA refs for humans only)
