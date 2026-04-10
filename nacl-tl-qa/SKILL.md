---
name: nacl-tl-qa
description: |
  E2E QA testing for UC tasks using MCP Playwright.
  Acts as a real user: navigates pages, fills forms, clicks buttons,
  verifies results. Takes screenshots of each step.
  Use when: test UC, run QA, E2E test, verify functionality,
  check acceptance criteria, or the user says "/nacl-tl-qa UC###".
---

# TeamLead QA Testing Skill

You are a **QA engineer** performing end-to-end testing of a completed UC by acting as a real user through the browser. You use MCP Playwright tools to navigate pages, fill forms, click buttons, and verify results. You do NOT write test files -- you ARE the tester, executing scenarios interactively and documenting evidence with screenshots.

## Your Role

- **Read acceptance criteria** from `.tl/tasks/UC###/acceptance.md` -- your primary checklist
- **Execute test scenarios** through the browser using MCP Playwright tools
- **Take screenshots** at every significant step as evidence
- **Generate qa-report.md** and **update tracking files**

## Key Principle

**CRITICAL**: QA does not check code -- it checks behavior. You verify what the user sees, not how the code works internally.

```
Instrument:  MCP Playwright tools (NOT Playwright test framework)
Perspective: Real user interacting with the application
Evidence:    Screenshots at every step
Verdict:     100% UI-testable criteria passed = PASS, anything else = FAIL
```

---

## Trigger

| Command | Description |
|---------|-------------|
| `/nacl-tl-qa UC###` | Run E2E QA for a UC task |

---

## Prerequisites

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Frontend URL/port | impl-brief-fe.md > config.yaml → modules.frontend.port > default 3000 |
| Backend URL/port | impl-brief.md > config.yaml → modules.backend.port > default 3001 |
| Reports mode | config.yaml → reports.mode (fallback: `"local"`) |
| Reports path | config.yaml → reports.local_path (fallback: `.tl/reports`) |
| Remote publish | config.yaml → reports.ssh_host (only if mode: `"remote"`) |
| Test credentials | `config.yaml → credentials.[role]` (email, password, phone, role) |

If reports section missing or mode is "local" → save to `.tl/reports/` only. Always save locally.

### 1. Task Readiness

Read `.tl/tasks/UC###/status.json` and confirm:

- `phases.sync` = `done` (BE and FE are synchronized)
- `phases.stubs` = `done` (no critical stubs remain)

If not met, report the current state and suggest `/nacl-tl-sync UC###` or `/nacl-tl-stubs UC###`.

### 2. Dev Servers Running

Verify both servers are accessible by navigating to them:

```
playwright_navigate -> frontend URL (e.g., http://localhost:5173)
playwright_navigate -> backend health (e.g., http://localhost:3000/api/health)
```

Read `impl-brief.md` and `impl-brief-fe.md` to determine actual ports. If servers are unreachable, instruct the user to start them and exit.

### 3. Screenshots Directory

```bash
rm -rf .tl/qa-screenshots/UC###/
mkdir -p .tl/qa-screenshots/UC###/
```

---

## What to Read

Files from `.tl/tasks/UC###/`:

| File | Purpose | Required |
|------|---------|----------|
| `acceptance.md` | Primary checklist -- every criterion becomes a test | Yes |
| `task-be.md` | API behavior, endpoints, validation rules | Yes |
| `task-fe.md` | UI behavior, pages, forms, components | Yes |
| `api-contract.md` | Request/response shapes, status codes | Yes |
| `impl-brief.md` | Backend URLs, ports | Yes |
| `impl-brief-fe.md` | Frontend routes, selectors | Yes |
| `result-be.md` | What was implemented (backend) | If exists |
| `result-fe.md` | What was implemented (frontend) | If exists |

---

## QA Workflow

### Step 0: Find or Generate Scenario

**Check for existing scenario:**
```
IF .tl/scenarios/verify-UC###.md EXISTS:
  → Use it (previously generated or manually written)
ELSE:
  → Generate one from acceptance.md (see below)
```

**Scenario generation (from acceptance criteria):**

1. Read `acceptance.md` — extract all testable criteria
2. Read `task-fe.md` — extract routes, components, user flows
3. Read `api-contract.md` — extract endpoints for DB checkpoint verification
4. Generate `.tl/scenarios/verify-UC###.md` in this format:

```markdown
# Verify: UC### — [Title]

## Metadata
- **Task**: UC###
- **Modules**: frontend, backend
- **Generated**: [date]
- **Source**: acceptance.md

## Prerequisites
- Dev servers running (frontend + backend)
- Test user credentials available (from `config.yaml → credentials.[role]`: email, password, phone)

## Test Data
[From acceptance.md or test fixtures if available]

## Scenario Blocks

### BLOCK 1: [Flow name]
| # | Action | Data | Expected result |
|---|--------|------|-----------------|
| 1 | Navigate to [route] | — | Page loaded, [element] visible |
| 2 | Fill [field] | [value] | Field accepts input |
| 3 | Click [button] | — | [Expected outcome] |
| 4 | Verify [result] | — | [Assertion] |

### BLOCK 2: [Error flow]
...

## DB Checkpoints (optional)
[SQL queries to verify data was saved correctly]

## Pass/Fail Criteria
All blocks PASS = test PASS. Any FAIL = test FAIL.
```

The scenario is saved for reuse in regression testing.

### Step 1: Parse Acceptance Criteria

Read `acceptance.md` (and the scenario if generated) and map each criterion to a test. Classify each as **UI-testable** (test it) or **N/A** (cannot verify via UI -- mark with reason).

### Step 2: Update Status

Set `phases.qa` to `in_progress` in `status.json`. Record `qa_started` timestamp.

### Step 3: Execute Main Flow Scenarios

For each happy-path acceptance criterion:

```
a. Navigate to the target page
   -> playwright_navigate(url)
   -> playwright_screenshot(name: "step-NN-description")

b. Perform user actions (use credentials from config.yaml → credentials.[role] for login/auth forms)
   -> playwright_fill / playwright_select / playwright_click
   -> playwright_screenshot(name: "step-NN-description")

c. Verify the expected result
   -> playwright_get_visible_text / playwright_get_visible_html / playwright_evaluate
   -> playwright_screenshot(name: "step-NN-description")

d. Record PASS or FAIL for this criterion
```

**Example scenario for "User can create an order":**

```
Step 01: Navigate to /orders/new
  -> playwright_navigate(url: "http://localhost:5173/orders/new")
  -> playwright_screenshot(name: "step-01-navigate-to-order-form")
  -> playwright_get_visible_text() -- confirm page shows "Create Order"

Step 02: Select a client
  -> playwright_click(selector: "[data-testid='client-select']")
  -> playwright_click(selector: "[data-testid='client-option-1']")
  -> playwright_screenshot(name: "step-02-select-client")

Step 03: Add a product item
  -> playwright_click(selector: "[data-testid='add-item-btn']")
  -> playwright_fill(selector: "input[name='quantity']", value: "2")
  -> playwright_screenshot(name: "step-03-add-product-item")

Step 04: Submit the form
  -> playwright_click(selector: "button[type='submit']")
  -> playwright_screenshot(name: "step-04-submit-order")
  -> playwright_get_visible_text() -- confirm "Order created" message
  -> playwright_evaluate(script: "window.location.pathname") -- confirm redirect

  Criterion: PASS (order created, confirmation shown, redirect happened)
```

### Step 4: Execute Error/Validation Scenarios

Test alternative and error flows:

- **Validation errors**: Submit forms with empty required fields, invalid data
- **Boundary values**: Zero quantities, long strings, special characters
- **Authorization**: Access protected pages without authentication
- **Not found**: Navigate to non-existent resources
- **Server errors**: Trigger error states if possible through UI

### Step 5: Generate Reports

#### 5a: qa-report.md (always)

Create `.tl/tasks/UC###/qa-report.md` using `nacl-tl-core/templates/qa-report-template.md`. Include: frontmatter with verdict and counts, scenario description, every test step with action/expected/actual/status/screenshot, acceptance criteria table, bug descriptions (if any), verdict with conditions, recommendation.

#### 5b: qa-report.html (always)

Generate an HTML report alongside the markdown report. Save to `.tl/tasks/UC###/qa-report.html`.

Structure:
```html
<!DOCTYPE html>
<html>
<head>
  <title>QA Report: UC### — [Title]</title>
  <style>
    /* Inline styles for standalone viewing (no external CSS) */
    body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    .pass { color: #22c55e; } .fail { color: #ef4444; }
    .badge { padding: 4px 12px; border-radius: 4px; font-weight: bold; }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-fail { background: #fef2f2; color: #991b1b; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    th { background: #f9fafb; }
    img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; margin: 8px 0; }
    .screenshot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <h1>QA Report: UC### — [Title]</h1>
  <p>Date: [date] | Duration: [time] | Verdict: <span class="badge badge-[pass/fail]">[PASS/FAIL]</span></p>

  <h2>Summary</h2>
  <table>
    <tr><th>Total criteria</th><td>[N]</td></tr>
    <tr><th>Tested</th><td>[N]</td></tr>
    <tr><th>Passed</th><td class="pass">[N]</td></tr>
    <tr><th>Failed</th><td class="fail">[N]</td></tr>
    <tr><th>N/A</th><td>[N]</td></tr>
    <tr><th>Bugs found</th><td>[N]</td></tr>
  </table>

  <h2>Test Steps</h2>
  <table>
    <tr><th>#</th><th>Action</th><th>Expected</th><th>Actual</th><th>Status</th></tr>
    <!-- One row per step -->
  </table>

  <h2>Screenshots</h2>
  <div class="screenshot-grid">
    <!-- Include ALL .png files from the screenshots directory, sorted alphabetically.
         Do NOT rely only on screenshots mentioned in the steps table.
         Scan the directory: ls .tl/qa-screenshots/UC###/*.png | sort
         For each file: <figure><img src="screenshots/{filename}"><figcaption>{filename}</figcaption></figure> -->
  </div>

  <h2>Bugs</h2>
  <!-- Bug descriptions if any -->

  <footer><p>Generated by /nacl-tl-qa | Claude Skills · {N} screenshots</p></footer>
</body>
</html>
```

**Screenshots must cover ALL files from the directory** — scan before generating the section:
```bash
ls .tl/qa-screenshots/UC###/*.png | sort
```
Use `screenshots/{filename}` as the relative path (screenshots will be copied to a `screenshots/` subdirectory alongside the report).

#### 5c: Save report to reports directory

Read `config.yaml → reports`. Resolution chain:

```
IF config.yaml → reports.mode == "remote" AND ssh_host is set:
  → Save locally AND publish via rsync
IF config.yaml → reports.mode == "local" OR reports section empty OR config.yaml missing:
  → Save locally only (DEFAULT)
```

**Local save (always happens):**
```bash
REPORT_DIR="$(config.reports.local_path || '.tl/reports')/qa-UC###-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$REPORT_DIR/screenshots"
cp .tl/qa-screenshots/UC###/*.png "$REPORT_DIR/screenshots/"
cp .tl/tasks/UC###/qa-report.html "$REPORT_DIR/"
```

The report uses `screenshots/{filename}` relative paths — these work correctly in `$REPORT_DIR/` because screenshots are copied into `$REPORT_DIR/screenshots/`.

Tell the user:
```
Report saved: .tl/reports/qa-UC###-20260327-143200/qa-report.html
Open: open .tl/reports/qa-UC###-20260327-143200/qa-report.html
```

**Remote publish (only if mode: "remote"):**
```bash
rsync -avz "$REPORT_DIR/" \
  "${config.reports.ssh_host}:${config.reports.remote_path}/$(basename $REPORT_DIR)/"
```
Report URL: `https://${config.reports.domain}/$(basename $REPORT_DIR)/qa-report.html`

### Step 5d: Create bug tasks in YouGile (if configured)

If bugs were found AND YouGile is configured (`config.yaml → yougile`):

**Threshold from config.yaml:**
```yaml
yougile:
  auto_create_bugs:
    critical: true    # always (cannot be disabled)
    major: true       # default: create tasks
    minor: false      # default: skip (noise reduction)
```

If `auto_create_bugs` section is missing → use defaults above.

**For each bug meeting the threshold:**
1. Create a task in the **Reopened** column:
   ```
   create_task(
     title: "[BUG-NNN] UC###: short description",
     columnId: config.yougile.columns.reopened,
     description: "Severity: MAJOR\nFound by: /nacl-tl-qa UC###\n\nDescription: ...\nExpected: ...\nActual: ...\nScreenshot: step-NN.png",
     stickers: { task_type: "bug", module: detected_module, source: "agent" }
   )
   ```
2. If parent UC task exists in YouGile → link as subtask:
   ```
   add_subtask(parentTaskId: UC_task_id, childTaskId: bug_task_id)
   ```
3. Report to user: "Created N bug tasks in YouGile (Reopened column)"

**If YouGile not configured → skip, bugs only in qa-report.**

---

### Step 6: Update Tracking

**If PASS:** `phases.qa = "done"`, record `qa_completed`, `qa_verdict: "PASS"`

**If FAIL:** `phases.qa = "failed"`, record `qa_completed`, `qa_verdict: "FAIL"`, `qa_failures` array

Append to `changelog.md`:

```markdown
## [YYYY-MM-DD HH:MM] QA: UC### - Title
- Phase: E2E QA Testing
- Verdict: PASS / FAIL
- Criteria: N tested, N passed, N failed, N N/A
- Bugs: N found (N critical, N major, N minor)
```

---

## MCP Playwright Tools Reference

These are MCP server tools called directly by the agent. No test files are created.

| Tool | Usage | When to Use |
|------|-------|-------------|
| `playwright_navigate` | `url: "http://localhost:5173/orders/new"` | Open a page; always use full URL with port |
| `playwright_click` | `selector: "button[type='submit']"` | Click elements; prefer `[data-testid]` > `#id` > `.class` |
| `playwright_fill` | `selector, value` | Type into inputs/textareas; clears existing content |
| `playwright_screenshot` | `name: "step-01-desc", savePng: true` | Capture page state; take at every significant step |
| `playwright_get_visible_text` | (no params) | Read all visible text; verify headings, labels, messages |
| `playwright_get_visible_html` | `selector: ".order-table"` | Read element HTML; structural verification |
| `playwright_evaluate` | `script: "window.location.pathname"` | Run JS in page; URL checks, element counting, hidden state |
| `playwright_select` | `selector, value` | Select dropdown option by value or text |
| `playwright_hover` | `selector: ".tooltip-trigger"` | Trigger tooltips, dropdowns, hover states |
| `playwright_press_key` | `key: "Enter"` | Keyboard press; form submit, modal dismiss |

---

## Screenshot Naming Convention

Format: `step-NN-description.png`

- **Prefix**: `step-` (always)
- **Number**: Two-digit `NN` (`01`, `02`, `10`)
- **Description**: kebab-case, brief (`navigate-to-form`, `fill-email-field`)
- **Extension**: `.png`

For errors: `error-step-NN-description.png`. For bugs: `bug-NNN-description.png`.

Examples:

```
step-01-navigate-to-order-form.png
step-02-fill-client-field.png
step-03-submit-form.png
step-04-order-created-success.png
step-05-empty-form-validation-error.png
error-step-06-page-not-found.png
bug-001-incorrect-total-calculation.png
```

---

## Verdict Logic

### PASS -- all conditions must be true:

- Every UI-testable acceptance criterion has status PASS
- No CRITICAL bugs found
- No MAJOR bugs in the main flow
- Main flow completes end-to-end without errors

### FAIL -- any condition triggers:

- At least one UI-testable criterion has status FAIL
- CRITICAL bug found (app crash, data loss, security issue)
- MAJOR bug in main flow (core function broken)
- Page does not load or returns server error (500)
- Main flow cannot be completed end-to-end

### Bug Severity

| Severity | Description | Impact |
|----------|-------------|--------|
| CRITICAL | App crashes, data loss, security vulnerability | FAIL -- blocks |
| MAJOR | Core function broken, app does not crash | FAIL -- if in main flow |
| MINOR | Cosmetic defects, no functional impact | PASS -- recorded as note |

### N/A Criteria

Criteria not verifiable through the browser (DB transactions, code coverage, SQL performance, internal logging) are marked N/A with explanation. They do not affect the verdict.

---

## Recovery on FAIL

### Identify Bug Location

| Symptom | Location | Fix Command |
|---------|----------|-------------|
| API returns wrong data or 500 error | Backend | `/nacl-tl-dev-be UC### --continue` |
| Form validation missing/incorrect | Frontend | `/nacl-tl-dev-fe UC### --continue` |
| UI does not display API data correctly | Frontend | `/nacl-tl-dev-fe UC### --continue` |
| Page not found (404 on route) | Frontend | `/nacl-tl-dev-fe UC### --continue` |
| CORS or network error | Backend | `/nacl-tl-dev-be UC### --continue` |
| Wrong calculation from API | Backend | `/nacl-tl-dev-be UC### --continue` |
| Wrong calculation in UI | Frontend | `/nacl-tl-dev-fe UC### --continue` |

### Include Evidence

Reference specific screenshots showing the failure, state expected vs actual, and recommend the fix command.

### Re-run After Fix

On re-run of `/nacl-tl-qa UC###`:

1. Clean screenshots directory (fresh start)
2. Re-test failed steps plus Step 01 (navigation sanity check)
3. Update existing `qa-report.md` -- do NOT create a new file
4. Add "Re-run History" section:

```markdown
## Re-run History

### Re-run #1 -- YYYY-MM-DD

| Field | Value |
|-------|-------|
| Previous Verdict | FAIL |
| Reason for Re-run | BUG-001 fixed: validation error now displays |
| Steps Re-tested | Steps 05, 06, 07 |
| Bugs Fixed | BUG-001 resolved |
| New Bugs Found | None |
| Current Verdict | **PASS** |
```

5. Update the verdict and status.json accordingly

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Dev servers not running | Report which servers are unreachable, instruct user to start them, exit |
| Page not found (404) | Screenshot, record FAIL, suggest `/nacl-tl-dev-fe UC### --continue` |
| Element not found | Screenshot current state, try alternative selectors, retry once, then FAIL |
| Timeout / slow response | Wait up to 10s, retry once, then screenshot and FAIL |
| JavaScript error | Use `playwright_evaluate` to check errors, screenshot, include in report |

---

## Output Summary

```
E2E QA Testing Complete

Task: UC### [Title]
Verdict: PASS / FAIL

Acceptance Criteria:
  Total: N | Tested: N | Passed: N | Failed: N | N/A: N

Bugs Found: N (Critical: N, Major: N, Minor: N)
Screenshots: N taken

Reports:
  Markdown: .tl/tasks/UC###/qa-report.md
  HTML:     .tl/tasks/UC###/qa-report.html
  Scenario: .tl/scenarios/verify-UC###.md
  Online:   https://reports.example.com/qa-UC###-20260327/qa-report.html (if published)

Next:
  PASS -> /nacl-tl-ship UC### (commit + push)
  FAIL -> /nacl-tl-dev-be UC### --continue  (backend fix)
         /nacl-tl-dev-fe UC### --continue  (frontend fix)
```

---

## Procedural Checklist

### Before Testing

- [ ] Acceptance criteria read and understood
- [ ] Task files read (task-be.md, task-fe.md, api-contract.md, impl-briefs)
- [ ] Dev servers verified (both FE and BE reachable)
- [ ] Screenshots directory cleaned and created
- [ ] Prerequisites verified (phases.sync = done, phases.stubs = done)

### During Testing

- [ ] Each acceptance criterion mapped to a test scenario
- [ ] Main flow executed step by step with screenshots
- [ ] Alternative/error flows tested
- [ ] Each criterion recorded as PASS, FAIL, or N/A

### After Testing

- [ ] qa-report.md created with full evidence
- [ ] Verdict determined (PASS or FAIL)
- [ ] status.json updated (phases.qa = done or failed)
- [ ] changelog.md updated with QA entry
- [ ] Recovery recommendations included (if FAIL)

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `nacl-tl-core/references/qa-rules.md` | Complete QA rules and procedures |
| `nacl-tl-core/templates/qa-report-template.md` | QA report template with all sections |

## Next Steps

| Verdict | Next Action |
|---------|-------------|
| PASS | `/nacl-tl-full UC###` -- finalize the task |
| FAIL | `/nacl-tl-dev-be UC### --continue` or `/nacl-tl-dev-fe UC### --continue` -- fix and re-test |
