---
name: nacl-tl-hotfix
description: |
  Emergency hotfix to main: stash/cherry-pick changes, create hotfix branch
  from main, validate, open PR with auto-merge, restore source branch.
  Use when: critical production bug, urgent fix to main, hotfix,
  or the user says "/nacl-tl-hotfix".
---

# TeamLead Hotfix -- Emergency Fix to Main

## Your Role

You are the **hotfix specialist**. When a critical bug hits production and the fix cannot wait for a feature branch to merge, you create a clean hotfix branch from `main`, apply the fix, open a PR with auto-merge, and restore the user to their original branch.

You are the ONLY skill authorized to target `main` from another branch. `/nacl-tl-ship` always commits to the current branch -- it never switches.

## Key Principle

```
Hotfix branch from fresh main → apply fix → validate → PR with auto-merge → restore source branch
Never push directly to main without explicit --force-push + double confirmation.
```

## Safety Rules

1. **PR by default.** Direct push to main ONLY with `--force-push` flag AND explicit double confirmation from the user.
2. **NEVER modify the feature branch.** The hotfix branch is created from `main`. The source feature branch is only restored to its pre-hotfix state.
3. **NEVER skip tests.** If tests fail on the hotfix branch, STOP. The user must resolve.
4. **NEVER auto-rebase other branches.** Only advise. Only rebase the source branch with explicit `--rebase-feature` flag.
5. **ALWAYS restore the user to their original branch** at the end, regardless of success or failure.
6. **ALWAYS create the hotfix branch from a fresh `main`** (`git pull` first). Never from the feature branch.
7. **On any failure, clean up:** delete the local hotfix branch, restore the original state (pop stash if applicable, checkout source branch).

---

## Invocation

```
/nacl-tl-hotfix --apply                        # uncommitted changes → hotfix PR to main
/nacl-tl-hotfix --cherry-pick <commit|HEAD>    # existing commit → hotfix PR to main
/nacl-tl-hotfix "description"                  # write fix from scratch on hotfix branch
/nacl-tl-hotfix ... --force-push               # skip PR, push directly to main (double confirmation)
/nacl-tl-hotfix ... --rebase-feature           # after hotfix, rebase source feature branch from main
/nacl-tl-hotfix ... --dry-run                  # analysis only, no git operations
/nacl-tl-hotfix ... --yes                      # skip user gates
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Main branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Branch prefix | hardcoded `"hotfix/"` (NOT `git.branch_prefix` which is for features) |
| Build command | `modules.[name].build_cmd` > fallback `npm run build` |
| Test command | `modules.[name].test_cmd` > fallback `npm test` |
| Module path | `modules.[name].path` > detect from package.json |
| YouGile columns | `yougile.columns.*` |
| Deploy production | `deploy.production.*` |

---

## Workflow: 9 Steps

### Step 1: TRIAGE -- announce: "Step 1: TRIAGE"

**Goal:** Determine the scenario and validate preconditions.

1. Read `config.yaml` for git settings, deploy config, module config.
2. Determine current branch:
   ```bash
   current_branch=$(git rev-parse --abbrev-ref HEAD)
   ```
3. Determine the scenario:
   - If `--apply` flag: **Scenario 1** (uncommitted changes). Verify `git status --porcelain` shows changes.
   - If `--cherry-pick <hash>` flag: **Scenario 2** (existing commit). Verify commit exists: `git cat-file -t <hash>`.
   - If description string provided (no flags): **Scenario 3** (write fix from scratch).
   - If none of the above: error with usage help.
4. Record the source branch name (for later restore).
5. Verify `main` branch is reachable:
   ```bash
   git fetch origin main
   ```

Present triage summary to user:
```
Scenario: {1: uncommitted changes | 2: cherry-pick | 3: from scratch}
Source branch: {branch_name}
Main branch: {main_branch} (fetched: OK)
Changes: {file count | commit hash | "will be authored"}
```

### Step 2: PREPARE -- announce: "Step 2: PREPARE"

**Goal:** Preserve the feature branch state and create the hotfix branch.

**Scenario 1 (uncommitted changes):**
```bash
git stash push -m "hotfix-stash-$(date +%s)"
```
Record the stash reference.

**Scenario 2 (existing commit):**
No stash needed. Record the commit hash to cherry-pick.

**Scenario 3 (from scratch):**
No stash needed. The fix will be written on the hotfix branch.

**All scenarios — create hotfix branch from fresh main:**
```bash
git checkout main
git pull origin main
git checkout -b hotfix/{slug}
```

Branch naming: `hotfix/` + slugified description (lowercase, hyphens, max 50 chars).
Example: `hotfix/cast-lectureid-uuid-generation-query`

### Step 3: APPLY FIX -- announce: "Step 3: APPLY FIX"

**Goal:** Get the fix code onto the hotfix branch.

**Scenario 1 (from stash):**
```bash
git stash apply stash@{0}
```
If conflicts:
- Report which files conflict and the conflict details.
- STOP and present to user with instructions.
- Do NOT attempt to auto-resolve code conflicts.

**Scenario 2 (cherry-pick):**
```bash
git cherry-pick <commit-hash> --no-commit
```
Using `--no-commit` to allow inspection before committing.

If cherry-pick fails:
```bash
git cherry-pick --abort
# Fallback: generate and apply patch
git diff <commit>~1 <commit> | git apply --3way
```
If both fail: STOP and report the dependency issue (the fix likely depends on code that only exists in the feature branch).

**Scenario 3 (from scratch):**
Delegate to `/nacl-tl-fix` with the user's description. Wait for fix to complete. If `/nacl-tl-fix` fails, STOP and report.

### Step 4: VALIDATE -- announce: "Step 4: VALIDATE"

**Goal:** Verify the fix works on the main branch codebase.

1. Run tests for affected modules:
   ```bash
   cd [module_path] && [test_cmd]
   ```
2. Run build:
   ```bash
   cd [module_path] && [build_cmd]
   ```
3. If tests/build FAIL:
   - Check if failures are related to missing code from the feature branch (dependency issue).
   - If yes: STOP with advisory:
     ```
     This fix depends on code from {source_branch} that does not exist on main.
     Options:
       (a) Include the dependency in the hotfix
       (b) Merge the full feature branch first
       (c) Write a standalone fix for main
     ```
   - If no (pre-existing failures or unrelated): warn but allow user to proceed.

4. Show impact summary:
   ```bash
   git diff --stat main..HEAD
   ```

### Step 5: COMMIT -- announce: "Step 5: COMMIT"

**Goal:** Create a clean commit on the hotfix branch.

1. Stage relevant files (smart staging -- exclude .env, node_modules, dist/, .tl/qa-screenshots/):
   ```bash
   git add [relevant files]
   ```
2. Commit with `hotfix:` prefix (not `fix:`) to clearly distinguish in git log:
   ```bash
   git commit -m "$(cat <<'EOF'
   hotfix: {description}

   Applied as hotfix from {source_branch}.
   Scenario: {1: stash apply | 2: cherry-pick <hash> | 3: authored on hotfix branch}

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

### Step 6: PR + MERGE (USER GATE) -- announce: "Step 6: PR + MERGE"

**Goal:** Get the fix to main via PR with auto-merge.

**Present plan to user (unless `--yes`):**
```
═══════════════════════════════════════════════
  HOTFIX READY TO SHIP
═══════════════════════════════════════════════

Branch: hotfix/{slug}
Target: {main_branch}
Commit: {hash}
Files changed: {N}

The hotfix PR will be created with auto-merge.
CI must pass before merge. After merge, production
deploy triggers automatically via {deploy.production.trigger}.

Proceed? [yes/no]
═══════════════════════════════════════════════
```

**Standard path (PR + auto-merge):**
```bash
git push -u origin hotfix/{slug}

gh pr create \
  --title "hotfix: {description}" \
  --body "$(cat <<'EOF'
## Hotfix

**Priority:** Critical -- production fix

**Source:** {source_branch} (Scenario {N})

### Changes
{git diff --stat summary}

### Test Plan
- [x] Unit tests passing on hotfix branch
- [x] Build succeeds
- [ ] CI pipeline (auto-merge enabled)

Generated with Claude Code via /nacl-tl-hotfix
EOF
)" \
  --base {main_branch} \
  --label "hotfix"

gh pr merge --auto --squash
```

**Force-push path (with `--force-push` flag):**

Requires double confirmation:
```
⚠ DIRECT PUSH TO MAIN ⚠
You are about to push directly to {main_branch}.
This triggers production deploy immediately.
Are you absolutely sure? [yes/no]
```

If confirmed:
```bash
git push origin hotfix/{slug}:{main_branch}
```

### Step 7: RESTORE -- announce: "Step 7: RESTORE"

**Goal:** Return the user to their original branch in a clean state.

```bash
git checkout {source_branch}
```

**Scenario 1 (was stashed):**
```bash
git stash pop
```
The changes are now back as uncommitted on the feature branch (same state as before hotfix).
If stash pop conflicts: leave stash in place, warn user to run `git stash pop` manually.

**Scenario 2 (cherry-picked):**
No stash to restore. The commit still exists on the feature branch. When the user later rebases from main, git will detect the duplicate and skip it cleanly (cherry-pick is dedup-safe).

**Scenario 3 (authored from scratch):**
No stash. The fix exists only on the hotfix branch / main. The feature branch is unmodified.

**If `--rebase-feature` flag:**
```bash
git rebase {main_branch}
```
If rebase conflicts: report and abort (`git rebase --abort`). The user can resolve manually.

### Step 8: ADVISORY -- announce: "Step 8: ADVISORY"

**Goal:** Inform the user about downstream effects.

1. **Feature branch rebase advice** (if not already rebased):
   ```
   Recommendation: rebase your feature branch to pick up the hotfix:
     git checkout {source_branch}
     git rebase {main_branch}
   ```

2. **Other feature branches scan:**
   ```bash
   # Files changed by hotfix
   hotfix_files=$(git diff --name-only {main_branch}~1..{main_branch})
   # Active feature branches
   git branch -r --list 'origin/feature/*'
   ```
   For each remote feature branch, check if it touches the same files:
   ```bash
   git diff --name-only {main_branch}...origin/feature/X
   ```
   If any intersection, report:
   ```
   Feature branches that may need rebase after hotfix merges:
     - feature/FR-002-user-settings (touches: src/auth/service.ts)
     - feature/FR-005-dashboard (touches: src/shared/utils.ts)
   ```

3. **YouGile update** (if configured):
   Post hotfix notification to relevant task chat:
   ```
   send_task_message(taskId, "
   🔥 HOTFIX shipped to {main_branch}

   PR: #{pr_number}
   Commit: {hash}
   Description: {description}

   Production deploy will trigger via {deploy.production.trigger}.
   Monitor: /nacl-tl-deploy --production
   ")
   ```

If YouGile not configured -> skip, report locally.

### Step 9: REPORT (MANDATORY) -- announce: "Step 9: REPORT"

**Goal:** Complete summary.

Present in user's language:

```
═══════════════════════════════════════════════
  HOTFIX SHIPPED
═══════════════════════════════════════════════

Hotfix: {description}
Scenario: {1: stash apply | 2: cherry-pick | 3: authored}

Git:
  Source branch: {source_branch}
  Hotfix branch: hotfix/{slug}
  PR: #{number} (auto-merge: enabled)
  Commit: {hash}
  Target: {main_branch}

Validation:
  Tests: {N} passing
  Build: OK

Source branch restored: {source_branch}
  Working directory: {clean | uncommitted changes restored}

Feature branches to rebase:
  {list or "none detected"}

Production:
  Deploy triggers via: {deploy.production.trigger}
  Monitor: /nacl-tl-deploy --production

Next steps:
  /nacl-tl-deploy --production     -- monitor production deploy
  /nacl-tl-release --patch         -- create patch release after deploy
═══════════════════════════════════════════════
```

---

## Edge Cases

### User is already on main

Valid scenario. Skip stash. Create hotfix branch from current HEAD.
```bash
git checkout -b hotfix/{slug}
```

### Uncommitted changes conflict with main

Report conflicting files after `git stash apply`. User must resolve or simplify the fix.
STOP and present options -- do NOT attempt auto-resolution.

### Cherry-pick commit depends on feature-only code

Build/test failure on hotfix branch reveals this. STOP with advisory:
```
This fix depends on code from {source_branch} that does not exist on main.
Options:
  (a) Include the dependency in the hotfix
  (b) Merge the full feature branch first
  (c) Write a standalone fix for main
```

### CI fails on the PR

Auto-merge will not proceed. Advise user to check CI logs:
```bash
gh run list --branch hotfix/{slug}
```

### Multiple hotfixes in quick succession

Each gets its own `hotfix/` branch and separate PR. They serialize through main via separate PRs. No special handling needed.

### gh CLI not installed or not authenticated

STOP at Step 6 with:
```
GitHub CLI (gh) is required for PR creation.
Install: brew install gh
Authenticate: gh auth login
```

### Stash pop conflicts after returning to feature branch

Leave stash in place. Warn user:
```
Stash pop had conflicts. Your stash is preserved.
Run manually: git stash pop
Then resolve conflicts.
```

### No CI configured

Warn that auto-merge won't work (no status checks). Fall back to manual merge suggestion or `--force-push`.

### Config.yaml missing

Use all defaults (main_branch: "main", etc.).

### YouGile not configured

Skip all YouGile operations. Report locally only.

---

## Cleanup on Failure

If ANY step fails and the workflow cannot continue:

1. If on hotfix branch → `git checkout {source_branch}`
2. If stash was created → `git stash pop` (restore working directory)
3. If hotfix branch was created → `git branch -D hotfix/{slug}` (delete local)
4. If hotfix branch was pushed → warn user to delete remote: `git push origin --delete hotfix/{slug}`
5. Report what happened and what was cleaned up

---

## References

- `config.yaml` → `git.main_branch`, `deploy.production.*`
- `nacl-tl-ship/SKILL.md` — regular shipping (always current branch)
- `nacl-tl-fix/SKILL.md` — spec-first bug fixing (used in Scenario 3)
- `nacl-tl-deploy/SKILL.md` — production deployment monitoring
- `nacl-tl-core/references/commit-conventions.md` — commit message format
