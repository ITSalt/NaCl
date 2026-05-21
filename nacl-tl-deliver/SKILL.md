---
name: nacl-tl-deliver
model: sonnet
effort: low
description: |
  Delivery orchestrator: push feature branch, wait for CI, verify on staging, health check.
  Chains nacl-tl-ship, nacl-tl-verify, and nacl-tl-deploy into a single continuous pipeline.
  Use when: deliver to staging, push and verify, ship feature branch,
  or the user says "/nacl-tl-deliver".
---

## Contract

**Inputs this skill consumes:**
- Per-UC dev statuses: Neo4j graph (primary) / .tl/status.json (fallback when Neo4j unavailable)
- /nacl-tl-verify results per UC
- /nacl-tl-deploy result for the staging environment

**Outputs this skill produces:**
- Aggregated delivery status; per-UC table
- Headline one of: DELIVER COMPLETE / DELIVER APPLIED — {SUFFIX} /
  DELIVER INCOMPLETE — REGRESSION
- IntakeItem `delivered` graph write gated on aggregated PASS

**Downstream consumers of this output:**
- nacl-tl-deploy
- Human user

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

# TeamLead Deliver — Feature Branch Delivery Pipeline

## Your Role

You are the **delivery specialist**. You take a feature branch with committed code and deliver it to staging: push, wait for CI, verify, health check. You bridge the gap between "code committed locally" and "verified on staging."

## Key Principle

```
Push → CI → Verify → Health Check
Each step must pass before the next begins.
Fail fast with clear diagnostics.
```

---

## Invocation

```
/nacl-tl-deliver                          # deliver current branch
/nacl-tl-deliver --branch feature/FR-001  # deliver specific branch
/nacl-tl-deliver --feature FR-001         # deliver by feature request ID
/nacl-tl-deliver --skip-verify            # push + CI only, no staging verification
/nacl-tl-deliver --skip-deploy            # push + CI + verify, no health check
/nacl-tl-deliver --env staging            # target environment (default: staging)
/nacl-tl-deliver --env production         # target production (extra safety checks)
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Build command | `modules.[name].build_cmd` > workspace `package.json` `scripts.build`. **No `npm run build` fallback.** Missing → `DELIVER HALTED — NO_INFRA (scripts.build undeclared)` (P2). |
| Test command | `modules.[name].test_cmd` > workspace `package.json` `scripts.test`. **No `npm test` fallback.** Missing → `DELIVER HALTED — NO_INFRA (scripts.test undeclared)` (P2). |
| Staging URL | `deploy.staging.url` > no default |
| Health endpoint | `deploy.staging.health_endpoint` > fallback `/api/health` |
| CI platform | `deploy.ci_platform` > detect from `.github/workflows/` |
| YouGile columns | `yougile.columns.*` |

If config.yaml missing → use fallback defaults. If YouGile missing → skip task moves.

---

## State File: `.tl/delivery-status.json`

Persists delivery progress for resumption:

```json
{
  "branch": "feature/FR-001-generation-controls",
  "env": "staging",
  "started": "2026-04-04T12:00:00Z",
  "ship": {
    "status": "done",
    "commit": "abc1234",
    "pr": "#42",
    "prUrl": "https://github.com/org/repo/pull/42"
  },
  "ci": {
    "status": "done",
    "runUrl": "https://github.com/org/repo/actions/runs/123",
    "duration": "3m 12s"
  },
  "verify": {
    "status": "in_progress",
    "ucs": ["UC028", "UC029"]
  },
  "deploy": {
    "status": "pending"
  },
  "graph": {
    "status": "pending"
  }
}
```

**Always update after each step completes.** This enables resumption.

---

## Workflow: 6 Steps

### Step 1: PRE-CHECK

1. Verify current branch:
   ```bash
   current=$(git rev-parse --abbrev-ref HEAD)
   ```
   - If `--branch` provided and current != branch → `git checkout [branch]`
   - If no branch specified → use current branch
   - Safety: refuse to deliver from `main`/`master` directly (suggest using CI/CD instead)

2. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```
   - If uncommitted changes exist → **STOP**: "Uncommitted changes detected. Run /nacl-tl-conductor or commit manually first."

3. Check for unpushed commits:
   ```bash
   git log origin/[branch]..HEAD --oneline 2>/dev/null
   ```
   - If branch doesn't exist on origin → that's OK, we'll push it
   - If branch exists and we have new commits → will push them

4. Run tests (all modules):
   ```bash
   cd [module_path] && [test_cmd]
   ```
   - If tests FAIL → **STOP**: report failures, suggest fixing before delivery

5. Run build (all modules):
   ```bash
   cd [module_path] && [build_cmd]
   ```
   - If build FAILS → **STOP**: report errors

6. Check for existing delivery-status.json:
   - If exists and branch matches → **RESUME MODE** (skip to incomplete step)

7. Write initial `.tl/delivery-status.json`

→ **If any pre-check fails:** stop immediately with clear error message and suggested fix.

---

### Step 2: SHIP (push + PR)

1. Push to origin:
   ```bash
   git push -u origin [branch]
   ```
   - If push rejected (behind remote):
     ```bash
     git pull --rebase origin [branch]
     ```
     Then retry push. If merge conflict → **STOP**, report to user.

2. Create PR if feature-branch strategy and PR doesn't exist:
   ```bash
   # Check if PR already exists
   gh pr list --head [branch] --state open
   ```
   - If no PR:
     ```bash
     gh pr create \
       --title "[branch-title]" \
       --body "$(cat <<'EOF'
     ## Summary
     [Auto-generated from git log: list commits on branch]

     ## Delivery
     Automated delivery via /nacl-tl-deliver

     Generated with Claude Code
     EOF
     )" \
       --base [base_branch]
     ```
   - If PR exists: note its URL

3. YouGile: post ship notification to task chat (if configured)

4. Update delivery-status.json: `ship.status = "done"`, record commit hash, PR URL

→ **Output:** commit hash, branch name, PR URL (if created)

---

### Step 3: WAIT FOR CI

1. Identify the CI run triggered by our push:
   ```bash
   gh run list --branch [branch] --limit 5 --json databaseId,status,conclusion,name,createdAt
   ```
   - Find the most recent run created after our push
   - If no run found within 30s → check if CI is configured (`.github/workflows/`)
   - If no CI configured → skip this step, proceed to verify

2. Monitor CI pipeline:
   ```bash
   gh run watch [run_id] --exit-status
   ```
   - Timeout: 10 minutes (configurable via `deploy.ci_timeout`)
   - Poll interval: 15 seconds

3. If CI PASSES:
   - Update delivery-status.json: `ci.status = "done"`, record run URL, duration
   - Continue to Step 4

4. If CI FAILS:
   - Read logs:
     ```bash
     gh run view [run_id] --log-failed | tail -50
     ```
   - Update delivery-status.json: `ci.status = "failed"`, record error
   - **STOP**: report CI failure with log excerpt, suggest fix

→ **Output:** CI status, run URL, duration

---

### Step 4: VERIFY (skip if `--skip-verify`)

**`--skip-verify` semantics (P4 — skip ⇒ unverified, never PASS):**

When `--skip-verify` is supplied, this skill:
1. **Sets the aggregated headline to** `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)`.
   The PASS-headline path is unreachable; the skill cannot emit `DELIVER COMPLETE`
   under this flag.
2. **Refuses to stamp IntakeItems** as `delivered` in Step 6 — no `i.status = 'delivered'`
   write occurs for any UC in this delivery, regardless of upstream dev status.
3. **Writes the skip reason to the graph** for every Task node in scope:
   ```cypher
   MATCH (t:Task {id: $ucId})
   SET t.verification_skip_reason = 'deliver --skip-verify',
       t.verification_skip_at = datetime(),
       t.verification_evidence = 'no-test'  // explicit user override at delivery
   ```
   Use `mcp__neo4j__write-cypher`. Failure to write is logged as a warning but
   does not change the headline. The `verification_evidence = 'no-test'` write
   is mandatory under `--skip-verify`: the operator has explicitly accepted
   shipping without a verified RED→GREEN seam, so the release skill must
   record that decision in its Evidence-level column (see
   `nacl-core/SKILL.md` § Task.verification_evidence).
4. **Records the skip flag in the audit trail** — `delivery-status.json` gains
   `"verify": {"status": "skipped", "reason": "--skip-verify", "skipped_ucs": [...]}`,
   and the same line appears in the final report.
5. Skips all Step 4 sub-steps (0–6) below. Step 5 (deploy health) still runs.
   Step 6 honours rule (2) above: no IntakeItem stamping under skip.

A separate explicit operator override is required to move any IntakeItem to
`delivered` after a `--skip-verify` run. That override is not part of this
skill — it must be a user-initiated reconcile or follow-up `/nacl-tl-deliver`
without `--skip-verify`.

When `--skip-verify` is NOT supplied, Step 4 proceeds as below:

0. **Pre-verify dev status check:**

   Before invoking /nacl-tl-verify for any UC, resolve its dev status using
   the following source-of-truth hierarchy:

   **Primary source — Neo4j graph:**
   Query each UC's Task node:
   ```cypher
   MATCH (t:Task {id: $ucId})
   RETURN t.status AS status
   ```
   Use `mcp__neo4j__read-cypher`. If the Task node exists, its `status` field
   is authoritative and overrides any value in `.tl/status.json`.

   **Fallback — `.tl/status.json`:**
   Use only when Neo4j is unavailable (connection error / timeout). Log:
   ```
   WARN: Neo4j unavailable — falling back to .tl/status.json for UC### dev status.
         Graph may be ahead of file; results have reduced confidence.
   ```

   The graph always wins when both sources disagree. Example:
   graph says `blocked` → status is BLOCKED even if `.tl/status.json` says `done`.

   | UC dev status | Action before verifying |
   |---------------|------------------------|
   | PASS (done) | Proceed with /nacl-tl-verify normally |
   | UNVERIFIED (verified-pending) | Post advisory: "UC### dev status UNVERIFIED. /nacl-tl-verify will run but results have reduced confidence. Proceed? [yes/no]". If yes → run verify; if no → skip UC (mark as skipped in delivery) |
   | BLOCKED (blocked) | Same as UNVERIFIED: advisory + user gate |
   | Not found / old-style "done" | Proceed (backward-compat) |
   | REGRESSION (failed) | DO NOT run /nacl-tl-verify. Log: "UC### skipped — REGRESSION status" |

1. Determine which UCs to verify:
   - If conductor-state.json exists → read completed UC list
   - If `--feature FR-001` → read FR's UC list from feature-request artifact
   - Fallback: verify all UCs found in `.tl/status.json` with status "done"
     or "verified-pending" (with user gate for the latter)

2. For each UC that passes the pre-verify gate (Step 4.0):
   Launch sub-agent (Task tool):
   ```
   Execute /nacl-tl-verify UC###
   ```
   
   nacl-tl-verify internally runs:
   - `/nacl-tl-verify-code` (static analysis, fast)
   - `/nacl-tl-qa` (E2E on staging, only if code analysis says PASS_NEEDS_E2E)

3. Collect results:
   - PASS: UC verified on staging
   - FAIL: UC has issues (code analysis or E2E failure)

4. YouGile transitions (handled by nacl-tl-verify):
   - PASS: DevDone → Testing → ToRelease
   - FAIL: DevDone → Testing → Reopened

5. Update delivery-status.json:
   ```json
   "verify": {
     "status": "done",
     "results": {
       "UC028": "PASS",
       "UC029": "FAIL",
       "UC030": "UNVERIFIED_DEV_SKIPPED"
     }
   }
   ```

6. Decision:
   - If ALL UCs PASS → proceed to Step 5
   - If SOME UCs FAIL → report which failed; **exclude FAIL UCs from the delivery
     artifact** (they are not passed to Step 5, not stamped in Step 6, and their
     IntakeItems are NOT written `delivered`). Proceed to Step 5 for PASS UCs only.
     This exclusion is symmetric with the IntakeItem stamping rule in Step 6:
     only PASS UCs ever receive the `delivered` stamp — FAIL UCs are explicitly
     omitted, not silently skipped.
   - If ANY UC is UNVERIFIED (dev status) and user declined verify → **USER GATE**:
     "X UCs have UNVERIFIED dev status. Deliver partial set or halt?"
     - If user confirms partial delivery → proceed to Step 5 for PASS UCs only
     - If user halts → DELIVER APPLIED — UNVERIFIED; do NOT write IntakeItem 'delivered'
   - If ALL UCs FAIL → **STOP**, recommend /nacl-tl-reopened

→ **Output:** verification report per UC

---

### Step 5: DEPLOY HEALTH CHECK (skip if `--skip-deploy`)

1. Read staging URL from config:
   ```
   url = config.yaml → deploy.staging.url
   health = config.yaml → deploy.staging.health_endpoint (default: /api/health)
   ```
   - If no staging URL configured → skip health check, report "no staging URL configured"

2. Wait for deployment propagation (15 seconds)

3. Health check with retries:
   ```bash
   curl -sf "[url][health]" --max-time 10
   ```
   - Retry 3 times with 10s intervals.
   - If 200 OK → deployment healthy. Continue.
   - If still failing after 3 retries → **HALT by default** with
     `DELIVER HALTED — UNVERIFIED (health failed)`. Do NOT stamp IntakeItems
     as delivered. The operator may re-run `/nacl-tl-deliver` after fixing
     the deploy or apply an explicit override (see step 3a).

3a. **Operator health-failure override (interactive):**
    If the operator chooses to acknowledge the health failure and proceed
    anyway (e.g. known transient infra issue), the headline downgrades to:
    ```
    DELIVER APPLIED — UNVERIFIED (health failed, operator override)
    ```
    IntakeItem stamping is still refused (Step 6 honours the same rule as
    `--skip-verify`). The override and reason are written to
    `delivery-status.json`:
    ```json
    "deploy": {
      "status": "unhealthy_override",
      "operator_override_reason": "<text>",
      "override_at": "<iso8601>"
    }
    ```
    and to the graph for each Task in scope:
    ```cypher
    MATCH (t:Task {id: $ucId})
    SET t.verification_skip_reason = 'deliver health failed, operator override',
        t.verification_skip_at = datetime()
    ```

4. YouGile: post deployment confirmation to task chat (if configured)

5. Update delivery-status.json: `deploy.status = "done"`, `"unhealthy_override"`,
   or HALT before reaching this step on default-no-override path

→ **Output:** health status, staging URL

---

### Step 6: UPDATE INTAKEITEM GRAPH STATE

After Step 5 completes, update the Neo4j graph for `IntakeItem` nodes.
This step is **gated on aggregated PASS status**:

- If aggregated delivery status is PASS → write `i.status = 'delivered'`
- If aggregated status is UNVERIFIED → DO NOT write 'delivered'; log warning:
  "IntakeItem not marked delivered — delivery contains UNVERIFIED UCs"
- If aggregated status is BLOCKED (with override) → write 'delivered' but
  add `i.delivery_note = 'shipped with BLOCKED status, user override'`
- If aggregated status is REGRESSION → DO NOT write; delivery is invalid

For partially-verified batches (PASS UCs mixed with UNVERIFIED UCs), only
stamp the IntakeItems corresponding to PASS UCs as 'delivered'. Leave
UNVERIFIED-UC IntakeItems untouched.

After verifying aggregated status, update the Neo4j graph so
each `IntakeItem` associated with PASS UCs reflects its delivered status.

Tool used: `mcp__neo4j__write-cypher`

**Identify IntakeItem IDs:**
- If delivered via `--feature FR-NNN` → read `.tl/feature-requests/FR-NNN.md` for
  `intakeItemIds` listed in the artifact.
- If delivered via `--branch feature/...` → read `.tl/conductor-state.json` for
  the `intakeItemIds` array (populated by `nacl-tl-conductor`).
- If neither source provides IDs → skip with a warning and set `graph.status = "skipped"`.

**For each `intakeItemId`, run:**

```cypher
MATCH (i:IntakeItem {id: $intakeItemId})
SET i.status = 'delivered',
    i.delivered_at = date(),
    i.delivered_pr = $prNumber
RETURN i;
```

Parameters:
- `$intakeItemId` — ID string from the list above (e.g. `"FAM-58"`)
- `$prNumber` — PR number string from `delivery-status.json → ship.pr` (e.g. `"#42"`)

**Failure tolerance:** If Neo4j is unavailable or the Cypher query errors for any reason,
log a warning and continue — do NOT fail the delivery:
```
WARN: Could not update IntakeItem [id] in Neo4j (connection error or node not found).
      Graph state may be stale — reconcile later with /nacl-tl-diagnose.
```

Update `delivery-status.json`:
```json
"graph": {
  "status": "done",
  "updated": ["FAM-58"],
  "skipped": []
}
```

Use `"skipped"` for IDs that were not found or errored. Use `"warn"` as status if any
item could not be updated.

→ **Output:** list of IntakeItem IDs updated, list skipped

---

## Final Report

The `Dev status` and `Verification` sections form a per-UC status table —
each UC appears on its own row with the upstream dev status alongside the
verification result. The aggregate headline (DELIVER COMPLETE / DELIVER
APPLIED — UNVERIFIED / DELIVER INCOMPLETE — REGRESSION) is selected from
the per-task statuses in those tables.

```
═══════════════════════════════════════════════════════════════
                    DELIVER COMPLETE
═══════════════════════════════════════════════════════════════

Branch: feature/FR-001-generation-controls

Ship:
  Commit: abc1234
  PR: #42 (https://github.com/org/repo/pull/42)
  Push: OK

CI:
  Status: passed (3m 12s)
  Run: https://github.com/org/repo/actions/runs/123

Dev status (pre-verify gate):
  UC028: PASS (dev verified before delivery)
  UC029: PASS (dev verified before delivery)

Verification:
  UC028: PASS (code analysis + E2E)    [Dev: PASS]
  UC029: PASS (code analysis only)     [Dev: PASS]

Deploy:
  Environment: staging
  URL: https://staging.example.com
  Health: 200 OK

Graph:
  IntakeItems updated: FAM-58 → delivered (gated on PASS)

YouGile: tasks moved to ToRelease

Headline selection:
  DELIVER COMPLETE
    — all UCs PASS, --skip-verify NOT used, health check OK.
  DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)
    — verification skipped via flag; no IntakeItem stamped delivered;
      Task.verification_skip_reason written to graph.
  DELIVER APPLIED — UNVERIFIED (health failed, operator override)
    — health check failed and operator chose to proceed; no IntakeItem
      stamped delivered; skip reason written to graph.
  DELIVER APPLIED — UNVERIFIED
    — any UC has UNVERIFIED dev status (general non-skip case).
  DELIVER HALTED — UNVERIFIED (health failed)
    — health check failed and no operator override was given.
  DELIVER HALTED — NO_INFRA (scripts.{test|build} undeclared)
    — declared workspace command missing; no fallback (P2).
  DELIVER INCOMPLETE — REGRESSION
    — any UC has REGRESSION status.

Next:
  /nacl-tl-release          — when ready for production
  /nacl-tl-reopened         — if verification issues found
═══════════════════════════════════════════════════════════════
```

If partial failure:

```
═══════════════════════════════════════════════════════════════
                  DELIVERED (PARTIAL)
═══════════════════════════════════════════════════════════════

Branch: feature/FR-001-generation-controls

Ship: pushed (abc1234), PR #42
CI: passed (3m 12s)

Verification:
  UC028: PASS
  UC029: FAIL — E2E test "format selection" failed
         See .tl/reports/verify-UC029-*/report.html

Deploy: staging healthy

Graph:
  FAM-58: updated (delivered)
  WARN: Neo4j unavailable for FAM-59 — reconcile later

YouGile:
  UC028: → ToRelease
  UC029: → Reopened

Next:
  /nacl-tl-reopened UC029   — fix and re-verify
  /nacl-tl-release          — release verified UCs only
═══════════════════════════════════════════════════════════════
```

---

## Resumption Logic

On start, if `.tl/delivery-status.json` exists and branch matches:

1. Read status file
2. Find first incomplete step:
   ```
   ship.status != "done"    → resume from Step 2
   ci.status != "done"      → resume from Step 3
   verify.status != "done"  → resume from Step 4
   deploy.status != "done"  → resume from Step 5
   graph.status != "done"   → resume from Step 6
   all done                 → show report
   ```

3. Report resume point:
   ```
   Resuming delivery for feature/FR-001.
   Ship: done (abc1234, PR #42)
   CI: done (passed)
   Resuming from: Verification
   ```

---

## Production Delivery (`--env production`)

When `--env production` is specified, additional safety checks:

1. **Pre-check:** verify branch has been merged to main (or is main)
   ```bash
   git log main --oneline | grep [commit_hash]
   ```
   - If commit not on main → **STOP**: "Code must be merged to main before production deploy"

2. **Pre-check:** verify all UCs passed verification on staging
   - Read delivery-status.json for staging results
   - If any UC has verify.status = "fail" → **STOP**: "Fix staging issues first"

3. CI step watches production pipeline (not staging)

4. Health check uses `deploy.production.url` + `deploy.production.health_endpoint`

5. YouGile: move tasks from ToRelease → Done

---

## Edge Cases

### No CI configured
If no `.github/workflows/` found and no `deploy.ci_platform` in config:
- Skip Step 3 entirely
- Log: "No CI pipeline detected, skipping CI check"
- Proceed to verification

### PR already exists
If `gh pr list` finds an existing open PR for this branch:
- Use existing PR (don't create duplicate)
- Note PR URL in report

### Branch already pushed (no new commits)
If `git log origin/[branch]..HEAD` is empty:
- Skip push (already up to date)
- Check if CI ran on latest push
- Continue to verify

### Staging URL not configured
If `deploy.staging.url` not in config.yaml:
- Skip health check (Step 5)
- Warn: "No staging URL configured. Skipping health check."

### Neo4j unavailable (Step 6)
- Log warning per item that could not be updated
- Set `graph.status = "warn"` in delivery-status.json
- Continue — delivery result is valid regardless of graph state

---

## Relationship to Other Skills

```
nacl-tl-conductor → calls /nacl-tl-deliver after all development complete
nacl-tl-deliver internally:
  Step 2: uses git + gh CLI directly (NOT /nacl-tl-ship — to avoid double test/build)
  Step 4: delegates to /nacl-tl-verify (which runs /nacl-tl-verify-code + /nacl-tl-qa)
  Step 5: uses curl for health check (NOT /nacl-tl-deploy — simpler, no pipeline monitoring needed)
  Step 6: uses mcp__neo4j__write-cypher to update IntakeItem nodes
```

**Why not use nacl-tl-ship?** nacl-tl-ship runs tests, build, commits, and pushes. But nacl-tl-deliver receives code that's already committed (by nacl-tl-conductor). Running nacl-tl-ship would duplicate test/build and try to commit when there's nothing to commit. nacl-tl-deliver only needs to push and create PR.

**Why not use nacl-tl-deploy?** nacl-tl-deploy is designed to monitor a CI/CD pipeline triggered by a push and then do health checks. nacl-tl-deliver already monitors CI (Step 3) and does health checks (Step 5). Using nacl-tl-deploy would add unnecessary indirection.

---

## References

- `config.yaml` → git strategy, deploy settings, yougile
- `.tl/conductor-state.json` → which UCs to verify (from conductor); also source of intakeItemIds
- `.tl/delivery-status.json` → delivery state (created by this skill)
- `.tl/feature-requests/FR-NNN.md` → feature scope; also source of intakeItemIds
- `.tl/status.json` → UC completion status
- `mcp__neo4j__write-cypher` → updates IntakeItem nodes in Neo4j (Step 6)
