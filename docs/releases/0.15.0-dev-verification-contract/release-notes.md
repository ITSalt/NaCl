# NaCl 0.15.0 — Dev & Verification Contract Cleanup

0.13.0 produced honest leaf-skill output. 0.14.0 made the five orchestration
paths (hotfix / conductor / deliver / ship / release) honour that output. What
0.15.0 closes is the layer in between: the dev `--continue` paths still ran
their own inline test-after-change loops, the verifier and the sync skill
treated the working tree as both baseline and postfix, the review skill
allowed an `npm test` fallback and could promote `APPROVED` under `NO_INFRA`,
and the wave/intake/deploy orchestrators advanced phase state without
consulting the six-status output of the work they were stamping.

After 0.15.0 every implementation and quality gate consumes or emits the same
six-status contract — `PASS / UNVERIFIED / BLOCKED / NO_INFRA / RUNNER_BROKEN
/ REGRESSION` — with exact runner discovery and explicit baseline evidence.
Dev `--continue` no longer self-grades; it delegates to `/nacl-tl-fix` with
a new `--from-review` metadata flag that proves the rework path went through
the hardened fix contract instead of an ad-hoc test-after-change loop.

The release threads the same five cross-cutting principles introduced in
0.14.0:

1. **`Status: {value}` is the only authoritative classifier.** Every skill
   that consumes another skill's report parses the `Status:` line. Headlines
   remain status-aware but advisory. A report whose `Status:` line and
   headline disagree is classified by `Status:`; the disagreement is logged.
2. **Declared workspace commands only.** No skill may fall back to
   `npm test`, `npm run build`, `npx tsc`, or any other invented command.
   Missing `scripts.test` / `scripts.build` is `NO_INFRA`, not a hidden
   default.
3. **Baseline before claim.** Any "pre-existing failures", "regression", or
   "new failures" claim requires a captured baseline run on the unchanged
   code, a postfix run on the changed code, and a set-difference. No
   baseline ⇒ no regression claim ⇒ status is `UNVERIFIED`, not `BLOCKED`.
4. **Skip ⇒ unverified, never PASS.** Skip flags (`--skip-qa` for
   `nacl-tl-full`) emit `<SKILL> APPLIED — UNVERIFIED (skipped: <flag>)`,
   refuse downstream stamping, and record the skip flag and reason in the
   report and in the graph.
5. **No autonomous branch switching.** Reaffirmed for the dev trio and the
   reopened orchestrator — neither switches branches when delegating to
   `/nacl-tl-fix`.

---

## Why This Release Exists

After 0.14.0 the orchestration paths to `main` / deployment / delivery /
release stopped silently passing unverified work through. But the dev,
verifier, sync, review, full, deploy, and intake layers still had local
loopholes:

- **`nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`** — `--continue`
  ran a test-after-change loop ("apply the fix, run tests"). No required
  RED-first regression test, no captured baseline, no failure-set
  comparison. The dev skill marked the phase `ready_for_review` regardless
  of the verification outcome. `nacl-tl-dev-fe` Step 3.3 also accepted
  silence-as-no-regression: "if the agent's report is silent on
  regressions, trust the agent's RED confirmation".
- **`nacl-tl-reopened`** — configuration permitted invented `npm test`
  fallbacks. The Step 8 re-run gate proceeded "with a warning" when
  `scripts.test` was missing. The batch sub-agent prompt omitted the Step
  7.5 status-line parsing and Step 7.5.1 regression-test-seam evidence
  gate. The final template always reported `Status: DevDone ✅` regardless
  of the parsed fix status.
- **`nacl-tl-verify-code`** — Step 5.2 ran the test suite once on the
  current working tree and called the result both "baseline" and
  "postfix", which is meaningless after a change has landed. `BLOCKED` and
  `REGRESSION` claims came out of single-run measurements with no set
  arithmetic.
- **`nacl-tl-sync`** — claimed "new failures vs pre-change baseline"
  without ever defining how to capture the pre-change baseline; the
  classifier table contained the contradictory rule "Both suites pass AND
  pre-existing failures remain → BLOCKED" (passing suites do not have
  failures).
- **`nacl-tl-review`** — Step 6a fell back to `npm test` when the workspace
  declared no `scripts.test`; missing infra was flagged in the report but
  review still proceeded; the verdict could promote to `APPROVED` under
  `NO_INFRA` or `RUNNER_BROKEN`. "Tests revealed new failures" was a valid
  headline with no baseline-capture procedure behind it.
- **`nacl-tl-full`** — Wave 0 launched `/nacl-tl-dev TECH-###` and
  advanced to review/commit without reading the dev six-status result.
  `--skip-qa` left `phase_qa = 'pending'` ("not executed") instead of
  `'skipped'`, allowing downstream stamping. Graph write failures
  continued the run "with status.json only".
- **`nacl-tl-deploy`** — `verified-pending` upstream proceeded after a
  confirmation prompt, with no audit annotation; "Not found in graph →
  Warn and proceed" silently allowed deploys against unknown verification
  state.
- **`nacl-tl-intake`** — progress and final-summary rows collapsed every
  bug atom to "fixed" regardless of the downstream `nacl-tl-fix` six-status
  result.

This release fixes all of it.

---

## Per-Skill Changes

### `nacl-tl-fix` (additive only)

**Before:** No `--from-review` flag. Invocations from any source produced
the same report metadata.

**After:** New `--from-review` flag (metadata-only). When set, the Step 8
report adds `Invocation source: review (--from-review)` immediately under
the Problem line, and the `.tl/changelog` block records
`- **Invocation source:** review`. The flag is purely a traceability
marker — the six-status contract, baseline procedure, and RED-first
discipline are unchanged. The flag exists so the dev trio can prove its
review-rework path delegated to `/nacl-tl-fix` rather than running an
inline test-after-change loop.

### `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`

**Before:** `--continue` ran an inline "fix the issue, run tests to verify
fix" loop with no required RED-first regression test, no captured
baseline, no failure-set comparison. The skill committed
`fix(UC###): address review feedback (iteration N)` and set
`phases.{be,fe}.status = "ready_for_review"` regardless of the
verification outcome. `nacl-tl-dev-fe` Step 3.3 accepted silence-as-
no-regression.

**After:** `--continue` is a thin wrapper that delegates to
`/nacl-tl-fix`. The flow:
1. Read `review-{be,fe}.md` (or `review.md` for TECH).
2. Parse Blocker / Critical / Major issues; render each as
   `File: <path>:<line>` + Severity + Description + Suggestion; concatenate
   in priority order.
3. Invoke `/nacl-tl-fix "<problem>" --uc UC### --from-review`. The fix
   sub-agent owns runner discovery, baseline capture (its Step 6b),
   RED-first regression test via `/nacl-tl-regression-test` (its Step
   6d–6e), postfix run + set-difference (its Step 6g/7.3), and six-status
   determination.
4. Parse `Status: {PASS|BLOCKED|UNVERIFIED|NO_INFRA|RUNNER_BROKEN|
   REGRESSION}` from the fix report — `Status:` is authoritative; headlines
   are advisory. Reports without a parseable `Status:` line halt as
   `DEV-{BE|FE} APPLIED — UNVERIFIED (downstream report unparseable)`.
5. Verify the regression-test seam evidence (`Tests > Regression test:`
   path and `Tests > RED→GREEN:` evidence). If absent for a status that
   requires it (anything other than `NO_INFRA` / `RUNNER_BROKEN`), treat
   the outcome as `UNVERIFIED`. Silence-as-evidence is forbidden.
6. Append a `## Fix Iteration N` block to `result-{be,fe}.md` with the
   verbatim fix `Status:`, headline, regression-test seam, and per-issue
   outcomes.
7. Update tracking: `phases.{be,fe}.status = "ready_for_review"` ONLY for
   `Status: PASS` (or operator-gated accepted-`BLOCKED`). Every other
   status keeps the phase in `in_progress` with `failure_reason` recorded.

The dev skill never writes test files in `--continue`; the test-author
isolation seam is preserved by `/nacl-tl-fix` invoking
`/nacl-tl-regression-test` internally.

`nacl-tl-dev-fe` Step 3.3 silence-as-no-regression rule is replaced:
silence on regressions is `UNVERIFIED`; require an explicit no-regression
line in the sub-agent's report (e.g. `Regressions: none introduced
(postfix ⊆ baseline)`) before advancing.

The Step 7 (Update Tracking) and Step 4.2 (VERIFY GREEN + COMPARE) status
gating tables are made explicit: `ready_for_review` is reachable only from
PASS or accepted-BLOCKED; every other six-status value keeps the phase in
`in_progress` with the failure reason recorded.

### `nacl-tl-reopened`

**Before:** Test/build commands fell back to `npm test` / `npm run build`
when neither config nor workspace declared them. The Step 8 re-run gate
proceeded "with a warning" when `scripts.test` was missing. The Batch
mode sub-agent prompt was a single line — `"Run: /nacl-tl-fix →
/nacl-tl-review → /nacl-tl-stubs → /nacl-tl-ship"` — with no Step 7.5
status-line parsing and no Step 7.5.1 regression-test-seam evidence gate.
The final report template always wrote `Status: DevDone ✅`.

**After:**
- Configuration: `scripts.test` and `scripts.build` are declared
  workspace commands only. Missing → `REOPENED HALTED — NO_INFRA
  (scripts.test undeclared)`. The previous `fallback npm test` /
  `fallback npm run build` clauses are removed.
- Step 8 re-run gate: missing `scripts.test` halts as
  `REOPENED HALTED — NO_INFRA`. The "proceed to review with a warning"
  path is removed.
- Batch sub-agent prompt: now includes the full six-status contract —
  Step 7.5 status-line parsing (`Status:` is the only authoritative
  classifier; headline advisory only); Step 7.5.1 regression-test-seam
  evidence gate (`Tests > Regression test:` path and
  `Tests > RED→GREEN:` evidence required for any status other than
  `NO_INFRA` / `RUNNER_BROKEN`); per-status branching that prevents
  `/nacl-tl-review`, `/nacl-tl-stubs`, and `/nacl-tl-ship` from running
  on non-PASS outcomes.
- Final report template: `Status: DevDone ✅` is gated on the headline
  `REOPENED COMPLETE` (i.e. fix `Status: PASS` AND re-run suite green AND
  review approved). Every other outcome renders
  `REOPENED APPLIED — <STATUS>` or `REOPENED HALTED — <STATUS>` and leaves
  the YouGile column at InWork (or the matching halt state).

### `nacl-tl-verify-code`

**Before:** Step 5.2 ran the suite once on the current working tree and
labelled the same run both "baseline" and "postfix". After a change has
landed, the working tree is post-change, so this measurement collapsed
to a postfix-only result. `BLOCKED` and `REGRESSION` claims followed
from set arithmetic with no real baseline operand.

**After:** Step 5.2 requires explicit baseline-ref discovery before any
"pre-existing" or "regression" claim. Resolution priority:
1. `--base <ref>` flag.
2. Saved baseline artifact at
   `.tl/tasks/<task>/baseline-failures.json` (written upstream by
   `nacl-tl-fix` / `nacl-tl-dev` at their CAPTURE BASELINE step).
3. Default: `git merge-base HEAD main` (or configured `git.main_branch`).

The baseline run uses `git worktree add` to a temp dir, runs the
declared `scripts.test` there, captures `baseline_failures`, and removes
the worktree on every exit path. The postfix run runs on the working
tree. `new_failures = postfix − baseline`. No baseline ⇒ result is
`UNVERIFIED (no baseline)` — set arithmetic is undefined when one operand
is missing. The previous "before touching any files, run the exact
scripts.test command on the current working tree" path is removed.

The classification table (Step 5.4) gains an explicit
`UNVERIFIED (no baseline)` row and a clarifying note that `BLOCKED`
requires a baseline.

### `nacl-tl-sync`

**Before:** Step 7.2 ran each workspace's suite once on the current
working tree and called the result a baseline. The classifier rule
"Both suites pass AND pre-existing failures remain → `BLOCKED`" was
self-contradictory ("pass" and "failures remain" cannot coexist).

**After:** Step 7.2 captures an explicit per-workspace baseline via
`git worktree add` at the resolved baseline ref (same priority as
`nacl-tl-verify-code`: `--base` flag, saved artifact, then
`git merge-base HEAD main`). The postfix run runs on the working tree.
Per-workspace deltas are computed: `be_new_failures`, `be_pre_existing`,
`fe_new_failures`, `fe_pre_existing`.

Step 7.4 classifier is rewritten:
- Any new failure in either workspace ⇒ `REGRESSION`.
- Any postfix failures with no baseline resolved ⇒ `UNVERIFIED (no
  baseline)`.
- Both suites green AND coverage ⇒ `PASS`.
- Both suites green AND coverage gap ⇒ `UNVERIFIED`.
- At least one workspace has failures, all of which are baseline-confirmed
  pre-existing (`postfix ⊆ baseline`) ⇒ `BLOCKED`.

The contradictory "Both suites pass AND pre-existing failures remain"
rule is removed.

### `nacl-tl-review`

**Before:** Step 6a executed `npm test (or the workspace's scripts.test)`.
Missing `scripts.test` was flagged in the report but review proceeded;
the verdict could promote to `APPROVED`. "Tests revealed new failures"
was a valid headline with no baseline procedure.

**After:**
- Step 6a runs the declared `scripts.test` only — no `npm test` /
  `npx jest` / `npx vitest` fallbacks (P2). Missing → `REVIEW HALTED —
  NO_INFRA (scripts.test undeclared)`. Runner crash → `REVIEW HALTED —
  RUNNER_BROKEN`. `APPROVED` is forbidden under both halt headlines.
- New Step 6a-baseline: explicit baseline ref discovery (`--base` flag,
  saved artifact at `.tl/tasks/<UC>/baseline-failures-{be,fe}.json`,
  `git merge-base HEAD main`). Baseline is run via `git worktree add`,
  postfix on the working tree, and `new_failures = postfix − baseline`
  is set-arithmetic-derived (P3). No baseline ⇒ `UNVERIFIED (no
  baseline)`; failures are not classified as new or pre-existing.
- Step 8b headline table is rewritten with an explicit "`APPROVED`
  allowed?" column. `Code judgment: APPROVED` may only be written when
  the headline is `REVIEW COMPLETE`. The previous "proceed to review and
  flag in report" loophole is removed.

### `nacl-tl-full`

**Before:** Wave 0 TECH flow launched `/nacl-tl-dev TECH-###` and
advanced to `/nacl-tl-review` and the `done` graph state without reading
the dev six-status result. `--skip-qa` left `phase_qa = 'pending'` (not
executed), allowing downstream stamping to fold "skipped" into "still to
be executed". Graph write failures continued the run "with status.json
only".

**After:**
- Wave 0 TECH flow reads `/nacl-tl-dev TECH-###`'s `Status:` line before
  advancing. Mirrors the BE/FE branching at Phase 2: `PASS` →
  `phase_dev = 'done'` and proceed to review; `BLOCKED` (no acceptance) /
  `UNVERIFIED` / `NO_INFRA` → halt the task, set
  `t.status = 'verified-pending'` or `'blocked'`, record reason, do NOT
  proceed to `/nacl-tl-review`; `RUNNER_BROKEN` / `REGRESSION` → halt
  task with `t.status = 'failed'`. Reports without a parseable `Status:`
  line halt with `t.status = 'failed', reason = 'dev report
  unparseable'`.
- `--skip-qa` (per Cross-cutting principle P4) emits the wave aggregate
  headline `FULL APPLIED — UNVERIFIED (qa skipped)`, sets `phase_qa =
  'skipped'` (not `'pending'`) and `Task.verification_skip_reason =
  'full --skip-qa'` on every UC Task, forbids downstream stamping, and
  records the skip in `status.json` (`run.skip_flags = ['qa']`). UCs
  that complete every other phase land at `verified-pending` rather than
  `done`. Operator must re-run without `--skip-qa` (or run `/nacl-tl-qa
  UC###` plus a manual reconcile) to advance to `done`.
- Graph write failure halts phase advancement immediately: log the
  Cypher statement, persist the in-flight phase result to
  `.tl/status.json` for forensic inspection only, STOP the wave. END
  GATE reports `FULL HALTED — UNVERIFIED (graph write failed for Task
  <id> phase <phase>); resolve Neo4j connectivity and re-run`. The "
  Continuing with status.json only" path is removed.

### `nacl-tl-deploy`

**Before:** `verified-pending` upstream prompted for confirmation and
proceeded on yes; the report headline could still read as a normal
deploy. Unknown verification state ("Not found in graph") warned and
proceeded.

**After:**
- `verified-pending` upstream halts by default as `DEPLOY HALTED —
  UNVERIFIED (upstream verified-pending)`. Operator override is
  permitted (explicit "yes" prompt; NOT auto-confirmed by `--yes`). On
  override → headline `DEPLOY APPLIED — UNVERIFIED (operator override)`;
  `Task.verification_skip_reason = 'deploy operator-override'`; the
  source Task is NOT moved to `done` / `released` (P4).
- `blocked` upstream uses the same gate; on override → `DEPLOY APPLIED —
  UNVERIFIED (blocked, operator override)` with the same no-state-
  movement rule.
- Unknown verification state ("Not found in graph") halts unconditionally:
  `DEPLOY HALTED — UNVERIFIED (upstream status unknown)`. The "warn and
  proceed (backward-compat)" path is removed; the operator must populate
  the Task node and re-run.

### `nacl-tl-intake`

**Before:** Progress rows read `[1/3] Done: Bug 1 "Share button" --
fixed` regardless of the downstream `nacl-tl-fix` `Status:` value. Final
summary collapsed all bug atoms to "fixed" rows. Headline selection
considered only classification evidence (graph vs heuristic), not
downstream status.

**After:**
- Progress rows surface the verbatim downstream `Status:` value:
  `[1/3] PASS: Bug 1 ... -- fixed`,
  `[1/3] UNVERIFIED: Bug 1 ... -- fix applied, no regression test`,
  `[1/3] NO_INFRA: ...`, `[1/3] RUNNER_BROKEN: ...`,
  `[1/3] REGRESSION: ...`. Headlines are advisory; `Status:` is
  authoritative.
- Final summary table gains a `Fix Status` column and a `State` column
  (`fixed` only when `Status: PASS`; `unfinished` for every other six-
  status value).
- Headline selection rules surface non-PASS bug atoms in the headline
  itself: any REGRESSION ⇒ `INTAKE TRIAGE INCOMPLETE — REGRESSION`; any
  RUNNER_BROKEN ⇒ `INTAKE TRIAGE HALTED — RUNNER_BROKEN`; any NO_INFRA /
  UNVERIFIED / unaccepted-BLOCKED ⇒ `INTAKE TRIAGE APPLIED — UNVERIFIED`
  with the specific reason; only when every bug atom is PASS does the
  headline default to the classification-evidence variant.
- Final state movement (`Done`, `Delivered`) requires PASS-family
  downstream status; otherwise the atom is reported as `unfinished` with
  the specific status, and the next-steps block names the unblock paths.

---

## Migration Impact

**Dev `--continue` semantics changed.** Anyone who runs
`/nacl-tl-dev-be UC### --continue`, `/nacl-tl-dev-fe UC### --continue`,
or `/nacl-tl-dev TECH-### --continue` will now see the dev skill invoke
`/nacl-tl-fix --uc <id> --from-review` and propagate its six-status
result. The dev skill no longer writes test files in `--continue`; the
fix sub-agent invokes `/nacl-tl-regression-test` internally. Phase
advancement to `ready_for_review` happens only on `Status: PASS` (or
operator-gated accepted-`BLOCKED`); every other status leaves the phase
in `in_progress` with `failure_reason` recorded. Workflows that expected
`--continue` to always commit and always advance to review will see
halts on UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION.

**Verifier and sync now require an explicit baseline ref.** The
`--base <ref>` flag is the recommended path. The fallback is
`git merge-base HEAD main`. Without it, the result is `UNVERIFIED (no
baseline)` rather than `BLOCKED` or `REGRESSION` — set arithmetic is
undefined when one operand is missing. Workspaces that previously relied
on single-run "current state" claims will see `UNVERIFIED` headlines
instead. Either pass `--base`, save a baseline artifact at
`.tl/tasks/<id>/baseline-failures-{be,fe}.json` upstream, or accept the
`UNVERIFIED` signal as accurate.

**Review forbids `APPROVED` under `NO_INFRA` / `RUNNER_BROKEN`.** Any
review whose runner cannot execute halts as `REVIEW HALTED — NO_INFRA`
or `REVIEW HALTED — RUNNER_BROKEN`. Operator override produces
`REVIEW APPLIED — UNVERIFIED (no test infra)` and the verdict is
`Code judgment: CHANGES REQUESTED` (or `BLOCKED`), never `APPROVED`.
Workflows that auto-approved when the review report flagged `NO_INFRA`
will now see explicit halts; either declare `scripts.test` or accept the
`UNVERIFIED` review verdict.

**`nacl-tl-reopened` no longer falls back to `npm test`.** Configuration
must declare `modules.[name].test_cmd` or the workspace's
`package.json` `scripts.test`. Missing declarations halt as
`REOPENED HALTED — NO_INFRA (scripts.test undeclared)`.

**`nacl-tl-full --skip-qa` aggregate headline changes.** Previously
left `phase_qa = 'pending'` (silently misleading). Now sets `phase_qa =
'skipped'` and forces the wave aggregate to
`FULL APPLIED — UNVERIFIED (qa skipped)`. UCs that completed every other
phase land at `verified-pending` rather than `done`. Operator must re-run
without `--skip-qa` to advance to `done`.

**`nacl-tl-deploy` halts on unknown upstream.** Workflows that invoked
deploy without populating `.tl/status.json` or the graph will hit
`DEPLOY HALTED — UNVERIFIED (upstream status unknown)`. Either populate
the status (recommended — run the appropriate dev / fix / verify skill
first) or accept the halt as the contract. There is no override that
promotes unknown to verified.

**`nacl-tl-intake` rows surface six-status downstream values.** Workflows
that grep intake reports for `"-- fixed"` will now see leading status
words (`PASS`, `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`, `REGRESSION`)
and a `Fix Status` column in the final table. Bug atoms with non-PASS
downstream status appear as `unfinished` rather than as completed.

No invocation syntax changed for any skill except `nacl-tl-fix`, which
adds the optional `--from-review` flag (additive only).

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual; each
scenario describes the expected halt path or downgrade.

### Scenario 1 — dev-be `--continue` delegates to `/nacl-tl-fix --from-review`

**Setup:** Run `/nacl-tl-dev-be UC037 --continue` against a workspace
where `.tl/tasks/UC037/review-be.md` contains three Critical issues
(file:line + description + suggestion for each).

**Expected behavior:**
1. The skill reads `review-be.md` and parses three Critical issues.
2. The skill renders the issues into a single problem-description string
   (Critical priority order, each block with `File: <path>:<line>`,
   `Severity: Critical`, `Description`, `Suggestion`).
3. The skill invokes `/nacl-tl-fix "<problem>" --uc UC037
   --from-review`. No test file is written by `nacl-tl-dev-be` itself.
4. `/nacl-tl-fix`'s Step 8 report contains
   `Invocation source: review (--from-review)` under the Problem line.
5. `nacl-tl-dev-be` parses `Status:` from the fix report.
6. On `Status: PASS`, `phases.be.status = "ready_for_review"`; the
   "## Fix Iteration N" block in `result-be.md` records the verbatim
   `Status:`, the `Tests > Regression test` path, and the
   `Tests > RED→GREEN` evidence.
7. On `Status: BLOCKED` (no operator acceptance) / `UNVERIFIED` /
   `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`, `phases.be.status =
   "in_progress"` with `failure_reason` recorded.

**Failure condition:** `nacl-tl-dev-be` runs tests itself, writes a test
file, marks `phases.be.status = "ready_for_review"` on `Status: BLOCKED`
without explicit operator acceptance, or fails to surface the verbatim
`Status:` value.

### Scenario 2 — verify-code with no baseline ref

**Setup:** Run `/nacl-tl-verify-code UC037` in a workspace where the
working tree is post-change, `--base` is not passed, no
`.tl/tasks/UC037/baseline-failures.json` exists, and
`git merge-base HEAD main` resolves (one-commit divergence). Postfix
run shows two failing tests.

**Expected behavior:**
1. Step 5.2 resolves the baseline ref to `git merge-base HEAD main`.
2. `git worktree add <tempdir> <merge-base>` succeeds; `scripts.test`
   runs there and produces a baseline failure set.
3. The worktree is removed via `git worktree remove --force` on every
   exit path.
4. Postfix run on the working tree captures
   `postfix_failures = {2 tests}`.
5. If `new_failures` is empty AND `postfix ⊆ baseline` ⇒ `BLOCKED`.
   Otherwise classification follows the Step 5.4 table.

**Failure condition:** the skill emits `BLOCKED` or `REGRESSION` without
running a baseline (single-run measurement), or the worktree is left
behind on a halt path.

**Variant — no baseline ref resolvable:** if `--base` is not passed,
no artifact exists, and `git merge-base HEAD main` cannot resolve
(shallow clone, no `main`), the result is `UNVERIFIED (no baseline)`.
Failure condition: emits `BLOCKED` or `REGRESSION` despite no baseline.

### Scenario 3 — `/nacl-tl-full --skip-qa`

**Setup:** Run `/nacl-tl-full --skip-qa` against a project with three
UCs in Wave 1 that each complete BE / review-BE / FE / review-FE / sync
/ stubs successfully.

**Expected behavior:**
1. Every UC reaches `phase_stubs = 'done'`.
2. The Wave Agent records `phase_qa = 'skipped'` (not `'pending'`) on
   every UC and sets `Task.verification_skip_reason = 'full --skip-qa'`.
3. The Wave Agent does NOT promote any UC to `Task.status = 'done'`.
   UCs that completed every other phase land at
   `Task.status = 'verified-pending'`.
4. The wave aggregate headline emitted by L0 is
   `FULL APPLIED — UNVERIFIED (qa skipped)`.
5. END GATE report's "Skipped phases" section names every affected UC.
6. `status.json` records `run.skip_flags = ['qa']`.

**Failure condition:** any UC is stamped `Task.status = 'done'`, the
headline reads `FULL COMPLETE`, or `phase_qa = 'pending'`.

### Scenario 4 — reopened on workspace with no `scripts.test`

**Setup:** Run `/nacl-tl-reopened --task <task-code>` against a YouGile
task whose changed files live in a workspace where `package.json` has
no `scripts.test` declared and `config.yaml` has no
`modules.[name].test_cmd` declared either.

**Expected behavior:**
1. Configuration resolution fails to find a declared test command.
2. The skill halts as
   `REOPENED HALTED — NO_INFRA (scripts.test undeclared)`.
3. The advisory is posted to the YouGile task chat.
4. The skill does NOT proceed to `/nacl-tl-fix`, `/nacl-tl-review`,
   `/nacl-tl-stubs`, or `/nacl-tl-ship`.
5. The recommended next step is
   `/nacl-tl-dev TECH-### "set up test runner for [workspace]"`.

**Failure condition:** the skill falls back to running `npm test`,
proceeds to review without a declared test command, or stamps
`Status: DevDone ✅`.

### Scenario 5 — intake with REGRESSION downstream

**Setup:** Run `/nacl-tl-intake` against a request batch where atom #1
is a feature, atom #2 is a bug whose `/nacl-tl-fix` invocation returns
`Status: REGRESSION`, and atom #3 is a documentation task.

**Expected behavior:**
1. The progress row for atom #2 reads
   `[2/3] REGRESSION: Bug 1 "..." -- fix INCOMPLETE (Fix Status: REGRESSION)`.
2. The final summary table shows atom #2 with `Fix Status: REGRESSION`
   and `State: unfinished`.
3. The headline is `INTAKE TRIAGE INCOMPLETE — REGRESSION (1 atoms
   unfinished)`.
4. The Next-steps block includes
   `REGRESSION → return to /nacl-tl-fix Step 6f`.
5. Atom #2 is NOT eligible for delivery; no `IntakeItem.status =
   'delivered'` write occurs.

**Failure condition:** atom #2 appears as `fixed` in the table, the
headline reads `INTAKE TRIAGE COMPLETE`, or the atom is stamped
`delivered`.

---

## Known Limitations

- **`Status:` line discipline is documentation, not runtime
  enforcement.** All consumers (dev trio, reopened batch agent, intake)
  are instructed to prefer the `Status:` line over the headline, but a
  malformed sub-skill output that fakes a `Status:` line will still pass
  parsing. Mitigation: per-skill review checklists catch this; the
  unparseable-report halt path covers the most common drift mode.
- **Baseline-ref discovery requires git history.** Shallow clones (CI
  workspaces with `--depth 1`) cannot resolve
  `git merge-base HEAD main` and will fall through to
  `UNVERIFIED (no baseline)` unless `--base` is passed explicitly or a
  saved artifact is provided. CI workflows that want PASS-family
  outcomes for verify-code, sync, or review must either deepen the
  clone or save baseline artifacts upstream.
- **`--from-review` is metadata-only.** The flag does not alter
  `nacl-tl-fix`'s behavior beyond writing one extra line in the report
  and changelog. Downstream consumers can grep for the marker to prove
  delegation, but the flag is not gated — operators can pass it manually
  even when the invocation didn't come from a review.
- **`--skip-qa` aggregate refusal applies to the entire wave.** If even
  one UC in the wave needs to ship verified, the operator must split
  the run: `/nacl-tl-full --task UC###` (without `--skip-qa`) for the
  shipping UC, then `/nacl-tl-full --skip-qa --wave N` for the rest.
  There is no per-UC skip granularity.
- **`nacl-tl-dev` Workflow B (verification-based TECH tasks) under
  `--continue` resolves to `NO_INFRA` when the review issue is
  infrastructure-only.** This is honest — there is no testable code to
  regress against — but operators expecting "fix and re-run" cycles for
  pure-config TECH tasks may find the halt surprising. Either declare a
  testable seam in the task or accept the `NO_INFRA` signal.
- **`nacl-tl-deploy` operator-override deploy-applied-unverified does
  not auto-mark the source Task as `released`.** The override emits the
  applied-unverified headline but leaves the source Task at
  `verified-pending`. Operator must run a separate verification cycle
  (`/nacl-tl-verify` then re-run `/nacl-tl-deploy` without override) to
  promote to `released`.
