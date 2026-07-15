# Changelog Format Specification

## Overview

This document defines the structure and format for the project changelog file (`.tl/changelog.md`). The changelog provides a human-readable history of all development activities, organized chronologically with entries from each phase of the TL workflow.

## Key Principle: Append-Only

**CRITICAL**: The changelog is an **append-only** file. Skills should NEVER modify or delete existing entries — only add new entries at the top of the appropriate section.

```
.tl/
├── changelog.md    # Human-readable change history (this file)
├── status.json     # Machine-readable status (for automation)
└── tasks/          # Individual task files
```

---

## File Structure

### Header

```markdown
# Project Changelog

> Auto-generated changelog tracking all development activities.
> Last updated: 2025-01-30T15:00:00Z

## Quick Stats

| Metric | Count |
|--------|-------|
| Tasks Completed | 5 |
| Tasks In Progress | 2 |
| Tasks Pending | 8 |
| Reviews Passed | 4 |
| Reviews Rejected | 1 |
```

### Sections

The changelog is organized into dated sections with the most recent at the top:

```markdown
---

## [2025-01-30]

### UC003 — Update Order Status

**Phase**: DOCS | **Status**: done

- Updated API documentation with new status endpoint
- Added status transition diagram to README
- Closed task UC003

---

### UC002 — Delete Order

**Phase**: REVIEW | **Status**: approved

- Code review completed
- All 8 acceptance criteria passed
- Minor issues found and resolved:
  - Added missing audit log entry
  - Fixed error message typo

---

### UC001 — Create Order

**Phase**: DEV | **Status**: ready_for_review

- TDD cycle completed (RED → GREEN → REFACTOR)
- Created 5 new files (+365 lines)
- All 7 tests passing
- Coverage: 87%

---

## [2025-01-29]

### Project Initialized

**Phase**: PLAN | **Status**: planned

- Created master plan from SA artifacts
- Identified 15 tasks across 3 modules
- Set up .tl/ directory structure
```

---

## Entry Format

### Standard Entry Template

```markdown
### {TASK_ID} — {Task Title}

**Phase**: {PHASE} | **Status**: {STATUS}

- {Bullet point 1}
- {Bullet point 2}
- {Bullet point 3}
```

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| TASK_ID | Task identifier (UC###) | UC001 |
| Task Title | Short descriptive title | Create Order |
| PHASE | Current workflow phase | DEV, REVIEW, DOCS |
| STATUS | Task status after this entry | in_progress, approved |

### Phase Values

| Phase | Description | Created By |
|-------|-------------|------------|
| PLAN | Task planning and preparation | nacl-tl-plan |
| DEV | Development work (TDD cycle) | nacl-tl-dev |
| REVIEW | Code review | nacl-tl-review |
| DOCS | Documentation updates | nacl-tl-docs |

### Status Values

| Status | Meaning |
|--------|---------|
| pending | Task created, not started |
| planned | Planning complete |
| in_progress | Development in progress |
| ready_for_review | Development complete |
| in_review | Code review in progress |
| review_rejected | Review failed, needs rework |
| approved | Review passed |
| done | Documentation complete, task closed |
| blocked | Waiting on dependency |

---

## Entry Examples by Phase

### PLAN Phase Entry

```markdown
### UC001 — Create Order

**Phase**: PLAN | **Status**: pending

- Extracted requirements from SA artifacts
- Created task.md with full context
- Defined 7 test cases in test-spec.md
- Set implementation hints in impl-brief.md
- Priority: high
- Dependencies: none
```

### DEV Phase Entry (Start)

```markdown
### UC001 — Create Order

**Phase**: DEV | **Status**: in_progress

- Started development using TDD workflow
- Reading task.md and test-spec.md
- Beginning RED phase
```

### DEV Phase Entry (Complete)

```markdown
### UC001 — Create Order

**Phase**: DEV | **Status**: ready_for_review

- TDD cycle completed successfully
- RED: Created 7 tests, all failing as expected
- GREEN: Implemented OrderService, all tests pass
- REFACTOR: Extracted order number generation
- Files created: 5 (+365 lines)
- Coverage: 87% (target: 80%)
- Commits: 3
```

### DEV Phase Entry (Iteration)

```markdown
### UC001 — Create Order

**Phase**: DEV | **Status**: in_progress

- Returning from review rejection
- Fixing issues:
  - AC05: Empty items validation
  - AC07: Negative quantity handling
- Re-running test suite
```

### REVIEW Phase Entry (Approved)

```markdown
### UC001 — Create Order

**Phase**: REVIEW | **Status**: approved

- Code review completed
- Acceptance criteria: 12/12 passed
- Code quality: all checks passed
- Issues found: 2 (both resolved)
  - Missing input sanitization → Added @Sanitize()
  - Unclear error message → Updated to "Client not found"
- Verdict: APPROVED
- Recommendations: Add rate limiting (future task)
```

### REVIEW Phase Entry (Rejected)

```markdown
### UC001 — Create Order

**Phase**: REVIEW | **Status**: review_rejected

- Code review completed
- Acceptance criteria: 10/12 passed
- Failed criteria:
  - AC05: Empty items not rejected properly
  - AC07: Negative quantity allowed
- Verdict: REJECTED
- Required fixes documented in review.md
- Task returned to DEV phase
```

### DOCS Phase Entry

```markdown
### UC001 — Create Order

**Phase**: DOCS | **Status**: done

- Updated API documentation (docs/api/orders.md)
- Added endpoint to README.md
- Updated CHANGELOG.md with user-facing entry
- Task completed and closed
```

---

## Writing Guidelines

### Bullet Point Style

Use concise, action-oriented language:

```markdown
✅ Good:
- Created OrderService with createOrder method
- Added validation for empty items array
- Fixed error message for invalid client

❌ Bad:
- I worked on the order service and created a method called createOrder
- The validation was added to check if items array is empty
- Changed the error message because it was unclear
```

### Quantify When Possible

Include numbers to make entries informative:

```markdown
✅ Good:
- Created 5 new files (+365 lines)
- All 7 tests passing
- Coverage: 87%
- Response time: ~45ms

❌ Bad:
- Created several files
- Tests are passing
- Coverage is good
- Response time is acceptable
```

### Reference Issues and Fixes

When fixing issues, reference them clearly:

```markdown
✅ Good:
- Fixed AC05: Empty items validation now rejects correctly
- Resolved Issue #123: Added missing audit log
- Addressed review comment: Improved error messages

❌ Bad:
- Fixed the validation
- Added logging
- Updated messages
```

---

## Special Entries

### Blocker Entry

```markdown
### UC003 — Update Order Status

**Phase**: DEV | **Status**: blocked

- Development blocked by dependency
- Waiting on: UC001 (Create Order)
- Blocker: Need Order entity before implementing status updates
- Will resume when UC001 is approved
```

### Hotfix Entry

```markdown
### HOTFIX — Order Number Collision

**Phase**: DEV | **Status**: done

- Fixed critical bug in order number generation
- Issue: Race condition causing duplicate numbers
- Solution: Added database-level unique constraint
- Bypassed standard review due to severity
- Follow-up: UC015 created for proper fix
```

### Planning Update Entry

```markdown
### PLAN UPDATE — Priority Revision

**Phase**: PLAN | **Status**: updated

- Reprioritized tasks based on stakeholder feedback
- UC005 priority: medium → high
- UC008 priority: high → medium
- Added new task: UC016 (Export to CSV)
- Removed task: UC012 (Duplicate of UC003)
```

---

## Integration with Skills

### nacl-tl-plan

Adds entries when:
- Initial planning complete
- Tasks created/modified
- Priorities changed
- Dependencies updated

### nacl-tl-dev

Adds entries when:
- Starting development
- Completing TDD cycle
- Returning from review rejection
- Encountering blockers

### nacl-tl-review

Adds entries when:
- Review completed (approved or rejected)
- Issues found and resolved
- Recommendations made

### nacl-tl-docs

Adds entries when:
- Documentation updated
- Task closed as done
- User-facing changelog updated

---

## Changelog vs status.json

| Aspect | changelog.md | status.json |
|--------|--------------|-------------|
| Audience | Humans | Machines (skills) |
| Format | Markdown prose | JSON structure |
| Detail | Rich context | Minimal status |
| History | Full history | Current state only |
| Updates | Append-only | Replace state |

### Synchronization Rule

Both files must be updated together. When a skill updates status.json, it MUST also add a corresponding changelog entry.

---

## Template for New Entry

```markdown
### {TASK_ID} — {Task Title}

**Phase**: {PHASE} | **Status**: {STATUS}

- {What was done}
- {Key metrics or outcomes}
- {Any issues or notes}
```

---

## Checklist: Changelog Entry Quality

### Required Information

- [ ] Task ID and title present
- [ ] Phase clearly stated
- [ ] Status accurately reflects task state
- [ ] At least one descriptive bullet point

### Quality Criteria

- [ ] Action-oriented language
- [ ] Quantified where applicable
- [ ] Issues/fixes clearly referenced
- [ ] No redundant information
- [ ] Consistent formatting with existing entries

### Synchronization

- [ ] status.json updated with same status
- [ ] Entry added to correct date section
- [ ] Most recent entries at top
- [ ] Quick Stats updated (if applicable)
