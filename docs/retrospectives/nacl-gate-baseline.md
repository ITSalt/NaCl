# NaCl Gate Baseline — W0 Inventory (read-only)

**Generated:** 2026-05-22 by W0-baseline subagent.
**Scope:** every `nacl-tl-*/SKILL.md` under `/home/project-owner/projects/NaCl/nacl-tl-*` and `/home/project-owner/projects/NaCl/skills-for-codex/nacl-tl-*`. Read-only — no skill edits.
**Inputs:** four postmortems + synthesis in `docs/retrospectives/`, plus the resolved Codex status vocabulary in `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md` and `skills-for-codex/references/verification-evidence.md`.
**Status discipline (closed set, per Codex contract):** `VERIFIED / FAILED / PARTIALLY_VERIFIED / BLOCKED / NOT_RUN / UNVERIFIED`. Claude-flavor skills still use their per-skill headline vocabulary (`{SKILL} COMPLETE / {SKILL} APPLIED — UNVERIFIED / {SKILL} HALTED — … / {SKILL} INCOMPLETE — REGRESSION`); the mapping from headline to closed-set status is documented per-skill in the source SKILL.md.

This baseline serves W1–W10 — it does not propose fixes.

---

## Skill Universe

Twenty-seven distinct `nacl-tl-*` skills with the SKILL.md present in both Claude (`nacl-tl-*/SKILL.md`) and Codex (`skills-for-codex/nacl-tl-*/SKILL.md`) flavors:

```
conductor, core, deliver, deploy, dev, dev-be, dev-fe, diagnose, docs, fix,
full, hotfix, intake, next, plan, qa, reconcile, regression-test, release,
reopened, review, ship, status, stubs, sync, verify, verify-code
```

(Twenty-seven entries; both `dev`, `dev-be`, `dev-fe` count separately.)

`nacl-tl-core/SKILL.md` is policy-only and does not emit a terminal status; the other twenty-six emit per-skill headlines that downstream skills consume.

---

## Table A — Skills × Exit Semantics

Each row is one skill (Claude flavor; Codex flavor mirrors except where called out). Headlines are the exact strings the SKILL.md emits today. Columns map each terminal status to the **literal condition** under which that status is emitted (file:line cites the Claude-flavor SKILL.md).

| Skill | VERIFIED-equivalent headline | UNVERIFIED-family | BLOCKED-family | FAILED/REGRESSION | NOT_RUN / HALTED-NO_INFRA / RUNNER_BROKEN |
|---|---|---|---|---|---|
| nacl-tl-review | `REVIEW COMPLETE` (tests ran, passed, baseline resolved, `new_failures.size == 0`) — `nacl-tl-review/SKILL.md:355` | `REVIEW APPLIED — UNVERIFIED` for: MAJOR test-author overlap >50% (line 356); no test imports the changed file (line 357); postfix has failures but baseline unresolved (line 358); operator override under NO_INFRA / RUNNER_BROKEN (line 361) | `REVIEW APPLIED — BLOCKED` when `postfix_failures ⊆ baseline_failures` AND `postfix_failures.size > 0` (line 363); also CRITICAL/orphaned stubs (line 364) | `REVIEW INCOMPLETE — REGRESSION` when `new_failures.size > 0` (line 362) | `REVIEW HALTED — NO_INFRA` (scripts.test undeclared, line 359); `REVIEW HALTED — RUNNER_BROKEN` (line 360) |
| nacl-tl-sync | `SYNC COMPLETE` / `SYNC COMPLETE (with warnings)` (verdict PASS, no warnings, runtime PASS) — `nacl-tl-sync/SKILL.md:368–370` | `SYNC APPLIED — UNVERIFIED` when `mock_warnings > 0` OR `fe_coverage_gap == true` OR `runtime_result == "UNVERIFIED"` (line 363-364); also `UNVERIFIED (no baseline)` (line 226) | `SYNC APPLIED — BLOCKED` when both workspaces' `postfix_failures ⊆ baseline_failures` AND non-empty (line 229, 365-366) | `SYNC INCOMPLETE — REGRESSION` when `verdict = FAIL` OR `runtime_result = REGRESSION` (lines 356, 362) | `SYNC APPLIED — NO_INFRA` (line 358); `SYNC APPLIED — RUNNER_BROKEN` (line 360) |
| nacl-tl-qa | `QA COMPLETE` (all testable criteria pass, all screenshots present) — `nacl-tl-qa/SKILL.md:469`, 475-483 | `QA APPLIED — UNVERIFIED` (all testable pass, ≥1 screenshot missing) — line 470, 484-488; also `QA HALTED — UNVERIFIED` (zero testable criteria, line 472) | (none — no BLOCKED headline in this skill) | `QA INCOMPLETE — REGRESSION` (≥1 testable failed) — line 473, 489 | `QA HALTED — NO_INFRA` (servers unreachable) — line 471 |
| nacl-tl-fix | `FIX COMPLETE` (rule 5: ≥1 test RED→GREEN AND `postfix_failures` empty) — `nacl-tl-fix/SKILL.md:537, 595` | `FIX APPLIED — UNVERIFIED` for rules 1 (NO_INFRA), 2 (RUNNER_BROKEN), 6 (BLOCKED — pre-existing failures), 7 (UNVERIFIED — no test exercises change) — lines 533–539, 596–599 | (folded into UNVERIFIED for headline, but `Status:` line carries BLOCKED — line 538) | `FIX INCOMPLETE` (rules 3, 4: `new_failures` non-empty OR regression test still RED) — lines 535–536, 600 | rules 1/2 above produce UNVERIFIED headline with closed Status `NO_INFRA` / `RUNNER_BROKEN` |
| nacl-tl-verify-code | `PASS` / `PASS_NEEDS_E2E` (suite ran AND ≥1 test covers changed file AND clean) — `nacl-tl-verify-code/SKILL.md:64–65, 212–213, 257–258` | `UNVERIFIED` for coverage gap (no test imports change) OR baseline unresolvable — line 66, 208, 211, 259 | `BLOCKED` (new_failures empty BUT postfix_failures non-empty AND baseline resolved) — line 69, 210, 262 | `REGRESSION` / `FAIL` (new failures introduced) — implicit in suite outcomes | `NO_INFRA` (scripts.test missing) — line 135; `RUNNER_BROKEN` |
| nacl-tl-verify | `VERIFY COMPLETE (code-only)` / `VERIFY COMPLETE (E2E-verified)` — `nacl-tl-verify/SKILL.md:101–102, 221–222` | `VERIFY APPLIED — UNVERIFIED` (verify-code returned UNVERIFIED, NO_INFRA, RUNNER_BROKEN, OR PASS without baseline integrity) — line 104, 142, 229; `VERIFY APPLIED — NO_INFRA` (105, 230); `VERIFY APPLIED — RUNNER_BROKEN` (106, 231) | `VERIFY APPLIED — BLOCKED` (pre-existing failures remain) — line 103, 232 | `VERIFY INCOMPLETE — REGRESSION` (verify-code REGRESSION OR E2E FAIL) — line 107, 223, 233 | NO_INFRA / RUNNER_BROKEN surfaced separately as UNVERIFIED-family (lines 105, 106) |
| nacl-tl-stubs | `STUBS COMPLETE` (production stubs == 0 AND empty-test-file count == 0 AND test files scanned > 0) — `nacl-tl-stubs/SKILL.md:22, 325, 408, 414` | `STUBS APPLIED — UNVERIFIED` (warnings) — line 326, 343; `STUBS APPLIED — UNVERIFIED (test files: 0)` — line 23, 409, 416; `STUBS HALTED — NO_INFRA` — line 329, 341 | `STUBS BLOCKED` (critical > 0 OR orphaned > 0) — line 328, 336, 388 | `STUBS APPLIED — REGRESSION (empty test files: N)` — line 327, 339 | `STUBS HALTED — RUNNER_BROKEN` (grep sanity-seed / registry unwritable) — line 24, 235, 280, 330, 410, 497-498 |
| nacl-tl-deliver | `DELIVER COMPLETE` (all UCs PASS, --skip-verify NOT used, health OK) — `nacl-tl-deliver/SKILL.md:496–528, 529–530` | `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)` — line 250, 531; `DELIVER APPLIED — UNVERIFIED (health failed, operator override)` — line 393, 534; general `DELIVER APPLIED — UNVERIFIED` for UC UNVERIFIED dev status — line 537 | (folds into UNVERIFIED via override path; no explicit BLOCKED) | `DELIVER INCOMPLETE — REGRESSION` (any UC has REGRESSION status) — line 543 | `DELIVER HALTED — UNVERIFIED (health failed)` — line 384, 539; `DELIVER HALTED — NO_INFRA (scripts.{test|build} undeclared)` — line 75–76, 541 |
| nacl-tl-deploy | `DEPLOY COMPLETE` (source-verification done, health green) — `nacl-tl-deploy/SKILL.md:34, 236, 253` | `DEPLOY APPLIED — UNVERIFIED (operator override)` (verified-pending + override) — line 136; `DEPLOY APPLIED — UNVERIFIED (blocked, operator override)` — line 137; `DEPLOY HALTED — UNVERIFIED (upstream verified-pending)` — line 136; `DEPLOY HALTED — UNVERIFIED (upstream status unknown)` — line 139; `DEPLOY INCOMPLETE — UNVERIFIED (health probe timeout)` — line 39, 187 | (none distinct — BLOCKED upstream folds into UNVERIFIED with override; line 137) | `DEPLOY HALTED — REGRESSION` (upstream failed/REGRESSION) — line 35, 138, 259 | `DEPLOY HALTED — NO_INFRA` (line 36, 37, 180); `DEPLOY HALTED — RUNNER_BROKEN` (line 37) |
| nacl-tl-release | `RELEASE COMPLETE` (every candidate UC PASS, health 200 OK, tag pushed) — `nacl-tl-release/SKILL.md:584–612, 648` | `RELEASE INCOMPLETE — UNVERIFIED (production health failed, operator override)` — line 322, 650; `RELEASE HALTED — UNVERIFIED (production health failed)` — line 313, 653; `RELEASE HALTED — UNVERIFIED` (operator declined UNVERIFIED-UC gate at Step 2) — line 199, 655; `RELEASE HALTED — MISSING TASK NODE` — line 187, 657 | (none distinct — BLOCKED upstream folds into operator override) | `RELEASE INCOMPLETE — REGRESSION` (any UC REGRESSION) — line 201, 575, 659 | (no NO_INFRA/RUNNER_BROKEN at release layer — release consumes upstream verdicts) |
| nacl-tl-conductor | `CONDUCTOR COMPLETE` (all items PASS) — `nacl-tl-conductor/SKILL.md:711` | `CONDUCTOR APPLIED — UNVERIFIED` (any UC UNVERIFIED) — line 710; `CONDUCTOR HALTED — UNVERIFIED (downstream report unparseable: …)` — line 280, 333, 404 | (folded into UNVERIFIED for headline; closed-set status carries BLOCKED — line 296, 357, 424, 487) | `CONDUCTOR INCOMPLETE — REGRESSION` (any UC REGRESSION) — line 21, 711–712, 746, 752 | (NO_INFRA / RUNNER_BROKEN surface as UNVERIFIED-family in the per-phase tables; lines 291, 296, 324, 396) |
| nacl-tl-ship | `SHIP COMPLETE` (upstream PASS, ship succeeds) — `nacl-tl-ship/SKILL.md:23, 412` | `SHIP APPLIED — UNVERIFIED` (upstream UNVERIFIED with explicit operator override only) — line 23–24, 142, 484, 515; `SHIP HALTED — UNVERIFIED` (default refusal) — line 142, 147; `SHIP HALTED — UNVERIFIED (upstream status unknown)` — line 147 | `SHIP HALTED — BLOCKED` — line 25, 143 | `SHIP INCOMPLETE — REGRESSION` — line 26, 146 | `SHIP HALTED — NO_INFRA` (line 25, 144); `SHIP HALTED — RUNNER_BROKEN` (line 25, 145) |
| nacl-tl-hotfix | (hotfix-specific headline; non-PASS requires explicit user override before auto-merge — `nacl-tl-hotfix/SKILL.md:16, 55, 499`) | non-PASS folded under operator override (line 499) | (none distinct) | (REGRESSION surfaces in CI / baseline diff; line 499) | NO_INFRA / RUNNER_BROKEN follow same closed-set vocabulary |
| nacl-tl-full | `FULL COMPLETE` (aggregated PASS across BE+FE+sync+review+QA) — `nacl-tl-full/SKILL.md:325 et seq, 675-679` | `FULL APPLIED — UNVERIFIED` (any phase UNVERIFIED) — line 326–327, 459–460, 496–497, 1005, 1008 | `FULL APPLIED — BLOCKED` (phase BLOCKED — pre-existing failures, user override) — line 459, 496, 675 | `FULL INCOMPLETE — REGRESSION` (any phase REGRESSION) — implicit in line 460, 497 | NO_INFRA / RUNNER_BROKEN follow Codex contract |
| nacl-tl-reconcile | (reconcile produces a per-task reconciliation table; closed-set status applies — `nacl-tl-reconcile/SKILL.md:239–247` covers `--force` scope) | (advisory status — UNVERIFIED for unparseable or stale) | (BLOCKED if reconcile would mutate without confirmation) | (FAILED if mutation conflicts) | (NOT_RUN if `--force` skipped per-task gates) |
| nacl-tl-reopened | (reads upstream review/qa/sync/deliver verdicts; headline mirrors source) | UNVERIFIED upstream → "Reopened" YouGile column move (verify/qa unverified) | (BLOCKED upstream — same Reopened path) | REGRESSION upstream → Reopened with regression annotation | NO_INFRA / RUNNER_BROKEN → Reopened (infra issue, not regression) |
| nacl-tl-dev-be | (per-phase headlines; `nacl-tl-dev-be/SKILL.md` mirrors review/sync semantics for the BE workspace; closed-set status applies) | UNVERIFIED when test seam not transitioned | BLOCKED when pre-existing failures remain | REGRESSION when new failures introduced | NO_INFRA (scripts.test missing) / RUNNER_BROKEN |
| nacl-tl-dev-fe | (FE mirror of dev-be — same closed-set vocabulary; UI-coverage gap downgrades to UNVERIFIED) | UNVERIFIED for mock-coverage gap | BLOCKED same as dev-be | REGRESSION same as dev-be | NO_INFRA / RUNNER_BROKEN |
| nacl-tl-dev | (TECH dev headline; uses dev-be checklist) | UNVERIFIED for missing test infra | BLOCKED for pre-existing failures | REGRESSION | NO_INFRA / RUNNER_BROKEN |
| nacl-tl-plan | (planning report; closed-set status — VERIFIED if plan generated cleanly; BLOCKED if graph unavailable) | UNVERIFIED for opaque payload boundaries (current behavior — see synthesis) | BLOCKED for graph unavailable | (n/a — planning does not emit REGRESSION) | NOT_RUN if `--skip-plan` is set |
| nacl-tl-intake | (triage report; closed-set status) | UNVERIFIED for ambiguous classification | BLOCKED for graph unavailable | (n/a) | NOT_RUN |
| nacl-tl-next | (next-task recommendation; advisory; UNVERIFIED if graph context missing) | UNVERIFIED | BLOCKED | (n/a) | NOT_RUN |
| nacl-tl-status | (status report; advisory; UNVERIFIED if status.json absent) | UNVERIFIED | BLOCKED | (n/a) | NOT_RUN |
| nacl-tl-docs | (docs update report; UNVERIFIED for missing sources) | UNVERIFIED | BLOCKED | (n/a) | NOT_RUN |
| nacl-tl-diagnose | (project-health report; closed-set status) | UNVERIFIED for stale artifacts | BLOCKED for unreadable repo | (n/a — diagnose surfaces FAILED upstream) | NOT_RUN |
| nacl-tl-regression-test | RED-fixture write contract; VERIFIED only when the test is RED on the current codebase | UNVERIFIED if test goes green prematurely | BLOCKED if no test runner | (n/a) | NOT_RUN |

**Codex flavor note:** every codex-flavor SKILL.md publishes the closed top-level `Status:` line per `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md:12`. The Claude headlines above are decoration; the closed-set Status remains the authoritative classifier (cf. `nacl-tl-conductor/SKILL.md:324–326`).

---

## Permitting Clauses (current "false-PASS surfaces")

The postmortems converge on this diagnosis: **non-`VERIFIED` upstream verdicts are repeatedly downgraded to "good enough to close"** by clauses in downstream SKILL.md files. The clauses below are the inventory those clauses live in today. W1–W10 will close each one.

The acceptance threshold is "≥10 specific clauses with file:line." Below: **30 such clauses**.

### P-1. nacl-tl-review — VERIFIED with red lint/typecheck/test never specified

- **Clause:** `nacl-tl-review/SKILL.md:260` ("If `scripts.test` is missing → halt as `REVIEW HALTED — NO_INFRA (scripts.test undeclared)`. Do NOT promote the verdict to `APPROVED`; do NOT proceed to Step 8 verdict assignment with a PASS-family headline. **Operator override is permitted** but the headline becomes `REVIEW APPLIED — UNVERIFIED (no test infra)` and the verdict cannot be `APPROVED`.")
- **Permits false PASS:** review can still emit `REVIEW APPLIED — UNVERIFIED` headline that downstream consumers (ship, deliver, release) read as "approved with caveats," not as a hard refusal. No `pnpm -r lint && pnpm -r typecheck && pnpm -r test` gate exists in the SKILL.md.
- **Postmortem evidence:** Project-Alpha Wave 4 PASS at 17:07 on 2026-05-11 with `pnpm -r lint` red, `pnpm -r typecheck` red (3 errors), `publishTaskEvent` / `publishNotification` / `pushSseEvent` defined but never called. Audit at 17:35 → seven-commit remediation (`07c11fe`, `a7eb747`, `01f2fcb`, `14f3000`, `c83e84f`, `92da5c7`, `135b14b`, `6ed12ac`). See `project-alpha-postmortem.md` § 3.12.

### P-2. nacl-tl-review — APPROVED still allowed under MAJOR test-author overlap

- **Clause:** `nacl-tl-review/SKILL.md:334` ("This check is non-blocking at the review layer. A MAJOR flag does not prevent REVIEW COMPLETE or APPROVED, but it must appear in the review artifact and is visible to downstream consumers.")
- **Permits false PASS:** test-author overlap >50% surfaces as informational MAJOR flag; downstream skills MAY (not MUST) gate on it. Project-Alpha Wave 5 closed with FE sync verdicts normalized to UNVERIFIED (post-mortem-codex.md § 6 / TL Review).

### P-3. nacl-tl-review — APPROVED under `REVIEW APPLIED — UNVERIFIED (no test infra)`

- **Clause:** `nacl-tl-review/SKILL.md:361` — operator override under NO_INFRA / RUNNER_BROKEN still allows `APPROVED` verdict family to be carried forward via the report (Step 10 writes `phases.review_be = "approved"`).
- **Permits false PASS:** explicit NO_INFRA / RUNNER_BROKEN is downgraded to UNVERIFIED but the per-phase status writes `approved`, which ship and deliver consume as PASS.

### P-4. nacl-tl-sync — UNVERIFIED is not refused at the verdict layer

- **Clause:** `nacl-tl-sync/SKILL.md:363–364` (verdict UNVERIFIED → headline `SYNC APPLIED — UNVERIFIED`); `nacl-tl-sync/SKILL.md:215` (FE coverage gap downgrades endpoint coverage to UNVERIFIED).
- **Permits false PASS:** UNVERIFIED is a phase-complete state. `nacl-tl-deliver` and `nacl-tl-release` read this status and gate via "operator override permitted" rather than hard refusal.
- **Postmortem evidence:** Project-Alpha Wave 5 closed with all six FE sync verdicts normalized to UNVERIFIED — `project-alpha-postmortem-codex.md` § 5 "Wave 5 MVP FE Closure." Project-Beta UC-300 / UC-100: TS types matched but TUS metadata key (filetype vs mime_type) wire-format mismatch (`project-beta-postmortem.md` § 3.1).

### P-5. nacl-tl-sync — type-alignment alone produces SYNC COMPLETE for the SYSTEM-actor case

- **Clause:** `nacl-tl-sync/SKILL.md:368–370` ("`verdict = "PASS"` → headline: SYNC COMPLETE") with no requirement of wire-evidence (fixture / contract test / live smoke) for any UC with `actor != SYSTEM`.
- **Permits false PASS:** kie.ai endpoint shape mismatch (Anthropic vs OpenAI envelope, `project-beta-postmortem.md` § 3.3) and UC-301 schema rename leaking into UC-300 worker (`project-beta-postmortem.md` § 8e92405) both passed sync.

### P-6. nacl-tl-qa — SKIP-on-missing-keys leaks into release

- **Clause:** `nacl-tl-qa/SKILL.md:470` (`QA APPLIED — UNVERIFIED` when ≥1 screenshot missing — descriptive, non-blocking) and SKILL.md does not encode "release-blocker by default for SKIP."
- **Permits false PASS:** UC-200 (ffmpeg/Deepgram) and UC-300 (kie.ai) shipped to production with QA skipped because real provider keys were unavailable; both broke on first real call. Project-Beta postmortems § 3.3, § 3.8 and § 5 (counted as `QA APPLIED — UNVERIFIED`).

### P-7. nacl-tl-qa — `QA APPLIED — UNVERIFIED` is non-blocking downstream

- **Clause:** `nacl-tl-qa/SKILL.md:401` (`phases.qa = "unverified"` written but no enforcement that this prevents `nacl-tl-deliver` / `nacl-tl-release` from advancing).
- **Permits false PASS:** `phases.qa = "unverified"` is a terminal phase state that downstream skills read as "QA ran"; the source of truth is whether the next phase honors it.

### P-8. nacl-tl-deliver — `--skip-verify` is a documented bypass flag

- **Clause:** `nacl-tl-deliver/SKILL.md:63` (`/nacl-tl-deliver --skip-verify` … push + CI only, no staging verification") and `nacl-tl-deliver/SKILL.md:247` (the `--skip-verify` semantics block, P4).
- **Permits false PASS:** even though the headline is `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)` and the SKILL.md explicitly says IntakeItem stamping is refused, the existence of the flag means an operator can deliver under bypass; release then reads `t.verification_evidence = 'no-test'` (line 261) and surfaces only as "Verification gap" footer (release SKILL.md:625) without blocking.

### P-9. nacl-tl-deliver — `--skip-deploy` skips health check entirely

- **Clause:** `nacl-tl-deliver/SKILL.md:64` ("`/nacl-tl-deliver --skip-deploy` … push + CI + verify, no health check") and `nacl-tl-deliver/SKILL.md:367` ("Step 5: DEPLOY HEALTH CHECK (skip if `--skip-deploy`)").
- **Permits false PASS:** delivery can complete without proving the deployed app responds on `/api/health` — project-beta's "deploy-health-only-isn't-product-readiness" pattern (project-beta-postmortem-codex.md § 6.6).

### P-10. nacl-tl-deliver — health-failed operator override still writes verification_evidence

- **Clause:** `nacl-tl-deliver/SKILL.md:393–411` (operator override path produces `DELIVER APPLIED — UNVERIFIED (health failed, operator override)` and writes `verification_skip_reason` to graph, but downstream release reads only the `t.verification_evidence` field).
- **Permits false PASS:** the override carries forward as "delivered but unverified," which `nacl-tl-release/SKILL.md:621` classifies as `no-test` (release-time exclusion is a footer, not a refusal).

### P-11. nacl-tl-release — operator override on health failure pushes tag

- **Clause:** `nacl-tl-release/SKILL.md:319–328` ("Operator override (interactive, OFF by default): If the operator chooses to proceed despite the failed health check, the release continues but with non-PASS reporting … Tag is pushed but `release-status.json` records `"health": {"status": "failed_override", "reason": "<text>"}`.")
- **Permits false PASS:** the release tag exists (immutable in git history) under a non-PASS state. The `RELEASE INCOMPLETE — UNVERIFIED (production health failed, operator override)` headline does not block downstream "production live" signaling.

### P-12. nacl-tl-release — `--skip-merge` skips the merge step

- **Clause:** `nacl-tl-release/SKILL.md:65, 123, 131, 562` ("`--skip-merge` flag | Skip the merge action of Step 2 (tag-only). UC status gate STILL runs over commits-since-last-tag (0.14.0 contract).")
- **Permits false PASS:** even though the UC status gate runs, the flag exists. The `direct` strategy path is the de-facto Project-Alpha pattern — `project-alpha-postmortem-codex.md` § 4 "GitHub PR search returned no PRs for `ITSalt/project-alpha`."

### P-13. nacl-tl-release — graph stale tolerated with `warn` status

- **Clause:** `nacl-tl-release/SKILL.md:457–462` (Step 7 IntakeItem stamping has `Failure tolerance: If Neo4j is unavailable or the query errors, log a warning and continue — do NOT block the release.").
- **Permits false PASS:** stale graph never becomes a release blocker. Project-Alpha: `.tl/release-status.json` recorded `graph.status: warn` "no IntakeItem nodes and stale Task statuses; release proceeded by operator override" (project-alpha-postmortem-codex.md § 3).

### P-14. nacl-tl-release — UNVERIFIED-UC user gate at Step 2

- **Clause:** `nacl-tl-release/SKILL.md:199` ("verified-pending (UNVERIFIED) | HALT: \"PR #N has UC### with UNVERIFIED dev status. Merge without verification? [yes/no] Default: no\". If user confirms → include with warning.")
- **Permits false PASS:** user can confirm and the UC is merged with a warning footer instead of blocked. UNVERIFIED is a permitted release state once the operator says yes.

### P-15. nacl-tl-release — no production URL = skip health check, warn-only

- **Clause:** `nacl-tl-release/SKILL.md:332` ("No production URL configured, skipping health check. (No halt — the operator opted out of automated health verification at config time.)")
- **Permits false PASS:** "production live" is declared without a single health probe — Project-Alpha's `.tl/release-status.json` `health.status: skipped` with reason `no production URL configured`. The reason "operator opted out at config time" is permanent.

### P-16. nacl-tl-conductor — `--skip-deliver` / `--skip-qa`

- **Clause:** `nacl-tl-conductor/SKILL.md:91–92, 312, 631` (Phase 5 DELIVERY skipped if `--skip-deliver`; Phase 4 QA skipped if `--skip-qa`).
- **Permits false PASS:** the conductor produces `CONDUCTOR COMPLETE` even when downstream delivery/QA never ran.

### P-17. nacl-tl-conductor — `--no-test` user override flips evidence to `no-test`

- **Clause:** `nacl-tl-conductor/SKILL.md:457` ("PASS + `--no-test` user override active | `\"none — UNVERIFIED\"` allowed | `'no-test'` (only path; explicit override must be present in conductor invocation)") and line 515 ("the only way to land `'no-test'` evidence is via an explicit user `--no-test` override").
- **Permits false PASS:** `'no-test'` evidence on a `done` Task is read by `nacl-tl-release/SKILL.md:621` ("`no-test` | No test file found; UC shipped under explicit user override") and surfaces only as a "Verification gap" footer (line 625), not a blocker.

### P-18. nacl-tl-conductor — BLOCKED downstream → operator override or abort

- **Clause:** `nacl-tl-conductor/SKILL.md:296, 357, 487` ("BLOCKED → operator override or abort"; "fix applied, pre-existing failures, user override recorded").
- **Permits false PASS:** BLOCKED is a closable state with operator confirmation. The closed-set status is recorded but the chain advances.

### P-19. nacl-tl-deploy — verified-pending HALT permits operator override

- **Clause:** `nacl-tl-deploy/SKILL.md:136` ("verified-pending (UNVERIFIED) | HALT by default … Operator override is permitted (explicit \"yes\" prompt; NOT auto-confirmed by `--yes`). On override → headline `DEPLOY APPLIED — UNVERIFIED (operator override)`; Task.verification_skip_reason = 'deploy operator-override'; the source Task is NOT moved to `done` / `released`").
- **Permits false PASS:** deploy under UNVERIFIED upstream is permitted; the failure mode is that the source Task does not advance but the deploy is on the staging/production environment regardless.

### P-20. nacl-tl-deploy — `DEPLOY APPLIED — UNVERIFIED (blocked, operator override)`

- **Clause:** `nacl-tl-deploy/SKILL.md:137` ("blocked | Same gate as UNVERIFIED. On override → `DEPLOY APPLIED — UNVERIFIED (blocked, operator override)`; no source-task state movement.")
- **Permits false PASS:** BLOCKED-upstream deploys are permitted under operator override.

### P-21. nacl-tl-ship — non-PASS upstream is shippable under operator confirmation

- **Clause:** `nacl-tl-ship/SKILL.md:142–143` (UNVERIFIED and BLOCKED both produce HALT + advisory; explicit operator "yes" answer (NOT `--yes`) proceeds with `SHIP APPLIED — UNVERIFIED` headline; PR description annotated).
- **Permits false PASS:** the PR exists; non-PASS upstream becomes a PR footer rather than a refusal.

### P-22. nacl-tl-fix — Rule 7 (`UNVERIFIED`) closes a fix with no test evidence

- **Clause:** `nacl-tl-fix/SKILL.md:539, 597` (Rule 7: "No test transitioned RED→GREEN (Path B, and no baseline_failures cleared). The fix was applied, the suite runs, but nothing in the suite gives evidence the fix did anything. | `UNVERIFIED` | `FIX APPLIED — UNVERIFIED` (no test exercises the change)").
- **Permits false PASS:** the fix closes with `FIX APPLIED — UNVERIFIED`. Downstream conductor (P-17) lands this as `t.verification_evidence = 'test-UNVERIFIED'` and the chain advances.

### P-23. nacl-tl-fix — `--force-l3-spec-gap` escape hatch

- **Clause:** `nacl-tl-fix/SKILL.md:261` ("Escape hatch (rare): If the user truly wants to handle a small spec gap inline and Step 3 mis-classified, they can re-invoke with `/nacl-tl-fix --force-l3-spec-gap …`. This bypasses the L3-feature exit and treats the request as `L3-spec-gap`")
- **Permits false PASS:** inline minor spec is permitted; the L3-feature guardrail is bypassable per the SKILL.md.

### P-24. nacl-tl-hotfix — `--force-push` skips PR

- **Clause:** `nacl-tl-hotfix/SKILL.md:55, 71` ("PR by default. Direct push to main ONLY with `--force-push` flag AND explicit double confirmation from the user.")
- **Permits false PASS:** direct push to main bypasses PR/CI gates.

### P-25. nacl-tl-stubs — `STUBS APPLIED — UNVERIFIED` advances downstream

- **Clause:** `nacl-tl-stubs/SKILL.md:326, 343` ("`phases.stubs: unverified`, headline `STUBS APPLIED — UNVERIFIED`" — TODO/STUB markers cleaned but no real-data shape validation).
- **Permits false PASS:** stub considered "complete" when TODO markers removed, not when real data plugged in. Project-Alpha `8522d1d` "fix(admin): unstub WORKFLOW_STEPS + categories envelope + WSC dropdown paging" — see `project-alpha-postmortem.md` § 4 nacl-tl-stubs.

### P-26. nacl-tl-stubs — shape validation gap on dist/

- **Clause:** scanner scans **source** (`nacl-tl-stubs/SKILL.md:124`-style markers in src/), not built artifacts. Project-Beta `66049d5 fix(UC-300): copy llm/prompts/*.md into worker dist on build` (`project-beta-postmortem.md` § 3.7).
- **Permits false PASS:** asset referenced at runtime not present in dist/ — scanner says PASS.

### P-27. nacl-tl-reconcile — `--force` skips USER GATE

- **Clause:** `nacl-tl-reconcile/SKILL.md:69, 239–247` ("`--force` … skip USER GATE (for programmatic use)").
- **Permits false PASS:** programmatic reconciliation cannot be audited against an operator-confirmed scope.

### P-28. nacl-tl-full — `--skip-plan` / `--skip-qa` documented as supported flags

- **Clause:** `nacl-tl-full/SKILL.md:149–150, 997, 1001, 1005, 1008` (records `phase_qa = 'skipped'` with `Task.verification_skip_reason = 'full --skip-qa'`; requires separate explicit operator override before any UC moves to done/delivered/released).
- **Permits false PASS:** the override path exists; `--skip-qa` is a documented mode.

### P-29. nacl-tl-conductor — Neo4j unavailable at Phase 3 = continue

- **Clause:** `nacl-tl-conductor/SKILL.md:764` ("Neo4j unavailable at Phase 3 | nacl-tl-full handles its own fallback; conductor continues normally") and line 765 ("Neo4j write fails after completion | Log warning, continue (graph sync is best-effort, not blocking)").
- **Permits false PASS:** the graph — the source of truth — can be stale or write-failed and the conductor still marks the wave complete.

### P-30. Verification-evidence taxonomy permits `no-test` under override

- **Clause:** `skills-for-codex/references/verification-evidence.md:17` ("`no-test` | Status `VERIFIED` under an explicit user override (e.g. `--skip-verify` at delivery).")
- **Permits false PASS:** the closed-set `VERIFIED` status can carry `no-test` evidence — Project-Alpha's exact "MVP feature-complete" pattern where verification was bypassed at delivery (project-alpha-postmortem.md § 4.6, project-beta-postmortem.md § 5.4).

---

## Table B — Postmortem Episodes × Permitting SKILL.md Clause

Eleven episodes from the four postmortems, each mapped to the **exact SKILL.md file:line** that permitted the false PASS.

| # | Date | Project | Episode summary | Owning skill | Permitting clause |
|---|---|---|---|---|---|
| 1 | 2026-05-11 17:07 | project-alpha | Wave 4 closed 6/6 PASS at 17:07; 17:35 audit reproduced `pnpm -r lint` red, `pnpm -r typecheck` red (3 errors), publishers defined but never called. 7-commit remediation. | nacl-tl-review | `nacl-tl-review/SKILL.md:260` (NO_INFRA operator override produces UNVERIFIED headline that downstream consumers treat as approved-with-caveat); no `pnpm -r lint && pnpm -r typecheck && pnpm -r test` requirement in SKILL.md |
| 2 | 2026-05-12 10:46 | project-alpha | Wave 5 closed as MVP feature-complete with all six FE sync verdicts normalized to UNVERIFIED (relied on MSW rather than wire-level parity); first stabilization fix landed 23 minutes later | nacl-tl-sync | `nacl-tl-sync/SKILL.md:363–364` (mock_warnings > 0 OR fe_coverage_gap → UNVERIFIED is non-blocking) |
| 3 | 2026-05-18 22:28 | project-beta | `4da4aca` "deliver(.tl): production live" tagged while full UC golden path (real upload) was deferred and UC-200/UC-300 QA was skipped | nacl-tl-deliver + nacl-tl-qa | `nacl-tl-deliver/SKILL.md:63` (`--skip-verify` flag) + `nacl-tl-qa/SKILL.md:470` (`QA APPLIED — UNVERIFIED` non-blocking) |
| 4 | 2026-05-19 | project-beta | kie.ai `/generate` deprecated mid-build → 404 in prod. TECH-011 spec named the abstraction `ILlmProvider`, not the external endpoint URL/shape. QA skipped because real KIE_API_KEY absent. | nacl-tl-sync + nacl-tl-qa | `nacl-tl-sync/SKILL.md:368–370` (PASS verdict requires only TS-type alignment, not wire-evidence); `nacl-tl-qa/SKILL.md:470` |
| 5 | 2026-05-18 | project-beta | TUS metadata key three-way mismatch (`mime_type` vs `filetype`); BE read one, FE sent another; sync passed because both imported the same TS type | nacl-tl-sync | `nacl-tl-sync/SKILL.md:368–370` (no requirement that string-literal field names match across prose, Zod, table) |
| 6 | 2026-05-18 | project-beta | Catalog page had no upload button; UC-001 spec listed only `open_button`; cross-UC nav not in form spec | nacl-sa-ui + nacl-tl-review | `nacl-tl-review/SKILL.md:334` (review checks code vs spec, not story map / missing affordance); no nav-actions section requirement |
| 7 | 2026-05-19 | project-beta | UC-200 ffmpeg fed unbuffered stream; needed seekable input; QA skipped for missing Deepgram key but the pre-Deepgram ffmpeg stage failed silently before any provider call | nacl-tl-qa | `nacl-tl-qa/SKILL.md:470` (no pre-provider/provider QA decomposition; SKIP-on-missing-keys masks earlier-stage failure) |
| 8 | 2026-05-19 | project-beta | TUS Location header used http behind Caddy reverse-proxy; deploy health green; URL not browser-reachable | nacl-tl-deploy + nacl-tl-deliver | `nacl-tl-deploy/SKILL.md:39, 187` (DEPLOY INCOMPLETE — UNVERIFIED (health probe timeout) is not a blocking closure); `nacl-tl-deliver/SKILL.md:367` (`--skip-deploy` flag) |
| 9 | 2026-05-21 | project-alpha | `.tl/release-status.json` recorded `graph.status: warn` "no IntakeItem nodes and stale Task statuses; release proceeded by operator override" | nacl-tl-release | `nacl-tl-release/SKILL.md:457–462` (Step 7 IntakeItem stamping has explicit `Failure tolerance: log a warning and continue — do NOT block the release`) |
| 10 | 2026-05-21 | project-alpha | Live graph 1083 nodes vs handover-artifact 970 nodes; FR-007 in changelog but not visibly in graph; `/nacl-sa-validate full` = FAIL with 1 CRITICAL, 156 WARNINGs | nacl-tl-conductor + nacl-tl-release | `nacl-tl-conductor/SKILL.md:765` (Neo4j write fails — log warning, continue); `nacl-tl-release/SKILL.md:457` (graph stale `warn` tolerated) |
| 11 | 2026-05-11 → 2026-05-18 | project-alpha | DIAGNOSTIC-REPORT.md measured 39% of fixes never updated documentation (code-first violation); `a7eb747` "docs(SA): UC-105/106/107 post-commit emit timing (L2)" landed AFTER FIX-B code wave | nacl-tl-fix | `nacl-tl-fix/SKILL.md:539, 597` (Rule 7 `UNVERIFIED` is a closable state); no spec-update-commit-first invariant in SKILL.md |

W11 will replay these eleven episodes against the post-W1-W10 chain and assert each gate fires.

---

## Table C — Override Flag Inventory

The W3/W4/W5/W9 flag-removal scope. Each row: (skill, flag, file:line, what-it-bypasses). **All flags below are documented in the current SKILL.md text — no inference.**

| # | Skill | Flag | file:line | What it bypasses |
|---|---|---|---|---|
| 1 | nacl-tl-deliver | `--skip-verify` | `nacl-tl-deliver/SKILL.md:63, 247, 250, 258, 269, 275, 277, 279, 531` | Step 4 VERIFY entirely; sets headline to `DELIVER APPLIED — UNVERIFIED (skipped: --skip-verify)`; writes `t.verification_evidence = 'no-test'`; refuses IntakeItem stamping but the delivery still ships |
| 2 | nacl-tl-deliver | `--skip-deploy` | `nacl-tl-deliver/SKILL.md:64, 367` | Step 5 DEPLOY HEALTH CHECK; no health probe runs |
| 3 | nacl-tl-release | `--skip-merge` | `nacl-tl-release/SKILL.md:65, 123, 131, 294, 562` | Step 2 MERGE action (no `gh pr merge` calls); the UC status gate still runs over commits-since-last-tag (per 0.14.0 contract) |
| 4 | nacl-tl-conductor | `--skip-deliver` | `nacl-tl-conductor/SKILL.md:91, 631` | Phase 5 DELIVERY; conductor returns headline without ever delivering to staging |
| 5 | nacl-tl-conductor | `--skip-qa` | `nacl-tl-conductor/SKILL.md:92, 312` | Pre-ship QA in the dev cycle; passed through to `/nacl-tl-full --skip-qa` |
| 6 | nacl-tl-full | `--skip-plan` | `nacl-tl-full/SKILL.md:149, 186, 997` | Planning subagent launch; expects `.tl/` and graph already populated |
| 7 | nacl-tl-full | `--skip-qa` | `nacl-tl-full/SKILL.md:150, 1001–1008` | E2E QA testing; records `phase_qa = 'skipped'` + `Task.verification_skip_reason = 'full --skip-qa'`; requires separate operator override before UC moves to `done` |
| 8 | nacl-tl-full | `--no-test` | `nacl-tl-full/SKILL.md:379, 570, 588` | Test discovery; PASS reports with `no-test` evidence string permitted only under this flag |
| 9 | nacl-tl-conductor | `--no-test` | `nacl-tl-conductor/SKILL.md:457, 515` | Same as above at conductor layer; the only way to land `'no-test'` evidence is via an explicit user `--no-test` override on the conductor invocation |
| 10 | nacl-tl-conductor | `--yes` | `nacl-tl-conductor/SKILL.md:184` | USER GATE confirmation (per-task confirmation prompts); does NOT skip UNVERIFIED safety gate |
| 11 | nacl-tl-release | `--yes` | `nacl-tl-release/SKILL.md:69, 229` | Plan-gate user confirmation in Step 2; UNVERIFIED-UC user gate is NOT skipped by `--yes` (explicit per-UC confirmation required) |
| 12 | nacl-tl-reconcile | `--force` | `nacl-tl-reconcile/SKILL.md:69, 239, 242, 247` | USER GATE for per-task confirmation prompts (programmatic use); strictly scoped to per-task confirmation, not unverified-behavior |
| 13 | nacl-tl-fix | `--force-l3-spec-gap "<description>"` | `nacl-tl-fix/SKILL.md:261` | L3-feature exit at Step 3; treats request as `L3-spec-gap`; permits inline minor spec |
| 14 | nacl-tl-hotfix | `--force-push` | `nacl-tl-hotfix/SKILL.md:50, 55, 71, 407, 538, 736` | PR creation; pushes directly to main (requires double confirmation) |
| 15 | nacl-tl-release | `--pr 42,45` | `nacl-tl-release/SKILL.md:68, 162` | PR discovery from YouGile + GitHub (uses specific PRs); not a status bypass, but a scope bypass |
| 16 | nacl-tl-release | `--dry-run` | `nacl-tl-release/SKILL.md:67, 570` | All write actions (merge, tag, IntakeItem stamping); reporting-only |
| 17 | nacl-tl-deliver | `--env production` | `nacl-tl-deliver/SKILL.md:67, 612–630` | Staging URL/health-endpoint defaults; switches to production deploy with extra safety checks but the underlying flag mechanics apply |

**The plan's W3/W4/W5/W9 scope (resolved_decisions `--skip-* flag policy`):** `--skip-verify`, `--skip-deploy`, `--skip-merge`, `--skip-qa`, `--skip-deliver`, `--skip-plan`, `--no-test`, `--force` are **scheduled for removal**. Only `--skip-e2e` is preserved — and a grep across both Claude and Codex SKILL.md sets **finds no current `--skip-e2e` flag**, so W3's scope includes creating it (or confirming that `--skip-qa` at the QA layer was the intended preservation target).

Three additional flags surface that the plan does not name explicitly: `--force-push` (hotfix), `--force-l3-spec-gap` (fix), `--yes` (conductor/release). These are noted here for W3/W4/W5/W9 to decide retention or removal individually.

---

## Headline → Closed Status Mapping (Codex contract)

Per `skills-for-codex/nacl-tl-core/references/tl-codex-contract.md:12`:

| Claude headline family | Codex closed status |
|---|---|
| `{SKILL} COMPLETE` | `VERIFIED` |
| `{SKILL} COMPLETE (with warnings)` | `VERIFIED` (with warnings in workflow detail) |
| `{SKILL} APPLIED — UNVERIFIED (…)` | `UNVERIFIED` or `PARTIALLY_VERIFIED` depending on dimension (review/qa/sync downgrade dimensions documented per skill) |
| `{SKILL} APPLIED — BLOCKED` | `BLOCKED` |
| `{SKILL} HALTED — NO_INFRA` | `BLOCKED` (workflow detail `NO_INFRA`) |
| `{SKILL} HALTED — RUNNER_BROKEN` | `BLOCKED` (workflow detail `RUNNER_BROKEN`) |
| `{SKILL} HALTED — UNVERIFIED (…)` | `UNVERIFIED` (HALT prevents downstream advance) |
| `{SKILL} INCOMPLETE — REGRESSION` | `FAILED` |

The mapping above is the source of W11's grep section: any usage of "approved with caveats" / "ship under override" / "unverified is non-blocking" must be expressible as one of `VERIFIED / FAILED / PARTIALLY_VERIFIED / BLOCKED / NOT_RUN / UNVERIFIED` and the downstream skill must refuse to advance on anything but `VERIFIED` (modulo signed exceptions per the W4 schema).

---

## Cross-cutting observations for W1–W10

1. **Every closure skill (`nacl-tl-deliver`, `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-ship`, `nacl-tl-conductor`) carries an "operator override" branch** that converts a non-VERIFIED upstream into a forward-advancing terminal state. The override paths are documented; the consequence (no downstream blocker) is also documented. The methodology gap is that `VERIFIED` is the only headline that downstream skills should treat as permission to advance — but the SKILL.md text consistently makes UNVERIFIED a permitted advance under an override prompt.
2. **`UNVERIFIED` is descriptively recorded everywhere, blockingly enforced nowhere.** The closed Codex contract says "Use `UNVERIFIED` when the available evidence cannot establish the result" (tl-codex-contract.md:24). That's correct as a description. The synthesis insight is that the next skill in the chain must refuse to consume `UNVERIFIED` as input — that refusal is not in any SKILL.md today.
3. **`--skip-*` flag inventory is broader than the plan names.** The W3/W4/W5/W9 scope includes `--force` (reconcile), `--force-l3-spec-gap` (fix), `--force-push` (hotfix), `--yes` (conductor, release), `--dry-run` (release) — beyond the eight flags the plan enumerates. The plan resolution says "Remove most flags entirely … Preserve only `--skip-e2e`." That preservation needs an additional inventory step at W3 to confirm scope.
4. **`gate_mode: legacy` is absent.** A `grep` across all SKILL.md (Claude and Codex) finds **no `gate_mode` or `legacy` references** consistent with the plan's "strict mode is the only mode" decision. W1 acceptance check (`Both SKILL.md files contain NO references to a `legacy` mode or `gate_mode` field`) is already true at baseline — W1 only needs to add the strict-everywhere blocking semantics.
5. **`project_kind` (standard | prototype) is absent at baseline.** No SKILL.md or config-schema.md mentions `project_kind`. W1 introduces it.
6. **The closed Codex status vocabulary is already correct.** `tl-codex-contract.md:12` lists `VERIFIED / FAILED / PARTIALLY_VERIFIED / BLOCKED / NOT_RUN / UNVERIFIED` — no extension needed. The W4 signed-exception schema is additive.

---

## Appendix — Verification

This baseline is read-only. Verification of compliance:

```bash
cd /home/project-owner/projects/NaCl
git diff --stat -- '*SKILL.md' '.tl/'   # should show zero SKILL.md edits
```

Cross-checked at end of W0: see `/home/project-owner/.nacl/wave-evidence/W0-baseline.md`.
