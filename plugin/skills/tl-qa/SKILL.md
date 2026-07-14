---
name: tl-qa
model: sonnet
effort: medium
description: |
  E2E QA testing for UC tasks using MCP Playwright.
  Acts as a real user: navigates pages, fills forms, clicks buttons,
  verifies results. Takes screenshots of each step.
  Use when: test UC, run QA, E2E test, verify functionality,
  check acceptance criteria, or the user says "/nacl:tl-qa UC###".
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
Verdict:     QA is decomposed into six stages; the aggregate terminal
             status equals the WEAKEST non-NOT_RUN stage. NOT_RUN on a
             mandatory stage = aggregate UNVERIFIED. Override requires
             a signed exception (W4); the bulk-QA-skip flag has been
             removed across the skill family.
```

---

## QA Stage Decomposition (binding)

QA is decomposed into six named stages. Each stage emits its OWN status
independently. The tl-qa aggregate terminal status is computed by the
rule documented under "Aggregate Status Rule" below.

| Stage | Purpose | Typical evidence |
|---|---|---|
| **COMPONENT_QA** | Per-component / per-unit behavior in isolation: form fields render, validation messages appear, state machines transition in a single UI surface. | Screenshots of rendered components; visible-text assertions. |
| **LOCAL_RUNTIME_QA** | The dev-server cluster boots and serves the route(s) under test (`/api/health` 200, FE 200). Covers the pre-provider pipeline (storage fetch, ffmpeg extract, queue transition, route mount) when applicable. | `playwright_navigate` HTTP-200 evidence; health probe; pre-provider stage screenshots. |
| **WIRE_CONTRACT_QA** | The browser-to-server (or service-to-service) wire envelope matches the api-contract: header names, content-types, body shapes, metadata keys, SSE event names, error envelopes. | Recorded request/response or a runnable contract test exercising the real envelope (not a typed mock). |
| **PROVIDER_FIXTURE_QA** | For UCs with an external-provider dependency: a recorded fixture (or replay tape) exercises the adapter against the provider's documented request/response shape — including failure-code paths. | Fixture file + adapter test pointed at it. |
| **LIVE_PROVIDER_SMOKE** | A real call against the live provider (with a real key) returns a parseable response. Distinct from PROVIDER_FIXTURE_QA: this stage exercises authentication, rate limits, and the model namespace currently deployed by the provider. | Screenshot + saved response body + non-empty result. |
| **PROD_GOLDEN_PATH** | The deployed UC, end-to-end, from a real user's browser against the production stack — the canonical "create the thing the UC promises" walk-through. | Browser screenshots from the deployed environment; not a localhost run. |

### Per-stage status vocabulary

Each stage emits one of the closed Codex statuses:
`VERIFIED / PARTIALLY_VERIFIED / FAILED / BLOCKED / NOT_RUN / UNVERIFIED`.

- `VERIFIED` — the stage's evidence is complete and the result is green.
- `PARTIALLY_VERIFIED` — the stage ran on a subset of its scope; the
  unran subset is enumerated in the qa-report.
- `FAILED` — the stage ran and an assertion did not hold.
- `BLOCKED` — pre-condition refused execution (e.g. dev server down for
  LOCAL_RUNTIME_QA).
- `NOT_RUN` — the stage was not executed in this run. **A mandatory
  stage carrying NOT_RUN forces aggregate `UNVERIFIED` (see below);
  the only way around that is a signed exception (W4).**
- `UNVERIFIED` — the stage ran but evidence cannot establish the
  result (e.g. tool returned ambiguous output, screenshot missing).

### Aggregate Status Rule

```
aggregate_status = weakest non-NOT_RUN stage status, where the
weakness ordering is:

VERIFIED < PARTIALLY_VERIFIED < UNVERIFIED < FAILED < BLOCKED

(VERIFIED is the strongest; BLOCKED is the weakest non-NOT_RUN value.)

THEN, if ANY mandatory stage (per the UC-type matrix below) is NOT_RUN
AND no signed exception covers it:
  aggregate_status := UNVERIFIED  (forced floor)
```

So a UC with `WIRE_CONTRACT_QA: VERIFIED`, `PROVIDER_FIXTURE_QA: VERIFIED`,
and `LIVE_PROVIDER_SMOKE: NOT_RUN` (where LIVE_PROVIDER_SMOKE is
mandatory for the UC type) has aggregate `UNVERIFIED` — not `VERIFIED`.
The aggregate is recorded into the `Status:` line of the QA report; the
headline string (e.g. `QA COMPLETE` vs `QA APPLIED — UNVERIFIED`) is
decoration only.

### Mandatory-stage matrix per UC type

Defaults (overridable per project via `config.yaml` → `qa_mandatory_stages`):

| UC trait | Mandatory stages | Optional stages |
|---|---|---|
| `actor == SYSTEM` (background workers, schedulers, no user surface) | LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA | COMPONENT_QA, PROVIDER_FIXTURE_QA, LIVE_PROVIDER_SMOKE, PROD_GOLDEN_PATH |
| `actor != SYSTEM`, no provider dependency | COMPONENT_QA, LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA, PROVIDER_FIXTURE_QA | LIVE_PROVIDER_SMOKE, PROD_GOLDEN_PATH |
| `actor != SYSTEM`, has provider dependency | COMPONENT_QA, LOCAL_RUNTIME_QA, WIRE_CONTRACT_QA, PROVIDER_FIXTURE_QA, LIVE_PROVIDER_SMOKE | PROD_GOLDEN_PATH |
| Release-gate UCs (declared in release plan) | All six | (none) |

Notes:

- For UCs with `actor != SYSTEM` the minimum mandatory stages are
  WIRE_CONTRACT_QA **and** PROVIDER_FIXTURE_QA (the latter degenerates
  to a no-op stage when there is no provider — recorded as `VERIFIED`
  with evidence `n/a — no provider dependency declared`).
- A UC has a "provider dependency" when its impl-brief or
  external-contracts artifact declares an external API call (kie.ai,
  Deepgram, Anthropic, Stripe, etc.).
- The matrix above is the default. A project can override per-stage
  mandatoriness in `config.yaml` (see next section). Override sets
  defaults; it is NOT a per-run gate bypass.

### `qa_mandatory_stages` override (config.yaml)

Defaults can be customised per project:

```yaml
# config.yaml
qa_mandatory_stages:
  default:
    - LOCAL_RUNTIME_QA
    - WIRE_CONTRACT_QA
  by_uc_trait:
    "actor != SYSTEM":
      - COMPONENT_QA
      - LOCAL_RUNTIME_QA
      - WIRE_CONTRACT_QA
      - PROVIDER_FIXTURE_QA
    "provider_dependency":
      - LIVE_PROVIDER_SMOKE
  per_uc:
    UC-300:
      - LIVE_PROVIDER_SMOKE
      - PROD_GOLDEN_PATH
```

Semantics:

- The override sets the project's default mandatory-stage set. It does
  NOT bypass a gate; running a single UC under this matrix still
  produces aggregate UNVERIFIED if a mandatory stage is NOT_RUN.
- To bypass a gate (e.g. run a release with `LIVE_PROVIDER_SMOKE`
  intentionally NOT_RUN), file a signed exception per W4 with
  `affected_gates: [LIVE_PROVIDER_SMOKE]`.

### Worked example — project-beta provider-skip episode

**Before (current behavior, project-beta-postmortem § 3.3, § 3.8):**
UC-300 needed kie.ai. `KIE_API_KEY` was absent in the QA environment.
Today's tl-qa marks the entire QA dimension as skipped → ships to prod
under `QA APPLIED — UNVERIFIED` (non-blocking) → first real call 404s.

**After (this skill, post-W3):**
The six stages are evaluated independently:

| Stage | Status (after) | Why |
|---|---|---|
| COMPONENT_QA | VERIFIED | The UI surface renders. |
| LOCAL_RUNTIME_QA | VERIFIED | FE+BE+worker boot; route mounts. |
| WIRE_CONTRACT_QA | VERIFIED | Adapter sends Anthropic-shaped envelope; api-contract test passes. |
| PROVIDER_FIXTURE_QA | VERIFIED | Recorded kie.ai fixture; adapter parses `content[]` array. |
| LIVE_PROVIDER_SMOKE | NOT_RUN | No `KIE_API_KEY` in environment. |
| PROD_GOLDEN_PATH | NOT_RUN | Not yet deployed. |

For a `provider-dep` UC, LIVE_PROVIDER_SMOKE is mandatory. Aggregate
is forced to UNVERIFIED. Release is refused unless a signed exception
covering `LIVE_PROVIDER_SMOKE` is filed. The pre-provider pipeline
(ffmpeg, storage, queue, route mount) is no longer hidden behind the
provider-key gate — its earlier silent stall would have been caught
by LOCAL_RUNTIME_QA + WIRE_CONTRACT_QA.

### `--skip-e2e` flag policy

The skill exposes exactly one operator flag for stage selection:

```
/nacl:tl-qa UC### --skip-e2e
```

**Scope:** `--skip-e2e` marks the `LIVE_PROVIDER_SMOKE` and
`PROD_GOLDEN_PATH` stages as `NOT_RUN` for this run only. It does NOT
mark any other stage as NOT_RUN. It is NOT a bulk QA bypass.

- `--skip-e2e` may leave aggregate `VERIFIED` only if neither
  `LIVE_PROVIDER_SMOKE` nor `PROD_GOLDEN_PATH` is mandatory for this
  UC (per the matrix above and any project override).
- If either stage is mandatory for this UC, `--skip-e2e` produces
  aggregate `UNVERIFIED` (NOT_RUN on a mandatory stage). The user
  must either:
  1. Run the stage; or
  2. File a signed exception per W4 with `affected_gates`
     enumerating the specific stage names (no blanket overrides).
- `--skip-e2e` is the single preserved skip-style flag. The bulk-QA-skip
  flag (formerly written as `--skip` followed immediately by `-qa`) has
  been removed from every skill in W3. Bulk-bypass needs are handled by
  emergency mode (W4).

---

## Trigger

| Command | Description |
|---------|-------------|
| `/nacl:tl-qa UC###` | Run E2E QA for a UC task |

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

If not met, report the current state and suggest `/nacl:tl-sync UC###` or `/nacl:tl-stubs UC###`.

### 2. Dev Servers Running

Verify both servers are accessible by navigating to them:

```
playwright_navigate -> frontend URL (e.g., http://localhost:5173)
playwright_navigate -> backend health (e.g., http://localhost:3000/api/health)
```

Read `impl-brief.md` and `impl-brief-fe.md` to determine actual ports.

**HTTP-200 assertion:** both `playwright_navigate` calls must return HTTP 200. If either server returns a non-200 status or is unreachable:

```
→ emit: QA HALTED — NO_INFRA (frontend unreachable)   ← use exact label
→ halt with explicit status; do NOT exit silently
→ tell the user which URL failed and suggest starting the dev server
```

Do not proceed past this step unless both servers confirm HTTP 200.

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

### Step 0: Testable-Criteria Gate

Read `acceptance.md`. Count how many criteria have `ui_testable == true` (or equivalent — any criterion that can be verified through the browser).

```
IF count(ui_testable criteria) == 0:
  → emit: QA HALTED — UNVERIFIED (no testable criteria)
  → halt immediately; do NOT proceed to any Playwright calls
```

If at least one testable criterion exists, continue to the next step.

### Step 0b: Find or Generate Scenario

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

**Requirements-coverage gate (traceability).** Build the explicit matrix `criterion → stage(s) → status` for **every** criterion, not just the ones you happened to exercise. A criterion is only allowed to be **N/A** when it genuinely cannot be observed through the browser *and* it carries no provider/runtime dependency — never use N/A to drop a provider-dependent criterion (route those to `LIVE_PROVIDER_SMOKE`/`PROD_GOLDEN_PATH`). Any UI-testable criterion left **unmapped** (no stage exercises it) is **not verified**: it forces the aggregate to `UNVERIFIED` via the same weakest-stage floor as a `NOT_RUN` mandatory stage — a green run that silently skipped a required criterion must not read as `VERIFIED`. Record unmapped criteria alongside `qa_not_run_mandatory_stages`.

### Step 2: Update Status

Set `phases.qa` to `in_progress` in `status.json`. Record `qa_started` timestamp.

### Step 3: Execute Main Flow Scenarios

For each happy-path acceptance criterion:

```
a. Navigate to the target page
   -> playwright_navigate(url)
   -> playwright_screenshot(name: "step-NN-description")
   -> stat .tl/qa-screenshots/UC###/step-NN-description.png
      IF file absent or empty: mark step FAIL, append "(screenshot missing)" to step record

b. Perform user actions (use credentials from config.yaml → credentials.[role] for login/auth forms)
   -> playwright_fill / playwright_select / playwright_click
   -> playwright_screenshot(name: "step-NN-description")
   -> stat .tl/qa-screenshots/UC###/step-NN-description.png
      IF file absent or empty: mark step FAIL, append "(screenshot missing)" to step record

c. Verify the expected result
   -> playwright_get_visible_text / playwright_get_visible_html / playwright_evaluate
   -> playwright_screenshot(name: "step-NN-description")
   -> stat .tl/qa-screenshots/UC###/step-NN-description.png
      IF file absent or empty: mark step FAIL, append "(screenshot missing)" to step record

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

Create `.tl/tasks/UC###/qa-report.md` using `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/qa-report-template.md`. Include: frontmatter with verdict and counts, scenario description, every test step with action/expected/actual/status/screenshot, acceptance criteria table, bug descriptions (if any), verdict with conditions, recommendation.

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

  <footer><p>Generated by /nacl:tl-qa | Claude Skills · {N} screenshots</p></footer>
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
     description: "Severity: MAJOR\nFound by: /nacl:tl-qa UC###\n\nDescription: ...\nExpected: ...\nActual: ...\nScreenshot: step-NN.png",
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

Every per-stage status is recorded in `status.json` under
`phases.qa_stages`, regardless of the aggregate:

```json
"phases": {
  "qa": "done | unverified | failed | halted",
  "qa_stages": {
    "component": "VERIFIED | PARTIALLY_VERIFIED | FAILED | BLOCKED | NOT_RUN | UNVERIFIED",
    "local_runtime": "...",
    "wire_contract": "...",
    "provider_fixture": "...",
    "live_provider_smoke": "...",
    "prod_golden_path": "..."
  },
  "qa_aggregate_status": "VERIFIED | PARTIALLY_VERIFIED | UNVERIFIED | FAILED | BLOCKED"
}
```

**If aggregate VERIFIED (`QA COMPLETE`):** `phases.qa = "done"`, record `qa_completed`, `qa_verdict: "QA COMPLETE"`.

**If aggregate PARTIALLY_VERIFIED or UNVERIFIED (`QA APPLIED — UNVERIFIED`):** `phases.qa = "unverified"`, record `qa_completed`, `qa_verdict` set to the headline, and (when applicable) `qa_not_run_mandatory_stages` array enumerating the mandatory stages with NOT_RUN status.

**If aggregate FAILED (`QA INCOMPLETE — REGRESSION`):** `phases.qa = "failed"`, record `qa_completed`, `qa_verdict: "QA INCOMPLETE — REGRESSION"`, `qa_failures` array.

**If aggregate BLOCKED (`QA HALTED — NO_INFRA` / `QA HALTED — UNVERIFIED`):** `phases.qa = "halted"`, record `qa_halted`, `qa_verdict` set to the exact headline.

Append to `changelog.md`:

```markdown
## [YYYY-MM-DD HH:MM] QA: UC### - Title
- Phase: E2E QA Testing
- Verdict: QA COMPLETE / QA APPLIED — UNVERIFIED / QA HALTED — NO_INFRA / QA HALTED — UNVERIFIED / QA INCOMPLETE — REGRESSION
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

The authoritative classifier is the aggregate `Status:` line derived
from the six-stage decomposition (see "QA Stage Decomposition"). The
headline string is decoration. Compute the aggregate per the
"Aggregate Status Rule" — weakest non-NOT_RUN stage, with the
mandatory-stage NOT_RUN floor forcing UNVERIFIED.

Headline vocabulary (use these exact labels):

| Aggregate Status (closed) | Headline |
|---|---|
| `VERIFIED` (all mandatory stages VERIFIED; non-mandatory may be NOT_RUN) | `QA COMPLETE` |
| `PARTIALLY_VERIFIED` (some mandatory stages PARTIALLY_VERIFIED, none weaker) | `QA APPLIED — PARTIALLY_VERIFIED` |
| `UNVERIFIED` (screenshots missing, mandatory stage NOT_RUN, evidence ambiguous) | `QA APPLIED — UNVERIFIED` |
| `BLOCKED` (servers unreachable, no testable criteria, infra refused) | `QA HALTED — NO_INFRA` *(workflow detail in body)* |
| `FAILED` (≥1 stage FAILED) | `QA INCOMPLETE — REGRESSION` |

### QA COMPLETE (PASS) — all conditions must be true:

- At least one UI-testable acceptance criterion exists (Step 0 gate passed)
- Every UI-testable acceptance criterion has status PASS
- Every test step's screenshot file exists on disk (stat check passed)
- No CRITICAL bugs found
- No MAJOR bugs in the main flow
- Main flow completes end-to-end without errors

### QA APPLIED — UNVERIFIED — triggers when:

- All testable criteria passed BUT at least one screenshot is absent or empty
- Evidence is incomplete; cannot fully confirm behavior

### QA INCOMPLETE — REGRESSION (FAIL) — any condition triggers:

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

**Under `/nacl-goal conduct` (2.18.0) this severity table gates a BOUNDED loop.**
This skill's own behavior is UNCHANGED — the bounding lives in the orchestrator,
not here. For context: when `conduct` runs this skill as a cluster's E2E gate, it
loops `nacl-tl-qa` → fix → re-test ONLY for CRITICAL and MAJOR-in-main-flow bugs
(routing to `/nacl-tl-{dev-be,dev-fe,fix} --continue`), capped at 3 iterations per
cluster; on exhaustion the cluster is blocked
(`GOAL_BLOCKED_CLUSTER_QA_UNRESOLVED`) without aborting sibling clusters. MINOR
bugs are deferred (filed, surfaced, never iterated on) so a cosmetic defect cannot
consume the cluster's iteration budget. The loop runs BETWEEN `nacl-tl-qa`
invocations, never inside this skill. See `nacl-goal/SKILL.md` §conduct Flow.

### N/A Criteria

Criteria not verifiable through the browser (DB transactions, code coverage, SQL performance, internal logging) are marked N/A with explanation. They do not affect the verdict.

---

## Recovery on FAIL

### Identify Bug Location

| Symptom | Location | Fix Command |
|---------|----------|-------------|
| API returns wrong data or 500 error | Backend | `/nacl:tl-dev-be UC### --continue` |
| Form validation missing/incorrect | Frontend | `/nacl:tl-dev-fe UC### --continue` |
| UI does not display API data correctly | Frontend | `/nacl:tl-dev-fe UC### --continue` |
| Page not found (404 on route) | Frontend | `/nacl:tl-dev-fe UC### --continue` |
| CORS or network error | Backend | `/nacl:tl-dev-be UC### --continue` |
| Wrong calculation from API | Backend | `/nacl:tl-dev-be UC### --continue` |
| Wrong calculation in UI | Frontend | `/nacl:tl-dev-fe UC### --continue` |

### Include Evidence

Reference specific screenshots showing the failure, state expected vs actual, and recommend the fix command.

### Re-run After Fix

On re-run of `/nacl:tl-qa UC###`:

1. Clean screenshots directory (fresh start)
2. Re-test failed steps plus Step 01 (navigation sanity check)
3. Update existing `qa-report.md` -- do NOT create a new file
4. Add "Re-run History" section:

```markdown
## Re-run History

### Re-run #1 -- YYYY-MM-DD

| Field | Value |
|-------|-------|
| Previous Verdict | QA INCOMPLETE — REGRESSION |
| Reason for Re-run | BUG-001 fixed: validation error now displays |
| Steps Re-tested | Steps 05, 06, 07 |
| Bugs Fixed | BUG-001 resolved |
| New Bugs Found | None |
| Current Verdict | **QA COMPLETE** |
```

5. Update the verdict and status.json accordingly

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Dev servers not running | Emit `QA HALTED — NO_INFRA (frontend unreachable)`, halt with explicit status (do not exit silently); tell user which URL failed |
| Page not found (404) | Screenshot, record FAIL, suggest `/nacl:tl-dev-fe UC### --continue` |
| Element not found | Screenshot current state, try alternative selectors, retry once, then FAIL |
| Timeout / slow response | Wait up to 10s, retry once, then screenshot and FAIL |
| JavaScript error | Use `playwright_evaluate` to check errors, screenshot, include in report |

---

## Output Summary

```
{HEADLINE}

Task: UC### [Title]
Status: {QA_STATUS}
Verdict: QA COMPLETE / QA APPLIED — UNVERIFIED / QA HALTED — NO_INFRA / QA HALTED — UNVERIFIED / QA INCOMPLETE — REGRESSION

Where `{HEADLINE}` is one of (status-aware; `Status:` line above is the
authoritative classifier — the headline is decoration):
- `QA COMPLETE` — every UI-testable criterion PASS, every screenshot present.
- `QA APPLIED — UNVERIFIED` — testing ran but at least one criterion was
  unverifiable (skipped step, missing screenshot file, ambiguous result).
- `QA HALTED — NO_INFRA` — prerequisite failure (frontend/backend unreachable,
  Playwright unavailable, no testable criteria in `acceptance.md`).
- `QA INCOMPLETE — REGRESSION` — at least one criterion FAIL caused by code
  the test exercised (not a flaky environment).

Headline must match the `Status:` line. The legacy `E2E QA Testing Complete`
header is no longer emitted regardless of verdict.

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
  QA COMPLETE              -> /nacl:tl-ship UC### (commit + push)
  QA APPLIED — UNVERIFIED  -> re-run QA; verify screenshot tool output
  QA HALTED — NO_INFRA     -> start dev servers, then re-run /nacl:tl-qa UC###
  QA HALTED — UNVERIFIED   -> review acceptance.md; mark criteria as ui_testable where applicable
  QA INCOMPLETE — REGRESSION -> /nacl:tl-dev-be UC### --continue  (backend fix)
                               /nacl:tl-dev-fe UC### --continue  (frontend fix)
```

---

## Procedural Checklist

### Before Testing

- [ ] Testable-criteria gate passed (≥1 ui_testable criterion confirmed)
- [ ] Acceptance criteria read and understood
- [ ] Task files read (task-be.md, task-fe.md, api-contract.md, impl-briefs)
- [ ] Dev servers verified — both FE and BE returned HTTP 200
- [ ] Screenshots directory cleaned and created
- [ ] Prerequisites verified (phases.sync = done, phases.stubs = done)

### During Testing

- [ ] Each acceptance criterion mapped to a test scenario
- [ ] Main flow executed step by step with screenshots
- [ ] Alternative/error flows tested
- [ ] Each criterion recorded as PASS, FAIL, or N/A

### After Testing

- [ ] qa-report.md created with full evidence
- [ ] Screenshot existence verified for every step (stat checks passed)
- [ ] Verdict determined using exact vocabulary (QA COMPLETE / QA APPLIED — UNVERIFIED / QA INCOMPLETE — REGRESSION)
- [ ] status.json updated (phases.qa = done / unverified / failed / halted)
- [ ] changelog.md updated with QA entry
- [ ] Recovery recommendations included (if FAIL)

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/qa-rules.md` | Complete QA rules and procedures |
| `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/templates/qa-report-template.md` | QA report template with all sections |

## Next Steps

| Verdict | Next Action |
|---------|-------------|
| QA COMPLETE | `/nacl:tl-full UC###` -- finalize the task |
| QA APPLIED — UNVERIFIED | Re-run QA; verify screenshot tool output |
| QA HALTED — NO_INFRA | Start dev servers, then re-run `/nacl:tl-qa UC###` |
| QA HALTED — UNVERIFIED | Review `acceptance.md`; mark criteria as ui_testable where applicable |
| QA INCOMPLETE — REGRESSION | `/nacl:tl-dev-be UC### --continue` or `/nacl:tl-dev-fe UC### --continue` -- fix and re-test |
