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

## Contract

**Inputs this skill consumes:**
- Per-PR underlying UC statuses (from graph or .tl/status.json)
- GitHub CI status per PR

**Outputs this skill produces:**
- Headline one of: RELEASE COMPLETE / RELEASE HALTED — {SUFFIX} /
  RELEASE INCOMPLETE — REGRESSION
- Release tag (created only on aggregated PASS)
- Per-UC table in release notes
- `delivered_in_release` graph stamp gated on PASS

**Downstream consumers of this output:**
- GitHub release
- Deploy pipeline (downstream of merge to main)

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
  "graph": { "status": "pending" },
  "release": { "status": "pending" },
  "yougile": { "status": "pending" }
}
```

**Always update after each step completes.** This enables resumption.

---

## Workflow: 9 Steps

### Step 0: PRE-CHECK

1. Read `config.yaml` → resolve all settings (see table above)

2. If `--skip-merge` OR `git.strategy == "direct"`:
   - Skip the **merge** action of Step 2 (no `gh pr merge` calls).
   - **DO NOT** skip the UC status gate. The gate at the top of Step 2
     (graph query, status branching, REGRESSION exclusion, MISSING TASK
     NODE halt) MUST run in every mode (P1 / 0.14.0 contract). The
     skip flag changes which artifacts are produced, not whether the
     gate runs.
   - Run the gate over the candidate UC list collected in Step 1, or — if
     `--skip-merge`/direct mode bypasses Step 1 entirely — over the UCs
     associated with commits since the last tag (`gh pr list --state merged
     --base {main_branch}` since `git describe --tags --abbrev=0`).
   - After the gate, jump to Step 3 (verify production deployment).

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

**Pre-merge UC status gate (runs BEFORE presenting merge plan):**

For each PR in the release candidate list:
1. Identify the underlying UC(s) and query the graph — **graph only, no JSON fallback**:
   ```cypher
   MATCH (t:Task)
   WHERE t.id IN [<UC list>]
   RETURN t.id, t.status, t.verification_evidence
   ```
   **If a Task node is missing (the query returns no row for a UC):**
   - **HALT immediately.**
   - Print:
     ```
     RELEASE HALTED — MISSING TASK NODE
     UC### has no Task node in the graph. The graph may be out of sync.
     Run /nacl-tl-diagnose to reconcile before retrying the release.
     ```
   - Do NOT fall back to `.tl/status.json`. Do NOT proceed.
2. Branch on UC status:

   | UC status | Merge action |
   |-----------|-------------|
   | done (PASS) | Include in merge plan normally |
   | verified-pending (UNVERIFIED) | HALT: "PR #N has UC### with UNVERIFIED dev status. Merge without verification? [yes/no] Default: no". If user confirms → include with warning. If not → exclude from merge plan; report RELEASE HALTED — UNVERIFIED |
   | blocked | Same user gate as UNVERIFIED |
   | failed / REGRESSION | DO NOT include; report: "PR #N excluded — REGRESSION in UC###"; flag RELEASE INCOMPLETE — REGRESSION |
   | Not found (after node-missing HALT above was skipped via prior user confirmation) | Must not reach here — HALT was mandatory. This row exists only for documentation clarity. |

Present the merge plan (including UC status column):

```
===============================================
  RELEASE — MERGE PLAN
===============================================

PRs to merge into {main_branch}:

  #42  feat: UC-028 Funnel event tracking     (feature/UC028)
       CI: passed | Reviews: 1 approved | Conflicts: none
       UC status: PASS (graph: done)

  #45  feat: UC-029 Scene prompt display       (feature/UC029)
       CI: passed | Reviews: 1 approved | Conflicts: none
       UC status: UNVERIFIED (graph: verified-pending) — USER GATE REQUIRED

Merge method: squash (from config.yaml)
Target: {main_branch}

Proceed with merge? [yes/no]
(UNVERIFIED PRs require separate confirmation before merging)
===============================================
```

**Wait for user confirmation.** Skip if `--yes` (but UNVERIFIED UCs still require explicit per-UC confirmation when `--yes` is set — `--yes` skips the plan gate, not the UNVERIFIED safety gate).

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

If health check fails — **HALT by default**:
```
RELEASE HALTED — UNVERIFIED (production health failed)
Production health endpoint did not return 200 OK after 3 retries.
Tag has NOT been pushed.

Resolution options:
  [1] Wait for deploy propagation and re-run /nacl-tl-release.
  [2] Investigate production with /nacl-tl-deploy --production.
  [3] Operator override (see below) to release the tag with a
      RELEASE INCOMPLETE — UNVERIFIED headline and changelog annotation.
```

**Operator override (interactive, OFF by default):**
If the operator chooses to proceed despite the failed health check, the
release continues but with non-PASS reporting (P4):
- Headline: `RELEASE INCOMPLETE — UNVERIFIED (production health failed, operator override)`.
- Changelog annotation: append a `> Health check FAILED at release time
  ({timestamp}); released under operator override. Verify production
  manually.` blockquote under the version heading in `.tl/changelog.md`
  before Step 5 aggregation.
- Tag is pushed but `release-status.json` records
  `"health": {"status": "failed_override", "reason": "<text>"}`.

If no `deploy.production.url` configured → skip health check, warn
"No production URL configured, skipping health check." (No halt — the
operator opted out of automated health verification at config time.)

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

**Changelog freshness cross-check (mandatory):**

```bash
# Date of the latest changelog entry (first ## line after last tag)
CHANGELOG_DATE=$(grep -m1 '^## ' .tl/changelog.md | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')

# Date of the most recent PR merged into main since the last tag
LAST_MERGE_DATE=$(gh pr list --state merged --base main --limit 20 \
  --json mergedAt --jq '[.[].mergedAt] | sort | last | .[0:10]')
```

Compare the two dates:
- If `CHANGELOG_DATE` is **more than 1 day older** than `LAST_MERGE_DATE`:
  ```
  WARNING — CHANGELOG MAY BE STALE
  Latest changelog entry: {CHANGELOG_DATE}
  Most recent PR merged:   {LAST_MERGE_DATE}
  Delta: {N} days. Review .tl/changelog.md and add missing entries before tagging.
  ```
  Do NOT block the release, but print this warning prominently above the version bump line.
- If `CHANGELOG_DATE` is within 1 day of `LAST_MERGE_DATE` (or ahead) → no warning.

### Step 6: CREATE GIT TAG

```bash
git tag -a v1.3.0 -m "Release v1.3.0 — Analytics Funnel Dashboard"
git push origin v1.3.0
```

---

### Step 7: MARK DELIVERED INTAKEITEMS WITH RELEASE VERSION

After the git tag is pushed, stamp `IntakeItem` nodes with the release version.
This step is **strictly gated on aggregated PASS status (P4 + 0.14.0
contract)**:

- Only stamp IntakeItems whose underlying UCs had PASS status (task.status = 'done').
- IntakeItems associated with UNVERIFIED, BLOCKED, or REGRESSION UCs are
  **excluded from the release artifact**. They are NOT stamped with a
  release version, NOT stamped with a "release note instead", and do NOT
  receive any `delivered_in_release` write. The previous "stamp with a note
  instead" path (0.13.0 and earlier) has been removed.
- Excluded IntakeItems are surfaced explicitly in the release report (see
  Step 9 / final report) so the operator can decide whether to retry
  verification before re-running release for those items.
- If ANY UC in the release had REGRESSION → halted at Step 2 (never reaches
  Step 7).

Run the following query for PASS items only, substituting the new version string:

```cypher
MATCH (i:IntakeItem)
WHERE i.status = 'delivered'
  AND i.delivered_in_release IS NULL
  AND NOT EXISTS {
    MATCH (i)<-[:PART_OF]-(t:Task)
    WHERE t.status IN ['verified-pending', 'blocked', 'failed']
  }
SET i.delivered_in_release = $version
RETURN count(i) AS updated;
```

Then collect the excluded set (read-only, for the report):

```cypher
MATCH (i:IntakeItem)<-[:PART_OF]-(t:Task)
WHERE i.status = 'delivered'
  AND i.delivered_in_release IS NULL
  AND t.status IN ['verified-pending', 'blocked', 'failed']
RETURN i.id AS intake_id,
       collect(DISTINCT {uc: t.id, status: t.status,
                         skip_reason: t.verification_skip_reason}) AS blocked_ucs;
```

Surface the excluded list in the final report under a dedicated
"Excluded from release (UNVERIFIED upstream)" section. Do NOT write any
`delivered_in_release` or `delivery_note` field for these items in this
release.

Parameter:
- `$version` — the new release version string, e.g. `"v1.3.0"`

**Failure tolerance:** If Neo4j is unavailable or the query errors, log a warning and
continue — do NOT block the release:
```
WARN: Could not stamp IntakeItems with release version in Neo4j.
      Graph state may be stale — reconcile later with /nacl-tl-diagnose.
```

Update `release-status.json`:
```json
"graph": {
  "status": "done",
  "version": "v1.3.0",
  "updated": 3
}
```

Use `"warn"` as status if the query failed.

→ **Output:** count of IntakeItem nodes stamped with the release version

---

### Step 8: CREATE GITHUB RELEASE (optional)

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

### Step 9: YOUGILE NOTIFICATION

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
   graph.status != "done"     → resume from Step 7
   release.status != "done"   → resume from Step 8
   yougile.status != "done"   → resume from Step 9
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
| `git.strategy == "direct"` | Skip the merge action of Step 2 (no PRs to merge). UC status gate STILL runs over commits-since-last-tag. |
| `--skip-merge` flag | Skip the merge action of Step 2 (tag-only). UC status gate STILL runs over commits-since-last-tag (0.14.0 contract). |
| No PRs found in ToRelease or GitHub | Skip Steps 1-3, proceed to version/tag |
| One PR has merge conflicts | Stop at that PR, report which merged / which remain |
| CI fails after merge | Stop before tagging, report. User fixes on main or reverts |
| No CI configured | Skip CI wait, proceed to health check |
| No production URL configured | Skip health check, warn |
| No changes since last tag | Report "nothing to release" |
| Single PR release | Same flow, one PR in list |
| `--dry-run` flag | Show merge plan + version bump, no action |
| Session interrupted mid-merge | Resume from release-status.json, skip already-merged PRs |
| Neo4j unavailable (Step 7) | Log warning, set graph.status = "warn", continue release |
| Task node missing in graph (Step 2) | RELEASE HALTED — MISSING TASK NODE. Run /nacl-tl-diagnose. Do NOT fall back to status.json. |
| PR merged but UC was UNVERIFIED | Halt BEFORE merge. Ask user: "UC### is UNVERIFIED — merge to main without test coverage? [yes/no] Default: no". Never auto-merge UNVERIFIED. If user answers yes, merge proceeds with override note. |
| Any UC has REGRESSION status | RELEASE INCOMPLETE — REGRESSION. Do NOT merge, do NOT tag. |
| All UCs PASS | Proceed normally; RELEASE COMPLETE headline |

---

## Output

```
===============================================
  RELEASE COMPLETE
===============================================

Merge:
  PR   Title                              Method   UC status    Evidence level
  ---  ---------------------------------  -------  -----------  ---------------
  #42  feat: UC-028 Funnel event tracking squash   PASS         test-GREEN (regression test path: .tl/tasks/UC028/regression-test.md)
  #45  feat: UC-029 Scene prompt display  squash   PASS         test-GREEN (regression test path: .tl/tasks/UC029/regression-test.md)

Deploy:
  CI: passed (4m 22s)
  Health: 200 OK (https://example.com/api/health)

Version: v1.3.0 (minor bump)
Tag: v1.3.0 (pushed)

Graph:
  IntakeItems stamped with v1.3.0: 3 nodes updated

Release: https://github.com/org/repo/releases/tag/v1.3.0

Changelog:
  2 features, 0 bug fixes

YouGile:
  Release notes posted
  Tasks closed: UC-028, UC-029

===============================================
```

**Per-UC evidence-level values** (populate from `t.verification_evidence` in the graph query from Step 2):

| Evidence level | Meaning |
|----------------|---------|
| `test-GREEN` | Regression test ran RED→GREEN; path recorded in graph |
| `test-UNVERIFIED` | Tests passed but no RED→GREEN artifact in graph |
| `no-test` | No test file found; UC shipped under explicit user override |
| `unknown` | Graph node existed but `verification_evidence` field is null/empty |

If any UC in the merged set has evidence level `no-test` or `unknown`, append a footer line:
```
Verification gaps: UC-029 (no-test), UC-031 (unknown) — review before next release.
```

**Excluded from release (UNVERIFIED upstream — Step 7):**

If the Step 7 excluded query returns any rows, append this section verbatim
to the final report:

```
Excluded from this release artifact (no IntakeItem stamped):
  IntakeItem  Underlying UC  UC status         Skip reason
  ----------  -------------  ----------------  -------------------------------
  FAM-58      UC-029         verified-pending  deliver --skip-verify
  FAM-61      UC-031         blocked           deliver health failed (override)

These items remain in the graph as 'delivered' but were NOT stamped with
the release version. Re-run /nacl-tl-deliver after restoring PASS status,
then re-run /nacl-tl-release for those items.
```

**Headline selection (P1 — `Status:` is the authoritative classifier):**

  RELEASE COMPLETE
    — every candidate UC PASS, health 200 OK, tag pushed.
  RELEASE INCOMPLETE — UNVERIFIED (production health failed, operator override)
    — Step 3b health failed and operator chose to proceed; tag pushed
      with changelog annotation; excluded items still excluded.
  RELEASE HALTED — UNVERIFIED (production health failed)
    — Step 3b health failed and no operator override; tag NOT pushed.
  RELEASE HALTED — UNVERIFIED
    — operator declined an UNVERIFIED-UC user gate at Step 2.
  RELEASE HALTED — MISSING TASK NODE
    — Step 2 graph query found a UC with no Task node.
  RELEASE INCOMPLETE — REGRESSION
    — any UC has REGRESSION status.

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

Graph:
  IntakeItems stamped with v0.1.0: 1 node updated

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
- `mcp__neo4j__write-cypher` → stamps IntakeItem nodes with release version (Step 7)
