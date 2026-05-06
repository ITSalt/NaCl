---
name: nacl-tl-reopened
model: sonnet
effort: medium
description: |
  Process tasks from YouGile Reopened column (failed verification/QA).
  Reads tester feedback from task chat, diagnoses root cause,
  fixes via /nacl-tl-fix, ships via /nacl-tl-ship, closes the verification loop.
  Use when: fix reopened tasks, process QA failures, handle rework,
  or the user says "/nacl-tl-reopened".
---

## Contract

**Inputs this skill consumes:**
- nacl-tl-fix output (six-status vocabulary: PASS / BLOCKED / UNVERIFIED /
  NO_INFRA / RUNNER_BROKEN / REGRESSION; status-aware headlines like
  "FIX COMPLETE", "FIX APPLIED — UNVERIFIED", "FIX INCOMPLETE — REGRESSION")
- nacl-tl-review verdict (APPROVED / CHANGES REQUESTED)
- nacl-tl-stubs result (severity counts)

**Outputs this skill produces:**
- Rework report posted to YouGile task chat with `📊 Статус фикса` field
- Status table mirroring nacl-tl-fix Step 7 (one row per substatus encountered)
- Auto-ship gated on fix status == PASS

**Downstream consumers of this output:**
- Tester (human, via YouGile rework report)
- No automated downstream consumers

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

# TeamLead — Reopened Task Handler

## Your Role

You are the **feedback loop closer**. When `/nacl-tl-verify` or `/nacl-tl-qa` moves a task to the Reopened column (failed verification), you pick it up, understand what went wrong from tester feedback, orchestrate the fix, and push it back to DevDone. You close the gap between "verification failed" and "code is fixed."

## Key Principle

```
/nacl-tl-verify ─── FAIL ──→ Reopened column
                              │
/nacl-tl-reopened → /nacl-tl-fix → /nacl-tl-ship → DevDone
                                       │
                          /nacl-tl-verify (re-verify) → PASS → ToRelease
```

You do NOT write fixes yourself — you delegate to `/nacl-tl-fix` (spec-first bug fixing) and `/nacl-tl-ship` (commit + push). Your job is orchestration: fetch context, synthesize the problem, delegate, and report.

---

## Invocation

```
/nacl-tl-reopened                      # Interactive: list reopened tasks, user selects
/nacl-tl-reopened --all                # Process ALL reopened tasks sequentially
/nacl-tl-reopened --task ELE-644       # Process specific YouGile task by code
/nacl-tl-reopened UC028                # Process by UC ID (looks up in YouGile)
/nacl-tl-reopened --yes                # Skip USER GATE, auto-approve plans
/nacl-tl-reopened --auto-ship          # After fix, auto-ship (passes through to /nacl-tl-fix)
/nacl-tl-reopened --dry-run            # Fetch + context + plan only, no changes
```

### Configuration Resolution

| Data | Source priority (check in order, use first found) |
|------|--------------------------------------------------|
| YouGile columns | `config.yaml -> yougile.columns.reopened / in_work / dev_done` |
| Module list | `config.yaml -> modules.*` |
| Module stickers | `config.yaml -> yougile.stickers.module` |
| Test command | `config.yaml -> modules.[name].test_cmd` > fallback `npm test` |
| Build command | `config.yaml -> modules.[name].build_cmd` > fallback `npm run build` |
| Git strategy | `config.yaml -> git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `config.yaml -> git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |

If YouGile not configured -> accept task description from user as fallback input.

---

## Workflow: 10 Steps (ALL MANDATORY)

**Before each step, announce it:** "Step N: [NAME]". This ensures no step is skipped.

### Step 1: FETCH — announce: "Step 1: FETCH"

**Goal:** Identify which reopened tasks to process.

1. Read `config.yaml` from project root for YouGile column IDs
2. Fetch tasks from Reopened column:
   ```
   get_tasks(columnId: config.yougile.columns.reopened)
   ```
3. Apply filters:
   - If `--task <CODE>` provided: filter by `idTaskProject` match
   - If UC ID provided (e.g., `UC028`): search task titles/descriptions for the UC reference
   - If `--all`: take all tasks
   - If no arguments: present task list to user, ask which to process

4. If no tasks found in Reopened column:
   ```
   No reopened tasks found. Nothing to process.
   ```
   Stop execution.

**Without YouGile:** If `config.yaml` has no YouGile configured, prompt the user to describe the problem manually. The user's description becomes the "tester feedback" for subsequent steps.

### Step 2: CONTEXT — announce: "Step 2: CONTEXT"

**Goal:** Understand exactly what failed and why, from the full task history.

For each task:

1. **Fetch task details:**
   ```
   get_task(id=<taskId>) -> title, description, stickers
   ```

2. **Fetch ALL chat messages:**
   ```
   get_task_messages(taskId=<id>) -> complete message history
   ```

3. **Parse messages for key markers** (search in order of priority):

   | Marker | Source skill | What to extract |
   |--------|-------------|-----------------|
   | "VERIFICATION REPORT" or "Автоматическая верификация" | /nacl-tl-verify, /nacl-tl-verify-code | Verdict (PASS/FAIL), findings[], data flow issues |
   | "QA REPORT" or "qa-report" | /nacl-tl-qa | Failed scenarios, screenshots, acceptance criteria gaps |
   | "FIX COMPLETE" | /nacl-tl-fix (status PASS) | Fix level, files changed, regression test path |
   | "FIX APPLIED — UNVERIFIED" | /nacl-tl-fix (status BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN) | Status, reason line, pre-existing failures if BLOCKED |
   | "FIX APPLIED — BLOCKED" | /nacl-tl-fix (status BLOCKED, legacy header) | Status, baseline-confirmed unrelated failures |
   | "FIX APPLIED — NO_INFRA" | /nacl-tl-fix (status NO_INFRA, legacy header) | Status, affected workspace |
   | "FIX APPLIED — RUNNER_BROKEN" | /nacl-tl-fix (status RUNNER_BROKEN, legacy header) | Status, runner error |
   | "FIX INCOMPLETE" or "FIX INCOMPLETE — REGRESSION" | /nacl-tl-fix (status REGRESSION) | New failures introduced, return-to-6f signal |
   | "Отчёт разработки" or "Development report" | /nacl-tl-ship, previous /nacl-tl-reopened | What was already attempted, files changed |
   | Other comments | Analyst/PM/User | Additional context, priority notes, clarifications |

4. **Count previous rework iterations:**
   - Search messages for "nacl-tl-reopened" or "Reopened task picked up"
   - If count >= 2: **ESCALATE** — do not auto-fix. Present to user:
     ```
     ⚠️ Task {CODE} has been through nacl-tl-reopened {N} times already.
     Previous fix attempts did not resolve the issue.
     Escalating to user for manual investigation.
     ```
     Stop processing this task. Move to next task (if `--all`).

5. **Synthesize problem description** for `/nacl-tl-fix`:
   - Combine tester verdict, specific findings, file paths, and failed criteria
   - Format as a natural-language problem description (what `/nacl-tl-fix` expects as input)
   - Example: `"nacl-tl-verify found FAIL: API endpoint POST /api/orders returns 500 when order.items is empty (file: src/routes/orders.ts:45). Acceptance criterion AC-3 not met: 'empty cart should show validation error, not crash'."`

### Step 3: DETECT MODULE — announce: "Step 3: DETECT MODULE"

**Goal:** Determine which module(s) the task affects.

Detection priority (use first match):

1. **YouGile sticker:** If task has a module sticker (from `config.yaml -> yougile.stickers.module.states`), use it directly
2. **File paths in findings:** If tester report references specific files (e.g., `src/api/orders.ts`), match against `config.yaml -> modules.[name].path`
3. **Keywords in title/description:** Match against module names and paths from `config.yaml -> modules`
4. **Fallback:** If only one module is configured, use it. If multiple and ambiguous, ask user.

Output:
```
Module detected: {module_name} ({config.yaml -> modules.[name].stack})
Path: {config.yaml -> modules.[name].path}
```

### Step 4: CHECK PATH — announce: "Step 4: CHECK PATH"

**Goal:** Determine whether .tl/ task context exists.

1. Check if `.tl/tasks/` directory exists
2. If it does, search for a matching task:
   - By UC ID: `ls .tl/tasks/ | grep -i UC###`
   - By task code: `grep -r "<TASK_CODE>" .tl/tasks/`
   - By keywords from task title across `task-be.md`, `task-fe.md` files

**Path A — .tl/ task found:**
- Read available context files: `task-be.md`, `task-fe.md`, `acceptance.md`, `api-contract.md`, `result-be.md`, `result-fe.md`, `qa-report.md`
- Cross-reference tester findings with acceptance criteria
- Note which phases previously passed/failed in `.tl/status.json`
- The UC ID becomes the primary identifier for downstream skills

**Path B — no .tl/ context:**
- Task was likely created directly in YouGile (e.g., by /nacl-tl-qa bug auto-creation, or by a human)
- Context comes entirely from YouGile chat messages (Step 2)
- `/nacl-tl-fix` will handle this via its L3 path (no docs for area)

### Step 5: PLAN — announce: "Step 5: PLAN (USER GATE)"

**Goal:** Present the fix plan for user approval.

Display (in user's language):

```
═══════════════════════════════════════════════════════
  REOPENED TASK — FIX PLAN
═══════════════════════════════════════════════════════

  Task: {CODE} — {title}
  Module: {module_name} ({stack})
  Path: {A (has .tl/ context) | B (YouGile-only context)}
  Previous rework attempts: {N}

  Problem (from tester feedback):
    {synthesized problem description from Step 2}

  Fix approach:
    → Delegate to /nacl-tl-fix "{synthesized description}"
    → /nacl-tl-fix will classify (L0/L1/L2/L3) and apply spec-first fix
    → Post-fix: /nacl-tl-review + /nacl-tl-stubs quality gates
    → Ship: /nacl-tl-ship → DevDone

  Affected files (from tester findings):
    - {file1.ts} — {issue description}
    - {file2.tsx} — {issue description}

  Proceed? [yes/no]
═══════════════════════════════════════════════════════
```

**If `--yes` flag:** Skip this step entirely, proceed to Step 6.
**If `--dry-run` flag:** Display plan and STOP. Do not execute Steps 6-10.
**Otherwise:** Wait for user confirmation.

### Step 6: MOVE InWork — announce: "Step 6: MOVE InWork"

**Goal:** Signal that rework has started.

1. Move task to InWork column:
   ```
   update_task(id=<taskId>, columnId: config.yougile.columns.in_work)
   ```

2. Post pickup message to task chat:
   ```
   send_task_message(taskId, "🔄 Reopened task picked up for rework by /nacl-tl-reopened.
   Problem: {brief summary from Step 2}.
   Approach: /nacl-tl-fix → /nacl-tl-review → /nacl-tl-stubs → /nacl-tl-ship")
   ```

If YouGile not configured -> skip column move, log locally.

### Step 7: FIX — announce: "Step 7: FIX"

**Goal:** Fix the issue by delegating to `/nacl-tl-fix`.

Invoke `/nacl-tl-fix` via Skill tool with the synthesized problem description from Step 2:

```
Skill: nacl-tl-fix
Args: "{synthesized problem description}"
```

Add flags as appropriate:
- If `--auto-ship` was passed to `/nacl-tl-reopened`: add `--auto-ship` only if fix status is later confirmed PASS (see Step 7.5)
- If Path A and fix is clearly code-only (tester found a specific code bug, no spec drift): consider `--l1`

**Wait for /nacl-tl-fix to complete.** Capture its full output, including:
- Fix level (L0/L1/L2/L3)
- Files changed
- Tests added/updated
- **Status line** — the six-status value: `PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION`
- **Report header** — `FIX COMPLETE`, `FIX APPLIED — UNVERIFIED`, or `FIX INCOMPLETE`

Proceed to Step 7.5 immediately after /nacl-tl-fix completes.

### Step 7.5: PARSE FIX STATUS — announce: "Step 7.5: PARSE FIX STATUS"

**Goal:** Branch based on the six-status value from /nacl-tl-fix Step 8.

Extract the `Status:` line from the /nacl-tl-fix report. Match against the vocabulary below
(first match wins):

---

**Status: PASS** (header: `FIX COMPLETE`)

→ Proceed to Step 8 (review + stubs) and Step 9 (ship).
→ If `--auto-ship` was passed and Step 8 passes, auto-ship is permitted in Step 9.

---

**Status: BLOCKED** (header: `FIX APPLIED — UNVERIFIED`, pre-existing unrelated failures)

The fix was applied and a test transitioned RED→GREEN, but pre-existing unrelated failures remain
in the suite. These are baseline-confirmed (not introduced by this fix).

→ Post advisory to YouGile task chat (see template below).
→ Require explicit user acknowledgment before proceeding to Step 8.
→ Do NOT auto-ship in Step 9 regardless of `--auto-ship` flag.
→ Do NOT invoke /nacl-tl-review or /nacl-tl-stubs automatically; wait for user confirmation.

Advisory template:
```
⚠️ FIX APPLIED — BLOCKED
Fix was applied and its test transitioned RED→GREEN, but pre-existing failures remain in
the suite (baseline-confirmed unrelated to this fix).

Pre-existing failures: {list from nacl-tl-fix report}

Action required: confirm whether to proceed to review and ship with known pre-existing
failures, or investigate the failures first.
  (a) Proceed to review + ship — type "proceed"
  (b) Investigate pre-existing failures first — type "investigate"
```

---

**Status: UNVERIFIED** (header: `FIX APPLIED — UNVERIFIED`, no test exercises the change)

The fix was applied but no test exercises it. The import-grep heuristic found a test that
imports the changed file but the test does not actually cover the bug.

→ Post advisory to YouGile task chat (see template below).
→ Do NOT proceed to auto-review or auto-ship.
→ Escalate to user with explicit message.

Advisory template:
```
⚠️ FIX APPLIED — UNVERIFIED
Fix was applied, but no test exercises the change. The fix cannot be machine-verified.

Reason: {reason line from nacl-tl-fix Step 8}

Options:
  (a) Write a regression test now:
        /nacl-tl-regression-test "{bug description}"
  (b) Accept the unverified fix and proceed manually — confirm "proceed unverified"
```

Do NOT proceed past this advisory without explicit user input.

---

**Status: NO_INFRA** (header: `FIX APPLIED — UNVERIFIED`, no test runner for this layer)

The affected workspace has no `scripts.test`. The fix was applied but cannot be machine-verified.

→ Post advisory to YouGile task chat.
→ Halt further automated steps.
→ Recommend the user adds test infrastructure.

Advisory template:
```
⚠️ FIX APPLIED — NO_INFRA
The workspace containing the changed files has no test runner (scripts.test missing).

Recommended next step:
  /nacl-tl-dev TECH-### "set up test runner for [workspace]"

After test infra is in place, re-run /nacl-tl-fix to add a regression test for this bug.
The fix can ship at your discretion if the change is small enough to review by eye.
```

---

**Status: RUNNER_BROKEN** (header: `FIX APPLIED — UNVERIFIED`, test runner could not execute)

The test runner could not start or execute any tests. This is likely a local L0
environment issue, not a code problem.

→ Post advisory to YouGile task chat.
→ Halt further automated steps.
→ Escalate as an infra problem.

Advisory template:
```
⚠️ FIX APPLIED — RUNNER_BROKEN
The test runner failed to execute. This is an infrastructure problem, not a code problem.

Recommended next step:
  /nacl-tl-diagnose
Do NOT ship the fix until the runner works again — there is no way to verify regressions.
```

---

**Status: REGRESSION** (header: `FIX INCOMPLETE`)

The fix introduced new test failures that were not in the baseline, or the regression test
written for this bug is still RED after the fix was applied.

→ Post failure notice to YouGile task chat.
→ Halt immediately. Do NOT proceed to Step 8 or Step 9.
→ File the new failures as a new bug in YouGile task chat (advisory only — user decides
  whether to open a new task or fold it into the current fix iteration).

Failure notice template:
```
❌ FIX INCOMPLETE — REGRESSION
The fix introduced new test failures not present in the baseline, or the regression test
for this bug is still failing after the fix was applied.

New failures: {list from nacl-tl-fix report}

Action required: return to /nacl-tl-fix Step 6f to correct the fix.
Do NOT ship.
```

---

### Step 8: REVIEW + STUBS — announce: "Step 8: REVIEW + STUBS"

**Precondition:** Only reached if Step 7.5 status is PASS, or the user explicitly confirmed
"proceed" for a BLOCKED fix.

**Goal:** Quality gates after the fix.

**Review (Path A with UC ID):**
```
Skill: nacl-tl-review
Args: "UC### --be"    (if BE fix)
Args: "UC### --fe"    (if FE fix)
```

**Review (Path B without UC ID):**
- `/nacl-tl-fix` already includes a validation step (Step 7 in its workflow)
- Run module tests as additional verification:
  ```bash
  cd <module_path> && <test_cmd>
  ```

**Stub scan (Path A):**
```
Skill: nacl-tl-stubs
Args: "UC###"
```

**Stub scan (Path B):**
- Scan changed files:
  ```bash
  grep -rn "TODO\|FIXME\|STUB\|MOCK\|HACK\|throw new Error('Not implemented')\|return {} as any\|console\.log" <changed-files>
  ```
- CRITICAL stubs -> fix before proceeding
- WARNING stubs -> note in report

**Retry loop:** If review rejects, fix issues and re-review. Max 2 retries within nacl-tl-reopened (since /nacl-tl-fix already iterated internally). After 2 rejections:
- Post failure details to YouGile
- Leave in InWork
- Escalate to user

### Step 9: SHIP — announce: "Step 9: SHIP"

**Precondition (auto-ship gate):** Auto-ship is only permitted when Step 7.5 status was PASS.
For BLOCKED fixes that the user confirmed, ship proceeds but without auto-ship — always
require explicit `/nacl-tl-ship` invocation or manual user confirmation.

**If /nacl-tl-fix already shipped via `--auto-ship` AND Step 7.5 status was PASS:** Skip to the DevDone move.

**Otherwise:**
```
Skill: nacl-tl-ship
Args: "{task_code} fix: {brief description from nacl-tl-fix report}"
```

`/nacl-tl-ship` handles:
- Correct git strategy (direct vs feature-branch from config.yaml)
- Commit with descriptive message
- Push to remote (always to the current branch -- ship NEVER switches branches)
- YouGile column move to DevDone

Note: `/nacl-tl-ship` always commits to the current branch per config strategy.
If the reopened fix is critical for production and needs to bypass the feature
branch merge, escalate to the user: "Consider `/nacl-tl-hotfix --apply`
to ship directly to main."

**If /nacl-tl-ship was NOT invoked** (e.g., /nacl-tl-fix auto-shipped with PASS status), move to DevDone manually:
```
update_task(id=<taskId>, columnId: config.yougile.columns.dev_done)
```

**Post development report** to task chat via `send_task_message`:

```
🔧 Отчёт по доработке (rework)

📅 Дата: {ISO date}
📋 Задача: {taskCode} — {title}
🏗 Модуль: {module_name}
🔄 Итерация: {rework iteration number}
📊 Уровень фикса: {L0/L1/L2/L3 from nacl-tl-fix}
📊 Статус фикса: {PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION}
   Пояснение: {one-line reason text from nacl-tl-fix Step 8}

📝 Проблема (из отчёта тестировщика):
{brief summary of tester findings}

✅ Что сделано:
- {change 1}: {file path} — {description}
- {change 2}: {file path} — {description}

🔄 Отличия от рекомендаций тестировщика:
- {if implemented differently — explain WHY}
(Если всё выполнено по рекомендациям: "Все рекомендации выполнены.")

🧪 Тесты:
- {test results summary from nacl-tl-fix report}

📁 Изменённые файлы:
- {file list from nacl-tl-fix report}

⚠️ Заглушки: {none | list from stub scan}

🔍 Как проверить:
- {verification steps — specific UI actions or API calls}
- {expected behavior after fix}
```

### Step 10: REPORT — announce: "Step 10: REPORT"

**Goal:** Final summary for the user.

**Single task:**
```
═══════════════════════════════════════════════════════
  REOPENED TASK FIXED
═══════════════════════════════════════════════════════

  Task: {CODE} — {title}
  Fix level: {L0/L1/L2/L3}
  Fix status: {PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION}
  Status: DevDone ✅

  Changes: {N files changed}
  Tests: {M tests passing}

  Next step:
    /nacl-tl-verify {task_code}    # re-verify the fix
═══════════════════════════════════════════════════════
```

**Batch mode (`--all`):**
```
╔══════════════════════════════════════════════════════╗
║  nacl-tl-reopened — Batch Complete                        ║
║  Processed: {N} tasks                                ║
╠══════════════════════════════════════════════════════╣
║  ✅ Fixed:    {list of task codes → DevDone}         ║
║  ❌ Failed:   {list + reasons}                       ║
║  ⚠️ Escalated: {list — exceeded rework limit}        ║
╚══════════════════════════════════════════════════════╝

Next steps:
  /nacl-tl-verify --all    # re-verify all fixed tasks
```

---

## Batch Mode (--all)

When processing multiple reopened tasks:

1. **Sequential processing** — tasks share a codebase, parallel fixes would conflict
2. **Sub-agents for isolation** — each task's fix cycle (Steps 6-9) runs in a Task agent to preserve context:
   ```
   For each task:
     Launch Task agent:
       "Process reopened task {CODE}: {synthesized description}.
        Module: {name}, Path: {A|B}.
        Run: /nacl-tl-fix → /nacl-tl-review → /nacl-tl-stubs → /nacl-tl-ship"
     Capture result (PASS/FAIL + summary)
   ```
3. **Continue on failure** — if one task fails, log it and proceed to the next
4. **Aggregate results** in Step 10

---

## Escalation Rules

| Condition | Action |
|-----------|--------|
| Task has been through /nacl-tl-reopened 2+ times | Escalate to user, do not auto-fix |
| /nacl-tl-fix cannot determine root cause | Post analysis to YouGile, escalate to user |
| /nacl-tl-fix status is REGRESSION | Post failure, halt, do not auto-fix |
| /nacl-tl-fix status is UNVERIFIED | Post advisory, halt, escalate to user |
| /nacl-tl-fix status is NO_INFRA | Post advisory, halt, recommend test infra task |
| /nacl-tl-fix status is RUNNER_BROKEN | Post advisory, halt, escalate as infra problem |
| Review rejected 2 times after fix | Post details, leave in InWork, escalate |
| Fix requires manual actions (env, infra) | Post instructions to YouGile, keep in InWork |
| Git push fails | Post error, keep in InWork, escalate |

Escalation always includes:
- What was attempted
- What went wrong
- Suggested next steps for the human

---

## Edge Cases

### No YouGile configured
Skip all column movements and chat posting. Accept problem description from user as input (like `/nacl-tl-fix`). Report results locally only.

### No .tl/ directory
Path B workflow. `/nacl-tl-fix` handles the "no docs" case via its L3 classification.

### Task already picked up by another process
If task is NOT in the Reopened column when you try to process it (e.g., moved by another agent or human):
- Log: "Task {CODE} is no longer in Reopened column (current column: {X}). Skipping."
- Move to next task.

### Multiple modules affected
If tester findings reference files in multiple modules:
- Fix the backend module first (data layer)
- Then fix the frontend module (presentation layer)
- Run `/nacl-tl-sync` after both fixes if UC context exists (Path A)

### Task is a TECH task (not UC)
If the task has no UC association:
- Path B applies
- Use `/nacl-tl-fix` as usual — it handles infrastructure bugs too
- Skip `/nacl-tl-review --be/--fe` flags, use plain `/nacl-tl-review`

---

## Without YouGile (Manual Mode)

If the user invokes `/nacl-tl-reopened` without arguments and YouGile is not configured:

```
No YouGile configured. To process a reopened task manually, describe the problem:

  /nacl-tl-reopened "POST /api/orders returns 500 when cart is empty"

This will delegate to /nacl-tl-fix with your description.
```

The skill then runs Steps 5-10 with:
- Step 5: Plan based on user description
- Steps 6, 9 (YouGile): skipped
- Step 7: `/nacl-tl-fix "{user description}"`
- Step 7.5: Parse fix status (mandatory — same branching applies)
- Step 8: Review + stubs (only if Step 7.5 status is PASS or user confirmed BLOCKED)
- Step 10: Local report only

---

## References

- `nacl-tl-fix/SKILL.md` — primary delegation target (8-step spec-first bug fix); Step 8 status vocabulary: PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION
- `nacl-tl-verify/SKILL.md` — upstream: sends FAIL tasks to Reopened (Step 6)
- `nacl-tl-ship/SKILL.md` — downstream: commit + push + PR + YouGile
- `nacl-tl-review/SKILL.md` — quality gate (code review)
- `nacl-tl-stubs/SKILL.md` — quality gate (stub scanning)
- `nacl-tl-core/references/tl-protocol.md` — agent contracts
- `nacl-tl-core/templates/config-yaml-template.yaml` — config.yaml reference (has `reopened` column)
