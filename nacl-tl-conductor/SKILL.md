---
name: nacl-tl-conductor
model: opus
effort: high
description: |
  Graph-aware batch process manager: intake to staging.
  Delegates planning to nacl-tl-plan, dev to nacl-tl-full.Use when: batch workflow with graph, orchestrate graph intake, or the user says "/nacl-tl-conductor".
---

## Contract

**Inputs this skill consumes:**
- Graph IntakeItems (queries Neo4j)
- Sub-orchestrator results: nacl-tl-full (UC paths), nacl-tl-fix (bug paths)
- .tl/status.json per task (six-status vocabulary: PASS / BLOCKED / UNVERIFIED /
  NO_INFRA / RUNNER_BROKEN / REGRESSION)

**Outputs this skill produces:**
- Per-task status table; aggregated PASS/UNVERIFIED/BLOCKED counts
- Headline one of: CONDUCTOR COMPLETE / CONDUCTOR APPLIED — {SUFFIX} /
  CONDUCTOR INCOMPLETE — REGRESSION
- Graph writes gated on PASS (t.status = 'done' only on PASS;
  'verified-pending' for UNVERIFIED; 'blocked' for BLOCKED)

**Downstream consumers of this output:**
- Human user (via batch report)

**Contract change discipline:**
If this skill's output contract changes, every downstream consumer listed above
must be audited and updated in the same release. The 0.10.0→0.10.1 regression
was caused by the absence of this discipline. `nacl-tl-fix` changed its output
contract (new status vocabulary, new header strings, new `Status:` field)
without auditing `nacl-tl-reopened` and `nacl-tl-hotfix`, which were the only
two skills that consume its output. Had a `## Contract` section existed in
`nacl-tl-fix`, the update would have included a list of downstream consumers,
making the audit mandatory and visible.

---

# Graph TeamLead Conductor -- Process Manager

## Your Role

You are the **process manager**. You know the entire workflow from user request to staging deployment. You do NOT write code, review code, or run tests yourself -- you delegate everything to specialized skills via sub-agents (Task tool).

Your job is **orchestration and decision-making**:
- Create and manage feature branches
- Dispatch development work to the right skills
- Commit each completed UC atomically
- Handle failures, retries, and edge cases
- Coordinate delivery to staging

**Nothing should surprise you.** Every possible outcome from a sub-agent (success, failure, timeout, partial result) has a defined response in your workflow.

**Key advantage over nacl-tl-conductor:** Phase 0 can read UC scope directly from the Neo4j graph. Phase 2 delegates to `nacl-tl-plan` (one Cypher query per UC instead of reading ~70 markdown files). Phase 3 delegates to `nacl-tl-full` (graph-aware lifecycle executor).

## Key Principle

```
Feature branch -> per-item development via sub-agents -> atomic commit per item -> batch delivery to staging.
One branch per batch. One commit per UC/BUG/TECH. One push at the end.
```

---

## Shared References

Read `nacl-core/SKILL.md` for:
- Neo4j MCP tool names and connection info (`mcp__neo4j__read-cypher`, `mcp__neo4j__write-cypher`)
- ID generation rules
- Schema files location (`graph-infra/schema/`)
- Query library location (`graph-infra/queries/`)

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Read UC scope, dependencies, wave structure from graph |
| `mcp__neo4j__write-cypher` | Update Task node statuses after completion/failure |

---

## Invocation

```
/nacl-tl-conductor --items FR-001,FR-002,BUG-003    # batch items from intake
/nacl-tl-conductor --feature FR-001                  # single feature request
/nacl-tl-conductor --branch feature/sprint-42        # explicit branch name
/nacl-tl-conductor --skip-deliver                    # dev only, no delivery
/nacl-tl-conductor --skip-qa                         # skip pre-ship QA in dev cycle
/nacl-tl-conductor --yes                             # skip user gates
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Branch prefix | `git.branch_prefix` > fallback `"feature/"` |
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
| YouGile columns | `yougile.columns.*` |
| Deploy config | `deploy.staging.*` |

If config.yaml missing -> use fallback defaults. If YouGile missing -> skip task moves.

---

## State File: `.tl/conductor-state.json`

Conductor persists its state for resumption:

```json
{
  "branch": "feature/FR-001-generation-controls",
  "baseBranch": "main",
  "items": [
    { "id": "FR-001", "type": "feature", "ucs": ["UC028", "UC029"] },
    { "id": "BUG-003", "type": "bug", "description": "Share button on mobile" }
  ],
  "started": "2026-04-04T10:00:00Z",
  "phase": "development",
  "techTasks": [
    { "id": "TECH-001", "status": "done", "commit": "abc1234" },
    { "id": "TECH-002", "status": "pending" }
  ],
  "ucTasks": [
    { "id": "UC028", "wave": 1, "status": "done", "commit": "def5678" },
    { "id": "UC029", "wave": 1, "status": "in_progress" }
  ],
  "bugFixes": [
    { "id": "BUG-003", "status": "pending" }
  ],
  "delivery": {
    "status": "pending"
  }
}
```

**Always update this file after each significant state change** (task completion, failure, phase transition). This enables resumption if the session is interrupted.

---

## Workflow: 7 Phases

### Phase 0: INIT

1. Read `config.yaml` (git strategy, modules, yougile)
2. Check for existing `.tl/conductor-state.json`:
   - If exists -> **RESUME MODE** (see Resumption section below)
   - If not -> fresh start
3. Determine scope of work:
   - If `--items`: parse comma-separated list (FR-NNN, BUG-NNN, TECH-NNN)
   - If `--feature`: **query Neo4j graph for affected UCs** (graph-first), then fall back to `.tl/feature-requests/FR-NNN.md` if graph unavailable
   - If neither: read `.tl/status.json`, find all incomplete items
4. Read `.tl/master-plan.md` (if exists) for wave structure and dependencies
5. Build execution plan:
   - TECH tasks (Wave 0): ordered by dependency
   - UC tasks (Waves 1..N): ordered by wave, then by priority within wave
   - Bug fixes: independent, can run in any order

#### Graph-Based Scope Resolution (Phase 0 -- `--feature FR-NNN`)

When `--feature` is provided, query the graph FIRST for the feature's UC scope:

```cypher
// Resolve feature scope from graph
MATCH (fr:FeatureRequest {id: $frId})-[:INCLUDES_UC]->(uc:UseCase)
OPTIONAL MATCH (uc)-[:DEPENDS_ON]->(dep:UseCase)
RETURN fr.id AS feature_id, fr.title AS feature_title,
       collect(DISTINCT {
         id: uc.id, name: uc.name, priority: uc.priority,
         depends_on: collect(DISTINCT dep.id)
       }) AS ucs
```

**If query returns results:** Use graph data for scope (more accurate, includes dependency edges).

**If query returns empty or Neo4j unavailable:** Fall back to reading `.tl/feature-requests/FR-NNN.md` and extracting affected UCs from the markdown (same as nacl-tl-conductor).

6. **USER GATE** (skip if `--yes`):
   ```
   ===============================================
     CONDUCTOR -- EXECUTION PLAN (graph-aware)
   ===============================================

   Branch: feature/FR-001-generation-controls
   Base: main
   Scope source: Neo4j graph  [or: feature-request file]

   Items: 3 (2 features, 1 bugfix)

   Wave 0 -- Infrastructure:
     TECH-001: Shared types setup

   Wave 1 -- Core:
     UC028: Image format selection (BE + FE)
     UC029: Scene prompt display (BE + FE)

   Independent:
     BUG-003: Share button on mobile

   Proceed? [y/n]
   ===============================================
   ```

---

### Phase 1: BRANCH

1. Determine branch name:
   - If `--branch`: use as-is
   - If `--feature FR-001`: `feature/FR-001-[slugified-title]`
   - If `--items`: `feature/intake-YYYY-MM-DD`
2. Resolve base branch from config
3. Create branch:
   ```bash
   git checkout -b [branch_name] [base_branch]
   ```
4. If branch already exists (resume scenario):
   ```bash
   git checkout [branch_name]
   ```
5. Write initial `.tl/conductor-state.json`

---

### Phase 2: PLAN (conditional)

**Skip if** `.tl/master-plan.md` and `.tl/tasks/` already exist with all needed task files.

**Critical difference from nacl-tl-conductor:** Delegates to `nacl-tl-plan` instead of `nacl-tl-plan`.

For each FR item that needs planning:
1. Launch sub-agent (Task tool): `/nacl-tl-plan --feature FR-NNN`
2. Wait for completion
3. Verify: `.tl/master-plan.md` updated, task files created in `.tl/tasks/`
4. Parse execution waves from master-plan.md

Update `conductor-state.json` with wave assignments.

---

### Phase 3: DEVELOPMENT

Execute items by wave, respecting dependencies.

**Critical difference from nacl-tl-conductor:** Delegates UC lifecycle to `nacl-tl-full` instead of `nacl-tl-full`.

#### Wave 0 -- TECH tasks (sequential)

For each TECH task:

```
1. Update conductor-state.json: TECH-### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /nacl-tl-dev TECH-###

3. Wait for result

4. Launch sub-agent (Task tool):
   Execute /nacl-tl-review TECH-###

5. If review REJECTED -> retry loop (max 3):
   a. Launch sub-agent: /nacl-tl-dev TECH-### --continue
   b. Launch sub-agent: /nacl-tl-review TECH-###
   c. If approved -> break
   d. If rejected again -> increment retry counter

6. Read nacl-tl-dev's six-status result before committing:
   a. Parse the `Status: {value}` line from nacl-tl-dev's report.
      Headlines are advisory; the `Status:` line is the only authoritative
      classifier (P1).
   b. If the report has no parseable `Status:` line:
      HALT. Emit:
        "CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable: TECH-###)"
      Update conductor-state.json: status = "unverified".
      Do NOT commit. Continue to next item only after operator review.

7. If APPROVED AND Status: PASS:
   a. Stage and commit:
      git add -A
      git commit -m "TECH-###: [title from task.md]"
   b. Update conductor-state.json: status = "done", commit = [hash]

   If APPROVED AND Status is non-PASS (UNVERIFIED / BLOCKED / NO_INFRA /
   RUNNER_BROKEN / REGRESSION):
   - Review approval CANNOT upgrade unverified dev work. The TECH commit
     gate consumes the dev result, not the review verdict.
   - Branch on the parsed dev status using the same rules as the UC loop
     (Step 4b below): UNVERIFIED → no commit, write 'verified-pending';
     BLOCKED → operator override or abort; NO_INFRA / RUNNER_BROKEN →
     halt and escalate; REGRESSION → halt and file bug.

8. If FAILED (3 retries exhausted):
   a. Update conductor-state.json: status = "failed", reason = [details]
   b. Log failure, continue to next TECH task
```

#### Waves 1..N -- UC tasks

For each UC in wave order (sequential within wave, wave-by-wave):

```
1. Update conductor-state.json: UC### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /nacl-tl-full --task UC### --skip-plan [--skip-qa if conductor has --skip-qa]
   
   This runs the full 8-step UC lifecycle:
   BE dev -> BE review -> FE dev -> FE review -> Sync -> Stubs -> QA -> Docs

3. Wait for completion

4. Read aggregated UC status (Step 4a then branch per Step 4b):

   a. Parse `Status: {value}` from nacl-tl-full's report:
      - The `Status:` line is the only authoritative classifier (P1).
        Recognised values: PASS / UNVERIFIED / BLOCKED / NO_INFRA /
        RUNNER_BROKEN / REGRESSION.
      - The decorative headline (e.g. "FULL COMPLETE", "FULL APPLIED —
        UNVERIFIED") is advisory only and MUST NOT be used to classify
        the result. A report whose `Status:` line and headline disagree
        is classified by `Status:`; the disagreement is logged and
        surfaced in Phase 6.
      - If no parseable `Status: {PASS|UNVERIFIED|BLOCKED|NO_INFRA|
        RUNNER_BROKEN|REGRESSION}` line is present:
        HALT. Emit:
          "CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable: UC###)"
        Update conductor-state.json: status = "unverified".
        Do NOT commit; do NOT advance to next UC.
      - Cross-check .tl/status.json for UC### (nacl-tl-full also writes
        it). If the JSON file contradicts the parsed `Status:` line, the
        graph and `Status:` line win; surface the contradiction in
        Phase 6.

   b. Branch on aggregated status:

      PASS:
        - Stage and commit:
          git add -A
          git commit -m "UC###: [title from task-be.md or status.json]"
        - Update Neo4j: t.status = 'done'
        - Update conductor-state.json: status = "done", commit = [hash]

      UNVERIFIED:
        - DO NOT commit
        - Update Neo4j: t.status = 'verified-pending'
        - Update conductor-state.json: status = "unverified", reason = [details]
        - Log: "UC### complete but UNVERIFIED — no test exercises the change"
        - Continue to next UC (will appear in report)

      BLOCKED:
        - HALT; post advisory to user:
          "UC### blocked: [reason]. Override with --yes to record as blocked
           and continue, or fix blocker first."
        - If user confirms override (or --yes flag):
          - Update Neo4j: t.status = 'blocked'
          - Update conductor-state.json: status = "blocked"
          - Continue
        - If no confirmation: abort batch

      NO_INFRA / RUNNER_BROKEN:
        - HALT; escalate:
          "Infrastructure problem for UC###: [status]. Fix infra before
           continuing. Re-run /nacl-tl-conductor to resume."
        - Update conductor-state.json: status = "infra_error"
        - Do NOT continue to next UC automatically

      REGRESSION:
        - HALT; file new bug:
          "UC### introduced a regression. File a bug, do not ship."
        - Update conductor-state.json: status = "regression"
        - Do NOT commit; do NOT advance to delivery
```

#### Bug fixes (independent, after TECH, can interleave with UCs)

For each BUG item:

```
1. Update conductor-state.json: BUG-### status = "in_progress"

2. Launch sub-agent (Task tool):
   Execute /nacl-tl-fix "[description from intake]"

3. Wait for completion

4. Parse `Status: {value}` from nacl-tl-fix's Step 8 report:
   - The `Status:` line is the only authoritative classifier (P1).
     Recognised values: PASS / UNVERIFIED / BLOCKED / NO_INFRA /
     RUNNER_BROKEN / REGRESSION.
   - Headlines such as "FIX COMPLETE" or "FIX APPLIED — UNVERIFIED" are
     advisory only. Since 0.10.0 nacl-tl-fix has used the same headline
     ("FIX APPLIED — UNVERIFIED") for several distinct statuses; the
     `Status:` line is what disambiguates them.
   - If no parseable `Status: {PASS|UNVERIFIED|BLOCKED|NO_INFRA|
     RUNNER_BROKEN|REGRESSION}` line is present:
     HALT. Emit:
       "CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable: BUG-###)"
     Update conductor-state.json: status = "unverified".
     Do NOT commit; do NOT advance to next bug.

5. Branch on status:

   PASS:
     a. Stage and commit:
        git add -A
        git commit -m "fix: [short description]"
     b. Update Neo4j: t.status = 'done'
     c. Update conductor-state.json: status = "done", commit = [hash]

   UNVERIFIED:
     a. DO NOT commit
     b. Update Neo4j: t.status = 'verified-pending'
     c. Update conductor-state.json: status = "unverified"
     d. Log: "BUG-### fixed but UNVERIFIED — no test exercises the change"
     e. Continue (will appear in report)

   BLOCKED:
     a. Halt; ask user to confirm override before continuing
     b. If confirmed: Update Neo4j t.status = 'blocked'; continue
     c. If not confirmed: abort batch

   NO_INFRA / RUNNER_BROKEN:
     a. Halt; escalate as infrastructure problem
     b. Update conductor-state.json: status = "infra_error"

   REGRESSION:
     a. Halt; log new regression; do NOT commit
     b. Update conductor-state.json: status = "regression"
```

#### Updating Task Node Status in Neo4j

After each item completes, update the corresponding Task node using the
aggregated sub-skill status. Graph writes are GATED on verification status,
and every terminal write MUST also set `t.verification_evidence` so that
`nacl-tl-release` can report Evidence level without a "Verification gap"
warning (see `nacl-core/SKILL.md` § Task.verification_evidence).

##### Deriving `$evidence` from the sub-skill report

Before issuing the Cypher write, parse the sub-skill report (`nacl-tl-full` /
`nacl-tl-fix`) for the `Regression test:` line (case-sensitive, exactly that
prefix). The value of `$evidence` follows this table:

| Sub-skill `Status:` | `Regression test:` value | `$evidence` |
|---|---|---|
| PASS | `<repo-relative path>` | `'test-GREEN:' + <path>` |
| PASS | `"covered by existing test: <path>"` | `'test-GREEN:' + <path>` (path extracted from the suffix) |
| PASS | `"none — UNVERIFIED"` or missing | **HALT** — `CONDUCTOR HALTED — UNVERIFIED (PASS report missing Regression test line: <taskId>)`. Do NOT write `done`. |
| PASS + `--no-test` user override active | `"none — UNVERIFIED"` allowed | `'no-test'` (only path; explicit override must be present in conductor invocation) |
| UNVERIFIED | any | `'test-UNVERIFIED'` |
| BLOCKED | any | `'test-UNVERIFIED'` (the test seam did not transition; surface as such) |
| REGRESSION / NO_INFRA / RUNNER_BROKEN | any | not written — task moves to `failed`; `verification_evidence` stays NULL by design |

`<repo-relative path>` must be a forward-slash path without a leading `./`.
If the sub-skill returned an absolute path, normalise to repo-relative
(strip the project root prefix) before composing `$evidence`.

##### Graph writes

```cypher
// PASS — task verified and committed
MATCH (t:Task {id: $taskId})
SET t.status = 'done',
    t.commit = $commitHash,
    t.completed_at = datetime(),
    t.verification_evidence = $evidence  // 'test-GREEN:<path>' or 'no-test'
```

```cypher
// UNVERIFIED — fix applied but no test covers the change
MATCH (t:Task {id: $taskId})
SET t.status = 'verified-pending',
    t.unverified_reason = $reason,
    t.verification_evidence = 'test-UNVERIFIED',
    t.updated = datetime()
```

```cypher
// BLOCKED — fix applied, pre-existing failures, user override recorded
MATCH (t:Task {id: $taskId})
SET t.status = 'blocked',
    t.blocked_reason = $reason,
    t.verification_evidence = 'test-UNVERIFIED',
    t.updated = datetime()
```

```cypher
// REGRESSION / NO_INFRA / RUNNER_BROKEN — halt without graph status advance
MATCH (t:Task {id: $taskId})
SET t.status = 'failed',
    t.failed_phase = $failedPhase,
    t.failure_reason = $reason,
    t.failed_at = datetime()
// verification_evidence is intentionally NOT set — release-skill excludes
// failed tasks from the merge plan, so no evidence is required.
```

**Rule:** t.status = 'done' is written ONLY when sub-skill status is PASS.
For UNVERIFIED: write 'verified-pending'. For BLOCKED: write 'blocked'.
For REGRESSION/NO_INFRA/RUNNER_BROKEN: write 'failed'.
This keeps the graph in sync with the actual verification state.

**Evidence rule:** `t.verification_evidence` is written for every terminal
state EXCEPT `failed`. A PASS report that does not carry a parseable
`Regression test: <path>` line is treated as a contract violation — the
conductor HALTs rather than write `done` without evidence. The only way
to land `'no-test'` evidence is via an explicit user `--no-test` override
on the conductor invocation; bare PASS reports must produce `test-GREEN`.

---

### Phase 4: QUALITY GATE

After all development items have been processed:

1. Launch sub-agent (Task tool): `/nacl-tl-stubs --final`
2. Parse result:
   - If critical stubs = 0 -> proceed
   - If critical stubs > 0:
     a. Attempt fix (launch sub-agent to resolve critical stubs)
     b. Re-scan (max 2 retries)
     c. If still critical -> record in state, warn in report

3. Re-query Neo4j to confirm terminal state (graph is the source of truth):

   ```cypher
   // Phase 4 graph-truth gate — must run BEFORE reading conductor-state.json
   MATCH (t:Task)
   WHERE t.intake_id = $intakeId
     AND t.status IN ['pending', 'in_progress']
   RETURN t.id AS taskId, t.status AS currentStatus
   ```

   - Bind `$intakeId` to the current intake (from conductor-state.json header).
   - If the query returns **any rows**: HALT immediately.
     Post this advisory and do NOT advance to Phase 5:

     ```
     HALT — graph/JSON mismatch detected before Phase 5.

     The following tasks are NOT in a terminal state in Neo4j
     even though conductor-state.json marks them as done:

       <taskId>  graph status: <currentStatus>

     Do NOT proceed to delivery until the graph reflects the correct
     terminal state (done / verified-pending / blocked / failed).

     Resolution options:
       [1] Re-run /nacl-tl-full <taskId> to replay and re-write graph status.
       [2] Run /nacl-tl-diagnose to reconcile JSON vs graph manually.
       [3] Abort this conductor run and investigate the crash.
     ```

   - If the query returns **zero rows**: all tasks are terminal in the graph.
     Continue to step 3b.

3b. **Evidence-completeness gate** — verify every `done` / `verified-pending`
   / `blocked` task carries `verification_evidence`. This closes the gap
   that would otherwise surface as a "Verification gap" at release time
   (see `nacl-core/SKILL.md` § Task.verification_evidence).

   ```cypher
   // Phase 4 evidence-completeness gate — must run AFTER step 3 succeeds
   MATCH (t:Task)
   WHERE t.intake_id = $intakeId
     AND t.status IN ['done', 'verified-pending', 'blocked']
     AND (t.verification_evidence IS NULL OR t.verification_evidence = '')
   RETURN t.id AS taskId, t.status AS currentStatus
   ```

   - Bind `$intakeId` to the current intake (from conductor-state.json header).
   - If the query returns **any rows**: HALT immediately.
     Post this advisory and do NOT advance to Phase 5:

     ```
     HALT — verification_evidence missing on terminal tasks.

     The following tasks reached a terminal status but have no evidence
     string in Neo4j. `nacl-tl-release` would surface this as a
     "Verification gap" — that is a contract violation, not normal output.

       <taskId>  graph status: <currentStatus>  evidence: NULL

     This is a writer bug: every Phase 3 graph write (PASS / UNVERIFIED /
     BLOCKED) must set `t.verification_evidence` per the taxonomy in
     `nacl-core/SKILL.md`. Resolution options:

       [1] Re-run /nacl-tl-full <taskId> — replay the task; the writer
           should populate evidence on the second pass.
       [2] Run /nacl-tl-diagnose to inspect the graph state.
       [3] Abort this conductor run and patch the writer that left
           evidence NULL.

     Do NOT manually set evidence to bypass this gate — that masks the
     underlying writer regression.
     ```

   - If the query returns **zero rows**: all terminal tasks carry evidence.
     Continue to step 4.

4. Review conductor-state.json:
   - Count: done, failed, pending items
   - If ALL items done -> proceed to Phase 5
   - If SOME failed -> **USER GATE** (skip if `--yes`):
     ```
     Partial completion: 2/3 items done, 1 failed.
     
     UC028: Image format selection          -- DONE
     BUG-003: Share button on mobile        -- DONE
     UC029: Scene prompt display            -- FAILED at sync, 3 retries
     
     Options:
       [1] Continue to delivery (ship what's done)
       [2] Abort (keep branch, fix manually later)
     ```
   - If ALL failed -> abort delivery, full failure report

5. Update conductor-state.json: phase = "quality_gate_passed"

---

### Phase 5: DELIVERY (skip if `--skip-deliver`)

1. Update conductor-state.json: phase = "delivery"

2. Launch sub-agent (Task tool):
   ```
   Execute /nacl-tl-deliver --branch [branch_name]
   ```
   
   nacl-tl-deliver handles:
   - Push branch to origin
   - Create PR (if feature-branch strategy)
   - Wait for CI pipeline
   - Run verification on staging (nacl-tl-verify)
   - Health check

3. Wait for result

4. Parse delivery result:
   - If ALL PASS -> update conductor-state.json: delivery.status = "done"
   - If VERIFY FAIL -> update: delivery.status = "verify_failed"
   - If DEPLOY FAIL -> update: delivery.status = "deploy_failed"
   - If CI FAIL -> update: delivery.status = "ci_failed"

---

### Phase 6: REPORT

Display the final report (in user's language):

```
===============================================================
                  BATCH EXECUTION COMPLETE
===============================================================

Branch: feature/FR-001-generation-controls
Duration: 2h 14m
Scope source: Neo4j graph

Development:
  TECH-001: Shared types setup    (commit abc1234)  -- DONE        [PASS]        Evidence: test-GREEN (backend/src/__tests__/shared-types.spec.ts)
  UC028: Image format selection   (commit def5678)  -- DONE        [PASS]        Evidence: test-GREEN (frontend/src/components/__tests__/format-selector.spec.tsx)
  UC029: Scene prompt display     (no commit)       -- UNVERIFIED  [UNVERIFIED]  Evidence: test-UNVERIFIED
  BUG-003: Share button on mobile (commit 789abcd)  -- DONE        [PASS]        Evidence: test-GREEN (frontend/src/__tests__/share-button.spec.tsx)

  Result: 3/4 items completed
  Status summary: 3 PASS, 1 UNVERIFIED, 0 BLOCKED, 0 REGRESSION

  Evidence is sourced from `Task.verification_evidence` in Neo4j
  (taxonomy: `nacl-core/SKILL.md`). The same string is what
  `nacl-tl-release` will surface in its Evidence-level column.

Quality:
  Stubs: 0 critical, 3 warnings
  Pre-ship QA: 2/2 passed (UC029 skipped -- failed)

Delivery:
  Ship: pushed to origin/feature/FR-001, PR #42
  CI: passed (3m 12s)
  Verify: PASS (code analysis + E2E)
  Deploy: staging healthy (https://staging.example.com)

YouGile: completed tasks -> ToRelease

Graph: Task nodes updated (3 done, 1 failed)

Problems:
  1. UC029 failed at sync phase after 3 retries.
     See .tl/tasks/UC029/sync-report.md
     Fix manually: /nacl-tl-full --task UC029

Verification gaps: UC029 (test-UNVERIFIED) — release will surface this.

Next:
  /nacl-tl-release              -- production release
  /nacl-tl-full --task UC029    -- fix unverified UC
  /nacl-tl-conductor --items ... -- next batch
===============================================================

Headline: CONDUCTOR APPLIED — UNVERIFIED
(Use CONDUCTOR COMPLETE when all items PASS; CONDUCTOR INCOMPLETE — REGRESSION
 when any item has REGRESSION status.)
```

The `Verification gaps:` footer is rendered when any terminal-state task in
the current intake has `verification_evidence` ∈ {`test-UNVERIFIED`,
`no-test`}. It mirrors the footer `nacl-tl-release` emits, so the user is
never surprised by a release-time gap report when the conductor itself
already declared COMPLETE. The footer is computed from the same Cypher
query the release skill runs:

```cypher
MATCH (t:Task)
WHERE t.intake_id = $intakeId
  AND t.status IN ['done', 'verified-pending', 'blocked']
  AND t.verification_evidence IN ['test-UNVERIFIED', 'no-test']
RETURN t.id, t.verification_evidence
ORDER BY t.id
```

If the result is empty, the footer is omitted entirely (no `Verification
gaps: none` line — silence is the positive signal).

---

## Failure Handling Matrix

Every possible sub-agent outcome has a defined response:

| Situation | Conductor Action |
|-----------|-----------------|
| nacl-tl-full returns PASS (FULL COMPLETE) | Commit atomically, write t.status='done' to graph, continue |
| nacl-tl-full returns UNVERIFIED | DO NOT commit; write t.status='verified-pending'; log; continue |
| nacl-tl-full returns BLOCKED | Halt; ask user override; if confirmed write t.status='blocked'; continue |
| nacl-tl-full returns NO_INFRA / RUNNER_BROKEN | Halt; escalate as infra problem; do NOT continue automatically |
| nacl-tl-full returns REGRESSION | Halt; file bug; do NOT commit or advance to delivery |
| nacl-tl-full returns FAILED for UC (old-style) | Record failure with phase + reason, update Task node, continue to next UC |
| nacl-tl-dev returns FAILED for TECH | Retry with review loop (max 3), then record failure |
| nacl-tl-fix returns PASS | Commit atomically, write t.status='done', continue |
| nacl-tl-fix returns UNVERIFIED | DO NOT commit; write t.status='verified-pending'; continue |
| nacl-tl-fix returns BLOCKED | Halt; ask user override before continuing |
| nacl-tl-fix returns REGRESSION | Halt; do NOT commit |
| Sub-agent timeout / no response | Record as timeout, continue. Recommend manual retry in report |
| Git conflict on commit | Attempt `git add -A && git commit`. If conflict -> pause, ask user |
| Git conflict on branch creation | Checkout existing branch (resume scenario) |
| nacl-tl-deliver FAIL at ship (push rejected) | Pull --rebase, retry push. If still fails -> report |
| nacl-tl-deliver FAIL at CI | Read CI logs, include in report. Suggest fix |
| nacl-tl-deliver FAIL at verify | Record. Suggest /nacl-tl-reopened for specific UCs |
| nacl-tl-deliver FAIL at deploy | Record with details. Suggest checking pipeline |
| All items failed | Skip delivery entirely. Full failure report |
| Partial success (some done, some failed) | User gate: continue with partial delivery or abort |
| Conductor session interrupted | State saved in conductor-state.json. Resume on next run |
| Neo4j unavailable at Phase 0 | Fall back to file-based scope resolution (read FR-NNN.md) |
| Neo4j unavailable at Phase 3 | nacl-tl-full handles its own fallback; conductor continues normally |
| Neo4j write fails after completion | Log warning, continue (graph sync is best-effort, not blocking) |

---

## Resumption Logic

On start, if `.tl/conductor-state.json` exists:

1. Read state file
2. Determine current phase and last completed item
3. Resume from the right point:

```
phase = "development":
  - Find first item with status != "done" and status != "failed"
  - For TECH: check if dev done but review pending
  - For UC: delegate to nacl-tl-full --task (it has its own resumption via status.json)
  - For BUG: re-run nacl-tl-fix if status = "in_progress"

phase = "quality_gate_passed":
  - Skip directly to Phase 5 (delivery)

phase = "delivery":
  - Read .tl/delivery-status.json
  - Resume nacl-tl-deliver from incomplete step (ship/ci/verify/deploy)

phase = "complete":
  - Show last report, ask if user wants to re-run anything
```

4. **USER GATE** (skip if `--yes`):
   ```
   Resuming from previous session.

   Branch: feature/FR-001-generation-controls
   Completed: TECH-001, UC028
   Resuming from: UC029 (Wave 1)

   Continue? [y/n]
   ```

---

## YouGile Integration

| Phase | Column Transition | Actor |
|-------|------------------|-------|
| Phase 0 (init) | UserRequests -> Backlog | nacl-tl-intake (before conductor) |
| Phase 3 (dev start) | Backlog -> InWork | conductor (or nacl-tl-full internally) |
| Phase 3 (dev done) | InWork -> DevDone | nacl-tl-full (per UC, automatic) |
| Phase 5 (verify) | DevDone -> Testing | nacl-tl-verify (inside nacl-tl-deliver) |
| Phase 5 (verify pass) | Testing -> ToRelease | nacl-tl-verify (inside nacl-tl-deliver) |
| Phase 5 (verify fail) | Testing -> Reopened | nacl-tl-verify (inside nacl-tl-deliver) |
| Phase 6 (release) | ToRelease -> Done | nacl-tl-release (merges PRs, verifies deploy, tags version) |

Conductor does NOT directly move YouGile tasks. It delegates to sub-skills that handle their own YouGile transitions. Conductor only reads YouGile state for awareness.

---

## Relationship to Other Skills

```
nacl-tl-intake -> classifies requests (graph-aware) -> recommends /nacl-tl-conductor
nacl-tl-conductor -> orchestrates batch -> delegates to:
  +-- /nacl-tl-plan (graph-based planning, if needed)
  +-- /nacl-tl-dev TECH-### (infrastructure -- unchanged)
  +-- /nacl-tl-review TECH-### (TECH review -- unchanged)
  +-- /nacl-tl-full --task UC### (graph-aware per-UC lifecycle)
  +-- /nacl-tl-fix "description" (bug fixes -- unchanged)
  +-- /nacl-tl-stubs --final (quality gate -- unchanged)
  +-- /nacl-tl-deliver (push -> verify -> deploy -- unchanged, format-agnostic)

nacl-tl-full remains the per-UC lifecycle executor (graph-aware).
nacl-tl-deliver handles the ship->verify->deploy chain (format-agnostic, unchanged).
nacl-tl-conductor is the process manager that ties everything together.
```

### Differences from nacl-tl-conductor

| Phase | nacl-tl-conductor delegates to | nacl-tl-conductor delegates to |
|-------|---------------------------|--------------------------------|
| Phase 0 INIT | `.tl/feature-requests/FR-NNN.md` | Neo4j graph (fallback: FR-NNN.md) |
| Phase 2 PLAN | `/nacl-tl-plan` | `/nacl-tl-plan` |
| Phase 3 DEV (UC lifecycle) | `/nacl-tl-full` | `/nacl-tl-full` |
| Phase 3 DEV (TECH) | `/nacl-tl-dev` | `/nacl-tl-dev` (unchanged) |
| Phase 3 DEV (BUG) | `/nacl-tl-fix` | `/nacl-tl-fix` (unchanged) |
| Phase 4 QUALITY GATE | `/nacl-tl-stubs` | `/nacl-tl-stubs` (unchanged) |
| Phase 5 DELIVERY | `/nacl-tl-deliver` | `/nacl-tl-deliver` (unchanged) |

### What conductor does NOT do:
- Write or review code (delegates to nacl-tl-dev-be/fe via nacl-tl-full)
- Run tests (delegates to nacl-tl-full, nacl-tl-verify)
- Create specifications (delegates to nacl-sa-feature via nacl-tl-intake)
- Move YouGile tasks (delegates to sub-skills)
- Query Neo4j during development (nacl-tl-full and nacl-tl-plan handle that)

### What conductor DOES do:
- Create and manage feature branches
- Decide execution order (waves, dependencies)
- Commit completed work atomically
- Handle failures and retries at the batch level
- Coordinate delivery timing
- Maintain persistent state for resumption
- Update Task node statuses in Neo4j after completion/failure
- Report progress and final results

---

## Edge Cases

### Single item batch
If only one FR or BUG is provided, conductor still creates a feature branch and follows the full workflow. This ensures consistent git history and delivery process.

### No TECH tasks
If master-plan.md has no Wave 0 (TECH), skip directly to UC waves.

### All items are bugs
Skip planning phase. Each bug gets /nacl-tl-fix -> commit. Then deliver.

### Feature branch already exists on remote
If `git push` reports the branch exists:
- If conductor-state.json exists -> resume mode, checkout and continue
- If no state -> ask user: "Branch exists. Checkout and continue, or create new branch?"

### Conflicting changes between UCs
If UC029 modifies files that UC028 already committed:
- Git handles this naturally (both commits on same branch)
- If actual conflict (same lines changed): git commit will succeed (both changes are staged)
- If test failures after commit: the quality gate (Phase 4) catches this

### Neo4j unavailable
If `mcp__neo4j__read-cypher` fails during Phase 0 scope resolution:
1. Log warning: "Neo4j unavailable, falling back to file-based scope resolution"
2. Read `.tl/feature-requests/FR-NNN.md` instead (same as nacl-tl-conductor)
3. Continue the workflow normally -- graph unavailability does NOT block orchestration
4. Sub-agents (nacl-tl-plan, nacl-tl-full) handle their own Neo4j fallback

### Graph write failures
If `mcp__neo4j__write-cypher` fails when updating Task node status:
1. Log warning: "Failed to update Task node in graph"
2. Continue -- graph sync is best-effort, not blocking
3. Include in report: "Graph sync incomplete, run manual sync if needed"

---

## References

- `config.yaml` -> git strategy, modules, deploy, yougile
- `.tl/master-plan.md` -> wave structure, task dependencies
- `.tl/status.json` -> per-UC phase tracking
- `.tl/conductor-state.json` -> conductor's own state (created by this skill)
- `.tl/delivery-status.json` -> delivery state (created by nacl-tl-deliver)
- `.tl/feature-requests/FR-NNN.md` -> feature request artifacts (fallback)
- `nacl-core/SKILL.md` -> Neo4j connection, schema, query library
- `graph-infra/queries/sa-queries.cypher` -> sa_uc_full_context, sa_find_uc_by_keywords
- `graph-infra/queries/tl-queries.cypher` -> Task node queries
