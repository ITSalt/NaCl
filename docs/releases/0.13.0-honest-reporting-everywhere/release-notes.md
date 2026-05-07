# NaCl 0.13.0 — Honest Reporting, Everywhere

0.10.0 hardened one skill (`nacl-tl-fix`) so that a bug fix could no longer
return PASS on the back of a runner that collected zero tests, a baseline that
was never captured, or a pre-existing failure that was reported as a regression.
0.11.0 spread the same vocabulary into the verification family. 0.12.0 carried
the six-status vocabulary through the dev TDD trio and the seven orchestrators
above them.

What 0.12.0 left behind: every other skill in the pipeline still had its own
local rules for when to claim PASS. The verification family ran the suite once.
The stub scanner could declare CLEAN on a tree that contained 44 hollow test
files. QA could report PASS when zero acceptance criteria were UI-testable.
Hotfix's `--yes` flag bypassed the pre-merge gate the same skill's preamble
forbade. Reopened parsed the legacy `FIX COMPLETE` headline instead of the
authoritative `Status:` line. The dev skills self-graded — the same agent that
wrote `*.test.*` files also wrote the implementation that satisfied them.

0.13.0 closes those gaps in one bundled release across 22 skills. The release
threads four discipline patterns through the entire skill catalogue:

1. **Test-author isolation as an absolute principle** — the agent that writes
   the test is never the agent that writes the implementation. Applies to dev
   skills, not just bug-fix skills.
2. **Baseline-vs-postfix discipline** — every PASS is gated on `tests_collected
   > 0`, baseline captured before the change, and a set-difference comparison
   to classify REGRESSION vs BLOCKED.
3. **Status: line as the authoritative classifier** — downstream skills parse
   `Status: {value}` from upstream reports, not the decorative headline.
4. **Graph as primary source of truth** — operational gates (deliver, release,
   conductor, full) read Neo4j first; `.tl/status.json` is a fallback that loses
   when the two disagree.

---

## Why This Release Exists

After 0.12.0 the dev and orchestrator layers reported honest status. But the
verification, fix-derivative, operational, and reporting layers still had local
loopholes:

- **`nacl-tl-verify-code`** — ran the suite once; treated `coverage_gap = false`
  as license to PASS; `tests_collected == 0` produced PASS, not RUNNER_BROKEN.
- **`nacl-tl-qa`** — could return PASS when every acceptance criterion was
  N/A; prerequisite check exited silently when servers were unreachable;
  screenshot file existence was never verified.
- **`nacl-tl-stubs`** — empty test files counted as INFO, then headline
  collapsed to `STUBS COMPLETE`; no sanity-seed against a known stub marker;
  `.tl/stub-registry.json` write failure was silent.
- **`nacl-tl-verify`** — passively promoted whatever `verify-code` returned;
  one `VERIFY COMPLETE` headline for both code-only and E2E-verified PASS.
- **`nacl-tl-hotfix`** — `--yes` bypassed Step 6's pre-merge non-PASS gate;
  Scenarios 1/2 could ship without any regression-test evidence; Step 4 didn't
  re-run the regression test it just delegated.
- **`nacl-tl-reopened`** — first-match-wins regex on the legacy `FIX COMPLETE`
  headline; never audited the test-author seam; never re-ran the suite on the
  reopened branch.
- **Dev skills (`nacl-tl-dev`, `-be`, `-fe`)** — same agent wrote both
  `*.test.*` and implementation; test-author isolation that 0.10.0 introduced
  for bug-fix mode never reached feature-dev.
- **Operational skills** (`nacl-tl-deploy`, `-reconcile`, `-intake`) — health
  check trusted HTTP-200 from a hardcoded path; reconcile canonicalized
  UNVERIFIED upstream fixes as PASS documentation; intake routed atoms without
  per-atom user gates.
- **Reporting skills** (`nacl-tl-sync`, `-docs`, `-review`, `-diagnose`) — sync
  ignored mock imports in production paths; docs Step 10 was a checkbox list;
  review's stub gate accepted `TODO: see backlog` as a "ticket reference";
  diagnose used 0.5 fills for components it couldn't measure.
- **Reliability** (`nacl-tl-conductor`, `-full`, `-deliver`, `-release`, `-ship`)
  — read JSON when the graph disagreed; advanced phases past Neo4j write
  failures.

This release fixes all of it.

---

## Per-Skill Changes

### Test-author isolation seam

#### `nacl-tl-regression-test` — dual-mode skill

**Before:** single mode (bug-fix). Wrote a test that FAILED on broken code;
verified RED; handed off to a separate implementation author.

**After:** two modes — `bug-fix` (default, unchanged) and `feature-dev` (new).
In feature-dev mode the skill reads `test-spec.md` / `test-spec-fe.md` /
`acceptance.md` (instead of a bug description), writes a test that FAILS
because the feature surface does not exist yet, and returns one of:
`FEATURE-TEST WRITTEN` / `FEATURE-TEST FAILED TO RED` / `FEATURE-TEST HALTED —
NO_INFRA` / `FEATURE-TEST INVALID — NOT RED`. Bug-fix mode is unchanged; the
0.10.0 invocation pattern from `nacl-tl-fix` Step 6d still works without
modification.

#### `nacl-tl-dev` / `nacl-tl-dev-be` / `nacl-tl-dev-fe` — delegated test authorship

**Before:** the same agent that wrote `*.test.*` files also wrote the
implementation. The dev skill self-graded its own RED phase by re-running the
suite in-skill.

**After:** Workflow A / Step 3.2 / Step A.2 invokes
`nacl-tl-regression-test mode=feature-dev` as a sub-agent. The dev skill
becomes strictly an implementation author — zero direct `Write` calls to test
files (or MSW handlers / fixtures, in the FE case). Step 3.3 / A.3 consumes
the sub-agent's RED-confirmation; the dev skill REFUSES to advance to GREEN
unless the sub-agent reported `FEATURE-TEST WRITTEN`. The dev skill propagates
the sub-agent's halt statuses into its existing `DEV-* HALTED — NO_INFRA` /
`-RUNNER_BROKEN` vocabulary.

`nacl-tl-dev` Workflow B (TECH/infra) is unchanged — TECH tasks may have no
`test-spec.md`; the existing baseline-and-reverify discipline stays.

### Verification family

#### `nacl-tl-verify-code` — baseline diff + runner sanity

**Before:** ran the suite once; one row in the classification matrix per exit
code; `tests_collected` was never checked; description listed seven statuses
(no `FAIL`).

**After:** runs the suite twice — once on the unchanged code (baseline), once
on the changed code (postfix) — and computes `new_failures = postfix −
baseline` and `transitioned = baseline − postfix`. Classification:

- `new_failures.size > 0` → `REGRESSION` (with failing test names)
- `new_failures.size == 0 && postfix.size > 0` → `BLOCKED` (with pre-existing
  failures listed)
- `postfix.size == 0 && coverage_gap == false` → `PASS`
- `postfix.size == 0 && coverage_gap == true` → `PASS_NEEDS_E2E`

`tests_collected > 0` is now a precondition for any PASS variant; if
collection is zero on a known-good test the skill emits `RUNNER_BROKEN`.
Empty-test-file detection (zero `it()` across all matched test files) emits
`NO_INFRA` rather than PASS. `FAIL` is added to the description's status
list. Result format gains `baseline_failures`, `postfix_failures`,
`new_failures`, `transitioned`.

#### `nacl-tl-qa` — testable-criteria gate + screenshot integrity

**Before:** could return PASS when every acceptance criterion was `ui_testable
== false` (vacuous PASS); prerequisite check exited silently when frontend was
unreachable; screenshot file existence after `playwright_screenshot` was never
asserted.

**After:** new Step 0 counts `ui_testable == true` criteria; emits `QA HALTED
— UNVERIFIED (no testable criteria)` and halts before any Playwright call when
the count is zero. Prerequisite check now asserts HTTP 200 and emits `QA
HALTED — NO_INFRA (frontend unreachable)` instead of exiting silently. Every
`playwright_screenshot` call is followed by a `stat` of the file; absent or
empty files mark the test step failed with `(screenshot missing)`. Verdict
logic now requires "at least one UI-testable criterion exists AND every
UI-testable criterion has status PASS AND every test step's screenshot exists
on disk" before returning `QA COMPLETE`. Headlines aligned with `nacl-tl-fix`
vocabulary: `QA COMPLETE` / `QA APPLIED — UNVERIFIED` / `QA HALTED — NO_INFRA`
/ `QA INCOMPLETE — REGRESSION`.

#### `nacl-tl-stubs` — sanity-seed + triple gate

**Before:** empty test files counted as INFO; `STUBS COMPLETE` could fire when
the grep returned zero hits because of a misconfigured pattern; the skill had
an internal contradiction between the empty-test-file rule (lines 232–233) and
the headline-vocabulary table (lines 440–441); registry-write failure was
silent.

**After:** Step 1b sanity-seed writes a known stub marker (`// STUB-SEED-CHECK
do-not-remove`) into a temp file and runs the configured grep against it
before scanning the workspace; if the marker isn't found the skill emits
`STUBS HALTED — RUNNER_BROKEN` and cleans up. `STUBS COMPLETE` is now gated on
a triple condition: production stubs == 0 AND empty-test-files == 0 AND test
files actually scanned (count > 0). Sibling-import-proxy pattern (test files
that import their assertions from a sibling file) is detected and downgraded
to `INFO STUB-EMPTY-TEST-FILE-IMPORT-PROXY`, not WARNING. New headline `STUBS
APPLIED — REGRESSION (empty test files: N)` fires when the empty count
exceeds 50% of test files. `.tl/stub-registry.json` write success is verified
before the summary; a write failure now emits `STUBS HALTED — RUNNER_BROKEN
(registry unwritable)`.

#### `nacl-tl-verify` — integrity gate + headline split

**Before:** passively promoted `verify-code`'s PASS verdict; one `VERIFY
COMPLETE` headline regardless of whether E2E ran; orchestrator report embedded
the child report verbatim.

**After:** before promoting any PASS, the skill asserts
`testRunner.command` is non-empty AND `testRunner.tests_collected > 0` AND
`baseline_failures` and `postfix_failures` are present in the result. Any
missing field downgrades the orchestrator outcome to `VERIFY APPLIED —
UNVERIFIED (verify-code returned PASS without baseline evidence)`. Two PASS
headline variants: `VERIFY COMPLETE (code-only)` when only verify-code ran,
`VERIFY COMPLETE (E2E-verified)` when QA also ran. Orchestrator report now
surfaces the integrity fields explicitly (runner command, tests collected,
baseline/postfix counts) — child report is no longer embedded verbatim.

### Fix-derivative skills

#### `nacl-tl-hotfix` — `--yes` loophole closed + regression-test seam audited

**Before:** `--yes` invocation flag silently bypassed the pre-merge non-PASS
gate at Step 6, contradicting the skill's own "NEVER skip tests" preamble.
Test-author seam was delegated but never audited. Step 4 didn't re-run the
regression test by file path. Scenarios 1/2 (stash, cherry-pick) could ship
without any test evidence at all.

**After:** `--yes` is scope-limited — it skips non-safety prompts (task-list
selection, module-detection confirmation) but does NOT bypass the pre-merge
non-PASS gate, which now issues a fresh unconditional prompt for any non-PASS
status. New Step 3.5 verifies the regression-test seam: parses
`nacl-tl-fix`'s Step 8 report for the regression-test file path and RED→GREEN
evidence; halts with `HOTFIX HALTED — UNVERIFIED (regression-test seam not
honored)` if either is absent. Scenarios 1/2 invoke `/nacl-tl-regression-test`
against `main` BEFORE applying the stash/cherry-pick — the test must be RED on
main (proving the bug exists) and GREEN after (proving the fix addresses it).
Step 4 runs the regression test by file path with the runner's filter flag,
not by glob. PR template gains `Regression test:` and `RED→GREEN evidence:`
fields. Per-status escape hatches (BLOCKED/UNVERIFIED/NO_INFRA/RUNNER_BROKEN
ship paths) consolidated into the single mandatory Step 6 gate.

#### `nacl-tl-reopened` — Status-line parser + re-run gate

**Before:** Step 7.5 used a first-match-wins regex on report headlines that
collapsed BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN under one umbrella
header. Test-author seam was never audited. Step 8 invoked review/stubs
without re-running the suite on the reopened branch.

**After:** Step 7.5 parses `Status: {value}` as the authoritative classifier;
the headline is decoration only. Reports without a parseable `Status:` line
emit `REOPENED HALTED — UNVERIFIED (fix report unparseable)`. New Step 7.5.1
verifies the regression-test seam (file path + RED→GREEN evidence) and halts
on absence with `REOPENED HALTED — UNVERIFIED (regression-test seam not
honored)`; skipped only for NO_INFRA / RUNNER_BROKEN statuses. New Step 8
precondition re-runs `scripts.test` on the reopened branch before invoking
review/stubs; emits `REOPENED INCOMPLETE — REGRESSION` and halts on suite
failure. Headline vocabulary aligned with `nacl-tl-fix` Step 8.

### Operational gates

#### `nacl-tl-deploy` — health-shape validation + contract section

**Before:** health check probed a hardcoded `/api/health` endpoint and trusted
HTTP-200 with no shape validation; a 10-second `sleep` preceded the probe; no
`## Contract` section for downstream consumers; per-task status table was
promised in prose but absent from the report; SSH-diagnostics block contained
placeholder Russian draft text.

**After:** health endpoint URL and expected response keys are read from
`config.yaml` under a `deploy.{env}.health_contract` block (`expected_keys`,
optional `expected_values`); response body is shape-validated with `jq
--exit-status` against the contract. If config doesn't define the contract the
skill emits `DEPLOY HALTED — NO_INFRA (health contract undefined)`. The
10-second sleep is replaced with a 2-second poll loop that runs for up to 60
seconds and emits `DEPLOY INCOMPLETE — UNVERIFIED (health probe timeout)` on
exhaustion. New `## Contract` section enumerates downstream consumers
(`nacl-tl-deliver`, `-release`, `-conductor`, `-hotfix`). Per-task status
table now appears in the worked example with columns `SHA | source-task |
source-verification-status | CI-status | health-status`. SSH-diagnostics
section rewritten in English.

#### `nacl-tl-reconcile` — UNVERIFIED-aware + freshness automation

**Before:** Phase 1 surfaced UNVERIFIED upstream fixes but allowed reconcile
to canonicalize them as `RECONCILE COMPLETE` documentation; staleness check
was prose, not automated; "MINIMAL specification" template edits were never
validated against the code they described; Phase 4 validation paths were all
optional; per-task status table was promised but absent.

**After:** when any upstream fix is UNVERIFIED the headline is hard-locked to
`RECONCILE APPLIED — UNVERIFIED (documenting unverified upstream behavior)`
regardless of user acknowledgment — the user can still proceed, but the
headline reflects reality. Freshness is automated with `git log -1
--format="%ai" -- {file_path}`; discrepancies whose target file was modified
after the diagnostic-report timestamp are skipped and recorded in a "Skipped
(already-fixed)" list in the Phase 5 report. Each Phase 3 MINIMAL-spec edit
is re-validated against the code (entity schema, main-flow step count,
endpoint paths) before the report finalizes; mismatch rejects the edit. Phase
4 makes at least one validation path mandatory; if neither `nacl-sa-validate`
nor `nacl-ba-validate` is available the gap-check fallback covers ≥10 docs
(was top-3). Phase 5 report gains a per-task status table with columns
`source-task | upstream-fix-status | doc-edit | validation-result`.

#### `nacl-tl-intake` — per-atom gate + GRAPH/HEURISTIC evidence

**Before:** Step 2b classified every atom and routed to a downstream skill
without per-atom user confirmation. Neo4j-backed and keyword-heuristic
classifications shared one headline. YouGile subtask linking errors were
silent. No `## Contract` section.

**After:** every atom is annotated with `confidence: HIGH|MEDIUM|LOW` and
`evidence: GRAPH|HEURISTIC`. Per-atom prompt fires before grouping; `--yes`
auto-confirms only on `confidence: HIGH AND evidence: GRAPH`; MEDIUM / LOW /
HEURISTIC re-prompt regardless of `--yes`. Final report column shows the
evidence flag. Headlines split: `INTAKE TRIAGE COMPLETE (graph-backed)` vs
`INTAKE TRIAGE APPLIED — UNVERIFIED (heuristic-backed)`. Each YouGile API
call is wrapped with 3-attempt retry; exhaustion emits `INTAKE HALTED —
RUNNER_BROKEN (YouGile linking failed)`. New `## Contract` section enumerates
downstream skills (`/nacl-sa-feature`, `/nacl-tl-fix`, `/nacl-tl-dev`) with
input schemas. The parallel-wave mechanism (single `Agent` tool call with
multiple invocations in one message) is documented explicitly with correct vs
incorrect examples.

### Reporting hygiene

#### `nacl-tl-sync` — mock detection in production paths

**Before:** mock scan excluded test fixtures but didn't flag `mock` imports
from production paths (`src/services`, `src/hooks`, `src/api`); endpoint-path
grep returned zero hits when paths contained regex metachars (`{id}`, `[type]`);
verdict ignored WARNING-severity mocks; FE tests using MSW handlers were not
detected.

**After:** Step 6 grep scans production paths for `import .* from .*mock` /
`import .*mock.* from`, excluding `__mocks__/`, `fixtures/`, `*.stories.*`,
`*.test.*`, `*.spec.*`; matches are BLOCKER, not WARNING. Step 7.3 endpoint
grep uses `grep -F` (literal-string match) instead of regex. New Step 7.3b
scans FE test files for `jest.mock(` / `vi.mock(` / `setupServer(` /
`mockapi.`; matches set `fe_coverage_gap = true` and downgrade FE side to
UNVERIFIED. Verdict rules expanded: `mock_blockers > 0` → `FAIL`;
`mock_warnings > 0 || fe_coverage_gap` → `UNVERIFIED`.

#### `nacl-tl-docs` — Step 10 made executable

**Before:** Step 10 was a checkbox list; pre-doc checks confirmed task
approval but didn't check code↔docs coherence; code examples in docs were
never run; output had a single happy-path summary.

**After:** Step 10 is split into three executable sub-steps: 10.1 automated
link check (greps all markdown for `[text](path)` patterns; asserts internal
targets exist; emits `DOCS HALTED — UNVERIFIED (broken links: N)`); 10.2
code-example syntax check (extracts fenced code blocks; runs `npx tsc
--noEmit --skipLibCheck` for TS/JS, `python -m py_compile` for Python); 10.3
implementation-coverage audit (diffs `result-{be,fe}.md` against doc sections
updated; user can accept with reason or reject). Output Summary replaces the
single `DOCS COMPLETE` headline with status-aware variants: `DOCS COMPLETE` /
`DOCS APPLIED — UNVERIFIED` / `DOCS HALTED — NO_INFRA` / `DOCS INCOMPLETE`.

#### `nacl-tl-review` — ticket-ID regex + tri-state checklist

**Before:** stub gate mandated a "ticket reference" but didn't validate the
format — `TODO: see backlog` passed the gate; MAJOR test-author-overlap flag
was non-blocking with no follow-up recommendation; headline was independent of
verdict; checklist rows were boolean PASS/FAIL with no PARTIAL state.

**After:** stub justifications must match
`(UC|TECH|FR|BUG)-?\d+|https?://`; absence sends the phase back to
`in_progress` and emits `REVIEW HALTED — UNVERIFIED (stubs lack ticket
references)`. MAJOR test-author flag remains non-blocking but adds a mandatory
"Next Steps" line: `Recommend: '/nacl-tl-regression-test --retroactive
UC###'`; downstream `ship` and `deliver` MAY consult this flag (documented in
the contract). Combined status line replaces the dual headline: `Workflow
status: '...'. Code judgment: '...'. Action required: ...`. Checklist rows are
now tri-state (PASS / PARTIAL / FAIL); PARTIAL surfaces in the report but
doesn't auto-block.

#### `nacl-tl-diagnose` — aggregation contract + evidence-required hypotheses

**Before:** three parallel sub-agents had no aggregation contract — partial
failures produced reports indistinguishable from full success; health-score
formula filled missing components with 0.5 (a "neutral" lie about coverage);
gap-analysis truncated at 5 files per cluster with no warning; root-cause
hypotheses had no evidence requirement; orphan reference to "L2/L3 only"
mini-validation.

**After:** new aggregation step waits for all three sub-agents; any failure
marks the report `Data completeness: partial (Agent #N failed: reason)`; all
success marks `complete`. Health-score formula replaces 0.5 fills with
explicit `not_assessable: <reason>` tags; composite single-number score is
withheld when any component is `not_assessable` and the report shows a
per-component breakdown instead. Gap-analysis truncation prints
"Analyzed top-5 of N files in cluster — full analysis may reveal additional
discrepancies." Root-cause hypotheses require at least one piece of evidence
(commit reference, file diff, etc.); evidence-free hypotheses are downgraded
to "candidate hypothesis (unverified)." Pre-finalize checklist asserts every
required section of `DIAGNOSTIC-REPORT.md` is present and non-empty.

### Reliability — graph-vs-JSON precedence

#### `nacl-tl-conductor` — Phase 4→5 graph re-query

**Before:** Phase 4 → 5 transition trusted `conductor-state.json` for
terminal-state confirmation; a Neo4j outage mid-batch could leave JSON saying
`done` while the graph said `in_progress`.

**After:** Phase 4 Quality Gate adds a Cypher sentinel query before
advancement: any Task with `status IN ['pending', 'in_progress']` triggers
`PHASE_ADVANCE_HALTED` with the offending task list and three remediation
paths. The HALT is unconditional — no `--yes` escape.

#### `nacl-tl-full` — dual-write fence + outage recovery

**Before:** dual-write protocol updated `.tl/status.json` even when the
Neo4j write failed; no documented recovery procedure for partial outages.

**After:** phase advancement requires Neo4j write success. A Neo4j failure
emits `PHASE_ADVANCE_HALTED: Neo4j write failed` and refuses to update the
JSON store. New "Outage Recovery" section: when Neo4j was unavailable
mid-execution the operator must run `/nacl-tl-diagnose` before resuming;
five-step recovery procedure documented (confirm connectivity, run diagnose,
review report, resolve mismatches with graph as source of truth, resume).

#### `nacl-tl-deliver` — graph-primary read

**Before:** pre-verify gate read `.tl/status.json` as primary source; FAIL UC
exclusion was implicit and not symmetric with the IntakeItem stamping rule.

**After:** Step 4.0 reads the Task node from the graph as primary source;
falls back to `.tl/status.json` only on Neo4j error/timeout (with WARN log).
Disambiguation rule documented: graph wins on disagreement. Partial-failure
exclusion now states explicitly that FAIL UCs are excluded from the delivery
artifact, from Step 5 verify, and from Step 6 stamping — symmetric with the
IntakeItem stamping rule.

#### `nacl-tl-release` — graph-only enforcement

**Before:** pre-merge UC status gate fell back to `.tl/status.json` when a
Task node was missing; release report had no per-UC verification status
column; changelog freshness was never cross-checked against merged-PR dates.

**After:** Step 2 status gate queries the graph and HALTs with `RELEASE
HALTED — MISSING TASK NODE` if any node is absent — no JSON fallback. Release
report gains per-UC columns (`UC status`, `Evidence level`) drawn from
`t.verification_evidence`; evidence-level legend documented. Changelog
freshness cross-check compares the latest changelog `## vX.Y.Z` heading date
against the most recent merged-PR date and emits a non-blocking WARNING on
staleness > 1 day.

#### `nacl-tl-ship` — conductor-driven branch-name note

**Before:** BASE-BRANCH GUARD implicitly assumed feature branch name matches
UC ID, which is false for conductor-driven invocations where one branch hosts
multiple UCs.

**After:** documentation-only pre-flight note added to Step 2: under
`/nacl-tl-conductor` the feature branch is pre-created and may host multiple
UCs in sequence; branch-name mismatch with UC ID is expected and must not
halt the ship. **No branch-switching logic introduced** — `nacl-tl-ship`
remains forbidden from autonomously switching branches; that path stays the
exclusive domain of `nacl-tl-hotfix`.

---

## Migration Impact

**Test-author isolation is now mandatory for feature-dev TDD.** The dev skills
(`nacl-tl-dev`, `-be`, `-fe`) no longer write test files directly. They invoke
`nacl-tl-regression-test mode=feature-dev` as a sub-agent. Any custom workflow
that previously called the dev skills and inspected the produced test files
will see the same files at the same paths — but the audit trail now shows
two distinct sub-agent runs instead of one.

**`nacl-tl-verify-code` result schema gains four fields.** Downstream
consumers — `nacl-tl-verify`, `nacl-tl-fix`, custom orchestrators — that
previously read only `status` will continue to work. Consumers that want
honest baseline evidence should read `baseline_failures`, `postfix_failures`,
`new_failures`, `transitioned`. The integrity gate in `nacl-tl-verify`
requires these fields to be present in any PASS result; their absence
downgrades to `VERIFY APPLIED — UNVERIFIED`.

**Hotfix `--yes` no longer bypasses the Step 6 gate.** Automation that passed
`--yes` to `/nacl-tl-hotfix` and expected silent merge of UNVERIFIED fixes
will now hit a fresh prompt at Step 6. The flag's documented scope is now
"non-safety prompts only." Update automation accordingly or accept an
operator-in-the-loop step on non-PASS hotfixes.

**Stub scanner sanity-seed is required infrastructure.** `nacl-tl-stubs` now
writes a temp file inside the workspace before scanning. Workspaces that
forbid file writes outside specific directories may need to whitelist the
sanity-seed path. The skill cleans up the temp file regardless of result.

**QA verdict requires testable criteria.** `acceptance.md` files where every
criterion has `ui_testable == false` will produce `QA HALTED — UNVERIFIED
(no testable criteria)` — they no longer auto-PASS. Review such files and
either add testable criteria or accept the new halt status.

**Reconcile UNVERIFIED locks the headline.** When `.tl/status.json` shows any
recent fix as `verified-pending`, reconcile's headline is hard-locked to
`RECONCILE APPLIED — UNVERIFIED (documenting unverified upstream behavior)`.
Acknowledgment authorizes proceeding, not re-labeling.

**Release gate is graph-only.** Missing Task nodes no longer fall back to
`.tl/status.json`. Workflows that bypass Neo4j writes (legacy, non-graph-aware
flows) need to either populate the graph (recommended) or skip
`nacl-tl-release` for those tasks.

**Health-contract config is required for deploy.** `nacl-tl-deploy` no longer
trusts a hardcoded `/api/health` endpoint. Add `deploy.{env}.health_contract`
to `config.yaml` with `expected_keys` (and optionally `expected_values`)
before the next deploy. Absent contract emits `DEPLOY HALTED — NO_INFRA`.

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual; each
scenario describes the expected halt path or downgrade.

### Scenario 1 — dev-be: feature-dev mode delegated to regression-test

**Setup:** Run `/nacl-tl-dev-be UC037`. `test-spec.md` is present;
`acceptance.md` lists three criteria; `api-contract.md` defines two
endpoints.

**Expected behavior:**
1. Step 3.0 (runner discovery), 3.1 (baseline) execute as before.
2. Step 3.2 invokes `nacl-tl-regression-test mode=feature-dev` with workspace,
   `test-spec.md`, `acceptance.md`, `api-contract.md`. The sub-agent writes
   the test files, verifies RED, returns `FEATURE-TEST WRITTEN`.
3. Step 3.3 reads the sub-agent's report; advances to GREEN.
4. Step 4 implements the feature; Step 4.2 verifies GREEN against baseline.

**Failure condition:** the dev-be skill writes a test file directly (audit
shows a `Write` call to `*.test.ts` from dev-be itself, not from the
sub-agent).

### Scenario 2 — verify-code: 44 hollow test files

**Setup:** Run `/nacl-tl-verify-code` against a workspace with 44 test files,
each containing zero `it()` calls (e.g. only a top-level describe with no
assertions).

**Expected behavior:**
1. Step 5.1 confirms `scripts.test` exists.
2. Step 5.2 baseline run reports `tests_collected = 0` (or whatever the
   runner says for empty files).
3. Step 5.3 empty-test-file guard fires: 44 files matched, 0 `it()` calls
   total. Result: `NO_INFRA — empty test files (44 files, 0 it() calls)`.
4. Result is NOT PASS. The skill never reaches Step 5.4 classification.

**Failure condition:** PASS or PASS_NEEDS_E2E.

### Scenario 3 — verify: code-only PASS vs E2E-verified PASS

**Setup:** Run `/nacl-tl-verify UC028`. verify-code returns `PASS` with all
integrity fields present. Run again with `verify-code` returning
`PASS_NEEDS_E2E` and qa returning PASS.

**Expected behavior:**
- First run: integrity gate passes; `coverage_gap == false`; QA not invoked.
  Headline: `VERIFY COMPLETE (code-only)`.
- Second run: integrity gate passes; QA invoked; QA returns PASS. Headline:
  `VERIFY COMPLETE (E2E-verified)`.

**Failure condition:** both runs produce the same headline.

### Scenario 4 — hotfix: `--yes` with UNVERIFIED fix

**Setup:** Run `/nacl-tl-hotfix "fix login crash" --yes`. `nacl-tl-fix`
returns `Status: UNVERIFIED`.

**Expected behavior:**
1. Step 3.5 parses the fix report; finds regression-test path and RED→GREEN
   evidence; advances.
2. Step 4 re-runs the regression test by file path; passes.
3. Step 6 pre-merge gate fires fresh prompt: "Status is UNVERIFIED. Confirm
   merge to main? [yes/no] Default: no". `--yes` does not auto-confirm.
4. Without confirmation: PR is not created; `HOTFIX HALTED — UNVERIFIED`.

**Failure condition:** PR created without explicit Step 6 confirmation.

### Scenario 5 — hotfix Scenario 1: stash with no regression test

**Setup:** Run `/nacl-tl-hotfix --scenario 1` (stash). The user-provided fix
description has no regression-test path.

**Expected behavior:**
1. Step 3 Scenario 1 invokes `/nacl-tl-regression-test` against `main` BEFORE
   applying the stash.
2. If the regression-test invocation is missing or returns no file path, Step
   3.5 detects `regression_test_path = empty` and emits `HOTFIX HALTED —
   UNVERIFIED (regression-test seam not honored)`.
3. Halt before Step 4. No merge.

**Failure condition:** stash applied or merge proceeds without test evidence.

### Scenario 6 — reopened: BLOCKED status with UNVERIFIED-shaped headline

**Setup:** `nacl-tl-fix` returned a report containing `Status: BLOCKED` plus
the headline `FIX APPLIED — UNVERIFIED (pre-existing failures)`.
`/nacl-tl-reopened` is invoked.

**Expected behavior:**
1. Step 7.5 parser finds `Status: BLOCKED` line. Headline is ignored.
2. Branch on parsed value `BLOCKED`. Post BLOCKED advisory; require explicit
   user `proceed` before Step 8.
3. Final classification: BLOCKED (not UNVERIFIED).

**Failure condition:** classification is UNVERIFIED.

### Scenario 7 — stubs: 44 empty test files

**Setup:** Run `/nacl-tl-stubs` against a workspace where 44 of 50 test files
are empty (zero `it()` calls).

**Expected behavior:**
1. Step 1b sanity-seed succeeds.
2. Step 2b empty-test-file detection counts 44 empty files (88% of 50).
3. Threshold (>10 OR >50%) fires the REGRESSION variant.
4. Headline: `STUBS APPLIED — REGRESSION (empty test files: 44)`. NOT `STUBS
   COMPLETE`.

**Failure condition:** `STUBS COMPLETE`.

### Scenario 8 — qa: all-N/A acceptance criteria

**Setup:** Run `/nacl-tl-qa UC050`. `acceptance.md` lists 10 criteria, all
with `ui_testable: false`.

**Expected behavior:**
1. Step 0 counts UI-testable criteria: 0. Halt before Step 1.
2. Headline: `QA HALTED — UNVERIFIED (no testable criteria)`.
3. No Playwright tool is invoked.

**Failure condition:** any Playwright call fires; PASS reported.

### Scenario 9 — deploy: health endpoint returns `{}`

**Setup:** `config.yaml` has `deploy.production.health_contract.expected_keys
= ["status", "version"]`. Production health endpoint returns HTTP 200 with
body `{}`.

**Expected behavior:**
1. Step 4 polls; first 200 response triggers Step 5 shape validation.
2. Step 5 runs `echo '{}' | jq --exit-status 'has("status")'`; non-zero exit.
3. Halt: `DEPLOY HALTED — health check failed (shape mismatch)`.

**Failure condition:** deploy proceeds to Step 6 (YouGile + report) on
empty-body 200.

### Scenario 10 — release: missing Task node

**Setup:** Run `/nacl-tl-release`. PR list contains UC-028 (graph node
present, status `done`) and UC-029 (no graph node).

**Expected behavior:**
1. Step 2 Cypher per-PR check; UC-029 returns zero rows.
2. Halt: `RELEASE HALTED — MISSING TASK NODE`. Recommend `/nacl-tl-diagnose`.
3. UC-028 never merged (HALT precedes the merge plan).

**Failure condition:** UC-028 merged before halt; or fallback to
`.tl/status.json` for UC-029.

### Scenario 11 — conductor: JSON says done, graph says in_progress

**Setup:** Run `/nacl-tl-conductor` after a Neo4j outage that left
`conductor-state.json` saying UC-031 is done while the graph still says
`in_progress`.

**Expected behavior:**
1. Phase 4 Quality Gate runs the Cypher sentinel.
2. UC-031 returns as a row with `status = 'in_progress'`.
3. Halt: `PHASE_ADVANCE_HALTED` listing UC-031 and three remediation paths.
4. Phase 5 not entered.

**Failure condition:** Phase 5 executes with stale JSON state.

---

## Known Limitations

- **Test-author isolation is documentation discipline**, not runtime
  enforcement. The dev skills' SKILL.md instructs the LLM agent to delegate
  test authorship to `nacl-tl-regression-test`; an LLM that writes tests
  directly anyway will produce tests, but the audit trail (sub-agent absence)
  surfaces the violation. Detection is post-hoc, not preventive.
- **The integrity gate in `nacl-tl-verify`** trusts the fields produced by
  `nacl-tl-verify-code`. A malformed sub-skill output that fakes the field
  shape would pass the gate. Mitigation: the per-skill review checklist
  catches this.
- **Hotfix Scenario 1/2 regression-test against main** requires the test to
  be runnable on the un-fixed `main` branch. If the regression test depends
  on infrastructure that doesn't exist on main (e.g. a new module path), the
  invocation will fail with `FEATURE-TEST HALTED — NO_INFRA` rather than
  meaningfully RED. Operator must add a TECH task to bootstrap the
  infrastructure before hotfix can proceed.
- **`nacl-tl-deploy` health contract** lives in `config.yaml`. Workspaces
  that override `config.yaml` per environment via env-vars will need a
  matching override mechanism; the skill assumes file-based config.
- **`nacl-tl-reconcile` Health Score adjustment for UNVERIFIED tasks** uses
  the same heuristic from 0.12.0 (-5 per UNVERIFIED). The score is advisory,
  not gating; the headline is the source of truth.
- **`nacl-tl-stubs` 50%-threshold** for the REGRESSION headline is a
  default; projects with intentionally many empty test files (e.g. scaffolds
  on a new module) may want to tune the threshold. Currently the threshold
  is documented but not parameterized.
