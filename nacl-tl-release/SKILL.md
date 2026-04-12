---
name: nacl-tl-release
model: sonnet
effort: low
description: |
  Full release pipeline: merge verified PRs to main, wait for production CI,
  health check, version bump, git tag, changelog, GitHub release, YouGile notification.
  Use when: create release, bump version, merge and release, generate release notes,
  tag version, or the user says "/nacl-tl-release".
---

# TeamLead Release — Merge + Deploy + Version + Notify

## Your Role

You execute the full release pipeline: merge verified feature branch PRs into main, verify production deployment, bump version, create git tag, aggregate changelog into release notes, and notify stakeholders via YouGile.

## Key Principle

```
Release = Merge PRs + Verify Deploy + Tag Version + Notify.
With feature-branch strategy, PRs must be merged before tagging.
With direct strategy, merge steps are skipped (code already on main).
Version follows SemVer. Changelog comes from .tl/changelog.md.
```

---

## Invocation

```
/nacl-tl-release                       # full release: merge PRs + deploy verify + version + tag
/nacl-tl-release --minor               # force minor version bump
/nacl-tl-release --major               # force major version bump
/nacl-tl-release --patch               # force patch version bump
/nacl-tl-release --skip-merge          # skip merge + deploy steps (tag only, old behavior)
/nacl-tl-release --dry-run             # show what would be merged + version bump, no action
/nacl-tl-release --pr 42,45            # merge specific PRs (skip discovery)
/nacl-tl-release --yes                 # skip user confirmation gates
```

### Configuration Resolution

**IMPORTANT:** Read `config.yaml` first for all settings. Fall back to defaults if missing.

| Data | Source priority (check in order, use first found) |
|------|--------------------------------------------------|
| Git strategy | `git.strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > fallback `"main"` |
| Merge method | `git.merge_method` > fallback `"squash"` |
| Production URL | `deploy.production.url` > no default |
| Health endpoint | `deploy.production.health_endpoint` > fallback `"/api/health"` |
| CI timeout | `deploy.production.ci_timeout` > fallback `600` (seconds) |
| CI platform | `deploy.ci_platform` > detect from `.github/workflows/` |
| YouGile to_release column | `yougile.columns.to_release` |
| YouGile done column | `yougile.columns.done` |

If config.yaml missing → use all fallback defaults. If YouGile missing → skip task discovery and moves.

---

## State File: `.tl/release-status.json`

Persists release progress for resumption:

```json
{
  "started": "2026-04-11T14:00:00Z",
  "prs": [
    { "number": 42, "title": "feat: UC-028 Funnel event tracking", "status": "merged" },
    { "number": 45, "title": "feat: UC-029 Scene prompt display", "status": "pending" }
  ],
  "merge": { "status": "in_progress", "merged_count": 1, "total": 2 },
  "ci": { "status": "pending" },
  "health": { "status": "pending" },
  "version": { "status": "pending", "bump": null, "value": null },
  "tag": { "status": "pending" },
  "release": { "status": "pending" },
  "yougile": { "status": "pending" }
}
```

**Always update after each step completes.** This enables resumption.

---

## Workflow: 8 Steps

### Step 0: PRE-CHECK

1. Read `config.yaml` → resolve all settings (see table above)

2. If `--skip-merge` OR `git.strategy == "direct"`:
   - Skip Steps 1-3 entirely → jump to Step 4

3. Check for existing `.tl/release-status.json`:
   - If exists → **RESUME MODE** (skip to incomplete step)

4. Ensure we're on the base branch or can switch to it:
   ```bash
   git fetch origin {main_branch}
   ```

---

### Step 1: COLLECT RELEASE CANDIDATES

Find open PRs targeting `{main_branch}` that are ready for release.

**Source A — YouGile (if configured):**
Query tasks in `yougile.columns.to_release`. For each task, extract the PR URL from the task chat (posted by `nacl-tl-ship` / `nacl-tl-deliver`).

**Source B — GitHub (fallback or supplemental):**
```bash
gh pr list --base {main_branch} --state open --json number,title,headRefName,mergeable,reviews,statusCheckRollup
```
Filter to PRs that are:
- Targeting `{main_branch}`
- All CI checks passing (or no CI configured)
- At least one approving review OR authored by automation

**If `--pr 42,45` provided:** skip discovery, use those specific PRs:
```bash
gh pr view 42 --json number,title,headRefName,mergeable,reviews,statusCheckRollup
gh pr view 45 --json number,title,headRefName,mergeable,reviews,statusCheckRollup
```

**If no PRs found:** skip Steps 1-3, proceed to Step 4 (tag-only mode — code was merged manually or via direct strategy).

Write initial `.tl/release-status.json` with discovered PRs.

---

### Step 2: MERGE TO MAIN (USER GATE)

Present the merge plan:

```
===============================================
  RELEASE — MERGE PLAN
===============================================

PRs to merge into {main_branch}:

  #42  feat: UC-028 Funnel event tracking     (feature/UC028)
       CI: passed | Reviews: 1 approved | Conflicts: none

  #45  feat: UC-029 Scene prompt display       (feature/UC029)
       CI: passed | Reviews: 1 approved | Conflicts: none

Merge method: squash (from config.yaml)
Target: {main_branch}

Proceed with merge? [yes/no]
===============================================
```

**Wait for user confirmation.** Skip if `--yes`.

For each PR, **sequentially** (order matters — later PRs may conflict after earlier merges):

```bash
gh pr merge {pr_number} --{merge_method} --delete-branch
```

Where `{merge_method}` is one of: `--squash`, `--merge`, `--rebase` (from `git.merge_method`, default: `squash`).

After each merge:
- Update `release-status.json`: mark PR as `"merged"`
- Check next PR's merge status:
  ```bash
  gh pr view {next_pr_number} --json mergeable
  ```
  If `mergeable == "CONFLICTING"` → **STOP**:
  ```
  CONFLICT: PR #45 has merge conflicts after merging #42.
  Resolve conflicts on feature/UC029, push, wait for CI, then re-run /nacl-tl-release.

  Already merged: #42
  Remaining: #45
  ```

After all PRs merged, update local main:
```bash
git checkout {main_branch}
git pull origin {main_branch}
```

---

### Step 3: VERIFY PRODUCTION DEPLOYMENT

After merge to main, the CI/CD pipeline triggers (per `deploy.production.trigger`).

**3a. Wait for CI:**

```bash
# Find the CI run triggered by the merge
gh run list --branch {main_branch} --limit 5 --json databaseId,status,conclusion,createdAt
```

Find the most recent run created after the merge. Watch it:
```bash
gh run watch {run_id} --exit-status
```

Timeout: `deploy.production.ci_timeout` (default 600 seconds / 10 minutes).

If no CI run found within 30 seconds → check if CI is configured:
- If no `.github/workflows/` → skip CI wait, warn "No CI pipeline detected"
- If CI exists but no run → retry for 60s, then warn and continue

If CI **FAILS**:
```bash
gh run view {run_id} --log-failed | tail -50
```
**STOP** with error:
```
CI FAILED after merge to {main_branch}.
Run: {run_url}

PRs already merged: #42, #45
These commits are on {main_branch}. Fix the issue and re-run /nacl-tl-release --skip-merge.
```
Do NOT proceed to tagging.

**3b. Health check (if `deploy.production.url` configured):**

Wait 15 seconds for deployment propagation, then:
```bash
curl -sf "{production_url}{health_endpoint}" --max-time 10
```
Retry 3 times with 10-second intervals.

If health check fails:
- Warn but do NOT block release (deploy may be slow)
- Report: "Health check failed. Verify production manually before announcing release."

If no `deploy.production.url` configured → skip health check, warn "No production URL configured, skipping health check."

---

### Step 4: DETERMINE VERSION BUMP

Read `.tl/changelog.md` since last git tag and classify changes:
- **major:** Breaking changes, API incompatibilities, major rewrites
- **minor:** New features, new endpoints, new UCs (default for features)
- **patch:** Bug fixes, performance improvements, doc updates

```bash
# Get current version
git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"

# Get changes since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Apply SemVer: `MAJOR.MINOR.PATCH`

If `--major`, `--minor`, or `--patch` flag provided → use forced bump.

### Step 5: AGGREGATE CHANGELOG

Read `.tl/changelog.md` entries since last tag. Group by type:

```markdown
## v1.3.0 — 2026-03-27

### Features
- UC-028: Funnel event tracking (POST /api/analytics/event)
- UC-029: Funnel dashboard for admin panel

### Bug Fixes
- Fix: robust sessionId resolution on loading page
- Fix: sync Dexie store before navigation

### Infrastructure
- TECH-020: @nivo charting library integration
```

### Step 6: CREATE GIT TAG

```bash
git tag -a v1.3.0 -m "Release v1.3.0 — Analytics Funnel Dashboard"
git push origin v1.3.0
```

### Step 7: CREATE GITHUB RELEASE (optional)

Create a GitHub release using `gh` CLI:

```bash
gh release create v1.3.0 \
  --title "v1.3.0 — Analytics Funnel Dashboard" \
  --notes "$(cat <<'EOF'
## Features
- UC-028: Funnel event tracking
- UC-029: Admin funnel dashboard

## Bug Fixes
- Session ID resolution
- Dexie store sync

Full changelog: .tl/changelog.md
EOF
)"
```

If `deploy.production.url` is set in config.yaml, include it in the release notes body.

### Step 8: YOUGILE NOTIFICATION

If YouGile configured:

1. Post release notes to the board (or a dedicated channel task):
   ```
   Release v1.3.0 — Analytics Funnel Dashboard

   Features:
   - Funnel event tracking (UC-028)
   - Admin dashboard (UC-029)

   Bug Fixes:
   - Session ID resolution
   - Dexie store sync

   Merged PRs: #42, #45
   Deployed: https://example.com
   Tag: v1.3.0
   ```

2. Move all feature tasks from ToRelease to Done (if not already)

3. Close parent UserRequest cards (if all subtasks are Done)

---

## Resumption Logic

On start, if `.tl/release-status.json` exists:

1. Read status file
2. Find first incomplete step:
   ```
   merge.status != "done"     → resume from Step 2 (skip already-merged PRs)
   ci.status != "done"        → resume from Step 3
   health.status != "done"    → resume from Step 3b
   version.status != "done"   → resume from Step 4
   tag.status != "done"       → resume from Step 6
   release.status != "done"   → resume from Step 7
   yougile.status != "done"   → resume from Step 8
   all done                   → show report
   ```

3. Report resume point:
   ```
   Resuming release.
   Merge: done (2 PRs merged)
   CI: done (passed)
   Resuming from: Version bump
   ```

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| `git.strategy == "direct"` | Skip Steps 1-3 (no PRs to merge) |
| `--skip-merge` flag | Skip Steps 1-3 (backward compat, tag-only) |
| No PRs found in ToRelease or GitHub | Skip Steps 1-3, proceed to version/tag |
| One PR has merge conflicts | Stop at that PR, report which merged / which remain |
| CI fails after merge | Stop before tagging, report. User fixes on main or reverts |
| No CI configured | Skip CI wait, proceed to health check |
| No production URL configured | Skip health check, warn |
| No changes since last tag | Report "nothing to release" |
| Single PR release | Same flow, one PR in list |
| `--dry-run` flag | Show merge plan + version bump, no action |
| Session interrupted mid-merge | Resume from release-status.json, skip already-merged PRs |

---

## Output

```
===============================================
  RELEASE COMPLETE
===============================================

Merge:
  #42  feat: UC-028 Funnel event tracking   — merged (squash)
  #45  feat: UC-029 Scene prompt display     — merged (squash)

Deploy:
  CI: passed (4m 22s)
  Health: 200 OK (https://example.com/api/health)

Version: v1.3.0 (minor bump)
Tag: v1.3.0 (pushed)
Release: https://github.com/org/repo/releases/tag/v1.3.0

Changelog:
  2 features, 0 bug fixes

YouGile:
  Release notes posted
  Tasks closed: UC-028, UC-029

===============================================
```

If merge-only (no deploy verification configured):

```
===============================================
  RELEASE COMPLETE
===============================================

Merge:
  #42  feat: UC-028 — merged (squash)

Deploy:
  CI: no pipeline detected (skipped)
  Health: no production URL configured (skipped)

Version: v0.1.0 (minor bump)
Tag: v0.1.0 (pushed)
Release: https://github.com/org/repo/releases/tag/v0.1.0

===============================================
```

---

## References

- `config.yaml` → git strategy, merge method, deploy settings, yougile
- `.tl/changelog.md` — source for release notes
- `.tl/release-status.json` — release state (created by this skill)
- `config.yaml` → deploy.production.url — link in release notes
- `config.yaml` → yougile — for notifications and PR discovery
