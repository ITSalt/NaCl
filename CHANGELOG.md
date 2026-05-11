# Changelog

All notable changes to NaCl (Natural Agent Control Language) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **NaCl Analyst Tool** (`analyst-tool/`) -- local web application that wraps Excalidraw with a full board browser, sync-status sidebar, snapshot browser with diff overlay, and unified board + graph search.
- `inline-table-v1` SA adapter: table-format requirements parser (RQ-NNN-NN rows) as fallback when no `### FR-NNN:` headings are found.
- `inline-table-v1` SA adapter: YAML frontmatter fallbacks for module ownership, form SCR-ID, and UC-ID resolution in requirements files.
- `inline-table-v1` SA adapter: Module ID derived from English «Код» column (kebab-case value) instead of transliterated Russian name; projects without the column are unaffected.
- `inline-table-v1` SA adapter: multi-column search for UC-IDs and domain-entity names in traceability-matrix rows (previously only `vals[1]` was checked).
- `inline-table-v1` SA adapter: `ROL-NN` accepted alongside `ACT-NN` as BA role identifier in traceability-matrix role section.
- `inline-table-v1` SA adapter: BRQ→requirement resolution now handles raw `RQ-NNN-NN` references in addition to canonical `REQ-*` IDs.
- `audit_sa`, `generate_sa_cypher`, `validate_sa_ir`: extended module lookup accepts English code (stored in `description`) and `MOD-` suffix as aliases for module name.

### Fixed

- `inline-table-v1` SA adapter: skip summary rows (`Итого`, `Total`, `Всего`) and strip backtick/asterisk formatting from the «Код» column in the module table.
- `inline-table-v1` SA adapter: deduplicate `HandoffEdge` pairs `(BP-*, UC-*)` — previously the same edge could be appended multiple times.
- `validate_sa_ir` SV5: `Form.used_by_uc` check is now advisory-only (always PASS, collects info); secondary and deleted UC references are not a migration blocker.

## [0.16.0] — 2026-05-11

Codex packaging release. This release turns the Codex adaptation from a
five-skill pilot into a complete installable package: all 57 migrated NaCl
skills now exist under `skills-for-codex/`, the installer discovers every
`SKILL.md` automatically, and the public documentation reflects the current
skill count and installation model.

### Added

- 52 additional Codex skill adaptations under `skills-for-codex/`, completing
  the migrated Codex package at 57 installable `SKILL.md` files.
- `skills-for-codex/INSTALL.md` with user-level symlink installation,
  verification, and uninstall commands.
- `skills-for-codex/scripts/install-user-symlinks.sh` for safe installation
  into `$HOME/.agents/skills/`.
- Release documentation at
  `docs/releases/0.16.0-codex-skills-package/`.

### Changed

- Codex skill installation now discovers every
  `skills-for-codex/*/SKILL.md` directory instead of maintaining a fixed
  five-skill pilot list.
- Codex migration docs now mark the full migration as complete and reserve
  follow-up work for polish, validation automation, and runtime discovery
  checks.
- README, skills reference, methodology, agent, and install docs now report
  the current 57-skill set: 14 BA, 10 SA, 26 TL, 4 utilities, and 3 migration
  skills.

### Notes

- Root-level `nacl-*` Claude-oriented source skill folders remain unchanged.
- GitHub release asset: `nacl-codex-skills-v0.16.0.tar.gz`, containing the
  full `skills-for-codex/` package.

## [0.15.0] — 2026-05-07

Bundled release closing the dev `--continue` paths, the verifier and sync
baseline procedures, the review runner discovery, and the wave / intake /
deploy stamping. After 0.14.0 the five orchestration paths to `main` /
deploy / delivery / release honoured the six-status output. 0.15.0 closes
the layer in between: every implementation and quality gate now consumes or
emits the same six-status contract with exact runner discovery and explicit
baseline evidence. Dev `--continue` no longer self-grades; it delegates to
`/nacl-tl-fix` with a new `--from-review` metadata flag.

Five cross-cutting principles thread through the affected skills:
1. `Status: {value}` is the only authoritative classifier (headlines are
   advisory).
2. Declared workspace commands only — no `npm test` / `npm run build` /
   `npx tsc` fallbacks.
3. Baseline before any "pre-existing" / "regression" / "new failures"
   claim.
4. Skip ⇒ unverified, never PASS.
5. No autonomous branch switching.

### Added

- `nacl-tl-fix`: `--from-review` flag (metadata-only). When set, the Step 8
  report adds `Invocation source: review (--from-review)` under the Problem
  line, and the `.tl/changelog` entry records `- **Invocation source:**
  review`. The six-status contract, baseline procedure, and RED-first
  discipline are unchanged. The flag exists so the dev trio can prove its
  review-rework path delegated to the hardened fix contract.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: explicit `--continue`
  delegation block. The dev skill reads `review-{be,fe}.md` (or
  `review.md` for TECH), parses Blocker / Critical / Major issues into a
  problem description, invokes `/nacl-tl-fix "<problem>" --uc UC###
  --from-review` as a sub-agent, parses the fix report's `Status:` line,
  verifies the regression-test seam (`Tests > Regression test` path +
  `Tests > RED→GREEN` evidence), appends a `## Fix Iteration N` block to
  `result-{be,fe}.md`, and gates `phases.{be,fe}.status =
  "ready_for_review"` on `Status: PASS` (or operator-gated accepted-
  `BLOCKED`). Status-aware `--continue Output Summary` in every dev skill.
- `nacl-tl-verify-code` Step 5.2: baseline-ref discovery (priority:
  `--base <ref>` flag → saved `.tl/tasks/<id>/baseline-failures.json`
  artifact → `git merge-base HEAD main`). Baseline run uses
  `git worktree add` to a temp dir; worktree removed on every exit path.
  New `UNVERIFIED (no baseline)` row in the Step 5.4 classification
  table.
- `nacl-tl-sync` Step 7.2: per-workspace baseline capture via
  `git worktree add`. New per-workspace deltas: `be_new_failures`,
  `be_pre_existing`, `fe_new_failures`, `fe_pre_existing`. New
  `UNVERIFIED (no baseline)` classification rule for workspaces without a
  resolvable baseline.
- `nacl-tl-review` Step 6a-baseline: explicit baseline-ref discovery
  (mirroring `nacl-tl-verify-code` and `nacl-tl-sync`). New
  "`APPROVED` allowed?" column in the Step 8b headline table; explicit
  `APPROVED`-promotion rule documenting that `Code judgment: APPROVED`
  may only be written when the headline is `REVIEW COMPLETE`.
- `nacl-tl-reopened` Batch mode sub-agent prompt: now includes the full
  six-status contract — Step 7.5 status-line parsing, Step 7.5.1
  regression-test-seam evidence gate (`Tests > Regression test` path +
  `Tests > RED→GREEN` evidence required for any status other than
  `NO_INFRA` / `RUNNER_BROKEN`), and per-status branching that prevents
  `/nacl-tl-review`, `/nacl-tl-stubs`, and `/nacl-tl-ship` from running
  on non-PASS outcomes.
- `nacl-tl-full` `--skip-qa`: explicit P4 semantics. Sets
  `phase_qa = 'skipped'`, `Task.verification_skip_reason =
  'full --skip-qa'`. Forces wave aggregate headline
  `FULL APPLIED — UNVERIFIED (qa skipped)`. Forbids downstream stamping;
  UCs that completed every other phase land at `verified-pending`,
  not `done`. Records `run.skip_flags = ['qa']` in `status.json`.
- `nacl-tl-intake`: `Fix Status` and `State` columns in the final
  summary table. Headline-selection rules surface non-PASS bug atoms in
  the headline (`INTAKE TRIAGE INCOMPLETE — REGRESSION`,
  `INTAKE TRIAGE HALTED — RUNNER_BROKEN`,
  `INTAKE TRIAGE APPLIED — UNVERIFIED (NO_INFRA: N atoms unfinished)`,
  etc.). Progress rows surface the verbatim downstream `Status:` value
  per atom.

### Changed

- `nacl-tl-dev-fe` Step 3.3: silence-on-regressions is no longer
  treated as no-regression. The previous "if the agent's report is
  silent on regressions, trust the agent's RED confirmation" rule is
  replaced with: silence is `UNVERIFIED`; require an explicit
  no-regression line in the sub-agent's report (e.g. `Regressions:
  none introduced (postfix ⊆ baseline)`) before advancing.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` Step 7 (Update
  Tracking): explicit status-gating table. `phases.{be,fe}.status =
  "ready_for_review"` only for `Status: PASS` (or operator-gated
  accepted-`BLOCKED`); every other status keeps the phase in
  `in_progress` with `failure_reason` recorded.
- `nacl-tl-reopened`: `modules.[name].test_cmd` and
  `modules.[name].build_cmd` config keys read declared workspace
  `package.json` `scripts.{test,build}` only (P2). The previous
  `fallback npm test` / `fallback npm run build` clauses are removed.
  Missing → `REOPENED HALTED — NO_INFRA (scripts.test undeclared)`.
- `nacl-tl-reopened` Step 8 re-run gate: missing `scripts.test` halts
  as `REOPENED HALTED — NO_INFRA`. The "proceed to review with a
  warning" path is removed.
- `nacl-tl-reopened` final report: `Status: DevDone ✅` is gated on
  the headline `REOPENED COMPLETE` (i.e. fix `Status: PASS` AND
  re-run suite green AND review approved). Every other outcome
  renders `REOPENED APPLIED — <STATUS>` or `REOPENED HALTED —
  <STATUS>` and leaves the YouGile column at InWork (or the matching
  halt state).
- `nacl-tl-verify-code` Step 5.2: the previous "before touching any
  files, run the exact `scripts.test` command on the current working
  tree" baseline rule is replaced with `git worktree add` against a
  resolved baseline ref. The working tree is treated exclusively as
  the postfix.
- `nacl-tl-sync` Step 7.4 classifier: the contradictory rule "Both
  suites pass AND pre-existing failures remain → `BLOCKED`" is
  removed. `BLOCKED` is now reserved for "at least one workspace has
  failures, all of which are baseline-confirmed pre-existing
  (`postfix ⊆ baseline`) AND no new failures in either workspace".
- `nacl-tl-review` Step 6a: declared `scripts.test` only — no
  `npm test` / `npx jest` / `npx vitest` fallbacks (P2). Missing →
  `REVIEW HALTED — NO_INFRA`; runner crash → `REVIEW HALTED —
  RUNNER_BROKEN`. `Code judgment: APPROVED` is forbidden under both
  halt headlines.
- `nacl-tl-full` Phase 1 Wave 0 TECH flow: reads `/nacl-tl-dev
  TECH-###`'s `Status:` line before advancing. Mirrors the BE/FE
  branching at Phase 2. The previous unconditional advancement to
  review/commit is replaced with explicit per-status branching.
- `nacl-tl-deploy` upstream gate: `verified-pending` halts by
  default as `DEPLOY HALTED — UNVERIFIED (upstream verified-pending)`;
  operator override emits `DEPLOY APPLIED — UNVERIFIED (operator
  override)` and refuses to move the source Task to `done`/`released`.
  Unknown verification state ("Not found in graph") halts
  unconditionally as `DEPLOY HALTED — UNVERIFIED (upstream status
  unknown)`. The "warn and proceed (backward-compat)" path is removed.
- `nacl-tl-intake`: progress and final-summary rows surface the
  verbatim downstream `Status:` value. Bug atoms with non-PASS
  downstream status appear as `unfinished`, not `fixed`. Final state
  movement (`Done`, `Delivered`) requires PASS-family downstream
  status.

### Removed

- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: the inline
  `--continue` "fix the issue, run tests to verify fix" loop.
  Replaced with delegation to `/nacl-tl-fix --from-review`.
- `nacl-tl-dev-fe` Step 3.3: "if the agent's report is silent on
  regressions, trust the agent's RED confirmation" — replaced with
  explicit no-regression-evidence requirement.
- `nacl-tl-reopened`: `fallback npm test` / `fallback npm run build`
  configuration clauses.
- `nacl-tl-reopened` Step 8 re-run gate: "proceed to review with a
  warning" on missing `scripts.test`.
- `nacl-tl-verify-code` Step 5.2: single-run "current working tree"
  baseline measurement.
- `nacl-tl-sync` Step 7.4: contradictory "Both suites pass AND
  pre-existing failures remain → `BLOCKED`" rule.
- `nacl-tl-review` Step 6a: `npm test (or workspace's scripts.test)`
  fallback; ability to promote to `APPROVED` under `NO_INFRA` /
  `RUNNER_BROKEN`.
- `nacl-tl-full` `--skip-qa`: `phase_qa = 'pending'` semantics.
- `nacl-tl-full` graph-write-failure handler: "continuing with
  status.json only" path.
- `nacl-tl-deploy` upstream gate: "Not found in graph | Warn and
  proceed" backward-compat path.
- `nacl-tl-intake`: progress / final-summary rows that collapsed
  every bug atom to "fixed" regardless of the downstream `Status:`
  value.

## [0.14.0] — 2026-05-07

Bundled release closing the five orchestration paths that could still move
unverified or unknown-status work toward `main`, deployment, delivery, or
release. After 0.13.0 every leaf skill produced honest six-status output;
0.14.0 makes the orchestrators that consume that output consistently honour
it.

Five cross-cutting principles thread through the affected skills:
1. `Status: {value}` is the only authoritative classifier (headlines are
   advisory).
2. Declared workspace commands only — no `npm test` / `npm run build`
   fallbacks.
3. Baseline before any "pre-existing" / "regression" claim.
4. Skip ⇒ unverified, never PASS.
5. Ship never switches branches.

### Added

- `nacl-tl-hotfix`: Step 4.0 captures a `main`-branch baseline via
  `git worktree add`; Step 4.2 computes
  `new_failures = postfix − baseline`,
  `pre_existing = postfix ∩ baseline`,
  `transitioned = baseline − postfix` and only classifies as `BLOCKED`
  (pre-existing) when set membership confirms it. The worktree is
  removed on every exit path (Step 7 RESTORE and Cleanup on Failure).
  PR body and Step 9 report gain a baseline-vs-postfix table.
- `nacl-tl-hotfix`: `modules.[name].test_filter_flag` config knob;
  Step 4.1 uses the declared filter or runs the full declared test
  command (no synthetic `--test-name-pattern`).
- `nacl-tl-deliver`: explicit `--skip-verify` semantics (P4 — skip ⇒
  unverified, never PASS). Headline forced to `DELIVER APPLIED —
  UNVERIFIED (skipped: --skip-verify)`; IntakeItem stamping refused;
  `Task.verification_skip_reason` written to graph; skip recorded in
  `delivery-status.json` and report.
- `nacl-tl-deliver`: operator health-failure override path (Step 5 →
  3a) — emits `DELIVER APPLIED — UNVERIFIED (health failed, operator
  override)`, refuses IntakeItem stamping, writes
  `Task.verification_skip_reason`.
- `nacl-tl-ship`: status-aware deploy headlines —
  `SHIP COMPLETE — DEPLOYED (direct)` (PASS),
  `SHIP APPLIED — UNVERIFIED (auto-deploy refused)` (operator-confirmed
  unverified ship), and a full `Headline selection` block enumerating
  every halt / applied / incomplete variant.
- `nacl-tl-release`: production health-failure operator override path
  (Step 3b) — emits `RELEASE INCOMPLETE — UNVERIFIED (production
  health failed, operator override)` and appends a changelog
  annotation blockquote under the version heading.
- `nacl-tl-release`: "Excluded from this release artifact (no
  IntakeItem stamped)" section in the final report listing UCs whose
  IntakeItems were excluded for non-PASS upstream status.
- `nacl-tl-conductor`: Status-line-based parser for `nacl-tl-full` and
  `nacl-tl-fix` reports (UC and BUG loops). Reports without a parseable
  `Status:` line halt with `CONDUCTOR HALTED — UNVERIFIED (downstream
  report unparseable: <id>)`.

### Changed

- `nacl-tl-hotfix`: build/test commands read declared workspace
  `scripts.{build,test}` only — no `npm run build` / `npm test`
  fallbacks (P2). Missing → `HOTFIX HALTED — NO_INFRA`.
- `nacl-tl-hotfix`: Step 6 PR + auto-merge gate. PASS → `gh pr merge
  --auto` enabled; non-PASS operator override → auto-merge skipped,
  PR annotated `HOTFIX APPLIED — UNVERIFIED`, operator runs the merge
  manually.
- `nacl-tl-conductor`: TECH path commit gate (Wave 0 sub-loop) reads
  the dev report's `Status:` line. Review approval no longer upgrades
  unverified dev work — `Status: PASS` is required to commit; non-PASS
  branches the same way the UC loop does.
- `nacl-tl-conductor`: UC and BUG loops parse `Status: {value}`
  (P1) — headlines are advisory only. Status-line and headline
  contradictions are surfaced in Phase 6.
- `nacl-tl-deliver`: build/test commands read declared workspace
  `scripts.{build,test}` only (P2). Missing → `DELIVER HALTED —
  NO_INFRA`.
- `nacl-tl-deliver`: failed health check (Step 5) halts by default
  as `DELIVER HALTED — UNVERIFIED (health failed)`. The previous
  "report as unhealthy but don't fail delivery" behaviour is removed.
- `nacl-tl-ship`: unknown upstream status (no `status.json` AND no
  Task node) halts as `SHIP HALTED — UNVERIFIED (upstream status
  unknown)`. The "warn and proceed" path is removed.
- `nacl-tl-ship`: operator-confirmed unverified ship (UNVERIFIED or
  BLOCKED, explicit "yes" not auto-confirmed by `--yes`) sets headline
  `SHIP APPLIED — UNVERIFIED`; auto-deploy via `--deploy` is refused
  under non-PASS upstream — operator runs `/nacl-tl-deploy` separately.
- `nacl-tl-ship`: documentation reaffirms "ship never switches
  branches autonomously" (P5) explicitly under the Step 1.0 status
  table.
- `nacl-tl-release`: UC status gate in Step 2 runs in every mode —
  `--skip-merge` and `git.strategy == "direct"` no longer skip Steps
  1–3. The skip flag changes which artifacts are produced, not whether
  the gate runs. In skip-merge mode the gate runs over UCs derived
  from commits-since-last-tag.
- `nacl-tl-release`: Step 3b production health failure halts by
  default as `RELEASE HALTED — UNVERIFIED (production health failed)`;
  the tag is NOT pushed. Operator override permitted (see Added).
- `nacl-tl-release`: Step 7 IntakeItem stamping is strictly gated on
  PASS. UNVERIFIED, BLOCKED, REGRESSION UCs are excluded from the
  release artifact — NOT stamped with a release version, NOT stamped
  with a "release note instead". The previous "stamp with a note"
  path is removed.

### Removed

- `nacl-tl-hotfix`: `npm run build` and `npm test` fallback rows in
  Configuration Resolution.
- `nacl-tl-hotfix`: synthetic `[test_cmd] --test-name-pattern "[test
  name]"` runner-flag heuristic in Step 4 regression-test execution.
- `nacl-tl-hotfix`: "If the failure appears unrelated... Warn but allow
  user to proceed" pre-existing-failure escape hatch.
- `nacl-tl-conductor`: headline-based parsing of `nacl-tl-full` and
  `nacl-tl-fix` reports. Headline-to-status mapping table replaced
  with `Status:` line parser.
- `nacl-tl-deliver`: `npm run build` and `npm test` fallback rows.
- `nacl-tl-deliver`: "report as unhealthy (but don't fail delivery)"
  health-check tolerance.
- `nacl-tl-ship`: "Not found (no status.json) | Warn and proceed
  (backward-compat)" row from the Step 1.0 prior-status table.
- `nacl-tl-ship`: `SHIPPED + DEPLOYED (direct)` headline (replaced
  with status-aware variants).
- `nacl-tl-release`: "If `--skip-merge` OR `git.strategy == "direct"`:
  Skip Steps 1-3 entirely → jump to Step 4" path. The merge action is
  skipped; the UC status gate is not.
- `nacl-tl-release`: "Warn but do NOT block release" health-check
  tolerance.
- `nacl-tl-release`: "For IntakeItems associated with UNVERIFIED UCs,
  stamp with a note instead" Cypher block.

## [0.13.1] — 2026-05-07

Patch release. Closes the eight low- and medium-severity findings from the
post-0.13.0 audit. No new contracts, no new flags, no parser changes — only
stops a handful of skills from reporting partial, skipped, or inferred work
as if it were complete, and removes invented `npm`/`tsc` fallbacks that
bypassed declared workspace scripts.

### Changed

**Reporting hygiene:**
- `nacl-tl-docs`: Steps 9 / 10 / 11 reordered so verification runs before
  "Mark Task as Done". Link checker now scans every modified markdown file
  (collected via `git diff --name-only`) and resolves links source-file-
  relative, not repo-root-relative. Code-syntax check uses the workspace's
  declared `scripts.typecheck` (or closest declared equivalent) instead of
  invented `npx tsc`. `DONE (with acknowledged gaps)` is reserved for
  coverage gaps only — broken links and code-syntax errors emit
  `DOCS INCOMPLETE` and the task is not marked done.
- `nacl-tl-qa`: Output Summary first line is now status-aware
  (`QA COMPLETE` / `QA APPLIED — UNVERIFIED` / `QA HALTED — NO_INFRA` /
  `QA INCOMPLETE — REGRESSION`); the legacy `E2E QA Testing Complete`
  happy-path header is removed.
- `nacl-tl-plan`: planning status contract added — `PLAN COMPLETE` /
  `PLAN APPLIED — PARTIAL (incomplete SA inputs)` /
  `PLAN HALTED — NO_SA_DATA`. The "create task files with available
  information" path is now explicit PARTIAL with missing SA inputs listed
  in the report and recorded under `partial_inputs` in `status.json`.
- `nacl-tl-status`: health indicators surface `verified-pending`,
  `NO_INFRA`, `RUNNER_BROKEN`, `REGRESSION` on dedicated rows; new
  mandatory "Per-Status Counts" section renders one row per six-status
  value, including zero counts.
- `nacl-tl-next`: Priority 0 (`/nacl-tl-deliver`) recommendation now
  requires every relevant Task to be `done` AND PASS-family.
  `verified-pending`, `blocked`, `UNVERIFIED`, `NO_INFRA`, `RUNNER_BROKEN`,
  and `REGRESSION` produce a prominent `[!! UNVERIFIED DELIVERY — NOT
  RECOMMENDED]` warning block instead of a normal recommendation.
- `nacl-tl-stubs`: `phases.stubs` in `status.json` aligns one-to-one with
  the headline vocabulary. `done` only when `STUBS COMPLETE` (triple
  condition); `unverified` for warnings or no-test-files-scanned;
  `regression` for empty-test-files exceeding 50%; `blocked` for
  critical/orphaned/runner-broken. Mapping table in Step 8 documents every
  headline → `phases.stubs` value → six-status equivalent.

**Declared-command discipline (P2):**
- `nacl-tl-diagnose`: Agent 3 (Code Health) reads
  `package.json.scripts.{build,test,typecheck}` (or closest declared
  equivalents) and refuses to fall back to `npm run build`, `npm test`,
  `npx tsc --noEmit`, or `npm audit`. Missing declared command emits
  `<component>: NO_INFRA (scripts.<name> undeclared)` for that
  sub-project; runner crash before any task runs emits `RUNNER_BROKEN`.
- `nacl-tl-reconcile`: Phase 4.4 build/test validation reads declared
  scripts only. Missing declared command records `NO_INFRA` for that
  component in the Phase 5 `validation-result` column. `--force` scope
  is now strictly limited to per-task confirmation prompts (user gate
  + Phase 3 per-discrepancy prompts); the unverified-upstream
  acknowledgment gate remains separate and unconditional.

### Removed

- Legacy `E2E QA Testing Complete` happy-path header in `nacl-tl-qa`.
- Hardcoded `npm run build` / `npm test` / `npx tsc --noEmit` / `npm audit`
  fallbacks in `nacl-tl-diagnose` Agent 3.
- Hardcoded `npm run build` / `npm test` in `nacl-tl-reconcile` Phase 4.4.
- `phases.stubs` binary collapse (`"blocked" if critical > 0, "done"
  otherwise`) in `nacl-tl-stubs` Step 8.
- Single happy-path `Development Plan Created` header in `nacl-tl-plan`.
- Generic `[OK]` / `[BLOCKED]` collapse for `verified-pending` /
  `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION` in `nacl-tl-status` health
  indicators.

## [0.13.0] — 2026-05-07

Single bundled release: honest reporting threaded through the remaining 22
skills in one narrative. After 0.10.0 (bug-fix), 0.11.0 (verification), and
0.12.0 (dev + orchestrators), the verification family, fix-derivative skills,
operational gates, reporting-hygiene skills, and reliability layer all still
had local PASS loopholes. 0.13.0 closes them.

Four discipline patterns are propagated across the catalogue:
1. Test-author isolation as an absolute principle (now applies to feature-dev,
   not just bug-fix).
2. Baseline-vs-postfix discipline gating every PASS.
3. `Status:` line as the authoritative classifier; headlines are decoration.
4. Neo4j graph as primary source of truth for operational gates.

### Added

**Test-author isolation seam:**
- `nacl-tl-regression-test`: new `feature-dev` mode (alongside existing `bug-fix`).
  Reads `test-spec.md` / `test-spec-fe.md` / `acceptance.md`; writes a test that
  FAILS because the feature surface does not exist; emits `FEATURE-TEST WRITTEN`
  / `FEATURE-TEST FAILED TO RED` / `FEATURE-TEST HALTED — NO_INFRA` /
  `FEATURE-TEST INVALID — NOT RED`.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: delegate test authorship
  to `nacl-tl-regression-test mode=feature-dev` — zero direct test-file
  `Write` calls in TDD paths.

**Verification family:**
- `nacl-tl-verify-code`: baseline-and-postfix runs; `new_failures` /
  `transitioned` set computation; `FAIL` added to status vocabulary;
  `tests_collected > 0` precondition for any PASS.
- `nacl-tl-qa`: Step 0 testable-criteria gate; HTTP-200 assertion on
  prerequisite check; `stat` validation after every screenshot.
- `nacl-tl-stubs`: sanity-seed against known stub marker; triple-condition
  gate on `STUBS COMPLETE`; `STUBS APPLIED — REGRESSION` headline for empty
  test files exceeding 50%.
- `nacl-tl-verify`: integrity gate against verify-code result fields;
  `VERIFY COMPLETE (code-only)` vs `VERIFY COMPLETE (E2E-verified)` headlines.

**Fix-derivative skills:**
- `nacl-tl-hotfix`: Step 3.5 regression-test seam audit; Scenarios 1/2
  RED-on-main precondition; PR template fields for regression-test path and
  RED→GREEN evidence.
- `nacl-tl-reopened`: Step 7.5 `Status:` line parser; Step 7.5.1 seam audit;
  Step 8 re-run gate before review/stubs.

**Operational gates:**
- `nacl-tl-deploy`: shape-validated health probe driven by
  `deploy.{env}.health_contract` in `config.yaml`; poll-and-timeout instead
  of fixed sleep; `## Contract` section; per-task status table.
- `nacl-tl-reconcile`: automated freshness skip via `git log`; mandatory
  validation path (≥10 docs gap-check fallback); per-task status table.
- `nacl-tl-intake`: `## Contract` section; per-atom user gate; YouGile API
  retry with explicit failure path.

**Reporting hygiene:**
- `nacl-tl-sync`: production-path mock-import detection (BLOCKER);
  `grep -F` for endpoint paths; FE-test mock detection.
- `nacl-tl-docs`: executable Step 10 (link check + `tsc --noEmit` + Python
  `py_compile` + implementation-coverage audit).
- `nacl-tl-review`: ticket-ID regex on stub justifications; tri-state
  checklist (PASS / PARTIAL / FAIL); combined status line.
- `nacl-tl-diagnose`: aggregation step for parallel sub-agents;
  `not_assessable` tags replace 0.5 fills; root-cause hypotheses require
  evidence; pre-finalize section checklist.

**Reliability:**
- `nacl-tl-conductor`: Cypher sentinel before Phase 4→5 advancement.
- `nacl-tl-full`: dual-write fence on Neo4j failure; Outage Recovery section.
- `nacl-tl-deliver`: graph-primary read at pre-verify gate; symmetric FAIL
  exclusion.
- `nacl-tl-release`: graph-only enforcement (no JSON fallback for status
  gate); per-UC `UC status` and `Evidence level` columns; changelog freshness
  cross-check.
- `nacl-tl-ship`: documentation note for conductor-driven multi-UC branches
  (no logic change — branch-switching remains forbidden).

### Changed

- `nacl-tl-verify-code` result schema: adds `baseline_failures`,
  `postfix_failures`, `new_failures`, `transitioned` fields. Existing
  consumers reading only `status` continue to work.
- Vacuous PASS scenarios (no testable criteria, no `it()` calls, all-mock FE
  tests) now produce explicit halt or UNVERIFIED statuses where 0.12.0 would
  have returned PASS.
- `nacl-tl-hotfix` `--yes` documentation: scope is "non-safety prompts only"
  — does NOT bypass the pre-merge non-PASS gate at Step 6.
- `nacl-tl-reopened` classification: `Status: {value}` is the authoritative
  source; the report headline is decoration.
- `nacl-tl-release` pre-merge gate: graph-only; missing Task nodes HALT
  rather than fall back to `.tl/status.json`.

### Removed

- Legacy first-match-wins headline regex in `nacl-tl-reopened` Step 7.5.
- 232/440 contradiction in `nacl-tl-stubs` between empty-test-file rule and
  headline-vocabulary table.
- Per-status escape hatches (BLOCKED/UNVERIFIED/NO_INFRA/RUNNER_BROKEN ship
  paths) at `nacl-tl-hotfix` lines 199–217 — consolidated into the single
  Step 6 mandatory gate.
- Untranslated placeholder text in `nacl-tl-deploy` SSH-diagnostics block.


- Sidebar with board tree, global search bar, and batch Regenerate / Sync actions.
- Canvas zone: full `@excalidraw/excalidraw` component with diff overlay for comparing current scene against snapshots.
- Status bar per board: `lastGeneratedAt`, `lastSyncedAt`, Regenerate / Sync / Analyze buttons.
- Run panel (bottom-right) streaming live pinch events: enqueued, started, blocked (with reason + countdown), completed, failed.
- Skill execution via `itsalt-pinch` -- programmatic Node.js API with WebSocket event streaming; hard caps (≥15 s spawn delay, ≥120 s wave cooldown, max 5 parallel) are enforced by pinch and surfaced to the user in the run panel.
- Snapshot browser: save, list, compare, and restore board snapshots; restore auto-saves a safety snapshot before overwriting.
- `<board>.meta.json` sidecar convention for per-board sync metadata (`lastGeneratedAt`, `lastGeneratedBy`, `lastSyncedAt`, `lastSyncStatus`, `lastSyncRunId`, `contentHashAtLastSync`); documented in `nacl-core/SKILL.md`.
- Fastify backend (`127.0.0.1:3583`) with REST routes for boards, skills, snapshots, search, and run history.
- Unified search: board element text / `customData.nodeId` / `customData.sourceDoc` + Neo4j graph nodes (name, title, label, description, id, uc_id, bp_id); degrades gracefully to board-only when Neo4j is unreachable.
- Batch operations: one-click Regenerate or Sync for all eligible boards.

### Changed

- `graph-infra/docker-compose.yml` no longer includes the `excalidraw` or `excalidraw-room` services; the Analyst Tool replaces them entirely.
- Board diagram generation and graph sync now go through the Analyst Tool's skill runner (pinch-mediated) rather than being triggered manually from the command line.

### Removed

- `excalidraw` Docker service (bare Excalidraw at `localhost:3580`) -- replaced by Analyst Tool at `localhost:3582`.
- `excalidraw-room` Docker service (live-collab container) -- removed as out of scope for a single-analyst workflow; can be reintroduced separately if needed.

## [0.12.0] — 2026-05-07

Two-part release. Part 1 hardened three dev skills with enforced TDD discipline.
Part 2 hardened seven orchestrator skills to consume and propagate the resulting
honest status across the full pipeline. The v0.12.0 tag is applied after both parts ship.

**Part 1 — TDD Discipline at the Dev Layer:**
`nacl-tl-dev`, `nacl-tl-dev-be`, and `nacl-tl-dev-fe` all claimed RED-first TDD but
had no enforcement — no baseline capture, no VERIFY RED step confirming new tests
appeared in the failure set, and no delta comparison at GREEN. A developer could report
"all tests pass" against a pre-existing clean suite without ever writing a test that
exercised the new code.

**Part 2 — Orchestrator Status Propagation:**
Seven orchestrator skills (`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-ship`,
`nacl-tl-deliver`, `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-reconcile`) were
collapsing sub-skill status into binary pass/fail. With Part 1 producing honest signal,
Part 2 makes orchestrators act on it: gate graph writes, halt on REGRESSION, require
user confirmation for UNVERIFIED, and surface per-task status in all reports.

### Added

**Part 1 — Dev skills:**
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.0 DISCOVER RUNNER — reads `scripts.test` from workspace `package.json`; halts with `NO_INFRA` if absent (never invents a fallback runner).
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.1 CAPTURE BASELINE — runs the test suite once before writing any test; stores failing-test set to a temp file as the reference for all subsequent comparisons.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.3 VERIFY RED — parses runner output after tests are written; confirms (a) new tests appear in the failure set, (b) no previously-passing test has flipped to fail. Halts if either condition fails.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Step N.5 VERIFY GREEN + COMPARE — computes delta against baseline; determines status (`PASS` / `UNVERIFIED` / `BLOCKED` / `RUNNER_BROKEN` / `REGRESSION`) before commit.
- `nacl-tl-dev` (Workflow B — infra): Steps B.0–B.3 verification-command discipline: DISCOVER VERIFICATION COMMAND → CAPTURE BASELINE STATE → APPLY CHANGE → RE-RUN VERIFICATION COMMAND. Parallel to the TDD path for Docker/CI/CD tasks.
- All three dev skills: `## Contract` section documenting inputs, outputs, downstream consumers, and the contract-change audit discipline introduced in 0.10.1.

**Part 2 — Orchestrator skills:**
- New graph property value `t.status = 'verified-pending'` for Task nodes where dev returned UNVERIFIED; `t.status = 'blocked'` for BLOCKED with user override.
- `nacl-tl-ship`: Step 1.0 pre-flight upstream status check — reads `.tl/status.json` BEFORE running local tests; UNVERIFIED/BLOCKED/REGRESSION halt before commit.
- `nacl-tl-deliver`: Step 4.0 pre-verify dev status gate — checks each UC's dev status before invoking `/nacl-tl-verify`; UNVERIFIED UCs require user gate.
- `nacl-tl-release`: Step 2 pre-merge UC status gate — looks up underlying UC statuses before presenting merge plan; UNVERIFIED requires per-PR confirmation (not bypassed by `--yes`).
- `nacl-tl-deploy`: Step 1.0 pre-monitor gate — confirms commit SHA came from PASS-status tasks before starting CI monitoring.
- `nacl-tl-reconcile`: Phase 1 pre-flight unverified fix scan — mandatory scan of recent fixes; UNVERIFIED fixes require explicit acknowledgment "documenting unverified behavior is intentional"; Health Score adjusted -5 per UNVERIFIED task.
- All seven orchestrator skills: `## Contract` section with aggregation rules and contract-change discipline.

### Changed

**Part 1 — Dev skills:**
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Output summary block replaced — single "Ready for Review" header replaced with status-aware headline: `DEV COMPLETE` / `DEV APPLIED — UNVERIFIED` / `DEV APPLIED — BLOCKED` / `DEV APPLIED — NO_INFRA` / `DEV APPLIED — RUNNER_BROKEN` / `DEV INCOMPLETE — REGRESSION` (and `DEV-BE *` / `DEV-FE *` variants).
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Output template gains baseline diff section (failures pre vs post the change) and test-runner output snippet.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Anti-patterns tables gain "no baseline capture" and "no postfix comparison" rows citing the new sub-steps.
- `nacl-tl-dev`, `nacl-tl-dev-be`, `nacl-tl-dev-fe`: Development checklists updated with per-sub-step checkboxes (N.0 through N.5).
- `nacl-tl-dev` Workflow A: A1/A2/A3 renamed to A.0–A.6 with new enforcement steps inserted. Existing RED/GREEN/REFACTOR content preserved as A.2/A.4/A.6.
- `nacl-tl-dev-be` Step 3 (RED Phase): restructured into sub-steps 3.0–3.3; Step 4 (GREEN Phase) gains Step 4.2 VERIFY GREEN + COMPARE.
- `nacl-tl-dev-fe` Step 3 (RED Phase): restructured into sub-steps 3.0–3.3 (RTL test categories CT/HT/FT/IT/AT/EC preserved as Step 3.2 content); Step 4 (GREEN Phase) gains Step 4.2 VERIFY GREEN + COMPARE.
- changelog.md append templates in all three skills: "Status: Ready for Review" replaced with status headline placeholder.

**Part 2 — Orchestrator skills:**
- `nacl-tl-conductor`: Phase 3 UC loop reads nacl-tl-full headline; graph write gated on PASS; failure matrix extended with UNVERIFIED/BLOCKED/REGRESSION rows; Phase 6 report gains per-task status column.
- `nacl-tl-conductor`: Bug fix branch reads nacl-tl-fix `Status:` field; `t.status = 'done'` written only on PASS.
- `nacl-tl-full`: STEP 1 BE dev / STEP 3 FE dev read sub-skill headline; `phase = 'approved'` written only on PASS (UNVERIFIED keeps phase at 'ready_for_review'); STEP 8 aggregates all phase statuses before writing overall task status.
- `nacl-tl-full`: WAVE_RESULT gains per-UC status, aggregated counts, and headline selection logic.
- `nacl-tl-ship`: PR body includes `**Verification status:**` field; `--deploy` cannot bypass upstream UNVERIFIED/BLOCKED status.
- `nacl-tl-deliver`: Step 6 graph write gated on aggregated PASS; partially-verified batches only stamp PASS-UC IntakeItems; final report gains per-UC dev status column.
- `nacl-tl-release`: Merge plan shows UC status column; Step 7 graph stamp excludes UNVERIFIED UCs from standard stamp.
- `nacl-tl-deploy`: Health failure in Step 3 halts pipeline (no longer report-and-continue); Step 4 success path only reachable with 200 OK health.
- `nacl-tl-reconcile`: Phase 5 report records UNVERIFIED acknowledgments; headline selection documents RECONCILE APPLIED — UNVERIFIED path.

## [0.11.0] — 2026-05-06

Five verification and quality-gate skills updated to apply the same honesty standard introduced by `nacl-tl-fix` in 0.10.0: all five were returning PASS based on static analysis or file scanning alone, with no test-runner discovery and no coverage check. A workspace with 44 hollow test files received the same output as one with a complete, green test suite.

### Added

- `nacl-tl-verify-code`: Step 5 "Run test suite" — discovers `scripts.test`, runs it, checks whether any test imports the changed file. Static analysis alone now produces `UNVERIFIED`, not `PASS`.
- `nacl-tl-stubs`: Step 2b "Scan test files" — counts `it()`/`test()` calls per test file; zero → `STUB-EMPTY-TEST-FILE` (WARNING). Detects the "44-stub scenario" (hollow describe blocks).
- `nacl-tl-stubs`: `STUB-EMPTY-DESCRIBE` check — flags describe blocks within non-empty test files that contain no test cases.
- `nacl-tl-sync`: Step 7 "Run BE and FE test suites" — runs both workspace runners after static checks; checks endpoint path coverage by grepping test files.
- `nacl-tl-review`: Step 6b "Test Author Independence Check" — `git log` author overlap check; MAJOR flag when tests and production code share the same primary author (>50% overlap).
- All five skills: `## Contract` section documenting inputs, outputs, downstream consumers, and the contract-change audit discipline introduced in 0.10.1.

### Changed

- `nacl-tl-verify-code`: result vocabulary expanded from `PASS | PASS_NEEDS_E2E | FAIL` to eight statuses: `PASS | PASS_NEEDS_E2E | UNVERIFIED | NO_INFRA | RUNNER_BROKEN | BLOCKED | REGRESSION | FAIL`.
- `nacl-tl-stubs`: headline status vocabulary added: `STUBS COMPLETE / STUBS APPLIED — UNVERIFIED / STUBS RUNNER_BROKEN / STUBS APPLIED — REGRESSION`. Binary "0 stubs = PASS" replaced.
- `nacl-tl-stubs`: WARNING stub justification (count > 3) now requires a TASK ticket or backlog item ID reference; free-text alone rejected.
- `nacl-tl-verify`: adopted six-status headline vocabulary (`VERIFY COMPLETE` / `VERIFY APPLIED — *` / `VERIFY INCOMPLETE — REGRESSION`). PASS report body now distinguishes code-only vs E2E-verified. YouGile-unavailable case now prints explicit fallback text instead of silently skipping.
- `nacl-tl-sync`: verdict logic now requires both BE and FE suites to pass AND endpoint paths to be covered before `SYNC COMPLETE`. Headline vocabulary expanded to six statuses.
- `nacl-tl-review`: headline vocabulary expanded to six statuses; APPROVED / CHANGES REQUESTED retained as verdict refinement within headline. Rejection path now distinguishes implementation-wrong from tests-tuned-to-bug.

## [0.10.1] — 2026-05-06

Downstream skills `nacl-tl-reopened` and `nacl-tl-hotfix` are updated to honor the six-status output contract introduced by `nacl-tl-fix` in 0.10.0. Both skills were previously unaware of the new status vocabulary and could auto-ship or merge to main an UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION fix without halting. Both skills also gain a `## Contract` section that documents inputs, outputs, downstream consumers, and a standing discipline: when a skill's output contract changes, its consumers must be audited in the same release.

### Fixed

- `nacl-tl-reopened`: Step 2 marker scan now recognizes all six 0.10.0 status-aware headers (`FIX COMPLETE`, `FIX APPLIED — UNVERIFIED`, `FIX INCOMPLETE`, etc.); old markers retained for backward-compat.
- `nacl-tl-reopened`: new Step 7.5 "Parse fix status" branches on PASS / BLOCKED / UNVERIFIED / NO_INFRA / RUNNER_BROKEN / REGRESSION. Non-PASS statuses post advisory and halt rather than silently advancing to review + ship.
- `nacl-tl-reopened`: Step 9 auto-ship gated on Step 7.5 status == PASS. BLOCKED/UNVERIFIED/NO_INFRA/RUNNER_BROKEN/REGRESSION never auto-ship.
- `nacl-tl-hotfix`: Step 3 Scenario 3 captures `/nacl-tl-fix` `Status:` field explicitly; any non-PASS status triggers halt-and-confirm (default: no) before proceeding.
- `nacl-tl-hotfix`: Step 4 VALIDATE distinguishes `NO_INFRA` / `RUNNER_BROKEN` from code-level test failures and from missing feature-branch dependencies.
- `nacl-tl-hotfix`: Step 6 pre-merge gate added: if fix status is not PASS, an additional confirmation is required before PR creation (`"Shipping a non-PASS fix to main is high-risk. Confirm? [yes/no]"`).

### Changed

- `nacl-tl-reopened/SKILL.md` + `nacl-tl-hotfix/SKILL.md`: added `## Contract` section after frontmatter documenting inputs consumed, outputs produced, downstream consumers, and the contract-change audit discipline.
- `nacl-tl-reopened`: YouGile rework report template gains `📊 Статус фикса: {STATUS}` field with a one-line rationale line from `/nacl-tl-fix` Step 8.
- `nacl-tl-hotfix`: PR body template includes `**Fix status:**` and, for non-PASS cases, notes that the fix was shipped with explicit user override.

## [0.10.0] — 2026-05-06

Honest bug-fix skill: `nacl-tl-fix` is rewritten to enforce TDD ordering (regression test before the fix, RED-first), capture a failing-test baseline before any change, and report status-aware results (`PASS` / `BLOCKED` / `UNVERIFIED` / `NO_INFRA` / `RUNNER_BROKEN` / `REGRESSION`) instead of always claiming `FIX COMPLETE`. New skill `nacl-tl-regression-test` is the independent test author that the fix skill delegates to. Bundled: `nacl-sa-validate` schema-drift hardening (queued from `_drafts/sa-validate-schema-drift.md`); plus a three-layer fix (parser canonicalization, writer schema correctness, validator coverage L3.5/L3.6) that closes a silent activity-diagram swimlane degradation where graphs passed validation as healthy while the renderer fell back to single-lane mode.

### Added

- **New skill `nacl-tl-regression-test`** — single-purpose skill that writes one regression test against currently-broken code; the test must be RED. Touches only test files, never production code. Refuses on `NO_INFRA`. Invoked by `nacl-tl-fix` Step 6d as a separate sub-agent (`developer` subagent_type) so the fix author cannot grade its own test coverage. Also callable directly.
- `nacl-tl-fix` Step 6 sub-stepped 6a→6h (TDD ordering): capture baseline → write regression test against broken code → verify RED → apply fix → re-run suite → verify GREEN AND no new failures vs baseline.
- `nacl-tl-fix` Step 7 — workspace `scripts.test` discovery (no fallback runner), runner sanity check for `SUITE_EMPTY`, 7-rule status table.
- `nacl-tl-fix` Step 8 — status-aware report headers (`FIX COMPLETE` / `FIX APPLIED — UNVERIFIED` / `FIX INCOMPLETE`) with per-status Next-step recommendations; explicit `Status:` line in the changelog template.
- `nacl-sa-validate` **L3.5 (CRITICAL)** — flags UseCases whose ActivitySteps have empty / NULL `actor`. The renderer cannot lay out swimlanes for these UCs and falls back to single-lane mode with a warning banner; previously this surfaced only visually.
- `nacl-sa-validate` **L3.6 (WARNING)** — flags ActivitySteps whose `actor` is non-canonical (anything outside `User` / `System`). Catches authoring drift where steps land with values like `admin`, lowercase `system`, `authenticated`.
- `nacl-ba-validate` — cross-reference note pointing users at `nacl-sa-validate` L3.5/L3.6 for SA-layer step-level structural checks. Prevents the false-confidence trap of running BA validation alone and assuming SA is also covered.

### Changed

- `nacl-tl-fix/SKILL.md` — Step 6, Step 7, Step 8 rewritten as described above. The "Tests are treated as code (L1)" line clarified: classification level is independent of test-writing — a regression test for the bug is mandatory for L1+ regardless of L0/L1/L2/L3.
- `nacl-tl-fix` `--auto-ship` flag now only fires on `PASS`; `BLOCKED`/`UNVERIFIED`/`NO_INFRA`/`RUNNER_BROKEN`/`REGRESSION` stop and let the user decide.
- `nacl-tl-core/references/fix-classification-rules.md` — L1 / L2 / L3 actions reordered to TDD (regression test first against broken code, then fix). New "What is NOT L0" callout: a workspace having no test runner is `NO_INFRA`, not L0; a broken runner is `RUNNER_BROKEN`, not L0. The fix's L0/L1/L2/L3 classification is independent of test-runner state.
- `.claude/agents/developer.md` — routes `nacl-tl-regression-test`.
- `docs/skills-reference.md` — added `nacl-tl-regression-test` row in Fix & Recovery; updated `nacl-tl-fix` row description; skill count 55 → 56.
- `docs/skills-reference.ru.md` — same updates in Russian; skill count 51 → 52.
- `README.md` + `README.ru.md` — skill count bumped.
- `nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1_sa.py` — per-step actor extraction. The adapter now reads the main-flow table's `Компонент` / `Исполнитель` / `Actor` / `Актор` column (case-insensitive header match) and applies substring canonicalization to cell values: `пользовател` / `клиент` / `user` / `client` → `User`; `систем` / `сервер` / `system` / `server` → `System`. UC-level actor fallback uses the same substring canonicalization, so strings like `Система (триггер: ...)` and `ACT-01 Пользователь (Посетитель)` resolve to canonical values. Round-1 `User:` / `System:` step-prefix detection (matching `frontmatter-v1` convention) retained as a higher-precedence fallback. Previously the actor column was discarded outright, leaving ActivitySteps with empty `actor` and the renderer falling back to single-lane mode.
- `nacl-sa-uc/SKILL.md` — MERGE template now writes `as.actor = $actor` instead of legacy `as.step_type = $stepType`. The graph schema and the renderer both use `actor`; the skill template was the only writer still emitting the legacy property name. Parameter name, comment, and schema cheatsheet entries updated to match.
- `analyst-tool/server/src/render/excalidraw/activity.ts` — warning text aligned with schema. Banner renamed from `actor_type не задан` to `actor не задан` (lines 312, 375); inline comments at lines 260 and 364 follow. The graph-schema property has always been `actor`; the user-facing warning was the last legacy `actor_type` reference.

### Fixed

- `nacl-sa-validate`: detect schema drift in pre-flight (Step 0a) via `db.labels()` / `db.relationshipTypes()`. When the graph uses non-canonical labels (`:SAModule`, `:SAEntity`, `:SARequirement`, `:SAActor`, `:SAComponent`) or non-canonical handoff edge `TRACES_TO`, the skill now HALTs with an explicit drift report instead of producing false-positive CRITICAL findings. Previously such a graph yielded 7 bogus CRITICAL + 5 bogus WARNING entries because the L2-L7 / XL6-XL9 queries silently matched zero rows.
- `nacl-sa-validate`: XL6.1 / XL6.4 now accept both Russian (`'Автоматизируется'`) and English (`'Automated'`) stereotype values; XL6.4 coverage summary additionally counts steps that have `AUTOMATES_AS` edge regardless of stereotype text.
- `nacl-sa-validate`: L1.4 enum-empty/duplicate check now coalesces `EnumValue.value`, `.code`, `.label` to tolerate naming drift; new informational L1.5 surfaces which property convention is in use.
- `nacl-sa-validate`: pre-flight node-count report now has two sections (canonical + non-canonical), making schema drift visible immediately.

### Documentation

- `nacl-sa-validate/SKILL.md`: added "Schema Reference" section listing canonical writers and the non-canonical aliases that trigger HALT.
- `nacl-sa-validate/SKILL.md`: added "Migration Cypher Appendix" with idempotent label/edge rename blocks (`SAModule->Module`, `SAEntity->DomainEntity`, etc., and `TRACES_TO` split into the four canonical handoff edges).
- `nacl-tl-fix/SKILL.md`: References section now points to `/nacl-tl-regression-test` as the canonical source for Step 6d.
- `nacl-tl-regression-test/SKILL.md`: new file (~150 lines) — workflow, hard constraints, failure-mode reports.
- `docs/releases/0.10.0-honest-bug-fix-skill/`: full release notes + Telegram drafts (en + ru).

## [0.6.0] — 2026-04-19

### Added
- Graph handover scripts (`graph-infra/scripts/handover-{export,import}.sh` + `_lib.sh`) for inter-machine transfer of a project's Neo4j graph. Uses APOC cypher export + gzip + age symmetric encryption; verified via manifest round-trip.
- `graph-infra/handover/` directory for committed encrypted snapshots, with `.gitattributes` binary marker and cleanup policy in local `README.md`.

### Fixed
- Cross-project container isolation: every `graph-infra/docker-compose.yml` now inherits a unique Compose project name via `name:` + `COMPOSE_PROJECT_NAME` (`nacl-tl-core/templates/graph-docker-compose.yml:1`). Previously all `graph-infra/` folders across the workspace resolved to the same project name, which allowed `docker compose up -d --remove-orphans` in one project to silently cull containers and data volumes of other projects. `nacl-init/SKILL.md` step 2c.4 now emits `COMPOSE_PROJECT_NAME=<slug>-graph` in every new project's `.env`/`.env.example`. Regression test confirms the class of incident is closed.

### Infrastructure
- Existing NaCl-using projects can be migrated to the templated form: named volumes, unique project labels, anonymous SHA-hashed volumes cleaned up. Projects on anonymous volumes should be dumped before the structural change (see `docs/HANDOVER.md`) as a one-time durability hedge.

### Documentation
- `docs/HANDOVER.md` + `docs/HANDOVER.ru.md` — runbook for exporting and importing a graph between machines.

## [0.5.0] — 2026-04-13

### Added
- Migration system for transitioning projects to the graph-based skill architecture (`nacl-migrate/`, `nacl-migrate-ba/`, `nacl-migrate-sa/`, `nacl-migrate-core/`)

### Fixed
- Post-migration retrospective gate: mandatory 3-sub-agent audit + user approval required before proceeding to next project after canary run

## [0.4.0] — 2026-04-12

### Added
- Agent architecture with explicit model and effort routing (`cd2e14d`)
- Central skill modifiers reference and conventions documentation (`778dbba`)

## [0.3.0] — 2026-04-11

### Added
- `nacl-tl-hotfix` skill for strategist-tier hotfix workflow (`872efcf`)
- Full release pipeline in `nacl-tl-release`: merge PRs, deploy verify, and tag (`e91ec37`)
- BA/SA methodology documentation in English and Russian (`59741d3`)

### Fixed
- `nacl-tl-ship` hardened against autonomous switching to base branch (`872efcf`, `ddaa97c`)

## [0.2.0] — 2026-04-10

### Added
- GitHub Actions CI pipeline and issue/PR templates (`2622bb6`)
- Platform compatibility notes for Desktop app and IDE extensions (`11759bf`)

### Changed
- All skills renamed with `nacl-` prefix and unified separator convention (`c1ea979`, `1050922`)

### Fixed
- Cleaned up remaining old naming references after prefix rename (`7295492`)

## [0.1.0] — 2026-04-09

### Added
- Initial project structure (`1985270`)
- Graph BA skills and infrastructure (`472e390`)
- Graph SA skills (`930949e`)
- Graph TL skills and rendering engine (`76aaead`)
- TL development skills and core code-generation templates (`2039ae0`)
- CLI tools: `docmost-sync` and `yougile-setup` (`bfbc82f`)
- `nacl-project-init` skill for bootstrapping new projects (`05279ff`)
- README and project documentation (`2622bb6`)

[Unreleased]: https://github.com/itsalt/NaCl/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/itsalt/NaCl/compare/v0.15.0...v0.16.0
[0.10.0]: https://github.com/itsalt/NaCl/compare/v0.9.0...v0.10.0
[0.5.0]: https://github.com/itsalt/NaCl/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itsalt/NaCl/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itsalt/NaCl/compare/v0.2.0...v0.3.0
