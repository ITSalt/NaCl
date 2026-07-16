# Changelog Entry Template

## File Name

`changelog.md` (entry format)

Located in: `.tl/changelog.md`

## Purpose

Provides a template for individual changelog entries appended to the project changelog file. Each entry documents a development activity (planning, development, review, or documentation) with consistent formatting. This template ensures **human-readable history** of all project changes.

## Created By

All TL skills (`nacl-tl-plan`, `nacl-tl-dev`, `nacl-tl-review`, `nacl-tl-docs`)

## Read By

All TL skills (read-only after creation), humans

## Contents

```markdown
### {{task_id}} — {{task_title}}

**Phase**: {{PHASE}} | **Status**: {{status}}

- {{activity_1}}
- {{activity_2}}
- {{activity_3}}
```

## Entry Templates by Phase

### PLAN Phase Entry

```markdown
### {{task_id}} — {{task_title}}

**Phase**: PLAN | **Status**: {{pending|planned}}

- Extracted requirements from SA artifacts
- Created task.md with full context
- Defined {{N}} test cases in test-spec.md
- Set implementation hints in impl-brief.md
- Priority: {{high|medium|low}}
- Dependencies: {{dependency_list|none}}
```

### DEV Phase Entry (Start)

```markdown
### {{task_id}} — {{task_title}}

**Phase**: DEV | **Status**: in_progress

- Started development using TDD workflow
- Reading task.md and test-spec.md
- Beginning RED phase
```

### DEV Phase Entry (Complete)

```markdown
### {{task_id}} — {{task_title}}

**Phase**: DEV | **Status**: ready_for_review

- TDD cycle completed successfully
- RED: Created {{N}} tests, all failing as expected
- GREEN: Implemented {{component_name}}, all tests pass
- REFACTOR: {{refactoring_description}}
- Files created: {{N}} (+{{lines}} lines)
- Coverage: {{coverage}}% (target: {{target}}%)
- Commits: {{N}}
```

### DEV Phase Entry (Rework)

```markdown
### {{task_id}} — {{task_title}}

**Phase**: DEV | **Status**: in_progress

- Returning from review rejection
- Fixing issues:
  - {{issue_1}}
  - {{issue_2}}
- Re-running test suite
```

### REVIEW Phase Entry (Approved)

```markdown
### {{task_id}} — {{task_title}}

**Phase**: REVIEW | **Status**: approved

- Code review completed
- Acceptance criteria: {{passed}}/{{total}} passed
- Code quality: all checks passed
- Issues found: {{N}} ({{resolved_status}})
  - {{issue_summary}}
- Verdict: APPROVED
- Recommendations: {{recommendations|none}}
```

### REVIEW Phase Entry (Rejected)

```markdown
### {{task_id}} — {{task_title}}

**Phase**: REVIEW | **Status**: review_rejected

- Code review completed
- Acceptance criteria: {{passed}}/{{total}} passed
- Failed criteria:
  - {{failed_criterion_1}}
  - {{failed_criterion_2}}
- Verdict: REJECTED
- Required fixes documented in review.md
- Task returned to DEV phase
```

### DOCS Phase Entry

```markdown
### {{task_id}} — {{task_title}}

**Phase**: DOCS | **Status**: done

- Updated API documentation ({{doc_path}})
- Added endpoint to README.md
- Updated CHANGELOG.md with user-facing entry
- Task completed and closed
```

### Blocker Entry

```markdown
### {{task_id}} — {{task_title}}

**Phase**: {{PHASE}} | **Status**: blocked

- Development blocked by dependency
- Waiting on: {{blocking_task_id}} ({{blocking_task_title}})
- Blocker: {{blocker_description}}
- Will resume when {{blocking_task_id}} is {{approved|done}}
```

## Field Reference

### Phase Values

| Phase | Description | Skill |
|-------|-------------|-------|
| PLAN | Task planning and preparation | nacl-tl-plan |
| DEV | Development work (TDD cycle) | nacl-tl-dev |
| REVIEW | Code review | nacl-tl-review |
| DOCS | Documentation updates | nacl-tl-docs |

### Status Values

| Status | Phase(s) | Meaning |
|--------|----------|---------|
| `pending` | PLAN | Task created, not started |
| `planned` | PLAN | Planning complete |
| `in_progress` | DEV | Development in progress |
| `ready_for_review` | DEV | Development complete |
| `in_review` | REVIEW | Code review in progress |
| `review_rejected` | REVIEW | Review failed, needs rework |
| `approved` | REVIEW | Review passed |
| `done` | DOCS | Task completed and closed |
| `blocked` | Any | Waiting on dependency |

### Priority Values

| Priority | Meaning |
|----------|---------|
| `high` | Critical path, do first |
| `medium` | Standard priority |
| `low` | Do when convenient |

## Placeholder Reference

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{task_id}}` | Task identifier | UC001 |
| `{{task_title}}` | Short descriptive title | Create Order |
| `{{PHASE}}` | Workflow phase (uppercase) | DEV |
| `{{status}}` | Current task status | ready_for_review |
| `{{N}}` | Numeric value | 7 |
| `{{component_name}}` | Main component implemented | OrderService |
| `{{coverage}}` | Test coverage percentage | 87 |
| `{{doc_path}}` | Documentation file path | docs/api/orders.md |
| `{{blocking_task_id}}` | ID of blocking task | UC002 |

## Writing Guidelines

### Use Action-Oriented Language

```markdown
Good:
- Created OrderService with createOrder method
- Added validation for empty items array
- Fixed error message for invalid client

Bad:
- I worked on the order service and created a method
- The validation was added to check if items array is empty
- Changed the error message because it was unclear
```

### Quantify When Possible

```markdown
Good:
- Created 5 new files (+365 lines)
- All 7 tests passing
- Coverage: 87%

Bad:
- Created several files
- Tests are passing
- Coverage is good
```

### Reference Issues Clearly

```markdown
Good:
- Fixed AC05: Empty items validation now rejects correctly
- Resolved Issue #123: Added missing audit log

Bad:
- Fixed the validation
- Added logging
```

## Integration Rules

### Append-Only

**CRITICAL**: The changelog is append-only. Skills MUST:
- Add new entries at the top of the current date section
- NEVER modify or delete existing entries
- Create a new date section if the date changed

### Synchronization with status.json

When adding a changelog entry:
1. Update status.json with the new status
2. Add the changelog entry
3. Ensure both files reflect the same state

### Date Section Format

```markdown
---

## [{{YYYY-MM-DD}}]

### {{task_id}} — {{task_title}}
...

---
```

## Quality Checklist

Before adding a changelog entry, verify:

- [ ] Task ID and title present
- [ ] Phase clearly stated (PLAN, DEV, REVIEW, or DOCS)
- [ ] Status accurately reflects task state
- [ ] At least one descriptive bullet point
- [ ] Action-oriented language used
- [ ] Quantities included where applicable
- [ ] Issues/fixes clearly referenced
- [ ] Consistent formatting with existing entries
- [ ] Entry added to correct date section
- [ ] status.json updated with same status
