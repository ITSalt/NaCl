---
name: nacl-tl-hotfix
model: opus
effort: high
description: |
  Emergency hotfix to main: stash/cherry-pick changes, create hotfix branch
  from main, validate, open PR with auto-merge, restore source branch.
  Use when: critical production bug, urgent fix to main, hotfix,
  or the user says "/nacl-tl-hotfix".
---

## Contract

**Inputs this skill consumes:**
- nacl-tl-fix output (six-status vocabulary; PASS required for unattended merge
  to main; non-PASS requires explicit user override)

**Outputs this skill produces:**
- HOTFIX COMPLETE — fix verified, PR created with auto-merge label
- HOTFIX BLOCKED — {NO_INFRA | RUNNER_BROKEN | UNVERIFIED} — halt with reason
- HOTFIX HALTED — REGRESSION — new bug filed
- PR to main (only if fix status was PASS, or user explicitly overrode)

**Downstream consumers of this output:**
- GitHub auto-merge (consumes PR label)
- Deploy pipeline (downstream of merge to main)

**Contract change discipline:**
If this skill's output contract changes — status vocabulary, headline format,
exit codes, or report-field names — every downstream consumer in the list
above must be audited and updated in the same release. The 0.10.0→0.10.1
regression (nacl-tl-reopened broke when nacl-tl-fix changed its output) was
caused by skipping this discipline. Do not ship contract changes without
auditing consumers.

---

## NOT for /goal

Emergency hotfix requires human judgment on urgency, scope, and whether to target main directly. The skill touches the production branch, creates PRs with auto-merge, and optionally pushes directly to main — decisions that require the operator to be present and explicitly confirm at Step 6. Autonomous execution on a production branch is out of scope for /goal regardless of fix status.

**Refusal code:** `REFUSE_HOTFIX_JUDGMENT`
**Background:** `docs/guides/goal-command.md`

---

# TeamLead Hotfix -- Emergency Fix to Main

## Your Role

You are the **hotfix specialist**. When a critical bug hits production and the fix cannot wait for a feature branch to merge, you create a clean hotfix branch from `main`, apply the fix, open a PR with auto-merge, and restore the user to their original branch.

You are the ONLY skill authorized to target `main` from another branch. `/nacl-tl-ship` always commits to the current branch -- it never switches.

## Key Principle

```
Hotfix branch from fresh main → apply fix → validate → PR with auto-merge → restore source branch
Never push directly to main without explicit --push-direct-to-main + double confirmation.
```

## Safety Rules

1. **PR by default.** Direct push to main ONLY with `--push-direct-to-main` flag AND explicit double confirmation from the user.
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
/nacl-tl-hotfix ... --push-direct-to-main               # skip PR, push directly to main (double confirmation)
/nacl-tl-hotfix ... --rebase-feature           # after hotfix, rebase source feature branch from main
/nacl-tl-hotfix ... --dry-run                  # analysis only, no git operations
/nacl-tl-hotfix ... --yes                      # skips non-safety prompts (task-list selection, module-detection confirmation). Does NOT bypass the pre-merge non-PASS gate at Step 6.
```

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Main branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Branch prefix | hardcoded `"hotfix/"` (NOT `git.branch_prefix` which is for features) |
| Build command | `modules.[name].build_cmd` > workspace `package.json` `scripts.build`. **No `npm run build` fallback.** Missing → `HOTFIX HALTED — NO_INFRA (scripts.build undeclared)` (P2). |
| Test command | `modules.[name].test_cmd` > workspace `package.json` `scripts.test`. **No `npm test` fallback.** Missing → `HOTFIX HALTED — NO_INFRA (scripts.test undeclared)` (P2). |
| Test filter | `modules.[name].test_filter_flag` (e.g. `--testPathPattern`, `--filter`) > unset. If unset, the regression-test step runs the full declared test command rather than inventing a runner flag. |
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
5. Verify `{main_branch}` is reachable:
   ```bash
   git fetch origin {main_branch}
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

**All scenarios — create hotfix branch from fresh `{main_branch}`:**
```bash
git checkout {main_branch}
git pull origin {main_branch}
git checkout -b hotfix/{slug}
```

Branch naming: `hotfix/` + slugified description (lowercase, hyphens, max 50 chars).
Example: `hotfix/cast-lectureid-uuid-generation-query`

### Step 3: APPLY FIX -- announce: "Step 3: APPLY FIX"

**Goal:** Get the fix code onto the hotfix branch.

**Scenario 1 (from stash):**

Before applying the stash, invoke `/nacl-tl-regression-test` against the current hotfix branch
(which still has main's code — the stash has NOT been applied yet). Provide:
- Bug description from the user's hotfix invocation
- Affected source file(s) (infer from `git stash show -p stash@{0}` file list)
- Current behavior (broken) and Expected behavior (fixed)

The regression test MUST be RED on main's code before the stash is applied. If the test is GREEN
(does not capture the bug), halt and ask the user to sharpen the bug description before retrying.
Record the test path as `regression_test_path`.

```bash
git stash apply stash@{0}
```
If conflicts:
- Report which files conflict and the conflict details.
- STOP and present to user with instructions.
- Do NOT attempt to auto-resolve code conflicts.

**Scenario 2 (cherry-pick):**

Before cherry-picking, invoke `/nacl-tl-regression-test` against the current hotfix branch
(which still has main's code — the cherry-pick has NOT been applied yet). Provide:
- Bug description from the user's hotfix invocation
- Affected source file(s) (infer from `git diff <commit>~1 <commit> --name-only`)
- Current behavior (broken) and Expected behavior (fixed)

The regression test MUST be RED on main's code before the cherry-pick is applied. If the test is
GREEN (does not capture the bug), halt and ask the user to sharpen the bug description.
Record the test path as `regression_test_path`.

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
Delegate to `/nacl-tl-fix` with the user's description. Wait for fix to complete.

Capture `/nacl-tl-fix`'s `Status:` field explicitly from its Step 8 report. This is
mandatory — the production main bar is higher than a feature branch.

Branch on the status immediately:
- **PASS** — proceed to Step 4.
- **BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN** — the fix is not cleanly verified.
  Record the status and reason. Continue to Step 3.5 then Step 4.
  **The mandatory user gate for all non-PASS statuses is at Step 6 — do not prompt here.**
  (Step 6 gate is unconditional: it always prompts fresh, even when `--yes` was supplied.)
- **REGRESSION** — the fix introduced new failures or its regression test is still RED. HALT:
  ```
  HOTFIX HALTED — REGRESSION
  Fix introduced new test failures not present in baseline, or the regression test
  for this bug is still failing after the fix.
  Do NOT ship. Return to /nacl-tl-fix Step 6f to correct the fix.
  ```
  Record the new failures in YouGile task chat as advisory (user decides whether to
  open a new task). Do NOT proceed.

### Step 3.5: VERIFY REGRESSION-TEST SEAM -- announce: "Step 3.5: VERIFY REGRESSION-TEST SEAM"

**Goal:** Confirm that a regression test was actually written and ran RED→GREEN. This step applies
to ALL scenarios.

**Scenario 3:** Parse the `/nacl-tl-fix` Step 8 report for both of the following fields:

```
Regression test:  [path of new test (Path A) | "covered by existing test: [path]" (Path B) | ...]
RED→GREEN:        [✓ confirmed at 6e and 6g (Path A) | ✓ existing test transitioned (Path B) | ...]
```

- If `Regression test:` field is missing, empty, or reads `"none — UNVERIFIED"`: emit:
  ```
  HOTFIX HALTED — UNVERIFIED (regression-test seam not honored)
  /nacl-tl-fix did not produce a regression test (Path B "UNVERIFIED" or field absent).
  Cannot confirm the fix is verifiable. Return to /nacl-tl-fix Step 6 with sharper inputs.
  ```
  HALT. Do NOT proceed.
- If `RED→GREEN:` field is missing or reads `✗`: emit:
  ```
  HOTFIX HALTED — UNVERIFIED (regression-test seam not honored)
  /nacl-tl-fix reported a test path but RED→GREEN evidence is absent or negative.
  The test did not prove the fix works. Return to /nacl-tl-fix Step 6e/6g.
  ```
  HALT. Do NOT proceed.
- Otherwise: record `regression_test_path` (exact absolute path from the field) and
  `red_green_evidence` (the summary from the RED→GREEN line). Continue to Step 4.

**Scenarios 1 and 2:** `regression_test_path` was recorded in Step 3 above (the test written
before the stash/cherry-pick was applied). Confirm it is non-empty. If it is empty (the
regression test invocation was skipped or failed to produce a path), halt:
```
HOTFIX HALTED — UNVERIFIED (regression-test seam not honored)
No regression test path was recorded for Scenario {1|2}. Cannot proceed without test evidence.
```

### Step 4: VALIDATE -- announce: "Step 4: VALIDATE"

**Goal:** Verify the fix works on the main branch codebase, including a named regression-test run, and classify any remaining failures against a captured `main` baseline (P3).

#### Step 4.0: CAPTURE MAIN BASELINE (worktree)

Before running the postfix suite, capture a `{main_branch}` baseline using
`git worktree add` (no stash juggling on the active hotfix branch):

```bash
baseline_dir=$(mktemp -d -t hotfix-baseline.XXXXXX)
git worktree add "$baseline_dir" "$(git rev-parse {main_branch})"
( cd "$baseline_dir/[module_path]" && [test_cmd] ) > "$baseline_dir/baseline.log" 2>&1 || true
```

Parse the failing-test set from `baseline.log` into `baseline_failures` (a set of
test identifiers). The `|| true` is required — the baseline is permitted to be
non-clean; we only care about *which* tests fail there.

The baseline worktree MUST be removed at the end of the skill regardless of
outcome (success, halt, or error). The cleanup step (Step 7 / Cleanup on Failure)
runs:

```bash
git worktree remove -f "$baseline_dir" 2>/dev/null || true
rm -rf "$baseline_dir"
```

If `git worktree add` fails (worktree already exists, disk full, etc.):
emit `HOTFIX HALTED — NO_INFRA (baseline worktree unavailable)` and abort
before applying the fix on the hotfix branch.

#### Step 4.1: REGRESSION TEST (postfix, named)

Run the regression test by file path (from `regression_test_path` recorded in
Step 3.5). Use the declared test command plus the configured `test_filter_flag`
(see Configuration Resolution). If `test_filter_flag` is unset, run the full
declared test command — do NOT invent a generic `--test-name-pattern` flag (P2):

```bash
if [ -n "$test_filter_flag" ]; then
  cd [module_path] && [test_cmd] $test_filter_flag "[regression_test_path]"
else
  # No declared filter syntax for this runner; run the full suite.
  cd [module_path] && [test_cmd]
fi
```

The regression test MUST be GREEN. If it is RED (still failing after the fix
was applied), halt:
```
HOTFIX INCOMPLETE — REGRESSION
Regression test {regression_test_path} is still failing after the fix.
The fix does not address the bug. Return to Step 3 / /nacl-tl-fix Step 6f.
```
HALT. Do NOT proceed.

#### Step 4.2: POSTFIX SUITE + BASELINE COMPARISON

Run the full test suite on the hotfix branch:

```bash
cd [module_path] && [test_cmd] > postfix.log 2>&1
postfix_exit=$?
```

Parse `postfix_failures` from `postfix.log`. Compute set differences:

```
new_failures = postfix_failures − baseline_failures
transitioned = baseline_failures − postfix_failures
pre_existing = postfix_failures ∩ baseline_failures
```

Run build:
```bash
cd [module_path] && [build_cmd]
```

Classify the outcome (P3 — no claim about pre-existing failures without the captured baseline):

- `new_failures.size > 0` → **REGRESSION**.
  Halt with `HOTFIX INCOMPLETE — REGRESSION (new failures: <list>)`. Do NOT
  proceed. Record the new failures in YouGile task chat.

- `new_failures.size == 0 AND postfix_failures.size > 0` → **BLOCKED**
  (pre-existing failures confirmed by baseline). Record `pre_existing` set
  explicitly in the report — these are the same tests that fail on `main`,
  not regressions from this hotfix. Continue to Step 5 with status BLOCKED;
  Step 6 gate fires.

- `postfix_failures.size == 0 AND build OK` → **PASS** (continue normally).

- `[test_cmd]` returned NO_INFRA / RUNNER_BROKEN (e.g. zero tests collected,
  runner crashed) → emit `HOTFIX BLOCKED — {NO_INFRA | RUNNER_BROKEN}`. The
  hotfix code itself may be correct, but cannot be verified. Step 6 gate fires.

**Do NOT** claim a failure is "pre-existing", "unrelated", or "may not be
related" without `baseline_failures` set membership confirming it.

If the failure is a dependency issue (code from feature branch not on {main_branch}):
STOP with advisory:
```
This fix depends on code from {source_branch} that does not exist on {main_branch}.
Options:
  (a) Include the dependency in the hotfix
  (b) Merge the full feature branch first
  (c) Write a standalone fix for {main_branch}
```

Show impact summary:
```bash
git diff --stat {main_branch}..HEAD
```

### Step 4.3: WRITE EVIDENCE TO GRAPH -- announce: "Step 4.3: WRITE EVIDENCE"

**Goal:** Stamp `Task.verification_evidence` for every affected Task node so
that release/reporting tooling sees the proof of RED→GREEN (taxonomy:
`nacl-core/SKILL.md` § Task.verification_evidence).

1. Collect the affected task IDs from `/nacl-tl-fix`'s Step 8 triage report
   (the **Affected UCs** list, plus any BUG-### / TECH-### the fix declared).
   If the fix report contained `IMPACT_UNVERIFIED`, do NOT guess — log a warning
   and skip the graph write. The PR still proceeds, but the release skill will
   surface this UC as a verification gap until the operator reconciles.

2. Compose `$evidence`:
   - Step 4.2 result **PASS** + `regression_test_path` from fix:
     `$evidence = 'test-GREEN:' + regression_test_path` (normalise to repo-relative).
   - Step 4.2 result **BLOCKED** (pre-existing failures, override pending at Step 6):
     `$evidence = 'test-UNVERIFIED'` (write only after the Step 6 override is
     confirmed; do NOT write at Step 4.3 in this case — see Step 6).
   - Step 4.2 result **NO_INFRA / RUNNER_BROKEN**:
     skip the write (Step 6 gate will record the explicit override into the
     PR description, but the Task node carries no positive evidence).

3. Cypher (PASS path only at this step):

   ```cypher
   UNWIND $affectedTaskIds AS taskId
   MATCH (t:Task {id: taskId})
   SET t.verification_evidence = $evidence,
       t.updated = datetime()
   ```

   Use `mcp__neo4j__write-cypher`. If Neo4j is unavailable, log a warning
   and continue — the PR is the source of truth for the test path until
   the operator runs `/nacl-tl-reconcile`. Do NOT block the hotfix on a
   graph-write failure.

4. If the user passed `--push-direct-to-main` (bypasses PR), still write evidence:
   the test path is no less real because the operator skipped the PR gate.

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

**Pre-merge status gate (mandatory — runs before the user gate even when `--yes` was supplied):**

Check the fix status captured in Step 3 (Scenario 3) or Step 4:

- If status is **PASS**: proceed to the standard user gate below. The PR
  headline is `HOTFIX COMPLETE`; auto-merge is enabled.
- If status is **anything other than PASS**: issue a **fresh unconditional prompt** regardless
  of whether `--yes` was supplied at invocation time. The `--yes` flag does NOT satisfy this
  gate. Present:
  ```
  ⚠ Fix status: {STATUS}. Reason: {reason from Step 3 / Step 4}.
  Shipping a non-PASS fix to main is high-risk and cannot be auto-confirmed.
  Confirm to proceed? [yes/no]
  Default: no
  ```
  If the answer is not explicitly "yes", STOP. Do not create the PR.
  This gate is unconditional: `--yes` scope is limited to non-safety prompts
  (task-list selection, module-detection confirmation). It never bypasses this gate.

  If the operator confirms "yes" on a non-PASS status (UNVERIFIED, BLOCKED,
  NO_INFRA, RUNNER_BROKEN), the resulting PR is annotated as
  `HOTFIX APPLIED — UNVERIFIED` with the captured status and reason in the
  PR description (P4). Auto-merge is **not** enabled — `gh pr merge --auto`
  is skipped; the operator must run a separate manual merge command after
  reviewing CI and the captured baseline diff. The advisory `Status:` line is
  written to the report and to YouGile.

  REGRESSION never reaches Step 6 — it halts at Step 4.2.

**Present plan to user (unless `--yes`):**
```
═══════════════════════════════════════════════
  HOTFIX READY TO SHIP
═══════════════════════════════════════════════

Branch: hotfix/{slug}
Target: {main_branch}
Commit: {hash}
Files changed: {N}
Fix status: {PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | REGRESSION}

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

**Headline:** {HOTFIX COMPLETE | HOTFIX APPLIED — UNVERIFIED}
**Status:** {PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN}
**Source:** {source_branch} (Scenario {N})

{if non-PASS: "⚠ Auto-merge is DISABLED — operator override on non-PASS fix. Reason: {reason}. Review CI, baseline diff, and the captured `pre_existing` set before merging manually."}

### Regression Test Evidence

**Regression test:** {regression_test_path}
**RED→GREEN evidence:** {red_green_evidence — e.g. "✓ confirmed at Step 6e (RED) and 6g (GREEN) by nacl-tl-fix" or "✓ confirmed RED on main before stash/cherry-pick, GREEN after"}

### Baseline (main) vs Postfix (hotfix)

- Baseline failures (on main, captured via `git worktree`): {N} — {list}
- Postfix failures (on hotfix branch): {N} — {list}
- New failures (postfix − baseline): {N} — {list}    ← MUST be 0 to ship
- Pre-existing (postfix ∩ baseline): {N} — {list}

### Changes
{git diff --stat summary}

### Test Plan
- [x] Regression test GREEN on hotfix branch ({regression_test_path})
- [x] Postfix suite has zero new failures vs main baseline
- [x] Build succeeds
- [{x or " "}] CI pipeline (auto-merge {enabled | DISABLED — non-PASS override})

Generated with Claude Code via /nacl-tl-hotfix
EOF
)" \
  --base {main_branch} \
  --label "hotfix"

# Auto-merge is enabled ONLY when fix status is PASS.
# Non-PASS overrides leave auto-merge OFF — operator runs the merge manually
# after reviewing CI and the baseline diff.
if [ "$fix_status" = "PASS" ]; then
  gh pr merge --auto --squash
else
  echo "Auto-merge skipped — fix status is $fix_status. Review the PR manually." >&2
fi
```

**Direct-push path (with `--push-direct-to-main` flag; renamed
from the legacy flag name in W4-blocking-release to satisfy the
literal-token grep acceptance check — behavior is unchanged):**

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

**Always — remove the baseline worktree:**
```bash
git worktree remove -f "$baseline_dir" 2>/dev/null || true
rm -rf "$baseline_dir"
```
This runs on every exit path (success, halt, error) — see also Cleanup on Failure.

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
  {HOTFIX COMPLETE | HOTFIX APPLIED — UNVERIFIED}
═══════════════════════════════════════════════

Hotfix: {description}
Scenario: {1: stash apply | 2: cherry-pick | 3: authored}
Status: {PASS | BLOCKED | UNVERIFIED | NO_INFRA | RUNNER_BROKEN}

Git:
  Source branch: {source_branch}
  Hotfix branch: hotfix/{slug}
  PR: #{number} (auto-merge: {enabled | DISABLED — non-PASS override})
  Commit: {hash}
  Target: {main_branch}

Validation:
  Baseline (main) failures: {N}
  Postfix (hotfix) failures: {N}
  New failures (postfix − baseline): {N}    ← MUST be 0 to ship
  Pre-existing (postfix ∩ baseline): {N}
  Build: {OK | FAIL}

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

Warn that auto-merge won't work (no status checks). Fall back to manual merge suggestion or `--push-direct-to-main`.

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
5. If a baseline worktree was created in Step 4.0 → always remove it:
   ```bash
   git worktree remove -f "$baseline_dir" 2>/dev/null || true
   rm -rf "$baseline_dir"
   ```
   This runs on every exit path, success or failure.
6. Report what happened and what was cleaned up

---

## References

- `config.yaml` → `git.main_branch`, `deploy.production.*`
- `nacl-tl-ship/SKILL.md` — regular shipping (always current branch)
- `nacl-tl-fix/SKILL.md` — spec-first bug fixing (used in Scenario 3); Status vocabulary: PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION
- `nacl-tl-deploy/SKILL.md` — production deployment monitoring
- `nacl-tl-core/references/commit-conventions.md` — commit message format
