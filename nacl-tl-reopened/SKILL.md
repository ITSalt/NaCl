---
name: nacl-tl-reopened
description: |
  Process tasks from YouGile Reopened column (failed verification/QA).
  Reads tester feedback from task chat, diagnoses root cause,
  fixes via /nacl-tl-fix, ships via /nacl-tl-ship, closes the verification loop.
  Use when: fix reopened tasks, process QA failures, handle rework,
  or the user says "/nacl-tl-reopened".
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
- If `--auto-ship` was passed to `/nacl-tl-reopened`: add `--auto-ship`
- If Path A and fix is clearly code-only (tester found a specific code bug, no spec drift): consider `--l1`

**Wait for /nacl-tl-fix to complete.** Capture its output:
- Fix level (L0/L1/L2/L3)
- Files changed
- Tests added/updated
- Validation result (tests pass / build OK)

**If /nacl-tl-fix fails** (tests don't pass, build broken, cannot determine fix):
- Do NOT proceed to Step 8
- Post explanation to YouGile task chat
- Leave task in InWork
- Report failure to user
- Move to next task (if `--all`)

### Step 8: REVIEW + STUBS — announce: "Step 8: REVIEW + STUBS"

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

**Goal:** Commit, push, and update YouGile.

**If /nacl-tl-fix already shipped via `--auto-ship`:** Skip to the DevDone move.

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

**If /nacl-tl-ship was NOT invoked** (e.g., /nacl-tl-fix auto-shipped), move to DevDone manually:
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
- Step 8: Review + stubs
- Step 10: Local report only

---

## References

- `nacl-tl-fix/SKILL.md` — primary delegation target (8-step spec-first bug fix)
- `nacl-tl-verify/SKILL.md` — upstream: sends FAIL tasks to Reopened (Step 6)
- `nacl-tl-ship/SKILL.md` — downstream: commit + push + PR + YouGile
- `nacl-tl-review/SKILL.md` — quality gate (code review)
- `nacl-tl-stubs/SKILL.md` — quality gate (stub scanning)
- `nacl-tl-core/references/tl-protocol.md` — agent contracts
- `nacl-tl-core/templates/config-yaml-template.yaml` — config.yaml reference (has `reopened` column)
