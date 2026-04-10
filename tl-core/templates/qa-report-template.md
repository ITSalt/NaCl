# QA Report Template

## File Name

`qa-report.md`

Located in: `.tl/tasks/{{task_id}}/qa-report.md`

Example: `.tl/tasks/UC001/qa-report.md`

## Purpose

Documents the end-to-end QA test results performed "through the user's eyes" using MCP Playwright. Contains the test scenario execution, acceptance criteria verification, discovered bugs, screenshots, and a final verdict. This file provides the **evidence** that the implemented feature works correctly from the user's perspective.

## Created By

`tl-qa` skill

## Read By

`tl-full` skill, `tl-status` skill

## Contents

```markdown
---
task_id: {{task_id}}
title: "QA Report: {{title}}"
tester: tl-qa
test_date: {{YYYY-MM-DDTHH:MM:SSZ}}
environment: {{dev|staging}}
browser: {{chromium|firefox|webkit}}
frontend_url: {{http://localhost:PORT}}
backend_url: {{http://localhost:PORT}}
verdict: {{PASS|FAIL}}
total_criteria: {{N}}
passed_criteria: {{N}}
failed_criteria: {{N}}
na_criteria: {{N}}
bugs_found: {{N}}
critical_bugs: {{N}}
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
tags: [qa-report, {{module}}, {{task_id}}]
---

# QA Report: {{task_id}}

## Scenario

| Field | Value |
|-------|-------|
| Use Case | {{task_id}} -- {{UC title}} |
| Actor | {{Primary actor from task.md}} |
| Preconditions | {{Preconditions from task.md — e.g., "User is authenticated", "Database seeded with test data"}} |
| Main Flow | {{Brief description of the main flow being tested}} |
| Frontend URL | {{http://localhost:PORT}} |
| Backend URL | {{http://localhost:PORT}} |

## Test Steps

### Step 01: {{Step description}}

| Field | Value |
|-------|-------|
| Action | {{What the user does — e.g., "Navigate to /orders/new"}} |
| Expected Result | {{What should happen — e.g., "Order creation form is displayed"}} |
| Actual Result | {{What actually happened — e.g., "Form displayed with title 'Create Order'"}} |
| Screenshot | [step-01-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/step-01-{{description}}.png) |
| Status | **{{PASS/FAIL}}** |

### Step 02: {{Step description}}

| Field | Value |
|-------|-------|
| Action | {{What the user does}} |
| Expected Result | {{What should happen}} |
| Actual Result | {{What actually happened}} |
| Screenshot | [step-02-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/step-02-{{description}}.png) |
| Status | **{{PASS/FAIL}}** |

### Step 03: {{Step description}}

| Field | Value |
|-------|-------|
| Action | {{What the user does}} |
| Expected Result | {{What should happen}} |
| Actual Result | {{What actually happened}} |
| Screenshot | [step-03-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/step-03-{{description}}.png) |
| Status | **{{PASS/FAIL}}** |

<!-- Add more steps as needed following the same format -->

### Step NN: {{Alternative flow / validation error step}}

| Field | Value |
|-------|-------|
| Action | {{What the user does — e.g., "Submit form with empty required fields"}} |
| Expected Result | {{What should happen — e.g., "Validation error message displayed"}} |
| Actual Result | {{What actually happened}} |
| Screenshot | [step-NN-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/step-NN-{{description}}.png) |
| Status | **{{PASS/FAIL}}** |

### Test Steps Summary

| Step | Description | Status |
|------|-------------|--------|
| 01 | {{Step description}} | {{PASS/FAIL}} |
| 02 | {{Step description}} | {{PASS/FAIL}} |
| 03 | {{Step description}} | {{PASS/FAIL}} |
| NN | {{Step description}} | {{PASS/FAIL}} |

## Acceptance Criteria Check

Criteria sourced from `.tl/tasks/{{task_id}}/acceptance.md`.

| # | Criterion | Status | Evidence |
|---|----------|--------|----------|
| AC01 | {{Criterion text from acceptance.md}} | {{PASS/FAIL/N/A}} | {{Step reference or explanation — e.g., "Step 04", "45ms response time"}} |
| AC02 | {{Criterion text from acceptance.md}} | {{PASS/FAIL/N/A}} | {{Evidence}} |
| AC03 | {{Criterion text from acceptance.md}} | {{PASS/FAIL/N/A}} | {{Evidence}} |
| AC04 | {{Criterion text from acceptance.md}} | {{PASS/FAIL/N/A}} | {{Evidence}} |

### Criteria not testable via UI (N/A)

{{List criteria marked N/A and explain why they cannot be verified through E2E testing.}}

- **{{AC_ID}}**: {{Criterion}} -- {{Reason, e.g., "Verified in unit tests during tl-review"}}
- **{{AC_ID}}**: {{Criterion}} -- {{Reason, e.g., "Database-level constraint, not observable in UI"}}

### Criteria Summary

| Category | Count |
|----------|-------|
| Total Criteria | {{N}} |
| Passed | {{N}} |
| Failed | {{N}} |
| N/A (not UI-testable) | {{N}} |

## Bugs Found

{{If no bugs found: "No bugs found during QA testing."}}

### BUG-001: {{Bug title}}

| Field | Value |
|-------|-------|
| Severity | {{CRITICAL/MAJOR/MINOR}} |
| Description | {{What is wrong}} |
| Steps to Reproduce | 1. {{Step 1}} 2. {{Step 2}} 3. {{Step 3}} |
| Expected Result | {{What should happen}} |
| Actual Result | {{What actually happens}} |
| Screenshot | [bug-001-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/bug-001-{{description}}.png) |
| Related Step | Step {{NN}} |

### BUG-002: {{Bug title}}

| Field | Value |
|-------|-------|
| Severity | {{CRITICAL/MAJOR/MINOR}} |
| Description | {{What is wrong}} |
| Steps to Reproduce | 1. {{Step 1}} 2. {{Step 2}} 3. {{Step 3}} |
| Expected Result | {{What should happen}} |
| Actual Result | {{What actually happens}} |
| Screenshot | [bug-002-{{description}}.png](../../../.tl/qa-screenshots/{{task_id}}/bug-002-{{description}}.png) |
| Related Step | Step {{NN}} |

### Bug Summary

| Severity | Count |
|----------|-------|
| CRITICAL | {{N}} |
| MAJOR | {{N}} |
| MINOR | {{N}} |
| **Total** | **{{N}}** |

## Screenshots

All screenshots are stored in `.tl/qa-screenshots/{{task_id}}/`.

| File | Step | Description |
|------|------|-------------|
| step-01-{{description}}.png | Step 01 | {{What the screenshot shows}} |
| step-02-{{description}}.png | Step 02 | {{What the screenshot shows}} |
| step-03-{{description}}.png | Step 03 | {{What the screenshot shows}} |
| step-NN-{{description}}.png | Step NN | {{What the screenshot shows}} |
| bug-001-{{description}}.png | BUG-001 | {{Bug evidence screenshot}} |

**Note:** Screenshots are not committed to git. Directory `.tl/qa-screenshots/` is in `.gitignore`.

## Verdict

### Result: **{{PASS / FAIL}}**

{{For PASS:}}
All acceptance criteria (testable via UI) are met and no critical or major bugs were found. The implementation works correctly from the user's perspective.

{{For FAIL:}}
The task did not pass QA due to the following reasons:

{{Select applicable:}}
- [ ] Acceptance criterion {{AC_ID}} failed
- [ ] Critical bug BUG-{{NNN}} found
- [ ] Major bug BUG-{{NNN}} in main flow
- [ ] Page does not load / returns server error
- [ ] Main flow cannot be completed end-to-end

### Verdict Conditions

| Condition | Required | Actual | Status |
|-----------|----------|--------|--------|
| All UI-testable criteria passed | Yes | {{N}}/{{N}} passed | {{PASS/FAIL}} |
| No critical bugs | Yes | {{N}} critical | {{PASS/FAIL}} |
| No major bugs in main flow | Yes | {{N}} major in main flow | {{PASS/FAIL}} |
| Main flow completes end-to-end | Yes | {{Yes/No}} | {{PASS/FAIL}} |

### Recommendation

{{For PASS: "Task is ready for completion. Proceed to tl-full."}}
{{For FAIL: "Task requires rework. Fix the listed bugs and failed criteria, then request re-test via tl-qa."}}

## Re-run History

{{If this is the first run: "This is the initial QA run. No re-run history."}}

### Re-run #{{N}} -- {{YYYY-MM-DD}}

| Field | Value |
|-------|-------|
| Previous Run Date | {{YYYY-MM-DD}} |
| Previous Verdict | {{PASS/FAIL}} |
| Reason for Re-run | {{What was fixed — e.g., "BUG-001 fixed: validation error now displays correctly"}} |
| Steps Re-tested | {{List of steps — e.g., "Steps 05, 06, 07"}} |
| Bugs Fixed | {{List — e.g., "BUG-001 resolved"}} |
| New Bugs Found | {{List or "None"}} |
| Current Verdict | **{{PASS/FAIL}}** |

## QA Session Metadata

| Attribute | Value |
|-----------|-------|
| Tester | tl-qa |
| Test Date | {{YYYY-MM-DD HH:MM}} |
| Environment | {{dev/staging}} |
| Browser | {{chromium/firefox/webkit}} |
| Duration | {{N}} minutes |
| Screenshots Taken | {{N}} |

### Files Referenced

| File | Purpose |
|------|---------|
| `.tl/tasks/{{task_id}}/acceptance.md` | Acceptance criteria source |
| `.tl/tasks/{{task_id}}/task.md` | Scenario and flow description |
| `.tl/tasks/{{task_id}}/impl-brief.md` | URLs, endpoints, component names |
| `.tl/tasks/{{task_id}}/result.md` | What was implemented |
```

## Verdict Reference

| Verdict | Meaning | Next Action |
|---------|---------|-------------|
| `PASS` | All UI criteria met, no critical/major bugs | Proceed to tl-full |
| `FAIL` | Criteria failed or critical/major bugs found | Rework and re-test |

## Bug Severity Reference

| Severity | Description | Impact on Verdict |
|----------|-------------|-------------------|
| CRITICAL | App crashes, data loss, security vulnerability | FAIL -- blocks |
| MAJOR | Core function broken, but app does not crash | FAIL -- if in main flow |
| MINOR | Cosmetic defects, inconvenience, no functional impact | PASS -- recorded as note |

## Environment Reference

| Environment | Meaning |
|-------------|---------|
| `dev` | Local development servers (localhost) |
| `staging` | Staging/preview deployment |

## Quality Checklist

Before committing a qa-report.md file, verify:

- [ ] Frontmatter complete (task_id, test_date, environment, verdict, browser)
- [ ] Scenario section describes UC, actor, and preconditions
- [ ] All test steps documented with action, expected/actual results, and status
- [ ] Screenshot taken and referenced for every step
- [ ] Acceptance criteria table complete with status and evidence
- [ ] N/A criteria explained (why not testable via UI)
- [ ] Bugs documented with severity, steps to reproduce, and screenshots
- [ ] Screenshots section lists all files in qa-screenshots directory
- [ ] Verdict clearly stated with conditions table
- [ ] Recommendation provided based on verdict
- [ ] Re-run history included (if this is a re-test)
- [ ] QA session metadata complete
