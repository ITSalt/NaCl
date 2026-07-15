# Task File Format Specifications

## Overview

This document defines the structure and format for all task-related files in the `.tl/tasks/` directory. The TL system uses a split BE/FE architecture where each Use Case (UC) produces separate backend and frontend task files, enabling parallel development with a shared API contract. Technical infrastructure tasks (TECH) use a simpler single-track format.

## Key Principle: Self-Sufficiency

**CRITICAL**: All task files must be **self-sufficient**. Development agents (`nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-dev`) read ONLY files in `.tl/tasks/{ID}/` -- never the original SA artifacts in `docs/`. Every piece of information needed for development must be embedded directly in the task files.

---

## UC Task Directory Structure

Each Use Case produces a full set of files covering backend, frontend, contract, review, sync, stubs, and QA.

```
.tl/tasks/UC001/
├── task-be.md         # Backend task description
├── task-fe.md         # Frontend task description
├── test-spec.md       # Backend test specification
├── test-spec-fe.md    # Frontend test specification
├── impl-brief.md      # Backend implementation brief
├── impl-brief-fe.md   # Frontend implementation brief
├── acceptance.md      # Acceptance criteria (shared BE+FE)
├── api-contract.md    # API contract (shared BE+FE bridge)
├── result-be.md       # Backend development result
├── result-fe.md       # Frontend development result
├── review-be.md       # Backend review result
├── review-fe.md       # Frontend review result
├── sync-report.md     # BE/FE sync verification
├── stub-report.md     # Stub scan result
└── qa-report.md       # E2E QA test result
```

**File creation timeline:**

| Phase | Files Created | By Skill |
|-------|--------------|----------|
| Planning | task-be, task-fe, test-spec, test-spec-fe, impl-brief, impl-brief-fe, acceptance, api-contract | nacl-tl-plan |
| BE Development | result-be | nacl-tl-dev-be |
| FE Development | result-fe | nacl-tl-dev-fe |
| BE Review | review-be | nacl-tl-review --be |
| FE Review | review-fe | nacl-tl-review --fe |
| Sync Check | sync-report | nacl-tl-sync |
| Stub Scan | stub-report | nacl-tl-stubs |
| QA Testing | qa-report | nacl-tl-qa |

---

## TECH Task Directory Structure

Technical / infrastructure tasks use a simpler single-track structure without BE/FE split.

```
.tl/tasks/TECH-001/
├── task.md            # TECH task description (uses tech-task-template.md)
├── test-spec.md       # Test specification (optional)
├── impl-brief.md      # Implementation brief (optional)
├── result.md          # Development result
└── review.md          # Review result (reviewed as BE)
```

TECH tasks have no Actor, Input/Output, or Main Flow sections. They describe infrastructure work: database setup, Docker configuration, CI/CD, authentication, shared types, monitoring.

---

## File Descriptions

### 1. task-be.md -- Backend Task Description

**Purpose**: Contains all information needed to understand WHAT to implement on the backend: API endpoints, services, business logic, database operations.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-be` | **Template**: `nacl-tl-core/templates/task-be-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Create Order"
source_uc: docs/14-usecases/UC001-create-order.md
status: pending
priority: high
module: orders
actor: Manager
created: 2025-01-30
updated: 2025-01-30
depends_on: []
blocks: []
tags: [orders, high, be]
---
```

**Required Sections**: Description, Actor, Preconditions, Input Data (field/type/required/validation table), Output Data (field/type table), Main Flow (API-side steps only: validate, create, return), Alternative Flows, Context Extract (entity attribute tables, status values, business rules), SA References (human-only).

---

### 2. task-fe.md -- Frontend Task Description

**Purpose**: Contains all information needed to understand WHAT to implement on the frontend: pages, routes, components, forms, state management, user interactions.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-fe` | **Template**: `nacl-tl-core/templates/task-fe-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Create Order"
source_uc: docs/14-usecases/UC001-create-order.md
status: pending
priority: high
module: orders
actor: Manager
created: 2025-01-30
updated: 2025-01-30
depends_on: []
blocks: []
tags: [orders, high, fe]
---
```

**Required Sections**: Description, Actor, Pages/Routes (route/component/layout table), Components (hierarchy tree with props), Forms (Zod validation schemas, field definitions, error messages), State Management (TanStack Query hooks + Zustand stores), User Interactions (step-by-step UI flow), Context Extract, SA References.

---

### 3. test-spec.md -- Backend Test Specification

**Purpose**: Defines all backend test cases for TDD development. The `nacl-tl-dev-be` agent writes tests based on this specification BEFORE writing implementation code (RED phase).

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-be` (RED phase) | **Template**: `nacl-tl-core/templates/test-spec-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Test Specification: Create Order"
test_framework: jest
coverage_target: 80%
created: 2025-01-30
---
```

**Required Sections**: Test Suite Structure (directory tree), Unit Tests (Given/When/Then format with Jest code examples), Integration Tests (endpoint + request + expected response), Edge Cases (case/input/expected table), Test Data Fixtures (TypeScript fixture files).

---

### 4. test-spec-fe.md -- Frontend Test Specification

**Purpose**: Defines all frontend test cases for TDD development. Uses React Testing Library (RTL) + user-event for component testing and MSW for API mocking.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-fe` (RED phase) | **Template**: `nacl-tl-core/templates/test-spec-fe-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "FE Test Specification: Create Order"
source_uc: docs/14-usecases/UC001-create-order.md
status: pending
created: 2025-01-30
updated: 2025-01-30
test_framework: vitest
test_library: "@testing-library/react + @testing-library/user-event"
mock_server: msw
tags: [tests, fe, orders, UC001]
---
```

**Required Sections**: Overview, Test Environment (dependencies, MSW handlers), Component Tests (CT -- render + screen queries + user interactions), Hook Tests (HT -- renderHook()), Form Tests (FT -- Zod validation, submission, error display), Integration Tests (IT -- multi-component flows with MSW), Accessibility Tests (AT -- ARIA roles, keyboard nav), Edge Cases (loading/error/empty states, network failures), Test Data & MSW Handlers.

---

### 5. impl-brief.md -- Backend Implementation Brief

**Purpose**: Provides backend implementation guidance: files to create/modify, code patterns, database schema, API specification. Does NOT contain business logic (that is in task-be.md).

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-be` (GREEN phase) | **Template**: `nacl-tl-core/templates/impl-brief-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Implementation Brief: Create Order"
tech_stack: [Node.js, TypeScript, Express, PostgreSQL]
estimated_files: 5
created: 2025-01-30
---
```

**Required Sections**: Files to Create (file/purpose table), Files to Modify (file/changes table), Patterns to Follow (Service/Controller/Repository code examples), DTO Validation (class-validator or Zod schemas), API Specification (endpoint, request body, success response, error response), Database Schema (SQL CREATE TABLE), Implementation Hints.

---

### 6. impl-brief-fe.md -- Frontend Implementation Brief

**Purpose**: Provides frontend implementation guidance: Next.js App Router structure, component hierarchy, TanStack Query hooks, Zustand stores, Tailwind CSS styling, TDD implementation order.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-fe` (GREEN phase) | **Template**: `nacl-tl-core/templates/impl-brief-fe-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "FE Implementation Brief: Create Order"
source_uc: docs/14-usecases/UC001-create-order.md
status: pending
created: 2025-01-30
updated: 2025-01-30
architecture_type: next-app-router
tags: [implementation, fe, orders, UC001]
---
```

**Required Sections**: Overview, Project Structure (Next.js App Router directory tree), Component Hierarchy (parent/child tree), API Integration (TanStack Query useQuery/useMutation hooks), State Management (Zustand stores if needed), Form Implementation (React Hook Form + Zod), Styling (Tailwind CSS patterns, design tokens), Layout (page layout composition from SA interfaces), TDD Implementation Order, Implementation Hints.

---

### 7. acceptance.md -- Acceptance Criteria

**Purpose**: Defines acceptance criteria for code review. Covers both BE and FE in a single file per UC.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-review` (both `--be` and `--fe`) | **Template**: `nacl-tl-core/templates/acceptance-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Acceptance Criteria: Create Order"
total_criteria: 15
created: 2025-01-30
---
```

**Required Sections**: Functional Criteria (numbered AC01, AC02... checklist), Non-Functional Criteria (performance, security, atomicity), Test Criteria (coverage targets, all tests must pass), Verification Commands (shell commands), Expected Test Output.

---

### 8. api-contract.md -- API Contract

**Purpose**: Single source of truth for BE/FE interaction. Defines endpoints, shared TypeScript types, error codes, Zod validation, WebSocket events, and authentication. Created BEFORE development, enabling parallel BE/FE work.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev-be`, `nacl-tl-dev-fe`, `nacl-tl-sync` | **Template**: `nacl-tl-core/templates/api-contract-template.md`

**Frontmatter**:
```yaml
---
uc_id: UC001
title: "API Contract: Create Order"
version: "1.0.0"
status: draft
created: 2025-01-30
updated: 2025-01-30
participants:
  - role: BE
  - role: FE
---
```

**Required Sections**: Shared Types (TypeScript interfaces in `src/shared/types/`), Endpoints (method, URL, request schema, response schema, error codes per endpoint), Zod Validation Schemas, Error Codes (standardized format), WebSocket Events (name, direction, payload -- if applicable), Authentication (required headers, token format, roles), Rate Limiting (if applicable).

---

### 9. result-be.md -- Backend Development Result

**Purpose**: Documents backend development work after TDD cycle completion. Evidence of RED-GREEN-REFACTOR phases.

**Created By**: `nacl-tl-dev-be` | **Read By**: `nacl-tl-review --be` | **Template**: `nacl-tl-core/templates/result-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "BE Development Result: Create Order"
developer: nacl-tl-dev-be
started: 2025-01-30T10:00:00Z
completed: 2025-01-30T14:30:00Z
tdd_phases: [RED, GREEN, REFACTOR]
status: ready_for_review
---
```

**Required Sections**: Summary, TDD Phases Completed (RED/GREEN/REFACTOR details), Files Changed (file/action/lines table), Test Results (suites, tests, coverage), Commits Made (conventional commit messages), Notes, Known Issues (or "None"), Ready for Review checklist.

---

### 10. result-fe.md -- Frontend Development Result

**Purpose**: Documents frontend development work after TDD cycle with RTL.

**Created By**: `nacl-tl-dev-fe` | **Read By**: `nacl-tl-review --fe` | **Template**: `nacl-tl-core/templates/result-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "FE Development Result: Create Order"
developer: nacl-tl-dev-fe
started: 2025-01-30T15:00:00Z
completed: 2025-01-30T19:00:00Z
tdd_phases: [RED, GREEN, REFACTOR]
status: ready_for_review
---
```

**Required Sections**: Summary, TDD Phases Completed (RED with RTL, GREEN with components, REFACTOR with hooks/memo), Components Created (name/type/test count table), Files Changed, Test Results (CT/HT/FT/IT/AT breakdown), Commits Made, Notes, Known Issues, Ready for Review checklist.

---

### 11. review-be.md -- Backend Review Result

**Purpose**: Documents backend code review. Contains acceptance criteria check, 8-category code quality assessment, issues, and verdict.

**Created By**: `nacl-tl-review --be` | **Read By**: `nacl-tl-dev-be --continue` (if rejected) | **Template**: `nacl-tl-core/templates/review-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "BE Review Result: Create Order"
reviewer: nacl-tl-review
reviewed_at: 2025-01-30T15:00:00Z
verdict: approved
issues_found: 2
issues_resolved: 2
---
```

**Required Sections**: Summary + Verdict, Acceptance Criteria Check (AC table with PASS/FAIL), Code Quality Check (8 categories: Correctness, Quality, Error Handling, Testing, Security, Performance, Documentation, Stub Gate), Issues Found (location/severity/description/resolution), Verdict (APPROVED/REJECTED), Recommendations.

---

### 12. review-fe.md -- Frontend Review Result

**Purpose**: Documents frontend code review with extended 10-category FE checklist.

**Created By**: `nacl-tl-review --fe` | **Read By**: `nacl-tl-dev-fe --continue` (if rejected) | **Template**: `nacl-tl-core/templates/review-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "FE Review Result: Create Order"
reviewer: nacl-tl-review
reviewed_at: 2025-01-31T10:00:00Z
verdict: approved
issues_found: 1
issues_resolved: 1
---
```

**Required Sections**: Summary + Verdict, Acceptance Criteria Check, FE Review Checklist (10 categories: Correctness, Quality, Error Handling, Testing, Security, Performance, Documentation, Stub Gate, Accessibility, Responsiveness), Issues Found, Verdict, Recommendations.

---

### 13. sync-report.md -- Sync Verification Report

**Purpose**: Documents BE/FE synchronization verification against the API contract.

**Created By**: `nacl-tl-sync` | **Read By**: `nacl-tl-full`, `nacl-tl-review` | **Template**: `nacl-tl-core/templates/sync-report-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Sync Report: Create Order"
api_contract_version: "1.0.0"
be_commit: abc1234
fe_commit: def5678
generated_at: 2025-01-31T12:00:00Z
status: completed
verdict: PASS
stats:
  total_checks: 12
  passed: 12
  failed: 0
  warnings: 0
created: 2025-01-31
---
```

**Required Sections**: Summary + Verdict, Contract Compliance (endpoint checks: URL/method/request/response shape), Type Consistency, Mock Remnants (no MSW in production), Error Handling (FE handles all BE error codes), Auth Flow, Issues (severity: BLOCKER/CRITICAL/MAJOR/MINOR), Verdict (PASS/FAIL/PASS_WITH_WARNINGS).

---

### 14. stub-report.md -- Stub Scan Report

**Purpose**: Documents scan results for stubs, TODOs, mocks, and temporary markers.

**Created By**: `nacl-tl-stubs` | **Read By**: `nacl-tl-review`, `nacl-tl-full` | **Template**: `nacl-tl-core/templates/stub-report-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "Stub Report: Create Order"
scan_date: 2025-01-31T11:00:00Z
scope: task
status: clean
total_stubs: 3
critical_count: 0
warning_count: 2
info_count: 1
created: 2025-01-31
updated: 2025-01-31
tags: [stub-report, orders, UC001]
---
```

**Required Sections**: Summary, Markers by Severity (CRITICAL/HIGH/MEDIUM/LOW tables), Blocking Verdict (CRITICAL/HIGH = blocked), Recommendations.

---

### 15. qa-report.md -- QA Test Report

**Purpose**: Documents E2E QA test results via MCP Playwright.

**Created By**: `nacl-tl-qa` | **Read By**: `nacl-tl-full`, `nacl-tl-status` | **Template**: `nacl-tl-core/templates/qa-report-template.md`

**Frontmatter**:
```yaml
---
task_id: UC001
title: "QA Report: Create Order"
tester: nacl-tl-qa
test_date: 2025-02-01T09:00:00Z
environment: dev
browser: chromium
frontend_url: http://localhost:3000
backend_url: http://localhost:3001
verdict: PASS
total_criteria: 12
passed_criteria: 12
failed_criteria: 0
na_criteria: 0
bugs_found: 0
created: 2025-02-01
---
```

**Required Sections**: Summary, E2E Scenarios (steps/expected/actual/PASS-FAIL per criterion), Screenshots (references to `.tl/qa-screenshots/{id}/`), Bugs Found (severity/steps/expected/actual/screenshot), Performance Notes, Verdict (PASS/FAIL).

---

### 16. task.md (TECH) -- Technical Task Description

**Purpose**: Describes infrastructure / technical tasks not tied to a specific Use Case. No Actor, Input/Output, or Main Flow.

**Created By**: `nacl-tl-plan` | **Read By**: `nacl-tl-dev` | **Template**: `nacl-tl-core/templates/tech-task-template.md`

**Frontmatter**:
```yaml
---
task_id: TECH-001
title: "Setup PostgreSQL + Docker Compose"
status: pending
priority: high
category: infra
created: 2025-01-30
updated: 2025-01-30
depends_on: []
blocks: [UC001, UC002]
tags: [infra, high, tech]
---
```

**Required Sections**: Description, Motivation, Requirements (numbered list), Scope (files to create/modify), Acceptance Criteria (checklist), Implementation Hints, Verification Commands.

---

## Status Tracking

### UC Task Status: Phase-Level Tracking

UC tasks are tracked per-phase because BE, FE, sync, stubs, and QA each have independent progress:

```yaml
phases:
  be:        pending | in_progress | ready_for_review
  review_be: pending | in_review | approved | rejected
  fe:        pending | in_progress | ready_for_review
  review_fe: pending | in_review | approved | rejected
  sync:      pending | passed | failed
  stubs:     pending | clean | has_blockers
  qa:        pending | passed | failed
```

**Deriving overall UC status from phases:**

| Condition | Overall UC Status |
|-----------|-------------------|
| All phases completed successfully | `done` |
| Any phase has blockers or failed | Blocked (reflects the blocking phase) |
| At least one phase `in_progress` or `in_review` | `in_progress` |
| All phases `pending` | `pending` |
| `review_be`/`review_fe` = `rejected` | Loops back: `be`/`fe` = `in_progress` |

### TECH Task Status: Simple Linear Tracking

```
pending -> in_progress -> ready_for_review -> in_review -> approved -> done
                                                  |
                                              rejected -> in_progress (re-do)
```

---

## Status Transitions Diagram

### UC Task Full Lifecycle

```
nacl-tl-plan creates all planning files
    |
    v
BE: nacl-tl-dev-be --> nacl-tl-stubs --> nacl-tl-review --be
    |                              |
    |                   +----------+----------+
    |                   |                     |
    |               APPROVED              REJECTED
    |                   |                     |
    |                   v                     v
    |              (continue)       nacl-tl-dev-be --continue --> re-review
    |
    v (after BE approved)
FE: nacl-tl-dev-fe --> nacl-tl-stubs --> nacl-tl-review --fe
    |                              |
    |                   +----------+----------+
    |                   |                     |
    |               APPROVED              REJECTED
    |                   |                     |
    |                   v                     v
    |              (continue)       nacl-tl-dev-fe --continue --> re-review
    |
    v (after both BE and FE approved)
nacl-tl-sync --> nacl-tl-stubs (final) --> nacl-tl-qa --> DONE
```

### Simplified Flow

```
nacl-tl-plan creates files
    |
BE: nacl-tl-dev-be --> nacl-tl-review --be --> (if rejected --> nacl-tl-dev-be --continue --> re-review)
    |
FE: nacl-tl-dev-fe --> nacl-tl-review --fe --> (if rejected --> nacl-tl-dev-fe --continue --> re-review)
    |
nacl-tl-sync --> nacl-tl-stubs --> nacl-tl-qa --> DONE
```

### TECH Task Lifecycle

```
nacl-tl-plan --> nacl-tl-dev --> nacl-tl-stubs --> nacl-tl-review --be --> (APPROVED --> nacl-tl-docs --> DONE)
                                                  --> (REJECTED --> nacl-tl-dev --continue)
```

---

## Execution Waves

Tasks are grouped into waves by dependencies. Within a wave, tasks can execute in parallel.

```
Wave 1: [TECH-001, TECH-002]        -- Infrastructure (DB, Docker, shared types)
Wave 2: [UC001-BE, UC002-BE]        -- Backend API for core UCs
Wave 3: [UC001-FE, UC002-FE]        -- Frontend for core UCs (depends on BE)
Wave 4: [UC001-SYNC, UC002-SYNC]    -- Sync verification for completed pairs
Wave 5: [QA-ALL]                    -- E2E testing across all approved UCs
```

**Wave rules:**
- **BE before FE**: If FE depends on a BE API, the BE task must be in an earlier wave
- **TECH early**: Infrastructure tasks go in Wave 1
- **SYNC after pairs**: nacl-tl-sync runs when both BE and FE for a UC are approved
- **QA last**: E2E tests run in final waves after sync is verified

---

## File Quality Checklists

### task-be.md
- [ ] Frontmatter complete (task_id, title, status, priority, module, actor)
- [ ] Description clear and self-contained
- [ ] Input/Output tables with types and validation
- [ ] Main flow contains ONLY API-side steps (no UI steps)
- [ ] Context extract includes all relevant entities and business rules
- [ ] NO external references for dev agent

### task-fe.md
- [ ] Pages/Routes table with Next.js paths
- [ ] Components listed with hierarchy and props
- [ ] Forms defined with Zod schemas
- [ ] State management defined (TanStack Query + Zustand)
- [ ] User interactions are step-by-step UI flow (no API logic)

### test-spec.md (BE)
- [ ] Unit tests in Given/When/Then format with code
- [ ] Integration tests with endpoint + request + expected response
- [ ] Edge cases table complete
- [ ] Test fixtures provided, coverage target specified

### test-spec-fe.md
- [ ] All 5 test categories: CT, HT, FT, IT, AT
- [ ] Tests use RTL + user-event (behavior, not implementation)
- [ ] MSW handlers defined, accessibility tests included

### impl-brief.md (BE)
- [ ] Files to create/modify listed
- [ ] Code patterns provided (Service/Controller/Repository)
- [ ] API specification complete, database schema defined

### impl-brief-fe.md
- [ ] Next.js App Router structure, component hierarchy
- [ ] TanStack Query hooks specified, Zustand stores defined
- [ ] Tailwind CSS patterns, TDD implementation order

### acceptance.md
- [ ] All criteria numbered (AC01, AC02...), covers both BE and FE
- [ ] Functional + non-functional + test criteria
- [ ] Verification commands and expected output

### api-contract.md
- [ ] Shared types in TypeScript, all endpoints listed
- [ ] Error codes standardized, Zod schemas provided
- [ ] Auth requirements specified, version number set

### result-be.md / result-fe.md
- [ ] TDD phases documented (RED/GREEN/REFACTOR)
- [ ] Files changed, test results with coverage, commits listed

### review-be.md / review-fe.md
- [ ] All acceptance criteria checked, code quality checklist completed
- [ ] Issues documented, verdict stated (APPROVED/REJECTED)

### sync-report.md
- [ ] All endpoints checked against contract, type consistency verified
- [ ] No mock remnants, verdict clear (PASS/FAIL)

### stub-report.md / qa-report.md
- [ ] Markers classified by severity / E2E scenarios documented
- [ ] Blocking status / verdict determined

---

## Template Reference

| File | Template Path |
|------|--------------|
| task-be.md | `nacl-tl-core/templates/task-be-template.md` |
| task-fe.md | `nacl-tl-core/templates/task-fe-template.md` |
| test-spec.md | `nacl-tl-core/templates/test-spec-template.md` |
| test-spec-fe.md | `nacl-tl-core/templates/test-spec-fe-template.md` |
| impl-brief.md | `nacl-tl-core/templates/impl-brief-template.md` |
| impl-brief-fe.md | `nacl-tl-core/templates/impl-brief-fe-template.md` |
| acceptance.md | `nacl-tl-core/templates/acceptance-template.md` |
| api-contract.md | `nacl-tl-core/templates/api-contract-template.md` |
| result-be.md / result-fe.md | `nacl-tl-core/templates/result-template.md` |
| review-be.md / review-fe.md | `nacl-tl-core/templates/review-template.md` |
| sync-report.md | `nacl-tl-core/templates/sync-report-template.md` |
| stub-report.md | `nacl-tl-core/templates/stub-report-template.md` |
| qa-report.md | `nacl-tl-core/templates/qa-report-template.md` |
| task.md (TECH) | `nacl-tl-core/templates/tech-task-template.md` |
