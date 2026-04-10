---
name: nacl-tl-ship
description: |
  Commit, push, create PR, and update YouGile after development.
  Reads git strategy from config.yaml (direct vs feature-branch).
  Posts commit summary to YouGile task chat.
  Use when: ship code, commit and push, create PR, finish development,
  or the user says "/nacl-tl-ship".
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

1. **NEVER switch branches.** If you are on branch X, commit to branch X. Period.
2. **NEVER push to a branch other than the current one.** No `git checkout main`. No `git stash && git checkout`. No autonomous "this is a hotfix" decisions.
3. If you believe the current branch is wrong for the change — **ASK the user**. Suggest `/nacl-tl-hotfix` if the fix seems critical for production.
4. The ONLY skill authorized to target `main` from another branch is `/nacl-tl-hotfix`.

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
| Already on a feature/topic branch (`current_branch != base_branch`) | **STAY here.** Commit and push to this branch. This is the most common scenario. |
| On `base_branch` AND strategy == `direct` | Stay on base branch, push directly. |
| On `base_branch` AND strategy == `feature-branch` | Create new branch: `git checkout -b feature/[UC-or-FR] [base_branch]` |

**IMPORTANT:** If you are on a feature branch, you ALWAYS commit there — regardless of whether
the change "matches" the branch name. Hotfixes, cross-cutting fixes, shared code changes —
all go to the current branch. If the user wants it on main, they will use `/nacl-tl-hotfix`.

### Step 3: COMMIT

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

### Step 5: CREATE MERGE REQUEST / PR (feature-branch only)

If git_strategy is `feature-branch`:

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

Generated with Claude Code
EOF
)" \
  --base [git_base_branch]
```

### Step 5.5: DEPLOY (config-driven, only with `--deploy` flag)

**This step only runs when `--deploy` flag is provided.**

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

   Next: /nacl-tl-verify UC028
   ")
   ```

If YouGile not configured → skip, just report locally.

---

## Output

Present to user (in their language):

**Without `--deploy`:**
```
═══════════════════════════════════════════════
  SHIPPED
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking

Git:
  Branch: feature/UC028
  Commit: abc1234
  PR: #42 (https://github.com/org/repo/pull/42)
  Push: origin (GitHub) — OK

Tests: 34 passing
Build: OK

YouGile: task moved to DevDone, summary posted

Next step:
  /nacl-tl-verify UC028  — verify implementation
═══════════════════════════════════════════════
```

**With `--deploy`:**
```
═══════════════════════════════════════════════
  SHIPPED + DEPLOYED (direct)
═══════════════════════════════════════════════

UC-028: Funnel Event Tracking

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
  /nacl-tl-verify UC028  — verify implementation
═══════════════════════════════════════════════
```

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

### Invoked with just a commit message (no UC/FR ID)

When called as `/nacl-tl-ship "some message"` without a UC or FR identifier:
- Commit to the CURRENT branch (whatever it is)
- Do NOT try to determine a "correct" branch based on the commit content
- The user explicitly chose to ship from where they are

### Feature request with multiple UCs

With `--feature FR-001`:
- Collect changes from ALL UCs in the feature
- Single commit with comprehensive message listing all UCs
- Single PR for the entire feature

---

## References

- `config.yaml` → modules.[name].git_strategy, git_base_branch
- `nacl-tl-core/references/commit-conventions.md` — commit message format
- `.tl/changelog.md` — source for commit message content
