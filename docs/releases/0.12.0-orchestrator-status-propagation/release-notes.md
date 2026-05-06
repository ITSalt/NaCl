# NaCl 0.12.0 — Orchestrator Status Propagation (Part 2 of 2)

This is the second and final part of the 0.12.0 release. Part 1 (TDD Discipline)
hardened `nacl-tl-dev`, `nacl-tl-dev-be`, and `nacl-tl-dev-fe` to produce honest
six-status output. Part 2 hardenes the seven orchestrator skills to consume and
propagate that status correctly.

Before this release, orchestrators collapsed sub-skill status into a binary pass/fail
without distinguishing PASS from UNVERIFIED, BLOCKED, NO_INFRA, RUNNER_BROKEN, or
REGRESSION. A task with no test coverage received the same graph write (`t.status =
'done'`) as a task with a green suite. With Part 1 in place, orchestrators had honest
signal from sub-skills but no instructions on how to act on it.

Part 2 closes that gap. The v0.12.0 git tag is created after Part 2 ships.

---

## Why This Release Exists

Waves 1–3 of the 0.12.0 honesty hardening program updated:
- Wave 1: `nacl-tl-reopened`, `nacl-tl-hotfix` (honor fix contract)
- Wave 2: `nacl-tl-verify-code`, `nacl-tl-stubs`, `nacl-tl-verify`, `nacl-tl-sync`,
  `nacl-tl-review` (verification skills produce honest statuses)
- Wave 3: `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` (dev skills produce honest statuses)

After Wave 3, every leaf skill in the pipeline produces one of the six canonical statuses.
But the orchestrators above them continued to:
- Read only binary "done/failed" from `.tl/status.json`
- Write `t.status = 'done'` to Neo4j regardless of UNVERIFIED/BLOCKED status
- Advance graph phases to `'approved'` without confirming that dev returned PASS
- Ship, deploy, and release without checking whether the underlying code was verified
- Produce final reports with no per-task status column

Wave 4 closes this gap in all seven orchestrators.

---

## The Aggregation Rules

Every orchestrator uses the same aggregation logic across sub-skill results:

| Sub-skill output | Orchestrator action |
|------------------|---------------------|
| All sub-skills PASS | Task → PASS; proceed; write 'done' to graph |
| Any sub-skill REGRESSION | Task → REGRESSION (highest severity); HALT; file bug |
| Any sub-skill UNVERIFIED (no REGRESSION) | Task → UNVERIFIED; HALT or user gate; write 'verified-pending' to graph |
| Any sub-skill BLOCKED (user override present) | Task → BLOCKED; proceed with override note; write 'blocked' to graph |
| Any sub-skill BLOCKED (no override) | HALT; ask user |
| Any sub-skill NO_INFRA / RUNNER_BROKEN | HALT; escalate as infrastructure problem |

Graph writes are **gated on verification status**:
- `t.status = 'done'` — written only on PASS
- `t.status = 'verified-pending'` — written for UNVERIFIED (new value in 0.12.0)
- `t.status = 'blocked'` — written for BLOCKED with override
- `t.status = 'failed'` — written for REGRESSION / NO_INFRA / RUNNER_BROKEN

---

## Per-Skill Changes

### nacl-tl-conductor (CRITICAL)

**Problem:** Phase 3 UC execution read `.tl/status.json` phase completeness only —
never inspected the sub-skill verification status. Bug fix branch recorded `status =
'done'` unconditionally. Graph always received `t.status = 'done'`.

**Changes:**
- Phase 3 UC loop: reads nacl-tl-full headline; branches per aggregation rules
- Phase 3 BUG loop: reads nacl-tl-fix `Status:` field; only writes `t.status = 'done'` on PASS
- Graph writes: `'done'` on PASS; `'verified-pending'` on UNVERIFIED; `'blocked'` on BLOCKED
- Failure matrix: UNVERIFIED/BLOCKED/REGRESSION rows added
- Phase 6 report: per-task status column added; headline selection rules documented

### nacl-tl-full (CRITICAL)

**Problem:** L1 Wave Agent prompt told the agent to `SET t.phase_be = 'ready_for_review'`
after dev unconditionally. Step 3.0 validated phase terminal state, not PASS. Final
report had no status column.

**Changes:**
- STEP 1 BE / STEP 3 FE: reads sub-skill headline; `'ready_for_review'` for PASS;
  `'ready_for_review'` (with unverified_reason) for UNVERIFIED; halts for NO_INFRA/REGRESSION
- STEP 2 BE review / STEP 4 FE review: `phase = 'approved'` only when dev was PASS;
  UNVERIFIED dev keeps phase at `'ready_for_review'`
- STEP 8 Docs: aggregates all phase statuses; `t.status = 'done'` only if all PASS
- Step 3.0 Validation: `'verified-pending'`, `'blocked'` added as terminal states
- WAVE_RESULT: includes per-UC status, aggregated counts, headline selection logic
- Final report: per-UC status column with graph values

### nacl-tl-ship (CRITICAL)

**Problem:** Step 1 pre-flight ran tests and shipped if local tests passed, without
consulting prior dev/fix verification status. `--deploy` flag had no upstream gate.

**Changes:**
- Step 1.0 (new sub-step): reads prior status from `.tl/status.json` BEFORE running
  local tests; branches per aggregation rules; local tests passing does NOT override
  upstream UNVERIFIED/BLOCKED status
- Step 5 PR creation: gate on PASS or explicit override; UNVERIFIED/BLOCKED PRs include
  status note in body; REGRESSION → no PR created
- Step 5.5 deploy: `--deploy` cannot bypass verification status; same gate as Step 1.0
- Output: status-aware headlines (SHIP COMPLETE / SHIP APPLIED — UNVERIFIED /
  SHIP HALTED — {suffix} / SHIP INCOMPLETE — REGRESSION)

### nacl-tl-deliver (HIGH)

**Problem:** Step 4 invoked `/nacl-tl-verify` without checking that each UC had PASS
dev status. Decision logic had no rule for UNVERIFIED UCs. Step 6 wrote IntakeItem
`delivered` regardless of status.

**Changes:**
- Step 4.0 (new sub-step): pre-verify dev status gate per UC from `.tl/status.json`;
  UNVERIFIED → advisory + user gate; REGRESSION → skip verify entirely
- Decision logic: "if any UC UNVERIFIED and user declines → user gate fires; do NOT
  write IntakeItem 'delivered'"
- Step 6 graph write: gated on aggregated PASS; UNVERIFIED UCs not stamped 'delivered';
  REGRESSION → delivery invalid
- Final report: per-UC dev status column; headline selection

### nacl-tl-release (HIGH)

**Problem:** Step 2 merged PRs once GitHub CI passed, without checking UC status.
Step 7 stamped `delivered_in_release` regardless of status. No edge cases for UNVERIFIED.

**Changes:**
- Step 2 pre-merge gate: per PR, looks up underlying UC status from graph or
  `.tl/status.json`; UNVERIFIED → halt + per-PR user gate; REGRESSION → exclude from
  merge, flag RELEASE INCOMPLETE — REGRESSION; `--yes` does NOT bypass UNVERIFIED gate
- Merge plan: UC status column added
- Step 7 graph stamp: gated on PASS; UNVERIFIED UCs excluded from standard stamp;
  stamped separately with delivery_note
- Edge cases: "PR merged but UC was UNVERIFIED" → halt BEFORE merge; documented explicitly

### nacl-tl-deploy (MEDIUM)

**Problem:** Step 1 identified deployment by finding CI run; did not check that code
came from verified tasks. Health failure (Step 3.7) ran SSH diagnostics and continued to
YouGile update (report-and-continue); did not halt pipeline.

**Changes:**
- Step 1.0 (new sub-step): pre-monitor gate reads task status by commit SHA from graph
  or status.json; UNVERIFIED → user gate; REGRESSION → HALT immediately
- Step 3.7 (health failure): now halts pipeline rather than report-and-continue; does
  NOT proceed to Step 4 success path on health failure
- Headlines added: DEPLOY COMPLETE / DEPLOY HALTED — REGRESSION /
  DEPLOY HALTED — {UNVERIFIED | BLOCKED | NO_INFRA | RUNNER_BROKEN}

### nacl-tl-reconcile (MEDIUM)

**Problem:** Phase 1 reconciled docs to match code without checking whether recent code
came from UNVERIFIED fixes. Health Score >= 80 check did not account for verification
status of recent work.

**Changes:**
- Phase 1 pre-flight unverified fix scan (new mandatory step): scans `.tl/status.json`,
  `git log`, and task chat for UNVERIFIED/BLOCKED recent fixes; surfaces to user;
  requires explicit acknowledgment "documenting unverified behavior is intentional"
  before proceeding
- Health Score adjustment: -5 per UNVERIFIED task found in status.json; adjusted score
  displayed alongside raw score; high score must reflect honest verification
- Phase 5 report: acknowledgments recorded; headline selection (RECONCILE COMPLETE /
  RECONCILE APPLIED — UNVERIFIED / RECONCILE HALTED — REGRESSION)

---

## Contract Sections

All seven skills now have a `## Contract` section placed after frontmatter and before
the first numbered step. Each section documents:
1. Inputs consumed (with vocabulary/format expected)
2. Outputs produced (headlines, graph writes, artifacts)
3. Downstream consumers
4. Contract change discipline (verbatim from 0.10.1)

---

## Migration Impact

**New graph property value:** `t.status = 'verified-pending'` is introduced for Task
nodes. Existing downstream Cypher queries that filter `WHERE t.status = 'done'` will
correctly exclude unverified tasks. Queries filtering `WHERE t.status <> 'failed'` will
now include 'verified-pending' and 'blocked' — review any such queries and decide
whether to include or exclude these states.

**Orchestrator reports gain status columns.** Batch reports from nacl-tl-conductor,
nacl-tl-full, and nacl-tl-deliver now show a `[PASS]` / `[UNVERIFIED]` / `[BLOCKED]` /
`[REGRESSION]` column per task. Human readers see verification status without needing
to read sub-skill output.

**`--deploy` no longer bypasses verification.** nacl-tl-ship `--deploy` previously
called the deploy script regardless of upstream status. After 0.12.0, `--deploy` is
subject to the same Step 1.0 gate as PR creation. Passing `--deploy` on an UNVERIFIED
task requires explicit user confirmation.

**Merge to main requires UC status check.** nacl-tl-release Step 2 now looks up UC
statuses before presenting the merge plan. UNVERIFIED UCs require per-PR confirmation
even when `--yes` is set.

**Health failure in nacl-tl-deploy now halts.** Previously the skill reported health
failure and continued to YouGile update. After 0.12.0, health failure stops the
pipeline. Users relying on the "continue despite health failure" behavior should switch
to explicit `--skip-health` if they need non-blocking health checks.

---

## Combined Narrative (Parts 1 + 2)

0.12.0 closes the TDD honesty gap end-to-end:

- **Part 1 (Wave 3):** Dev skills now capture a baseline before writing tests, verify
  RED genuinely fails, and compare postfix against baseline to confirm GREEN is real.
  They produce honest status (PASS / UNVERIFIED / BLOCKED / REGRESSION) instead of
  always claiming success.

- **Part 2 (Wave 4, this release):** Orchestrators now consume that honest status,
  propagate it through the pipeline, gate graph writes on PASS, and surface per-task
  status in every report. An unverified fix can no longer silently reach a production
  merge without at least one explicit user acknowledgment at each orchestration layer.

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual.

### Scenario 1 — conductor: batch with PASS + UNVERIFIED

**Setup:** Run `/nacl-tl-conductor --items UC001,UC002`. UC001 completes with
nacl-tl-full returning `FULL COMPLETE`. UC002 completes with nacl-tl-full returning
`FULL APPLIED — UNVERIFIED`.

**Expected behavior:**
1. UC001: committed; Neo4j `t.status = 'done'`
2. UC002: NOT committed; Neo4j `t.status = 'verified-pending'`; advisory logged
3. Phase 6 report shows per-task status column: UC001 `[PASS]`, UC002 `[UNVERIFIED]`
4. Status summary: 1 PASS, 1 UNVERIFIED
5. Headline: CONDUCTOR APPLIED — UNVERIFIED

**Failure condition:** UC002 committed or graph written as 'done'.

---

### Scenario 2 — full: wave with sub-skill returning UNVERIFIED

**Setup:** Run `/nacl-tl-full --task UC005`. nacl-tl-dev-be returns
`DEV-BE APPLIED — UNVERIFIED`.

**Expected behavior:**
1. STEP 1: `t.phase_be = 'ready_for_review'` written with unverified_reason
2. STEP 2 (review): approved, but `t.phase_review_be = 'ready_for_review'` (NOT 'approved')
3. Execution continues through remaining phases (UNVERIFIED propagates forward)
4. STEP 8: `t.status = 'verified-pending'` (NOT 'done')
5. WAVE_RESULT headline: FULL APPLIED — UNVERIFIED

**Failure condition:** `t.phase_review_be = 'approved'` written after UNVERIFIED dev.

---

### Scenario 3 — ship: `--deploy` on UNVERIFIED UC

**Setup:** Run `/nacl-tl-ship UC028 --deploy`. `.tl/status.json` for UC028 has
`status: 'verified-pending'`.

**Expected behavior:**
1. Step 1.0 reads status: UNVERIFIED
2. Skill halts: "Task dev status is UNVERIFIED. `--deploy` does not bypass verification.
   Confirm deploy? [yes/no] Default: no"
3. Without user confirmation → SHIP HALTED — UNVERIFIED; no PR created; no deploy
4. With user confirmation → proceeds; headline SHIP APPLIED — UNVERIFIED; PR body
   includes `**Verification status:** UNVERIFIED (user override)`

**Failure condition:** Skill proceeds to PR creation or deploy without confirmation.

---

### Scenario 4 — deliver: batch with one UNVERIFIED UC

**Setup:** Run `/nacl-tl-deliver`. `.tl/status.json` has UC028 as `done` (PASS) and
UC029 as `verified-pending` (UNVERIFIED).

**Expected behavior:**
1. Step 4.0: UC028 passes gate; UC029 shows advisory, user gate fires
2. If user declines UC029 verify: UC029 skipped; Step 4 result shows UC029 as
   "UNVERIFIED_DEV_SKIPPED"
3. Step 6 graph write: ITEM-001 (UC028) → 'delivered'; ITEM-002 (UC029) NOT written
4. Headline: DELIVER APPLIED — UNVERIFIED

**Failure condition:** ITEM-002 written as 'delivered' when UC029 is UNVERIFIED.

---

### Scenario 5 — release: PR with UNVERIFIED underlying UC

**Setup:** Run `/nacl-tl-release`. PR #47 has UC029 whose `t.status = 'verified-pending'`.

**Expected behavior:**
1. Step 2 pre-merge gate: discovers UC029 status = 'verified-pending'
2. Merge plan displayed: PR #47 shows `UC status: UNVERIFIED (graph: verified-pending) — USER GATE REQUIRED`
3. Global "Proceed?" gate fires; even if user says yes, PR #47 requires separate
   per-PR confirmation: "UC029 is UNVERIFIED — merge to main? [yes/no] Default: no"
4. If user declines: PR #47 excluded; RELEASE HALTED — UNVERIFIED
5. If user confirms: PR #47 merged with override note in `delivered_in_release`

**Failure condition:** PR #47 merged without separate per-PR UNVERIFIED confirmation.

---

### Scenario 6 — deploy: commit SHA from UNVERIFIED task

**Setup:** Run `/nacl-tl-deploy --staging`. The most recent commit on the branch
corresponds to a task with `t.status = 'verified-pending'` in the graph.

**Expected behavior:**
1. Step 1.0 pre-monitor gate: reads task status by commit SHA; finds 'verified-pending'
2. Halts: "Deploying code from task with UNVERIFIED dev status. Confirm? [yes/no]
   Default: no"
3. Without confirmation → DEPLOY HALTED — UNVERIFIED; no CI monitoring starts
4. With confirmation → proceeds; DEPLOY HALTED — UNVERIFIED in headline if health fails

**Failure condition:** Pipeline monitoring starts without confirmation when task is UNVERIFIED.

---

### Scenario 7 — reconcile: recent fix is UNVERIFIED

**Setup:** Run `/nacl-tl-reconcile`. `.tl/status.json` has one task with
`status: 'verified-pending'` modified in the last 7 days. Health Score from diagnose is 72.

**Expected behavior:**
1. Phase 1 pre-flight unverified scan: finds UNVERIFIED task
2. User prompted: "WARNING: Recent fix [task-id] has UNVERIFIED status. Documenting
   unverified behavior as canonical. Acknowledge? [yes/no]"
3. Health Score adjusted: 72 → 67 (−5 for one UNVERIFIED task); displayed as
   "Health Score: 72 → 67 (adjusted for 1 UNVERIFIED task)"
4. If user acknowledges: reconcile proceeds; headline RECONCILE APPLIED — UNVERIFIED;
   Phase 5 report records the acknowledgment explicitly
5. If user declines: skill stops; recommends fixing verification gap first

**Failure condition:** Reconcile proceeds without user acknowledgment of UNVERIFIED fix.
Health Score displayed as raw 72 without adjustment.

---

## Known Limitations

- The `## Contract` sections are documentation discipline, not runtime checks. There is
  no automated enforcement that orchestrators have been audited when sub-skill contracts
  change.
- The pre-monitor gate in nacl-tl-deploy relies on a graph query by commit SHA. If tasks
  were not written to the graph (e.g. non-graph-aware workflows), the gate falls back
  to "not found — proceed with warning". This is backward-compatible but loses the safety
  benefit for non-graph workflows.
- The UNVERIFIED user gate in nacl-tl-release requires separate per-PR confirmation even
  when `--yes` is set. This is intentional — `--yes` skips plan-level confirmations but
  not safety gates. Some automation scripts that pass `--yes` may need to be updated to
  handle the additional per-PR prompt.
- nacl-tl-reconcile's Health Score adjustment (-5 per UNVERIFIED task) is a heuristic.
  The exact weight may need tuning based on project size and UNVERIFIED task prevalence.
