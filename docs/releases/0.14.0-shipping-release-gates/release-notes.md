# NaCl 0.14.0 — Shipping & Release Gates

0.13.0 closed the honest-reporting gaps in the verification, fix-derivative,
operational, reporting-hygiene, and reliability layers. After 0.13.0 every
leaf skill produced one of the six canonical statuses
(`PASS / UNVERIFIED / BLOCKED / NO_INFRA / RUNNER_BROKEN / REGRESSION`) and
every orchestrator collapsed those statuses into status-aware headlines.

What 0.13.0 left behind: the five orchestration paths that move work toward
`main`, deployment, delivery, or release still had local rules for *when an
unverified or unknown-status report could pass through*. Conductor parsed
upstream reports by headline rather than `Status:`. Hotfix claimed
"pre-existing failures" without a captured baseline and still shelled out
to `npm test` / `npm run build` when no module command was declared.
Deliver's `--skip-verify` silently suppressed verification with no graph
audit trail. Ship's "warn and proceed" path ran when no upstream status
existed at all. Release's `--skip-merge` and direct strategies skipped the
UC status gate entirely; production health failure only warned;
UNVERIFIED IntakeItems still received a "release note instead" stamp.

0.14.0 closes those five paths in one bundled release. After this release
no unverified or unknown-status work can be committed, shipped, deployed,
delivered, or released without an explicit non-PASS status, an
operator-initiated override, and a non-PASS report headline.

The release threads five cross-cutting principles through the affected
skills:

1. **`Status: {value}` is the only authoritative classifier.** Every
   skill that consumes another skill's report parses the `Status:` line.
   Headlines remain status-aware but advisory. A report whose `Status:`
   line and headline disagree is classified by `Status:`; the
   disagreement is logged.
2. **Declared workspace commands only.** No skill may fall back to
   `npm test`, `npm run build`, `npx tsc`, or any other invented command.
   Missing `scripts.test`/`scripts.build` is `NO_INFRA`, not a hidden
   default.
3. **Baseline before claim.** Any "pre-existing failures",
   "regression", or "new failures" claim requires a captured baseline
   run on the unchanged code, a postfix run on the changed code, and a
   set-difference. No baseline ⇒ no regression claim ⇒ status is
   `UNVERIFIED`, not `BLOCKED`.
4. **Skip ⇒ unverified, never PASS.** Any skill with a skip flag
   (`--skip-verify`, `--skip-merge`) emits `<SKILL> APPLIED — UNVERIFIED
   (skipped: <flag>)`, refuses to auto-merge / auto-deploy / auto-stamp
   downstream state, and records the skip flag and reason in the report
   and in the graph (`Task.verification_skip_reason`).
5. **No autonomous branch switching.** Reaffirmed for `nacl-tl-ship` —
   ship commits to the current branch only; hotfix-to-main is a
   separate user-initiated skill (`/nacl-tl-hotfix`); a non-PASS
   upstream status does NOT cause ship to pivot to a hotfix branch or
   to `main`.

---

## Why This Release Exists

After 0.13.0 the dev, verification, and orchestrator layers reported
honest status. But the five orchestration paths to `main` /
deployment / delivery / release still had local loopholes:

- **`nacl-tl-hotfix`** — claimed "pre-existing failures" on `main`
  without ever capturing a `main` baseline; `npm run build` and
  `npm test` were the implicit fallbacks; the regression-test step
  appended a generic `--test-name-pattern` flag that does not exist on
  every runner; non-PASS overrides could still trigger
  `gh pr merge --auto`.
- **`nacl-tl-conductor`** — parsed sub-skill reports by headline,
  not by the `Status:` line. Since 0.10.0 `nacl-tl-fix` has used the
  same headline (`FIX APPLIED — UNVERIFIED`) for several distinct
  statuses; the conductor's headline parser collapsed them. The TECH
  path committed after review approval without consulting the dev
  six-status result, so review approval could silently upgrade
  unverified dev work.
- **`nacl-tl-deliver`** — `--skip-verify` silently suppressed
  verification with no audit trail; `npm run build` / `npm test`
  fallbacks; failed health was explicitly non-blocking ("report as
  unhealthy but don't fail delivery").
- **`nacl-tl-ship`** — when no upstream status existed (no
  `status.json`, no Task node), ship "warned and proceeded";
  `--deploy` could chain into deploy from an UNVERIFIED upstream;
  the success-path headline read `SHIPPED + DEPLOYED (direct)`
  regardless of the consumed status.
- **`nacl-tl-release`** — `--skip-merge` and direct strategies
  skipped Steps 1–3 entirely, including the UC status gate;
  production health failure only warned; UNVERIFIED IntakeItems
  were stamped with a "release note instead" rather than excluded
  from the artifact.

This release fixes all of it.

---

## Per-Skill Changes

### `nacl-tl-hotfix`

**Before:** "Pre-existing" failures could be claimed without any
captured baseline ("If the failure appears unrelated... Warn but allow
user to proceed"). Build and test commands fell back to `npm run build`
and `npm test`. The regression-test step appended a generic
`[test_cmd] --test-name-pattern "[test name]"` flag. Non-PASS overrides
still triggered `gh pr merge --auto`.

**After:**
- Build and test commands read declared workspace `scripts.{build,test}`.
  Missing → `HOTFIX HALTED — NO_INFRA (scripts.{test|build} undeclared)`
  (P2). No `npm` fallbacks.
- Regression-test execution uses the configured
  `modules.[name].test_filter_flag` (e.g. `--testPathPattern`,
  `--filter`); if unset, the skill runs the full declared test command
  rather than inventing a runner flag (P2).
- New Step 4.0 captures a `main`-branch baseline using
  `git worktree add` to a temp dir (no stash juggling on the active
  branch). The baseline `[test_cmd]` runs there; the failing-test set
  is parsed into `baseline_failures`. Step 4.2 runs the suite on the
  hotfix branch, parses `postfix_failures`, and computes
  `new_failures = postfix − baseline`,
  `pre_existing = postfix ∩ baseline`,
  `transitioned = baseline − postfix`. Failures are only called
  "pre-existing" when set membership confirms it (P3). The worktree is
  removed (`git worktree remove --force`) on every exit path —
  success, halt, and error — via Step 7 RESTORE and Cleanup on Failure.
- Step 6 PR + auto-merge gate: PASS → headline `HOTFIX COMPLETE`,
  `gh pr merge --auto` enabled. Non-PASS (UNVERIFIED / BLOCKED /
  NO_INFRA / RUNNER_BROKEN) with operator override → headline
  `HOTFIX APPLIED — UNVERIFIED`, PR description annotated,
  `gh pr merge --auto` is **skipped**, operator must run the merge
  manually. REGRESSION never reaches Step 6 (halts at Step 4.2).
- PR body and Step 9 report gain a baseline-vs-postfix table
  (baseline failures count, postfix failures count, new failures,
  pre-existing) so the operator can audit the set arithmetic.

### `nacl-tl-conductor`

**Before:** UC and BUG paths read `nacl-tl-full` and `nacl-tl-fix`
output by headline, not by `Status:`. Expected impossible/legacy
headers like `FIX APPLIED — BLOCKED` (since 0.10.0 the headline is
`FIX APPLIED — UNVERIFIED` for several statuses; the `Status:` line
disambiguates them). The TECH path committed after review approval
without reading the dev six-status result — review approval could
upgrade unverified dev work to "done".

**After:**
- UC loop and BUG loop both parse
  `Status: {PASS|UNVERIFIED|BLOCKED|NO_INFRA|RUNNER_BROKEN|REGRESSION}`
  as the only authoritative classifier (P1). Headlines remain
  advisory. A report whose `Status:` line and headline disagree is
  classified by `Status:`; the disagreement is surfaced in the
  Phase 6 report.
- Reports without a parseable `Status:` line halt with
  `CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable: <id>)`.
  No commit; no advancement.
- TECH path commit gate (Step 6 → 7 of the Wave 0 sub-loop) reads
  the dev report's `Status:` line. Review approval no longer
  upgrades unverified dev work — `Status: PASS` is required to
  commit; non-PASS branches the same way the UC loop does
  (`UNVERIFIED` no commit + write `verified-pending`; `BLOCKED`
  operator override; `NO_INFRA` / `RUNNER_BROKEN` halt and escalate;
  `REGRESSION` halt and file bug).
- Cross-check of `.tl/status.json` happens for backwards
  compatibility but the JSON file no longer wins over the parsed
  `Status:` line; contradictions are surfaced in Phase 6.

### `nacl-tl-deliver`

**Before:** `--skip-verify` silently suppressed verification with no
graph audit trail. `npm run build` / `npm test` were the implicit
build/test fallbacks. Failed health was explicitly non-blocking:
"report as unhealthy (but don't fail delivery)".

**After:**
- `--skip-verify` semantics are made explicit (P4). The flag:
  - Forces the headline to `DELIVER APPLIED — UNVERIFIED
    (skipped: --skip-verify)`. The PASS-headline path is unreachable.
  - Refuses to stamp IntakeItems as `delivered` in Step 6 — no
    `i.status = 'delivered'` write occurs for any UC in the delivery.
  - Writes `Task.verification_skip_reason = 'deliver --skip-verify'`
    plus `verification_skip_at` to every Task node in scope via
    `mcp__neo4j__write-cypher`.
  - Records the skip flag and reason in `delivery-status.json` and
    in the final report.
  - Requires a separate explicit operator override (a follow-up
    `/nacl-tl-deliver` without `--skip-verify`, or a manual reconcile)
    to move any IntakeItem to `delivered`.
- Build and test commands read declared workspace
  `scripts.{build,test}`. Missing → `DELIVER HALTED — NO_INFRA
  (scripts.{test|build} undeclared)` (P2). No `npm` fallbacks.
- Failed health check (Step 5) halts by default as
  `DELIVER HALTED — UNVERIFIED (health failed)`. Operator override
  downgrades to `DELIVER APPLIED — UNVERIFIED (health failed,
  operator override)`; IntakeItem stamping is still refused; the
  override and reason are recorded in `delivery-status.json` and in
  `Task.verification_skip_reason`.

### `nacl-tl-ship`

**Before:** Unknown upstream status (no `status.json`, no Task node)
fell into a "warn and proceed" backward-compat path. `--deploy` could
chain into deploy under an operator-confirmed unverified upstream.
The deploy-path success headline read `SHIPPED + DEPLOYED (direct)`
regardless of the consumed `Status:` value.

**After:**
- Unknown upstream status (no `status.json` AND no Task node in graph)
  halts as `SHIP HALTED — UNVERIFIED (upstream status unknown)`.
  The "warn and proceed" path is removed.
- Operator-confirmed unverified ship (UNVERIFIED or BLOCKED with
  explicit "yes" at Step 1.0; **NOT** auto-confirmed by `--yes`)
  proceeds with headline `SHIP APPLIED — UNVERIFIED` and a PR
  description annotation. **Auto-deploy via `--deploy` is refused
  in this state** — the operator must run `/nacl-tl-deploy` separately
  as an explicit deploy override (P4).
- The `SHIPPED + DEPLOYED (direct)` headline is replaced with
  status-aware variants:
  - `SHIP COMPLETE` — PASS, no deploy chain.
  - `SHIP COMPLETE — DEPLOYED (direct)` — PASS + `--deploy` succeeded.
  - `SHIP APPLIED — UNVERIFIED (auto-deploy refused)` —
    operator-confirmed unverified ship, deploy skipped.
  - `SHIP HALTED — UNVERIFIED (upstream status unknown)`,
    `SHIP HALTED — UNVERIFIED`, `SHIP HALTED — BLOCKED`,
    `SHIP HALTED — NO_INFRA`, `SHIP HALTED — RUNNER_BROKEN`,
    `SHIP INCOMPLETE — REGRESSION`.
- **Reaffirmed: ship never switches branches autonomously (P5).**
  Ship commits to the current branch only. A non-PASS upstream status
  does NOT cause this skill to pivot to a hotfix branch or to `main`.
  Hotfix-to-main is the exclusive domain of `/nacl-tl-hotfix`.

### `nacl-tl-release`

**Before:** `--skip-merge` and `git.strategy == "direct"` skipped
Steps 1–3 entirely, including the UC status gate. Production health
failure only warned ("Warn but do NOT block release"). UNVERIFIED
IntakeItems were stamped with a release note: "released with
UNVERIFIED dev status, user override".

**After:**
- The UC status gate at the top of Step 2 (graph query, status
  branching, `RELEASE HALTED — MISSING TASK NODE` halt, REGRESSION
  exclusion) runs in **every mode** — `--skip-merge`, direct
  strategy, and the standard feature-branch path. The skip flag
  changes which artifacts are produced (no `gh pr merge` calls), not
  whether the gate runs. In skip-merge mode the gate is run over
  the UCs associated with commits since the last tag.
- Production health failure (Step 3b) halts by default as
  `RELEASE HALTED — UNVERIFIED (production health failed)`. The tag
  is NOT pushed. Operator override downgrades to
  `RELEASE INCOMPLETE — UNVERIFIED (production health failed,
  operator override)`; the changelog gains an annotation
  blockquote under the version heading recording the failure
  timestamp; `release-status.json` records
  `health.status = "failed_override"`.
- Step 7 IntakeItem stamping is **strictly gated on PASS**.
  IntakeItems associated with UNVERIFIED, BLOCKED, or REGRESSION UCs
  are excluded from the release artifact — NOT stamped with a
  release version, NOT stamped with a "release note instead". The
  previous "stamp with a note" path is removed. The excluded set is
  surfaced explicitly in the final report under "Excluded from this
  release artifact (no IntakeItem stamped)" with the underlying UC,
  status, and skip reason so the operator can decide whether to
  retry verification before re-running release.
- Headline selection is status-aware: `RELEASE COMPLETE`,
  `RELEASE INCOMPLETE — UNVERIFIED (production health failed,
  operator override)`, `RELEASE HALTED — UNVERIFIED (production
  health failed)`, `RELEASE HALTED — UNVERIFIED`,
  `RELEASE HALTED — MISSING TASK NODE`,
  `RELEASE INCOMPLETE — REGRESSION`.

---

## Migration Impact

**Hotfix workspaces must declare `scripts.{build,test}`.** The
`npm run build` / `npm test` fallbacks are removed. Workspaces that
relied on those defaults will hit `HOTFIX HALTED — NO_INFRA` until they
declare the commands in `package.json` or in
`modules.[name].{build,test}_cmd` in `config.yaml`. Same applies to
`nacl-tl-deliver`. There is no transition warning period — the halt
is emitted on first invocation under the new contract.

**Hotfix workspaces must allow `git worktree add`.** The new Step 4.0
creates a temporary worktree in a `mktemp -d` directory. Workspaces
with restrictive filesystem policies or pre-commit hooks that block
worktree directories will need to whitelist the path. The worktree is
removed on every exit path; transient diskspace is the only ongoing
cost.

**Conductor consumers must emit a parseable `Status:` line.** Headlines
are no longer parsed. Any sub-skill output that lacks a `Status: PASS`
/ `Status: UNVERIFIED` / `Status: BLOCKED` / `Status: NO_INFRA` /
`Status: RUNNER_BROKEN` / `Status: REGRESSION` line halts the conductor
with `CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable)`.
All `nacl-tl-*` skills already emit this line per the 0.13.0
honest-reporting contract; custom orchestration scripts that emit
their own headlines without a `Status:` line need to add one.

**`/nacl-tl-deliver --skip-verify` no longer auto-stamps.** Automation
that ran `--skip-verify` and expected `IntakeItem.status = 'delivered'`
to follow will now find IntakeItems untouched. The skill writes
`Task.verification_skip_reason` to the graph; downstream queries that
need the skip metadata can read it from there. To stamp the
IntakeItem, run a follow-up `/nacl-tl-deliver` without `--skip-verify`
or apply a manual override.

**`/nacl-tl-ship --deploy` no longer chains under unverified upstream.**
Automation that called ship with `--deploy` against an UNVERIFIED UC
and expected a single-shot ship + deploy will now see the ship complete
(headline `SHIP APPLIED — UNVERIFIED (auto-deploy refused)`) but no
deploy. To deploy, run `/nacl-tl-deploy --staging` separately as an
explicit operator action.

**`/nacl-tl-ship` halts on unknown upstream.** Workflows that invoked
ship without populating `.tl/status.json` or the graph will hit
`SHIP HALTED — UNVERIFIED (upstream status unknown)`. Either populate
the status (recommended — run the appropriate dev / fix / verify
skill first) or accept the halt as the contract.

**`/nacl-tl-release --skip-merge` runs the UC status gate.** Tag-only
releases that previously skipped the gate by passing `--skip-merge`
will now hit the same `RELEASE HALTED — MISSING TASK NODE` /
`RELEASE HALTED — UNVERIFIED` paths as the standard release. The gate
is unconditional on mode; it runs over commits-since-last-tag in
skip-merge mode.

**Production health failure now halts release by default.** Workflows
that relied on the "warn but don't block" behavior need to either
fix production health before tagging, accept the halt, or use the
operator override (which produces the
`RELEASE INCOMPLETE — UNVERIFIED` headline and annotates the
changelog).

**UNVERIFIED IntakeItems are excluded from the release artifact.**
Downstream reports or dashboards that read `i.delivered_in_release`
will no longer see UNVERIFIED items in the release set; they appear
in a separate "Excluded from release" section in the release report.
Re-run delivery + release for those items after restoring PASS
status.

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual; each
scenario describes the expected halt path or downgrade.

### Scenario 1 — hotfix: pre-existing failures with captured baseline

**Setup:** Run `/nacl-tl-hotfix --apply` against a workspace where the
declared `scripts.test` on `main` reports two known-failing tests
(`auth/login.test.ts:should reject expired token`,
`auth/login.test.ts:should rate-limit by IP`). The hotfix changes a
file unrelated to those tests.

**Expected behavior:**
1. Step 4.0 creates a `git worktree add` for `main` in a temp dir;
   runs the declared `[test_cmd]`; parses two failing tests into
   `baseline_failures`.
2. Step 4.2 runs `[test_cmd]` on the hotfix branch; parses the same
   two failing tests into `postfix_failures`.
3. Set arithmetic: `new_failures = ∅`, `pre_existing = {2 tests}`.
4. Classification: `BLOCKED` (postfix has failures, all confirmed
   by baseline). Step 6 pre-merge gate fires; operator decides.
5. PR body shows the baseline-vs-postfix table with both tests
   listed in `pre_existing`.
6. Step 7 always removes the worktree.

**Failure condition:** the skill claims "pre-existing" without
printing the captured baseline output, or the worktree is left
behind.

### Scenario 2 — conductor: `Status: BLOCKED` under `FIX APPLIED — UNVERIFIED` headline

**Setup:** `nacl-tl-fix` returns a Step 8 report containing
`Status: BLOCKED` plus the headline `FIX APPLIED — UNVERIFIED
(pre-existing failures)`. `/nacl-tl-conductor --items BUG-003` is
invoked.

**Expected behavior:**
1. Conductor's BUG loop parses `Status: BLOCKED` from the report.
   The headline is ignored.
2. Branch on parsed value `BLOCKED`. Post BLOCKED advisory; require
   explicit operator confirmation.
3. Final classification reflected in Phase 6 report: BLOCKED (not
   UNVERIFIED).
4. Phase 6 report logs the headline-vs-Status disagreement (header
   said UNVERIFIED, classifier said BLOCKED).

**Failure condition:** classification is UNVERIFIED, or conductor
auto-commits based on headline.

### Scenario 3 — deliver: `--skip-verify` on a one-UC delivery

**Setup:** Run `/nacl-tl-deliver --skip-verify` against a branch
containing UC-028 with `t.status = 'done'` in the graph and a
linked IntakeItem `FAM-58` with `i.status = 'delivered'`.

**Expected behavior:**
1. Step 4 short-circuits: skill emits headline
   `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)`.
2. `Task.verification_skip_reason = 'deliver --skip-verify'` is
   written to the graph for UC-028.
3. Step 6 IntakeItem stamping is **refused**: `FAM-58` is NOT
   updated; no `i.status = 'delivered'` write occurs (it was
   already 'delivered' from the earlier conductor step; the point
   is the skill writes nothing further and emits no
   `delivered_in_release` in any consumer).
4. `delivery-status.json` records
   `verify.status = 'skipped', reason = '--skip-verify'`.

**Failure condition:** IntakeItem stamping happens, the report
omits the skip reason, or the headline reads `DELIVER COMPLETE`.

### Scenario 4 — ship: unknown upstream status

**Setup:** Run `/nacl-tl-ship UC-099` against a workspace where
`.tl/status.json` has no entry for UC-099 and the graph has no
Task node with that ID.

**Expected behavior:**
1. Step 1.0 reads `.tl/status.json`: not found.
2. Step 1.0 queries the graph: no Task node.
3. Halt: `SHIP HALTED — UNVERIFIED (upstream status unknown)`. No
   commit, no PR.
4. The "warn and proceed" path is not invoked.

**Failure condition:** ship proceeds, creates a commit or PR, or
emits a `SHIP COMPLETE` headline.

### Scenario 5 — release: `--skip-merge` with a non-PASS UC

**Setup:** Run `/nacl-tl-release --skip-merge`. The most recent
merged PR on `main` since the last tag corresponds to UC-029, whose
graph status is `verified-pending`.

**Expected behavior:**
1. Step 0 sees `--skip-merge` and notes that Steps 1–2 merge
   actions are skipped.
2. Step 2 status gate **still runs** over UCs derived from
   commits-since-last-tag. The gate finds UC-029 with
   `verified-pending`.
3. UC-029 triggers the user gate: "PR/UC ### has UNVERIFIED dev
   status. Release without verification?".
4. If operator declines: `RELEASE HALTED — UNVERIFIED`; tag NOT
   pushed.
5. If operator accepts: release proceeds, but Step 7 excludes UC-029's
   IntakeItem from the artifact (no `delivered_in_release` stamp).
   Final report includes the "Excluded from this release artifact"
   section listing UC-029.

**Failure condition:** the gate is skipped because of `--skip-merge`,
the tag is pushed without operator interaction, or UC-029's
IntakeItem is stamped with a "release note".

---

## Known Limitations

- **`Status:` line discipline is documentation, not runtime
  enforcement.** Conductor's parser is instructed to prefer the
  `Status:` line over the headline, but a malformed sub-skill output
  that fakes a `Status:` line will still pass. Mitigation: the
  per-skill review checklist catches this; the headline-vs-Status
  contradiction logging makes drift visible in Phase 6 reports.
- **Hotfix baseline worktree requires a clean `main`.** If `main` is
  itself broken (e.g. a transient infra outage on the baseline
  branch), the captured baseline contains the broken state and the
  `pre_existing` set may include failures that are not "really"
  pre-existing. The operator sees the baseline output and can
  adjudicate; the skill does not attempt to detect this.
- **Hotfix `test_filter_flag` is per-runner.** If the workspace's
  runner has no documented filter flag, the skill runs the full test
  command, which can be slow on large suites. There is no
  auto-detection of runner type — the operator must declare the flag
  or accept the full-suite cost.
- **Deliver / release skip flags require operator follow-up.** A
  `--skip-verify` delivery leaves IntakeItems in a `delivered` state
  without the release-version stamp, and a non-PASS release leaves
  IntakeItems excluded from the artifact. The operator must
  remember to re-run the verified path; there is no automatic retry
  queue.
- **Ship's auto-deploy refusal applies even to operator-confirmed
  unverified ships.** This is intentional (P4 — skip / unverified
  paths cannot chain into deploy auto-magically) but means the
  operator must run `/nacl-tl-deploy` as a separate explicit step.
  Single-shot ship+deploy is reserved for `Status: PASS`.
- **Release UC status gate in skip-merge mode reads
  commits-since-last-tag.** If commits were squash-merged with a
  message that doesn't contain the UC ID in a parseable form, the
  gate may miss the UC. Mitigation: enforce the
  `nacl-tl-core/references/commit-conventions.md` UC-prefix
  convention; manually pass `--pr` to identify the candidate set.
