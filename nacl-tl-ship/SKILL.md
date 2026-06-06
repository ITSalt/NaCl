---
name: nacl-tl-ship
model: sonnet
effort: low
description: |
  Commit, push, create PR, and update YouGile after development.
  Reads git strategy from config.yaml (direct vs feature-branch).
  Posts commit summary to YouGile task chat.
  Use when: ship code, commit and push, create PR, finish development,
  or the user says "/nacl-tl-ship".
---

## Contract

**Inputs this skill consumes:**
- Prior verification status from .tl/status.json or YouGile task chat
  (six-status vocabulary: PASS / BLOCKED / UNVERIFIED / NO_INFRA /
  RUNNER_BROKEN / REGRESSION)
- Local test-suite results (sanity check, NOT a substitute for upstream status)
- config.yaml (git strategy)

**Outputs this skill produces:**
- Headline one of: SHIP COMPLETE / SHIP APPLIED — UNVERIFIED (only when user
  explicitly overrides on --deploy with non-PASS upstream) /
  SHIP HALTED — {NO_INFRA | RUNNER_BROKEN | UNVERIFIED | BLOCKED} /
  SHIP INCOMPLETE — REGRESSION
- Commit + push to feature branch
- PR creation (gated on aggregated PASS or explicit override)

**Downstream consumers of this output:**
- nacl-tl-deliver
- nacl-tl-deploy
- nacl-tl-release

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

# TeamLead Ship — Commit + Push + PR + YouGile

## Your Role

You are the **shipping specialist**. After development is complete (code written, tests pass, review approved), you commit, push, create a PR if needed, and notify YouGile. You bridge the gap between "code works locally" and "code is in the repo."

## Key Principle

```
Read git strategy from config.yaml → commit → push → PR (if feature-branch) → YouGile update
Never push without passing tests first.
```

## Safety Rules

> **ABSOLUTE RULE: When strategy == "feature-branch", you MUST NOT commit to base_branch.
> No exceptions. No rationalizations. Not "all recent commits are small fixes."
> Not "the user gave a bare message." Not "this is a tiny one-liner."
> If you are on base_branch and strategy is feature-branch,
> you MUST create a new branch BEFORE committing.**

1. **NEVER commit to base_branch when strategy == "feature-branch".** This is the highest-priority rule. It overrides ALL edge cases below. If you are about to `git commit` on base_branch with feature-branch strategy — STOP, you have a bug in your reasoning.
2. **NEVER switch branches.** If on branch X (not base_branch), commit to X. Period.
3. **NEVER push to a branch other than the current one.** No `git checkout main`. No autonomous "this is a hotfix" decisions.
4. If you believe the current branch is wrong — **ASK the user**. Suggest `/nacl-tl-hotfix` if critical.
5. The ONLY skill authorized to target `main` from another branch is `/nacl-tl-hotfix`.
6. **MECHANICAL GUARD:** Before every `git commit`, run the base-branch assertion (Step 2.5). If it prints FATAL — do NOT proceed.

---

## Invocation

```
/nacl-tl-ship UC028                    # ship specific UC
/nacl-tl-ship --feature FR-001         # ship all tasks in a feature
/nacl-tl-ship "custom commit message"  # ship with explicit message
/nacl-tl-ship                          # ship all uncommitted changes (auto-compose message)
/nacl-tl-ship --deploy                 # ship + deploy (method from config.yaml)
/nacl-tl-ship UC028 --deploy           # ship UC + deploy
```

### Configuration Resolution

**IMPORTANT:** Projects may use different config.yaml structures. Check BOTH formats:

| Data | Source priority (check in order, use first found) |
|------|--------------------------------------------------|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Branch prefix | `git.branch_prefix` > fallback `"feature/"` |
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
| Module path | `modules.[name].path` > detect from package.json |
| YouGile dev_done | `yougile.columns.dev_done` |
| Deploy method (staging) | `deploy.staging.method` > `deploy.method` > fallback `"github-actions"` |
| Deploy script | `deploy.staging.script` > no default |
| Skip CI flag | `deploy.staging.skip_ci` > fallback `false` |
| Deploy env file | `deploy.staging.env_file` > no default |

**Two config.yaml formats exist in projects:**

Format A (per-module):
```yaml
modules:
  backend:
    git_strategy: "feature-branch"
    git_base_branch: "main"
```

Format B (top-level git section):
```yaml
git:
  strategy: "feature-branch"
  main_branch: "main"
  branch_prefix: "feature/"
```

**Always check Format B first** (top-level `git:` section), then Format A (`modules.[name]`). Never assume only one format exists.

If config.yaml missing → use all fallback defaults. If YouGile missing → skip task moves.

---

## Workflow: 6 Steps

### Step 1: PRE-FLIGHT CHECKS

0. **Read prior verification status (BEFORE running local tests):**

   Check `.tl/status.json` for the task being shipped, or read the sub-skill
   output from the task chat. Look for the six-status vocabulary:

   | Prior status | Action |
   |--------------|--------|
   | PASS | Proceed normally |
   | UNVERIFIED | HALT. Post advisory: "Task dev status is UNVERIFIED — no test exercises the change. Local tests passing does NOT substitute for upstream verification. Confirm to ship unverified? [yes/no] Default: no". If the operator answers explicitly "yes" (NOT auto-confirmed by `--yes`), proceed with `SHIP APPLIED — UNVERIFIED` headline; PR description is annotated; auto-deploy via `--deploy` is **refused** in this state — the operator must run `/nacl-tl-deploy` separately as an explicit deploy override. If no answer → `SHIP HALTED — UNVERIFIED`. |
   | BLOCKED | HALT. Post: "Task dev status is BLOCKED — pre-existing failures. Confirm to ship blocked task? [yes/no] Default: no". If confirmed → proceed under `SHIP APPLIED — UNVERIFIED (BLOCKED override)`; auto-deploy refused. If not → `SHIP HALTED — BLOCKED`. |
   | NO_INFRA | HALT. Report: `SHIP HALTED — NO_INFRA`. Recommend fixing infra. |
   | RUNNER_BROKEN | HALT. Report: `SHIP HALTED — RUNNER_BROKEN`. Escalate. |
   | REGRESSION | HALT. Report: `SHIP INCOMPLETE — REGRESSION`. Do NOT ship. |
   | Unknown / not found (no status.json AND no Task node in graph) | **HALT.** Report: `SHIP HALTED — UNVERIFIED (upstream status unknown)`. The previous "warn and proceed" backward-compat path has been removed (P5 + 0.14.0 contract). The operator must populate the graph or `.tl/status.json`, or invoke an explicit user-initiated path that knowingly accepts the unknown state. |

   **Local tests passing does NOT override prior UNVERIFIED/BLOCKED/unknown status.**
   Local tests are a sanity check, not a verification substitute.

   **Reaffirmed: ship never switches branches autonomously (P5).** Ship commits
   to the current branch only. Hotfix-to-main is a separate user-initiated skill
   (`/nacl-tl-hotfix`); a non-PASS upstream status does NOT cause this skill to
   pivot to a hotfix branch or to `main`. The operator chooses.

1. Read `config.yaml` for git strategy, module config, **and deploy config**
2. Run tests for affected modules:
   ```bash
   cd [module_path] && [test_cmd]
   ```
3. Run build:
   ```bash
   cd [module_path] && [build_cmd]
   ```
   - **If `--deploy` flag is set** and `deploy.staging.env_file` exists:
     load env vars from that file before building the frontend module.
     This injects staging-specific variables (e.g. `NEXT_PUBLIC_VK_CLIENT_ID`)
     into the static frontend build.
4. If tests or build FAIL → report and **stop**. Do not push broken code.
5. Check for uncommitted changes: `git status`
6. If no changes → report "nothing to ship" and exit

### Step 2: DETERMINE GIT STRATEGY

```
current_branch = git rev-parse --abbrev-ref HEAD
base_branch = config.yaml → git.main_branch (default: "main")
strategy = config.yaml → git.strategy (default: "feature-branch")
```

| Situation | Action |
|-----------|--------|
| Already on a feature/topic branch (`current_branch != base_branch`) | **STAY here.** Commit and push to this branch. |
| On `base_branch` AND strategy == `direct` | Stay on base branch, push directly. |
| On `base_branch` AND strategy == `feature-branch` | **MUST create a new branch before committing.** See naming below. |

**IMPORTANT:** If on a feature branch, ALWAYS commit there — regardless of whether
the change "matches" the branch name. If user wants it on main → `/nacl-tl-hotfix`.

**NOTE (conductor-driven invocations):** When this skill is invoked under
`/nacl-tl-conductor`, the feature branch is pre-created by the conductor and may
host multiple UCs in sequence. Do not require the branch name to match the UC ID —
a mismatch is expected and must not halt the ship.

#### Branch naming (when creating a new branch)

| Source | Branch name | Example |
|--------|-------------|---------|
| UC identifier provided | `feature/UC028` | `/nacl-tl-ship UC028` |
| FR identifier provided | `feature/FR-001` | `/nacl-tl-ship --feature FR-001` |
| Bare commit message | `feature/[slug]` | `"fix: add lecture breadcrumb"` → `feature/fix-add-lecture-breadcrumb` |
| Auto-composed message | `feature/[slug]` | Auto: `"fix: cast lectureId"` → `feature/fix-cast-lectureid` |

Slugification:
```bash
slug=$(echo "$message" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c1-50)
git checkout -b "feature/${slug}" "$base_branch"
```

**There is NO scenario where strategy == "feature-branch" and you commit directly to base_branch.**
If you cannot derive a branch name — ask the user. Do NOT fall back to base_branch.

### Step 2.5: BASE-BRANCH GUARD (mandatory)

Run this BEFORE every `git commit`. Non-negotiable.

```bash
current_branch=$(git rev-parse --abbrev-ref HEAD)
# base_branch and strategy were read from config.yaml in Step 1
if [ "$current_branch" = "$base_branch" ] && [ "$strategy" = "feature-branch" ]; then
  echo "FATAL: Cannot commit to $base_branch with feature-branch strategy. Create a branch first."
  exit 1
fi
echo "GUARD OK: branch=$current_branch, strategy=$strategy"
```

If FATAL → go back to Step 2, create the branch. Do NOT skip or override this check.

### Step 3: COMMIT

0. **Pre-commit check:** Verify you ran Step 2.5 and are NOT on base_branch with feature-branch strategy. If you are — STOP, go back to Step 2.
1. Stage relevant files (smart staging — exclude .env, node_modules, dist/, .tl/qa-screenshots/):
   ```bash
   git add [relevant files]
   ```
2. Compose commit message. **Priority chain:**
   ```
   IF user provided a message in invocation → use it
   IF .tl/changelog.md has entries since last commit → compose from latest entries
   IF neither → auto-compose from git diff:
   ```
   - **If `--deploy` flag is set** and `deploy.staging.skip_ci == true` in config.yaml:
     append `[skip ci]` to the **first line** of the commit message.
     This prevents GitHub Actions (both CI and deploy workflows) from running.
   ```
     - Read `git diff --cached --stat` for changed files
     - Read `git diff --cached` for actual changes (first ~100 lines)
     - Compose: "fix/feat/refactor: [summary of changes]"
     - List changed files in body
   ```

   Example auto-composed message:
   ```
   fix: switch to Gemini 2.5 Flash models + add prompt cache

   - backend/src/config/env.ts: updated model names
   - backend/src/services/interview-agent.service.ts: added in-memory cache

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
3. Commit:
   ```bash
   git commit -m "$(cat <<'EOF'
   [message]
   EOF
   )"
   ```

### Step 4: PUSH

```bash
git push [-u origin feature/UC028]  # feature-branch
# or
git push                            # direct
```

If push fails (reject, conflict):
- Pull and rebase: `git pull --rebase`
- If merge conflict → report to user, do not force-push
- Retry push after rebase

**Post-push check:** If strategy == "feature-branch" and you just pushed to base_branch — STOP.
Something went wrong. Report the error to the user immediately.

### Step 5: CREATE MERGE REQUEST / PR (feature-branch only)

If git_strategy is `feature-branch`:

**Verification gate before PR creation:**
- If prior task status (from Step 1.0) was PASS → create PR normally
- If prior task status was UNVERIFIED and user confirmed override in Step 1.0:
  → create PR with `**Verification status:** UNVERIFIED` note in body
- If prior task status was BLOCKED and user confirmed override in Step 1.0:
  → create PR with `**Verification status:** BLOCKED (user override)` in body
- If prior task status was REGRESSION → DO NOT create PR; report SHIP INCOMPLETE — REGRESSION
- If no status found (backward-compat) → create PR normally

**Create Pull Request on GitHub:**
```bash
gh pr create \
  --title "feat: UC-028 Funnel event tracking" \
  --body "$(cat <<'EOF'
## Summary
- POST /api/analytics/event with idempotent dedup
- FunnelEvent entity + migration
- Integration hooks across 7 existing pages

## Test Plan
- [x] 34 unit tests passing
- [ ] E2E verification via /nacl-tl-verify

**Verification status:** PASS

Generated with Claude Code
EOF
)" \
  --base [git_base_branch]
```

### Step 5.5: DEPLOY (config-driven, only with `--deploy` flag)

**This step only runs when `--deploy` flag is provided.**

**Verification gate before deploy:**
- If prior task status (from Step 1.0) was PASS → proceed with deploy.
- If prior task status was UNVERIFIED (operator-confirmed ship in Step 1.0) →
  **auto-deploy is refused.** This skill emits an advisory:
  `Auto-deploy disabled — upstream status is UNVERIFIED. Run /nacl-tl-deploy
   --staging separately as an explicit deploy override.`
  The PR is created and the report ends with the `SHIP APPLIED — UNVERIFIED`
  headline. `--deploy` does NOT chain into deploy under unverified upstream.
- If prior task status was BLOCKED (operator-confirmed ship) → same as UNVERIFIED:
  no auto-deploy, separate explicit operator action required.
- If prior task status was REGRESSION → `SHIP INCOMPLETE — REGRESSION`; no PR; no deploy.
- If upstream status was unknown → never reaches Step 5.5 (Step 1.0 already halted).
- Deploy never bypasses verification. Local tests passing does not substitute.

Read deploy strategy from `config.yaml`:

```
current_branch = git rev-parse --abbrev-ref HEAD
main_branch = config.yaml → git.main_branch (default: "main")

IF current_branch == main_branch:
  SKIP — production deploys always go through CI pipeline.
  Report: "Production deploy happens via GitHub Actions after push to main."

ELSE (feature/staging branch):
  method = config.yaml → deploy.staging.method (default: "github-actions")

  IF method == "direct":
    script = config.yaml → deploy.staging.script
    IF script exists:
      Run: bash [script]
      Report result (success/failure, duration)
    ELSE:
      Report error: "deploy.staging.script not found"

  ELSE IF method == "github-actions":
    Report: "Deploy will happen via GitHub Actions pipeline."
    (Optionally monitor with /nacl-tl-deploy --staging)

  ELSE:
    Report error: "Unknown deploy method: [method]"
```

**The skill does NOT know deployment specifics** (SSH hosts, rsync paths, PM2 commands).
All of that lives in the project's deploy script referenced by `deploy.staging.script`.
The skill only resolves the config and executes the script.

### Step 6: YOUGILE UPDATE

If `config.yaml → yougile` is configured:

1. Move task to DevDone column:
   ```
   update_task(taskId, columnId: config.yougile.columns.dev_done)
   ```

2. Post commit summary to task chat:
   ```
   send_task_message(taskId, message: "
   🚀 Shipped to repository

   Branch: feature/UC028 (PR #42)
   Commit: abc1234
   Files: 12 changed, 450 insertions, 30 deletions

   Tests: 34 passing
   Build: OK

   Next: /nacl-tl-verify UC028   (bare fix, no UC id → /nacl-tl-release --pr 42 to merge)
   ")
   ```

If YouGile not configured → skip, just report locally.

---

## Output

Per-task status table is the first block of every report — the headline summarizes
the aggregated status, then a `Verification status:` line surfaces the per-task value
that was consumed (PASS / UNVERIFIED / BLOCKED / NO_INFRA / RUNNER_BROKEN /
REGRESSION) so the reader sees the per-task status at a glance. Present to user
(in their language):

**Next-step invariant:** the `Next step:` block lists only concrete `/nacl-...`
commands (with current, real flags) — **never prose**. The block always names the
skill that performs the next action. When no UC/FR id is available (e.g. a bare
bug-fix), omit the id argument; do **not** substitute a prose description like
"review and merge the PR". See the **Next-step resolution** table below for how to
fill it.

**Without `--deploy` (PASS case):**
```
═══════════════════════════════════════════════
  SHIP COMPLETE
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking
Verification status: PASS

Git:
  Branch: feature/UC028
  Commit: abc1234
  PR: #42 (https://github.com/org/repo/pull/42)
  Push: origin (GitHub) — OK

Tests: 34 passing
Build: OK

YouGile: task moved to DevDone, summary posted

Next step:
  /nacl-tl-verify UC028     — verify implementation (E2E/code)
  /nacl-tl-release --pr 42  — merge PR #42 into main (after verify)
═══════════════════════════════════════════════
```

**UNVERIFIED case (user confirmed override):**
```
═══════════════════════════════════════════════
  SHIP APPLIED — UNVERIFIED
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking
Verification status: UNVERIFIED (user override — shipped without test coverage)

WARNING: No test exercises the change. Ship confirmed by user.
...
═══════════════════════════════════════════════
```

**With `--deploy` (PASS — auto-deploy chained):**
```
═══════════════════════════════════════════════
  SHIP COMPLETE — DEPLOYED (direct)
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking
Verification status: PASS

Git:
  Branch: feature/UC028
  Commit: abc1234 [skip ci]
  PR: #42

Deploy (staging):
  Method: direct (via deploy/staging-direct.sh)
  Result: OK
  Duration: 47s

Tests: 34 passing
Build: OK

YouGile: task moved to DevDone, summary posted

Next step:
  /nacl-tl-verify UC028     — verify implementation (E2E/code)
  /nacl-tl-release --pr 42  — merge PR #42 into main (after verify)
═══════════════════════════════════════════════
```

**With `--deploy` (UNVERIFIED — auto-deploy refused):**
```
═══════════════════════════════════════════════
  SHIP APPLIED — UNVERIFIED (auto-deploy refused)
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking
Verification status: UNVERIFIED (operator override at Step 1.0)

Git:
  Branch: feature/UC028
  Commit: abc1234
  PR: #42 (annotated: SHIP APPLIED — UNVERIFIED)

Deploy (staging):
  Method: SKIPPED — upstream UNVERIFIED. --deploy does not chain under
          non-PASS status. Run /nacl-tl-deploy --staging as a separate
          explicit operator action if you accept the risk.

Tests: 34 passing
Build: OK

YouGile: task moved to DevDone with UNVERIFIED note

Next step:
  /nacl-tl-deploy --staging   — explicit operator deploy (separate skill)
  /nacl-tl-verify UC028       — restore verified status before re-shipping
═══════════════════════════════════════════════
```

**Bare bug-fix (PASS, no UC id) — feature-branch:**
When ship is invoked with a bare commit message (no UC/FR id) and upstream status
is already PASS (e.g. shipped after `/nacl-tl-fix`, which ran a RED→GREEN regression
test), the only remaining action is the merge. Name the merge skill — do NOT emit
prose like "Review and merge the PR":
```
═══════════════════════════════════════════════
  SHIP COMPLETE
═══════════════════════════════════════════════

fix: <commit message>
Verification status: PASS

Git:
  Branch: fix/<slug>
  Commit: abc1234
  PR: #5 (https://github.com/org/repo/pull/5)
  Base: main-v2
  Push: origin (GitHub) — OK

Tests: 28 passing

YouGile: not configured

Next step:
  /nacl-tl-release --pr 5   — merge PR #5 into main-v2
  (/nacl-tl-verify          — optional: E2E-verify the fix before merge)
═══════════════════════════════════════════════
```

**Headline selection (the only authoritative classifier is the consumed
`Status:` line — see Step 1.0):**

  SHIP COMPLETE
    — upstream PASS, no skip flag, no health/CI failure.
  SHIP COMPLETE — DEPLOYED (direct)
    — PASS + `--deploy` succeeded.
  SHIP APPLIED — UNVERIFIED
    — upstream UNVERIFIED or BLOCKED with operator override; PR annotated;
      auto-deploy refused regardless of `--deploy`.
  SHIP HALTED — UNVERIFIED (upstream status unknown)
    — no `.tl/status.json` AND no Task node in graph (P1 / P5).
  SHIP HALTED — UNVERIFIED
    — operator declined the unverified-ship prompt at Step 1.0.
  SHIP HALTED — BLOCKED
    — operator declined the BLOCKED-ship prompt at Step 1.0.
  SHIP HALTED — NO_INFRA
    — declared workspace command missing (P2).
  SHIP HALTED — RUNNER_BROKEN
    — runner cannot be exercised.
  SHIP INCOMPLETE — REGRESSION
    — upstream REGRESSION; no PR, no deploy.

### Next-step resolution

Fill the `Next step:` block from the data this skill already has — `strategy`,
`pr_number` + resolved `base_branch` (`git.main_branch`), the consumed verification
status, and whether a UC/FR id was provided. `<base>` = resolved `base_branch`;
`<N>` = the PR number just created/found. The block always names a skill.

| Strategy | Verification status | `Next step:` block (named skills, in order) |
|---|---|---|
| feature-branch | PASS, UC/FR id present | `/nacl-tl-verify <id>` — verify implementation; then `/nacl-tl-release --pr <N>` — merge PR #<N> into `<base>` |
| feature-branch | PASS, **no id** (bare fix) | `/nacl-tl-release --pr <N>` — merge PR #<N> into `<base>`; `(/nacl-tl-verify` — optional E2E before merge`)` |
| feature-branch | UNVERIFIED / BLOCKED (operator override) | `/nacl-tl-deploy --staging` — explicit operator deploy; `/nacl-tl-verify <id>` — restore verified status before re-shipping |
| direct | PASS | `/nacl-tl-deploy` — monitor CI/deploy (no PR to merge) |

The merge skill is always `/nacl-tl-release` — it is the only skill that runs
`gh pr merge`, reads the base branch from `git.main_branch` (so it targets `<base>`,
e.g. `main-v2`), and gates the merge on PASS status.

---

## Edge Cases

### Multiple modules changed

If UC touches both frontend and backend:
- Check git_strategy for EACH module
- If strategies differ (one direct, one feature-branch) → use feature-branch for both (safer)
- Single commit with all changes, single PR

### Nothing to commit

If `git status` shows no changes:
- Check if changes were already committed but not pushed
- If already pushed → report "already shipped"
- If nothing changed at all → report "nothing to ship"

### Fix seems unrelated to current branch

If the change appears unrelated to the current feature branch name:
- This is NORMAL — hotfixes, cross-cutting concerns, and shared code
  are often committed from whatever branch is active
- Commit to the CURRENT branch
- Do NOT autonomously switch to main or create a new branch
- If you believe the fix is urgent for production,
  mention it in the report:
  "Note: if this fix is urgent for production, consider `/nacl-tl-hotfix --apply`"
- **Note:** "current branch" here means a FEATURE branch. If you are on base_branch,
  this edge case does not apply — Step 2's decision table takes precedence.

### Invoked with just a commit message (no UC/FR ID)

When called as `/nacl-tl-ship "some message"` without a UC or FR identifier:
- **If on a feature branch:** commit to the CURRENT branch. The user chose to ship from here.
- **If on base_branch AND strategy == "direct":** commit to base_branch. Allowed.
- **If on base_branch AND strategy == "feature-branch":** MUST create a new branch first. Derive branch name from message slug (see Step 2, "Branch naming"). Example: `"fix: add lecture breadcrumb"` on main → create `feature/fix-add-lecture-breadcrumb`.
- A bare commit message does NOT override the project's git strategy. Strategy is a project-level decision, not per-invocation.

### Feature request with multiple UCs

With `--feature FR-001`:
- Collect changes from ALL UCs in the feature
- Single commit with comprehensive message listing all UCs
- Single PR for the entire feature

---

## Goal-context append mode (2.10.1+)

When this skill is invoked under `/nacl-goal intake` (the autonomous goal orchestrator added in 2.10.1), the wrapper exports five env vars that modify Steps 2, 3, 4, and 5 below. **When any of these env vars are absent, the default behavior documented above applies unchanged** — interactive `/nacl-tl-ship` is not affected.

| Variable | Set by | Used here |
|---|---|---|
| `NACL_GOAL_RUN_ID` | `/nacl-goal intake` | Commit message footer + PR body trailer for traceability |
| `NACL_GOAL_BRANCH` | `/nacl-goal intake` | Branch to commit/push on (selected by the wrapper) |
| `NACL_SHIP_MODE` | `/nacl-goal intake` (always `append`) | Triggers append-mode behavior below |
| `NACL_SHIP_PUSH` | `/nacl-goal intake` (`per-atom` \| `deferred` \| `none`) | Push cadence — gates Steps 4 and 5. Absent ⇒ `per-atom` (pre-2.13 behavior) |
| `NACL_GOAL_BUDGET_FILE` | `/nacl-goal intake` | Inner-skill envelope appended at end of run |

### Behavior when `NACL_SHIP_MODE=append` AND `NACL_GOAL_BRANCH` is set

**Step 2 (DETERMINE GIT STRATEGY)** — modified branch resolution:

- DO NOT create a new branch. `$NACL_GOAL_BRANCH` is selected by `/nacl-goal intake` Step 5 — either a wrapper-created `feature/goal-<short-hash>` (`branch_mode=new`) or the user's own feature branch the run executes on (`branch_mode=current`). Do not assume the `feature/goal-*` naming. The current `HEAD` must already be on that branch (verify with `git rev-parse --abbrev-ref HEAD == "$NACL_GOAL_BRANCH"`; if not, FATAL — report the mismatch and exit).
- The base-branch guard (Step 2.5) is still enforced. The goal-run branch is by definition not `main`/`master`/`release/*`, so the guard passes.
- This is structurally identical to the existing conductor-driven invocation note above. The goal-run branch is just another pre-created feature branch.

**Step 3 (COMMIT)** — selective staging + WIP-collision guard + commit message footer:

- Stage ONLY the files this atom's work actually modified (`git add <file>...` — the existing "relevant files" rule, now binding). NEVER `git add -A` in append mode: the worktree may be shared with other agents whose uncommitted files must not ride along.
- WIP-collision guard: read `preexisting_dirty_files[]` from `.tl/goal-runs/$NACL_GOAL_RUN_ID/plan.lock.json` (absent/empty ⇒ skip the guard). If any file you are about to stage is in that list, HALT WITHOUT COMMITTING and report the collision (file list + atom) — the wrapper surfaces it as `GOAL_BLOCKED_WIP_COLLISION` (resumable). Those edits belong to another agent; committing them would swallow work that is not this atom's to ship.
- Append a stable trailer line at the end of the commit message body:

```
Goal-run-id: <NACL_GOAL_RUN_ID>
```

This lets `git log --grep="goal-run-id:"` find every commit that belongs to a goal-run. The trailer goes ABOVE the existing `Co-Authored-By:` and `Generated with Claude Code` lines if present.

**Step 4 (PUSH)** — gated on `NACL_SHIP_PUSH`:

- `per-atom` (or var absent): unchanged — push to `$NACL_GOAL_BRANCH` (which is the current branch).
- `deferred` | `none`: DO NOT push. The commit stays local; the single push happens at `/nacl-tl-deliver` (deferred) or is left entirely to the user (none). Skip every `git push` and every `gh` call in this step.

**Step 5 (CREATE MERGE REQUEST / PR)** — gated on `NACL_SHIP_PUSH`: runs ONLY under `per-atom` (or var absent). Under `deferred`/`none` skip this entire step — nothing has been pushed, the PR does not exist yet, and `pr.json` is written later by the wrapper at DELIVER (deferred) or never (none). Append-to-existing-PR semantics for `per-atom`:

```bash
# Check whether a PR already exists for this branch
existing_pr=$(gh pr list --head "$NACL_GOAL_BRANCH" --json url,number --limit 1 2>/dev/null)
existing_pr_url=$(echo "$existing_pr" | jq -r '.[0].url // empty')
existing_pr_number=$(echo "$existing_pr" | jq -r '.[0].number // empty')

if [ -n "$existing_pr_url" ]; then
  # Subsequent push — the PR already exists. Do NOT call `gh pr create` again
  # (it would error with "a pull request for branch X already exists").
  # Refresh the PR body if .tl/goal-runs/<run_id>/pr-body.md exists:
  pr_body_file=".tl/goal-runs/$NACL_GOAL_RUN_ID/pr-body.md"
  if [ -f "$pr_body_file" ]; then
    gh pr edit "$existing_pr_url" --body-file "$pr_body_file"
  fi
  # Update pr.json.head_sha + updated_at; head_sha = new HEAD after this push.
  new_head_sha=$(git rev-parse HEAD)
  pr_json=".tl/goal-runs/$NACL_GOAL_RUN_ID/pr.json"
  # Write/update pr.json (per nacl-goal/plan-lock-schema.md §pr.json):
  jq -n \
    --arg url "$existing_pr_url" \
    --argjson number "$existing_pr_number" \
    --arg branch "$NACL_GOAL_BRANCH" \
    --arg head_sha "$new_head_sha" \
    --arg updated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ schema_version: 1, url: $url, number: $number, branch: $branch,
       head_ref: $branch, head_sha: $head_sha,
       created_at: (input.created_at // $updated_at),
       updated_at: $updated_at }' \
    "$pr_json" > "${pr_json}.tmp" && mv "${pr_json}.tmp" "$pr_json"
else
  # First push for this goal-run — open the goal-run PR.
  # Read the body from .tl/goal-runs/<run_id>/pr-body.md (rendered by the wrapper).
  pr_body_file=".tl/goal-runs/$NACL_GOAL_RUN_ID/pr-body.md"
  base_branch="${base_branch:-main}"   # from config.yaml as usual
  if [ -f "$pr_body_file" ]; then
    pr_url=$(gh pr create \
      --base "$base_branch" \
      --head "$NACL_GOAL_BRANCH" \
      --title "$(head -n 1 "$pr_body_file" | sed 's/^## //')" \
      --body-file "$pr_body_file")
  else
    # Fallback: compose a minimal body if the wrapper artifact is missing.
    pr_url=$(gh pr create \
      --base "$base_branch" \
      --head "$NACL_GOAL_BRANCH" \
      --title "$(git log -1 --pretty=%s)" \
      --body "Goal-run-id: $NACL_GOAL_RUN_ID")
  fi
  new_head_sha=$(git rev-parse HEAD)
  pr_number=$(gh pr view "$pr_url" --json number --jq '.number')
  pr_json=".tl/goal-runs/$NACL_GOAL_RUN_ID/pr.json"
  created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq -n \
    --arg url "$pr_url" \
    --argjson number "$pr_number" \
    --arg branch "$NACL_GOAL_BRANCH" \
    --arg head_sha "$new_head_sha" \
    --arg ts "$created_at" \
    '{ schema_version: 1, url: $url, number: $number, branch: $branch,
       head_ref: $branch, head_sha: $head_sha,
       created_at: $ts, updated_at: $ts }' > "$pr_json"
fi
```

**Step 6 (YOUGILE UPDATE)** — unchanged when invoked under `/nacl-goal intake`. The goal-run does not bind to a single YouGile card; if `intake.json` carries `youGile_card_id` per atom, the existing per-atom YouGile flow runs as today.

**Inner-skill envelope (end of skill execution)** — if `$NACL_GOAL_BUDGET_FILE` is set and the file exists, append a single entry:

```bash
if [ -n "$NACL_GOAL_BUDGET_FILE" ] && [ -f "$NACL_GOAL_BUDGET_FILE" ]; then
  jq --arg skill "nacl-tl-ship" \
     --arg started_at "$ship_started_at" \
     --arg ended_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --argjson duration "$(( $(date +%s) - ship_started_epoch ))" \
     --arg exit_status "shipped" \
     '.inner_skill_runs += [{
        skill: $skill, started_at: $started_at, ended_at: $ended_at,
        duration_seconds: $duration, exit_status: $exit_status
      }]' \
     "$NACL_GOAL_BUDGET_FILE" > "${NACL_GOAL_BUDGET_FILE}.tmp" \
    && mv "${NACL_GOAL_BUDGET_FILE}.tmp" "$NACL_GOAL_BUDGET_FILE"
fi
```

Failures to write to `budget.json` are silent — this is best-effort observability for `/nacl-goal intake`'s GOAL_PROOF block.

**Invariant**: this entire section is gated on `NACL_SHIP_MODE=append AND NACL_GOAL_BRANCH set AND NACL_SHIP_PUSH ∈ {per-atom (default when absent), deferred, none}`. With `NACL_SHIP_MODE`/`NACL_GOAL_BRANCH` absent, the default behavior in Steps 1–6 above runs unchanged; with `NACL_SHIP_PUSH` absent, append mode pushes per atom exactly as it did pre-2.13. Interactive `/nacl-tl-ship UC028` is unaffected.

---

## References

- `config.yaml` → modules.[name].git_strategy, git_base_branch
- `nacl-tl-core/references/commit-conventions.md` — commit message format
- `.tl/changelog.md` — source for commit message content
- `nacl-goal/plan-lock-schema.md` — `pr.json` and `budget.json` schemas (2.10.1)
- `nacl-goal/pr-body-template.md` — goal-run PR body template (2.10.1)
