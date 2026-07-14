---
name: tl-deliver
model: sonnet
effort: low
description: |
  Delivery orchestrator: push feature branch, wait for CI, verify on staging, health check.
  Chains nacl-tl-ship, nacl-tl-verify, and nacl-tl-deploy into a single continuous pipeline.
  Use when: deliver to staging, push and verify, ship feature branch,
  or the user says "/nacl:tl-deliver".
---

## Contract

**Inputs this skill consumes:**
- Per-UC dev statuses: Neo4j graph (primary) / .tl/status.json (fallback when Neo4j unavailable)
- /nacl:tl-verify results per UC
- /nacl:tl-deploy result for the staging environment

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
/nacl:tl-deliver                          # deliver current branch
/nacl:tl-deliver --branch feature/FR-001  # deliver specific branch
/nacl:tl-deliver --feature FR-001         # deliver by feature request ID
/nacl:tl-deliver --env staging            # target environment (default: staging)
/nacl:tl-deliver --env production         # target production (extra safety checks)
```

### Removed Flags (W4-blocking-release)

The SKIP-VERIFY flag (was: "push + CI only, no staging
verification") and the SKIP-DEPLOY flag (was: "push + CI + verify,
no health check") were REMOVED in W4-blocking-release. Their
literal tokens are scrubbed from this skill's prose. The bypass
use case routes through:

- **Signed exceptions** (for known, planned carve-outs) — file
  under `.tl/exceptions/<exception_id>.yaml` with explicit
  `affected_gates`; consumed by the release skill. See
  `nacl-tl-release/SKILL.md` § "Release Blocking Gates
  (Strict-Only)".
- **Emergency mode** (for reactive bulk-bypass) — three env vars
  on the invoking shell. See
  `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/emergency-mode.md`.

Neither path re-enables the removed flags. The flag surface is
gone.

### Configuration Resolution

| Data | Source priority |
|------|---------------|
| Git strategy | `git.strategy` > `modules.[name].git_strategy` > fallback `"feature-branch"` |
| Base branch | `git.main_branch` > `modules.[name].git_base_branch` > fallback `"main"` |
| Build command | `modules.[name].build_cmd` > workspace `package.json` `scripts.build`. **No `npm run build` fallback.** Missing → `DELIVER HALTED — NO_INFRA (scripts.build undeclared)` (P2). |
| Test command | `modules.[name].test_cmd` > workspace `package.json` `scripts.test`. **No `npm test` fallback.** Missing → `DELIVER HALTED — NO_INFRA (scripts.test undeclared)` (P2). |
| Package manager | `build.package_manager` > `package.json` `packageManager` > lockfile detection. Mixed → `BLOCKED (clean-checkout-pm-ambiguous)` (Step 4b). |
| Runtime assets | `runtime_assets` (list of paths relative to build output, per workspace). Missing assets in clean-checkout → `BLOCKED (clean-checkout-runtime-assets-missing)` (Step 4b). See `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/config-schema.md` § `runtime_assets`. |
| Smoke endpoints | `deploy.smoke.endpoints` (list of paths). Default: `["/api/health"]` (records `PASS_HEALTH_ONLY`). |
| Entrypoint | `build.entrypoint` > `package.json` `main` > `dist/index.js`. |
| Migrate cmd | `build.migrate_cmd` > undefined (then migrate stage `SKIPPED`). |
| Test database URL | `build.test_database_url` > undefined (then BLOCKED if migrate would run). |
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
  "clean_checkout": {
    "status": "pending",
    "commit": null,
    "artifact_path": null
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
   - If uncommitted changes exist → **STOP**: "Uncommitted changes detected. Run /nacl:tl-conductor or commit manually first."
   - **Goal-context exception (2.14+)**: when `NACL_GOAL_RUN_ID` is set and
     `.tl/goal-runs/$NACL_GOAL_RUN_ID/plan.lock.json` carries
     `preexisting_dirty_files[]`, those exact paths are EXPECTED dirt —
     another agent's in-flight work in the shared worktree (Smart WIP).
     Tolerate them: they are not staged, not pushed, and do not block
     delivery. Any uncommitted path NOT in that list still STOPs as above.

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
     Automated delivery via /nacl:tl-deliver

     Generated with Claude Code
     EOF
     )" \
       --base [base_branch]
     ```
   - If PR exists: note its URL
   - **Goal-context (2.14+, `NACL_SHIP_PUSH=deferred`)**: this Step-2 push is
     THE single push of the goal run — per-atom commits stayed local. Read
     the PR body from `.tl/goal-runs/$NACL_GOAL_RUN_ID/pr-body.md` (rendered
     and finalized by the wrapper) instead of the auto-generated git-log
     body, so the goal-run PR opens with the full atom table. Title = first
     line of that file stripped of the leading `## `. After creation the
     wrapper writes `pr.json` from the result; CI runs once, on the full
     batch.

3. YouGile: post ship notification to task chat (if configured)

4. Update delivery-status.json: `ship.status = "done"`, record commit hash, PR URL

→ **Output:** commit hash, branch name, PR URL (if created)

---

### Step 3: WAIT FOR CI

1. Wait for the push-triggered CI via the single-authority helper (run selection + watch +
   outcome classification; constants documented in-script; shared with release/deploy;
   pinned by `${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/wait-for-ci.test.sh`):
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/wait-for-ci.sh watch --branch [branch] --since "$push_iso" \
     --timeout "${ci_timeout:-600}"
   # exit 0 → CI_OK | NO_CI (no `.github/workflows` → skip, proceed to verify) | NO_RUN (warn & proceed)
   # exit 1 → CI_FAILED (failed-log tail already printed) — handle as item 4 below

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

### Step 4: VERIFY (mandatory; W4-blocking-release)

The SKIP-VERIFY flag was removed in W4-blocking-release. Step 4 is
now mandatory on every delivery. The `verification_evidence =
'no-test'` write that the removed flag used to produce is no
longer producible by this skill — the release skill consumed that
evidence string only as an artifact of the removed flag.

Override paths (single-run carve-outs):

- **Signed exception** for a planned carve-out. The exception lives
  in `.tl/exceptions/<exception_id>.yaml`; it does NOT relax this
  step, but it lets the downstream release skill accept the
  resulting `UNVERIFIED` aggregate for the specific gates the
  exception names. The deliverable carve-out targets are
  `upstream-qa-unverified` and `LIVE_PROVIDER_SMOKE` /
  `PROD_GOLDEN_PATH` (W3 names).
- **Emergency mode** (`NACL_EMERGENCY=1` + companion env vars)
  for reactive bulk-bypass. The deliver run prints a bypass
  banner per refusal, writes an event under `.tl/emergencies/`,
  and produces a `(emergency-bypass)` Status: suffix. See
  `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/emergency-mode.md`.

Step 4 proceeds as below in every standard delivery:

0. **Pre-verify dev status check:**

   Before invoking /nacl:tl-verify for any UC, resolve its dev status using
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
   | PASS (done) | Proceed with /nacl:tl-verify normally |
   | UNVERIFIED (verified-pending) | Post advisory: "UC### dev status UNVERIFIED. /nacl:tl-verify will run but results have reduced confidence. Proceed? [yes/no]". If yes → run verify; if no → skip UC (mark as skipped in delivery) |
   | BLOCKED (blocked) | Same as UNVERIFIED: advisory + user gate |
   | Not found / old-style "done" | Proceed (backward-compat) |
   | REGRESSION (failed) | DO NOT run /nacl:tl-verify. Log: "UC### skipped — REGRESSION status" |

1. Determine which UCs to verify:
   - If conductor-state.json exists → read completed UC list
   - If `--feature FR-001` → read FR's UC list from feature-request artifact
   - Fallback: verify all UCs found in `.tl/status.json` with status "done"
     or "verified-pending" (with user gate for the latter)

2. For each UC that passes the pre-verify gate (Step 4.0):
   Launch sub-agent (Task tool):
   ```
   Execute /nacl:tl-verify UC###
   ```
   
   nacl-tl-verify internally runs:
   - `/nacl:tl-verify-code` (static analysis, fast)
   - `/nacl:tl-qa` (E2E on staging, only if code analysis says PASS_NEEDS_E2E)

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
   - If ALL UCs FAIL → **STOP**, recommend /nacl:tl-reopened

→ **Output:** verification report per UC

---

### Step 4b: CLEAN-CHECKOUT GATE (Strict-Only; W9-ci-clean-checkout)

This gate runs AFTER Step 4 VERIFY but BEFORE Step 5 DEPLOY HEALTH
CHECK on every delivery. It exists because 17 of the ~60 baseline
signals (the largest single bucket) are config / infra / CI drift
that ONLY surface on a clean runner: pnpm version mismatch,
Prisma generate missing, TEST_DATABASE_URL unset, tsconfig
divergence, drizzle journal drift, pm2 entry-point confusion, and
non-TS runtime assets (ffmpeg, ffprobe, prompt markdown, fonts,
locale data) absent from build output. The pattern is "first CI
run on a clean runner exposes drift after the wave is declared
done." A pre-existing local `node_modules/` and a warm
`dist/` mask these failures; only a shallow clone into a fresh
directory followed by a full install + build + smoke catches them.

VERIFIED is refused unless this gate completes with PASS.

#### Procedure

1. **Determine wave-tip commit and project package manager:**
   - `commit = $(git rev-parse HEAD)` on the branch being delivered.
   - `package_manager = config.yaml → build.package_manager` (default
     resolved from `packageManager` field in `package.json` if
     present, else from lockfile presence: `pnpm-lock.yaml` → pnpm,
     `package-lock.json` → npm, `yarn.lock` → yarn). The clean-checkout
     gate uses this single resolved value; mixed package managers in
     one workspace fail the gate with `BLOCKED — clean-checkout-pm-ambiguous`.

2. **Shallow clone into a fresh directory:**
   ```bash
   tmpdir=$(mktemp -d -t nacl-clean-checkout-XXXXXX)
   git clone --depth 1 --branch "$branch" "$repo_url" "$tmpdir/repo"
   cd "$tmpdir/repo"
   git checkout "$commit"
   ```
   - The directory MUST be fresh (no inherited `node_modules/`,
     `dist/`, `.next/`, `prisma/generated/`, or other build cache).
     Local pnpm/yarn/npm caches MAY be reused (this is a CI runner
     simulation, not an offline test).

3. **Install:**
   ```bash
   # pnpm: respects packageManager field and pnpm-lock.yaml
   pnpm install --frozen-lockfile
   # npm: npm ci
   # yarn: yarn install --frozen-lockfile
   ```
   - If install fails → BLOCKED with `clean-checkout-install-failed`.
     Capture stderr tail (50 lines) to evidence.

4. **Build (all workspaces):**
   ```bash
   pnpm -r build       # or: npm run build / yarn build
   ```
   - If build fails → BLOCKED with `clean-checkout-build-failed`.
   - If `config.yaml → build.requires_prisma_generate: true`, the
     build step MUST include `prisma generate` upstream of the
     compile (either via a `prebuild` script or a workspace-level
     equivalent). Missing → BLOCKED with `clean-checkout-prisma-generate-missing`.

5. **Verify runtime assets present in build output:**

   Read `config.yaml → runtime_assets` (list of paths relative to
   each workspace's build-output root). For each entry, assert the
   file or directory exists under the built artifact tree. Missing
   any required runtime asset → **BLOCKED**, NOT a WARNING.

   See `${CLAUDE_PLUGIN_ROOT}/nacl-tl-core/references/config-schema.md` § `runtime_assets`
   for the schema and defaults for common project shapes.

6. **Migrate (only if DB tooling is present):**
   - If `config.yaml → build.migrate_cmd` is set, run it against a
     scratch database (the URL comes from
     `config.yaml → build.test_database_url` — if absent, the gate
     reports BLOCKED with `clean-checkout-test-database-url-undefined`
     when the migrate step would otherwise run).
   - If no DB tooling configured → migrate stage is recorded as
     `SKIPPED` (not BLOCKED) and the gate proceeds.

7. **Run-smoke (boot the entrypoint, hit health, hit one product endpoint):**
   ```bash
   pnpm start &        # or: node dist/index.js, or service-specific entry
   PID=$!
   # Wait for health (curl loop with timeout)
   # Hit /api/health -> expect 200
   # Hit one product endpoint named in config.yaml -> deploy.smoke.endpoints[0] -> expect 2xx
   kill $PID
   ```
   - Entrypoint resolution comes from `config.yaml → build.entrypoint`
     (default: `package.json` `main` field, else `dist/index.js`).
   - Product-endpoint smoke list comes from
     `config.yaml → deploy.smoke.endpoints` (list of paths; default:
     `["/api/health"]` for projects without product surface; if
     defaulted, this is recorded as `health-only` smoke evidence
     and the smoke status is `PASS_HEALTH_ONLY`).
   - Any non-2xx → BLOCKED with `clean-checkout-smoke-failed` plus
     the failing path.
   - Entrypoint that fails to bind a port within 60s → BLOCKED with
     `clean-checkout-entrypoint-no-port`. This is the
     project-beta `dist/index.js` vs `dist/server.js` pattern.

8. **Capture evidence to `.tl/clean-checkout/<commit>.json`** (artifact
   schema: see `.tl/clean-checkout/_template.json`). Fields:
   - `commit`
   - `started_at`, `completed_at` (ISO-8601 UTC)
   - `build_status`: `PASS` | `FAIL`
   - `migrate_status`: `PASS` | `FAIL` | `SKIPPED`
   - `smoke_status`: `PASS` | `PASS_HEALTH_ONLY` | `FAIL`
   - `runtime_assets_verified`: list of `{path, present: bool}`
   - `terminal_status`: `PASS` | `BLOCKED`
   - `blocker_detail`: workflow-detail string (only when terminal_status = BLOCKED)

#### Override paths (single-run carve-outs)

The gate does NOT support an inline override flag. Bypass paths:

- **Signed exception** under `.tl/exceptions/<exception_id>.yaml`
  with `affected_gates` enumerating one of:
  `clean-checkout-install-failed`, `clean-checkout-build-failed`,
  `clean-checkout-smoke-failed`,
  `clean-checkout-runtime-assets-missing`,
  `clean-checkout-prisma-generate-missing`,
  `clean-checkout-test-database-url-undefined`,
  `clean-checkout-entrypoint-no-port`,
  `clean-checkout-pm-ambiguous`.
- **Emergency mode** (`NACL_EMERGENCY=1` plus
  `NACL_EMERGENCY_REASON` and `NACL_EMERGENCY_OWNER`). The gate
  advances under a recorded bypass; closed Status: is
  `PARTIALLY_VERIFIED` with `(emergency-bypass)` suffix. The
  evidence artifact still records the underlying BLOCKED detail.

Neither path re-enables a `--skip-clean-checkout` flag; no such
flag exists.

#### Worked examples (from baseline retrospectives)

**Project-Alpha pnpm/Prisma/TEST_DATABASE_URL cluster.** Local dev had
pnpm-lock.yaml, a warm `node_modules/`, and a populated dev
database. The first clean CI runner failed at three layers:
(a) pnpm version mismatch (the lockfile demanded a newer pnpm
than the runner had — `packageManager` field undeclared); (b)
`prisma generate` missing from the build step (local dev had run
it eagerly at install time); (c) `TEST_DATABASE_URL` unset in CI,
causing migration to silently target the local dev DB during
build. Each was caught only after green local + green review.
The clean-checkout gate would have blocked at step 3 (install),
step 4 (build → `clean-checkout-prisma-generate-missing`), and
step 6 (`clean-checkout-test-database-url-undefined`)
respectively, on the first delivery attempt.

**Project-Beta ffmpeg / pm2 entry / prompt-markdown cluster.**
The build emitted `dist/*.js` cleanly but omitted non-TS assets:
the `worker/src/llm/prompts/{ru,en}/protocol.md` templates
disappeared (tsc copies only `.ts`), the `ffprobe` binary was
expected on `PATH` but the container image did not ship one, and
pm2's ecosystem entry pointed at `dist/server.js` (factory file
returning `buildApp()`) instead of `dist/index.js` (the file that
calls `.listen()`). The clean-checkout gate would have caught:
(a) missing prompt markdown via `runtime_assets: [worker/dist/llm/prompts/ru/protocol.md, worker/dist/llm/prompts/en/protocol.md]`
→ `clean-checkout-runtime-assets-missing`; (b) entrypoint that
never binds a port → `clean-checkout-entrypoint-no-port`; (c)
ffprobe absence via `runtime_assets: [bin/ffprobe]` on the
built-artifact bundle. None of these reach the runtime in
production if the gate runs against a fresh checkout.

#### Headline contribution

- Clean-checkout PASS + Step 5 PASS → DELIVER COMPLETE.
- Clean-checkout BLOCKED, no exception, no emergency →
  **DELIVER HALTED — UNVERIFIED (clean-checkout-<detail>)**.
  IntakeItems are NOT stamped delivered.
- Clean-checkout BLOCKED, signed exception covers the specific
  detail → delivery proceeds with a banner; closed Status: is
  `PARTIALLY_VERIFIED` and IntakeItems are stamped delivered with
  `i.delivery_note` referencing the exception_id.
- Clean-checkout BLOCKED, emergency mode → delivery proceeds with
  `(emergency-bypass)` suffix; closed Status: is
  `PARTIALLY_VERIFIED`; IntakeItems are NOT stamped delivered.

---

### Step 5: DEPLOY HEALTH CHECK (mandatory; W4-blocking-release)

The SKIP-DEPLOY flag was removed in W4-blocking-release. The
inline operator health-failure override was also removed. Step 5
is now mandatory on every delivery; failure refuses VERIFIED with
no inline opt-out.

1. Read staging URL from config:
   ```
   url = config.yaml → deploy.staging.url
   health = config.yaml → deploy.staging.health_endpoint (default: /api/health)
   ```
   - If no staging URL configured → `DELIVER HALTED — UNVERIFIED
     (no-staging-url-without-exception)`. Override paths are
     signed exception (`affected_gates: [missing-prod-golden-path]`
     plus an explicit staging-url carve-out) or emergency mode.

2. Health probe via the single-authority helper (propagation wait + retry count + interval
   documented in-script; shared with release; pinned by `${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/health-check.test.sh`):
   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/nacl-core/scripts/health-check.sh --url "[url][health]"
   ```
   - exit 0 `HEALTH_OK` → deployment healthy. Continue.
   - exit 1 `HEALTH_FAILED` (after the 3 retries) → **HALT**:
     ```
     DELIVER HALTED — UNVERIFIED (health failed)
     Staging health endpoint did not return 200 OK after 3 retries.
     IntakeItems have NOT been stamped as delivered.

     Resolution options:
       [1] Fix the staging deploy and re-run /nacl:tl-deliver.
       [2] File a signed exception under .tl/exceptions/ with
           affected_gates: [missing-prod-golden-path] for the
           release-time gate, then re-run.
       [3] Invoke emergency mode (NACL_EMERGENCY=1 +
           NACL_EMERGENCY_REASON + NACL_EMERGENCY_OWNER); the
           delivery advances with a (emergency-bypass) suffix
           and is NEVER promoted to VERIFIED.
     ```
   - HEALTH_ONLY (a green `/health` probe with no `PROD_GOLDEN_PATH`
     execution) is **not** product-readiness evidence. A green
     probe here only certifies that staging accepts HTTP; it does
     NOT replace the W3 `PROD_GOLDEN_PATH` evidence requirement at
     the release-time gate.

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
      Graph state may be stale — reconcile later with /nacl:tl-diagnose.
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

Headline selection (W4-blocking-release strict):
  DELIVER COMPLETE
    — all UCs PASS, every mandatory step ran, health check OK.
  DELIVER COMPLETE — emergency-bypass
    — emergency mode (NACL_EMERGENCY=1) invoked; one or more
      mandatory steps refused VERIFIED; the delivery advanced
      under a recorded bypass; closed Status: is PARTIALLY_VERIFIED.
  DELIVER APPLIED — UNVERIFIED
    — any UC has UNVERIFIED dev status; no IntakeItem stamped
      delivered for the UNVERIFIED UC; PASS UCs are stamped normally.
  DELIVER HALTED — UNVERIFIED (health failed)
    — Step 5 health check failed; no inline override (W4 strict).
  DELIVER HALTED — UNVERIFIED (clean-checkout-<detail>)
    — Step 4b clean-checkout gate (W9) failed at install / build /
      smoke / runtime-asset / prisma / entrypoint / pm-ambiguous;
      detail names the specific failure. IntakeItems NOT stamped.
  DELIVER HALTED — UNVERIFIED (no-staging-url-without-exception)
    — no staging URL configured and no signed exception covers it.
  DELIVER HALTED — NO_INFRA (scripts.{test|build} undeclared)
    — declared workspace command missing; no fallback (P2).
  DELIVER INCOMPLETE — REGRESSION
    — any UC has REGRESSION status.

The pre-W4 vocabulary (`DELIVER APPLIED — UNVERIFIED (skipped:
SKIP-VERIFY-FLAG)` and `DELIVER APPLIED — UNVERIFIED (health
failed, operator override)`) is no longer producible — the flag
and the inline operator override were removed.

Next:
  /nacl:tl-release          — when ready for production
  /nacl:tl-reopened         — if verification issues found
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
  /nacl:tl-reopened UC029   — fix and re-verify
  /nacl:tl-release          — release verified UCs only
═══════════════════════════════════════════════════════════════
```

---

## Resumption Logic

On start, if `.tl/delivery-status.json` exists and branch matches:

1. Read status file
2. Find first incomplete step:
   ```
   ship.status != "done"             → resume from Step 2
   ci.status != "done"               → resume from Step 3
   verify.status != "done"           → resume from Step 4
   clean_checkout.status != "done"   → resume from Step 4b
   deploy.status != "done"           → resume from Step 5
   graph.status != "done"            → resume from Step 6
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

1. **Pre-check:** verify branch has been merged to `{main_branch}` (or is `{main_branch}`)
   ```bash
   git log {main_branch} --oneline | grep [commit_hash]
   ```
   - If commit not on `{main_branch}` → **STOP**: "Code must be merged to {main_branch} before production deploy"

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
nacl-tl-conductor → calls /nacl:tl-deliver after all development complete
nacl-tl-deliver internally:
  Step 2: uses git + gh CLI directly (NOT /nacl:tl-ship — to avoid double test/build)
  Step 4: delegates to /nacl:tl-verify (which runs /nacl:tl-verify-code + /nacl:tl-qa)
  Step 5: uses curl for health check (NOT /nacl:tl-deploy — simpler, no pipeline monitoring needed)
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
