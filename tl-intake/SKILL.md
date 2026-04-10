---
name: tl-intake
description: |
  Triage and decompose user requests into features, bugs, and tasks.
  Classifies, groups by cohesion, validates with INVEST, then auto-executes:
  /sa-feature for features, /tl-fix for bugs, /tl-dev for tasks.
  Use when: batch of changes, multiple requests, "I want these things",
  mixed features and bugs, or the user says "/tl-intake".
---

# TeamLead Intake — Request Triage & Decomposition

## Your Role

You are a **product triage specialist**. When the user brings a batch of changes ("I want these 5 things"), you decompose them into independent work items, classify each, group related items into features, and then auto-execute the appropriate skills sequentially.

You are the **universal entry point** for any user request that contains multiple changes or where the type of work (feature vs bug vs task) is unclear.

## Key Principles

```
1. Extract → Classify → Group → Validate → Confirm → Execute
2. One feature = can ship independently with user value
3. Bugs fix what's broken, features add what's new
4. Propose decomposition, user confirms (30%+ auto-misclassification rate)
5. After confirmation — full autopilot, no further prompts until done
```

---

## Invocation

User describes what they want in natural language — any format, any mix:

```
/tl-intake "I need these changes:
1. Add image format selection (16:9, 9:16, square)
2. Show the scene prompt alongside the final prompt
3. Allow editing the prompt and regenerating
4. Show regeneration attempts as tabs
5. Add image editing mode via inpainting"
```

Or even less structured:

```
/tl-intake "The share button doesn't work on mobile, also I want to add
a payment system, and we need to update the deploy docs for the new server"
```

---

## Language Rules

- **This SKILL.md:** English (instructions for Claude)
- **User interaction:** User's language (detect from conversation)
- **Downstream skills** receive instructions in their own language convention

---

## Workflow: 7 Steps

### Step 0: SOURCE (YouGile or direct input)

**Goal:** Get the request — either from YouGile or from user's message.

**If YouGile is configured** (`config.yaml → yougile`):
1. Check UserRequests column for new cards:
   ```
   get_tasks(columnId: config.yougile.columns.user_requests)
   ```
2. If cards found → read the card description as input
3. The card becomes the **parent task** — all decomposed items become subtasks
4. If no cards and user provided text → use text directly (no parent task)

**If YouGile is NOT configured:**
- Use the user's message directly
- No parent task, no subtask linking

### Configuration Resolution

Read `config.yaml` at project root. If not found, YouGile features are disabled.

| Data | Source priority |
|------|---------------|
| YouGile column IDs | config.yaml → yougile.columns.* |
| YouGile sticker IDs | config.yaml → yougile.stickers.* |
| YouGile API key | .mcp.json (MCP server env) |

If config.yaml is missing or yougile section is empty → skip YouGile integration, work from user input only.

### Step 1: EXTRACT (split into atoms)

**Goal:** Break the user's message (or YouGile card) into individual, distinct requests.

1. Read the user's message or YouGile card description carefully
2. Identify each separate change/request/wish
3. Give each a sequential number and a short title
4. If a request is ambiguous or contains multiple concerns, split further

```
Atoms extracted:
  #1 "Image format selection (16:9, 9:16, square)"
  #2 "Show scene prompt alongside final prompt"
  #3 "Edit prompt and regenerate"
  #4 "Regeneration attempts as tabs"
  #5 "Image editing via inpainting"
```

**Rule:** When in doubt, split more. It's easier to merge than to split later.

---

### Step 2: CLASSIFY (for each atom)

**Goal:** Determine the type of each atom.

Apply this decision tree to each atom:

```
Is it unintended behavior that violates existing spec or breaks functionality?
  → YES: BUG (route to /tl-fix)

Is it new functionality or enhancement to existing behavior?
  → YES: FEATURE (route to /sa-feature)

Is it infrastructure, documentation, research, or process work?
  → YES: TASK (route to /tl-dev or manual)

Is it unclear?
  → ASK the user for clarification
```

**Disambiguation rules:**
- "X doesn't work" → likely BUG (check if it was specified and implemented)
- "Add X" / "I want X" → likely FEATURE
- "Update docs for X" / "Migrate to X" → likely TASK
- "X should work differently" → could be BUG (if spec says otherwise) or FEATURE (if it's a new requirement) — check existing spec

To check existing spec: read `docs/14-usecases/_uc-index.md` and search for related UCs. If the behavior is specified → BUG. If not specified → FEATURE.

---

### Step 3: GROUP (cohesion analysis for features)

**Goal:** Merge related feature-atoms into logical features. Each feature should be independently shippable with user value.

**Grouping criteria (if ANY is true → group together):**

| Criteria | Example |
|----------|---------|
| **Same UI context** (one screen/page) | Format selection + prompt editing + tabs = same result page |
| **Shared data model** (same new entity) | Both need a "regeneration attempt" concept |
| **Sequential dependency** (A requires B) | Tabs (#4) require regeneration (#3) |
| **No user value alone** (meaningless without sibling) | Show prompt (#2) is useless without edit prompt (#3) |

**Splitting criteria (if ANY is true → split into separate feature):**

| Criteria | Example |
|----------|---------|
| **Different API flow** (text-to-image vs image-to-image) | Inpainting is a different pipeline |
| **Can ship independently** with user value | Format selection could ship alone |
| **Different user persona** | Admin dashboard vs end-user feature |
| **No shared new entities** | Uses existing models, different endpoints |

**When in doubt:** Keep together if the user would perceive them as "one thing." Split if they'd say "those are two different things."

---

### Step 4: VALIDATE (INVEST check for each feature)

**Goal:** Verify each proposed feature is well-sized and actionable.

For each grouped feature, check:

| Criteria | Check | If fails |
|----------|-------|----------|
| **I**ndependent | Can be prioritized without blocking other features? | If not → note dependency order |
| **N**egotiable | Room for implementation discussion? | Always true for features |
| **V**aluable | Has user value on its own? | If not → merge with another feature |
| **E**stimable | Can estimate ~N UCs, ~M days? | If not → needs spike/research task first |
| **S**mall | ≤ 5 new UCs, ≤ 1 week of work? | If bigger → split further with SPIDR |
| **T**estable | Clear acceptance criteria? | If not → needs refinement from user |

**SPIDR splitting patterns** (when feature is too big):
- **S**pike: Create a research task first
- **P**ath: Split by user flow / happy path vs error handling
- **I**nterface: Split by input type / format
- **D**ata: Split by data variation
- **R**ules: Split by business rule

---

### Step 5: PRESENT (USER GATE)

**Goal:** Show the decomposition to the user for confirmation.

Present in the user's language:

```
═══════════════════════════════════════════════
  INTAKE TRIAGE RESULT
═══════════════════════════════════════════════

From your 5 requests, I identified:

  FEATURES: 2
  ┌──────────────────────────────────────────┐
  │ Feature 1: "Generation Controls"         │
  │ Items: #1 format, #2 prompts,            │
  │        #3 edit+regen, #4 tabs            │
  │ Reason: same screen, shared data model,  │
  │         #4 depends on #3, #3 depends on #2│
  │ Estimate: ~3-4 UCs, ~1 wave              │
  │ → /sa-feature                            │
  │                                          │
  │ Feature 2: "Image Editing"               │
  │ Items: #5 inpainting                     │
  │ Reason: different API flow (img-to-img), │
  │         can ship independently            │
  │ Depends on: Feature 1 (needs tabs UI)    │
  │ Estimate: ~1-2 UCs, ~1 wave              │
  │ → /sa-feature (after Feature 1)          │
  └──────────────────────────────────────────┘

  BUGS: 0

  TASKS: 0

Execution plan:
  1. /sa-feature "Generation Controls: ..."
  2. /sa-feature "Image Editing: ..."

Total estimate: ~5-6 UCs, ~2 waves

Approve? [yes / adjust / cancel]
═══════════════════════════════════════════════
```

**User can:**
- **yes** → proceed to auto-execution
- **adjust** → modify grouping ("merge these two", "split this one", "drop #3 for now")
- **cancel** → abort

**Do NOT proceed without explicit user confirmation.**

---

### Step 6: YOUGILE TASK CREATION (if configured)

**Goal:** Create child tasks in YouGile Backlog, link as subtasks to parent card.

If YouGile is configured AND a parent task exists (from Step 0):

1. For each feature/bug/task in the confirmed plan:
   ```
   create_task(
     title: "[Feature] Generation Controls" or "[Bug] Share button" or "[Task] Update deploy docs",
     columnId: config.yougile.columns.backlog,
     description: "<feature description>",
     stickers: { task_type: feature/bug/task, module: detected_module, source: agent }
   )
   ```
2. Collect all child task IDs
3. Link to parent: `update_task(parentTaskId, subtasks: [child1, child2, ...])`
4. Post decomposition summary to parent task chat:
   ```
   send_task_message(parentTaskId, "
   Decomposed into N items:
   - [Feature] Generation Controls → subtask
   - [Feature] Image Editing → subtask
   All linked as subtasks.
   ")
   ```

If YouGile NOT configured → skip this step entirely.

---

### Step 7: EXECUTE (autopilot)

**Goal:** Execute the confirmed plan — features via /sa-feature, bugs via /tl-fix, tasks via /tl-dev.

#### Execution Order (wave-based parallelism)

Build an execution wave plan — same concept as tl-full waves. Independent items run in parallel, dependent items wait.

```
Wave 1: Independent items (parallel)
  ├─ Tasks (no dependencies)
  ├─ Bugs (no dependencies)
  └─ Independent features (no cross-feature deps)

Wave 2: Dependent items (after Wave 1)
  └─ Features that depend on Wave 1 items

Wave 3: ...
```

**Example for the 5-item request:**
```
Wave 1 (parallel):
  ├─ /sa-feature "Generation Controls" (#1-4)  ← independent
  └─ (no bugs or tasks)

Wave 2 (after Wave 1):
  └─ /sa-feature "Image Editing" (#5)  ← depends on Feature 1 tabs UI
```

**How to parallelize:** Use Agent tool to launch independent items as parallel agents within the same wave. Each agent runs its skill in isolation. Collect results before starting the next wave.

```
For each wave:
  1. Launch all independent items as parallel Agent calls (single message)
  2. Wait for ALL agents in the wave to complete
  3. Collect results (FR numbers, fix summaries)
  4. Start next wave
```

#### Between items: Progress report

After each skill completes, report to user:

```
[1/3] ✓ Feature 1 "Generation Controls" — specified
       Created: FR-003, 4 new UCs (UC-030..033)

[2/3] Working on Feature 2 "Image Editing"...
```

#### After all items: Final summary

```
═══════════════════════════════════════════════
  INTAKE COMPLETE
═══════════════════════════════════════════════

Processed: 5 requests → 2 features, 0 bugs, 0 tasks

Feature 1: "Generation Controls" — FR-003
  4 UCs specified (UC-030, UC-031, UC-032, UC-033)

Feature 2: "Image Editing" — FR-004
  2 UCs specified (UC-034, UC-035)
  Depends on: FR-003

Next steps:
  Full lifecycle (dev + staging deploy):
    /tl-conductor --items FR-003,FR-004

  Development only (no delivery):
    /tl-conductor --items FR-003,FR-004 --skip-deliver

  Step by step:
    /tl-plan --feature FR-003
    /tl-full --feature FR-003
    /tl-deliver --feature FR-003
═══════════════════════════════════════════════
```

---

## Edge Cases

### All items are the same type

If all atoms are features → skip bug/task steps, go straight to grouping.
If all atoms are bugs → skip sa-feature, execute all via /tl-fix.

### Single item

If the user provides only one request:
- If it's a feature → redirect to `/sa-feature` directly (no decomposition needed)
- If it's a bug → redirect to `/tl-fix` directly
- Report: "Single request detected, routing directly to [skill]"

### User disagrees with classification

If user says "that's not a bug, it's a feature" or "merge these":
- Accept the user's classification (they know their product better)
- Adjust grouping and re-present

### Feature depends on a bug fix

If a feature requires a bug to be fixed first:
- Execute bug fix first (/tl-fix)
- Then proceed with feature (/sa-feature)
- Note dependency in the execution plan

### Too many items (>10)

If the user provides >10 items:
- Extract and classify all
- Present top-level grouping
- Suggest: "Process in batches? First batch: Features 1-3, Second batch: Features 4-5 + bugs"
- Reasoning: context window management, avoid overwhelming a single session

---

## Interaction with Other Skills

```
/tl-intake (this skill)
  ├─ Bugs     → /tl-fix "description"
  ├─ Tasks    → /tl-dev TECH-NNN
  └─ Features → /sa-feature "description"
                  ├─ Creates docs/ specs
                  └─ Creates .tl/feature-requests/FR-NNN.md
                       ↓
                  /tl-conductor --items FR-001,FR-002,BUG-003
                    (creates feature branch, runs dev per item,
                     commits per UC, delivers to staging)
```

**Recommended flow:** After intake completes specification, hand off to `/tl-conductor` for the full lifecycle. Conductor handles planning, development, git management, and delivery as a single batch.

---

## References

- INVEST criteria for story validation
- SPIDR framework for story splitting
- `tl-core/references/fix-classification-rules.md` — L0/L1/L2/L3 for bugs
- `sa-feature/SKILL.md` — feature specification workflow
- `tl-fix/SKILL.md` — bug fix workflow
