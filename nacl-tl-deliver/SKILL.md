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
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
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
  }
}
```

**Always update after each step completes.** This enables resumption.

---

## Workflow: 5 Steps

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

1. Determine which UCs to verify:
   - If conductor-state.json exists → read completed UC list
   - If `--feature FR-001` → read FR's UC list from feature-request artifact
   - Fallback: verify all UCs found in `.tl/status.json` with status "done"

2. For each UC (or batch via `--all`):
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
       "UC029": "FAIL"
     }
   }
   ```

6. Decision:
   - If ALL UCs PASS → proceed to Step 5
   - If SOME UCs FAIL → report which failed, proceed to Step 5 for healthy UCs
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
   - Retry 3 times with 10s intervals
   - If 200 OK → deployment healthy
   - If still failing after 3 retries → report as unhealthy (but don't fail delivery)

4. YouGile: post deployment confirmation to task chat (if configured)

5. Update delivery-status.json: `deploy.status = "done"` (or `"unhealthy"`)

→ **Output:** health status, staging URL

---

## Final Report

```
═══════════════════════════════════════════════════════════════
                    DELIVERED TO STAGING
═══════════════════════════════════════════════════════════════

Branch: feature/FR-001-generation-controls

Ship:
  Commit: abc1234
  PR: #42 (https://github.com/org/repo/pull/42)
  Push: OK

CI:
  Status: passed (3m 12s)
  Run: https://github.com/org/repo/actions/runs/123

Verification:
  UC028: ✅ PASS (code analysis + E2E)
  UC029: ✅ PASS (code analysis only)

Deploy:
  Environment: staging
  URL: https://staging.example.com
  Health: 200 OK

YouGile: tasks moved to ToRelease

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

Ship: ✅ pushed (abc1234), PR #42
CI: ✅ passed (3m 12s)

Verification:
  UC028: ✅ PASS
  UC029: ❌ FAIL — E2E test "format selection" failed
         See .tl/reports/verify-UC029-*/report.html

Deploy: ✅ staging healthy

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

---

## Relationship to Other Skills

```
nacl-tl-conductor → calls /nacl-tl-deliver after all development complete
nacl-tl-deliver internally:
  Step 2: uses git + gh CLI directly (NOT /nacl-tl-ship — to avoid double test/build)
  Step 4: delegates to /nacl-tl-verify (which runs /nacl-tl-verify-code + /nacl-tl-qa)
  Step 5: uses curl for health check (NOT /nacl-tl-deploy — simpler, no pipeline monitoring needed)
```

**Why not use nacl-tl-ship?** nacl-tl-ship runs tests, build, commits, and pushes. But nacl-tl-deliver receives code that's already committed (by nacl-tl-conductor). Running nacl-tl-ship would duplicate test/build and try to commit when there's nothing to commit. nacl-tl-deliver only needs to push and create PR.

**Why not use nacl-tl-deploy?** nacl-tl-deploy is designed to monitor a CI/CD pipeline triggered by a push and then do health checks. nacl-tl-deliver already monitors CI (Step 3) and does health checks (Step 5). Using nacl-tl-deploy would add unnecessary indirection.

---

## References

- `config.yaml` → git strategy, deploy settings, yougile
- `.tl/conductor-state.json` → which UCs to verify (from conductor)
- `.tl/delivery-status.json` → delivery state (created by this skill)
- `.tl/feature-requests/FR-NNN.md` → feature scope
- `.tl/status.json` → UC completion status
