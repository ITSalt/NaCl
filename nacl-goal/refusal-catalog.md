# /nacl-goal refusal catalog

Every refusal path through `/nacl-goal` returns one of these codes.
Refusals are logged to `.tl/goal-runs/<ts>-refused.md` when they occur
at `--start` (post-preview); preview-only refusals are not logged.

## REFUSE_HUMAN_GATE_BA_SA_HANDOFF

| | |
|---|---|
| Triggers | Alias resolves to a workflow that crosses the BA→SA handoff confirmation, OR runtime gate detector spots the handoff prompt |
| Message | "`/nacl-goal` cannot wrap a workflow that crosses the BA→SA handoff. This is a mandatory human-approval gate that locks the BA layer before SA decomposition. Run `/nacl-ba-handoff` interactively, confirm the handoff, then re-run `/nacl-goal`." |
| Fallback | Run `/nacl-ba-handoff` interactively. After confirmation, the original `/nacl-goal <alias>` becomes valid. |
| Logs to runs/ | Yes if hit at `--start` (gate detector). No if caught at preview. |
| Reference | `nacl-tl-core/references/gate-fire-catalog.md#ba-sa-handoff` |

## REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION

| | |
|---|---|
| Triggers | Alias resolves to `nacl-sa-full` or any SA phase that requires user confirmation between phases (context → domain → roles → UC → UI → finalize) |
| Message | "`/nacl-goal` cannot wrap `nacl-sa-full` or any incremental SA phase. Each SA phase has a mandatory user confirmation gate. Run `/nacl-sa-full` interactively through phase confirmation, then `/nacl-goal validate:module:<X>` to verify." |
| Fallback | `/nacl-sa-full` interactively, then `/nacl-goal validate:module:<X>` |
| Logs to runs/ | Yes if hit at `--start`. No if caught at preview. |
| Reference | `nacl-tl-core/references/gate-fire-catalog.md#sa-phase-confirmation` |

## REFUSE_HOTFIX_JUDGMENT

| | |
|---|---|
| Triggers | Alias resolves to `nacl-tl-hotfix`, OR `fix:<BUG>` where the bug is L0/L1, OR `reopened-drain` containing emergency-tagged items |
| Message | "`/nacl-goal` cannot wrap emergency hotfix work. Hotfix routing requires human judgment about urgency, scope, and target branch. Run `/nacl-tl-hotfix` interactively. Resume the wrapper for the post-hotfix verification work afterwards." |
| Fallback | `/nacl-tl-hotfix` interactively |
| Logs to runs/ | Yes if hit at `--start`. No if caught at preview. |
| Reference | `feedback_ship_never_switch_branches.md` (memory) |

## REFUSE_POST_CANARY_RETROSPECTIVE

| | |
|---|---|
| Triggers | `migrate-canary` alias when retrospective gate has already been passed for this project, OR runtime detection of attempted post-canary migration step |
| Message | "`/nacl-goal migrate-canary` runs only up to the retrospective gate. After the canary project (per `feedback_migration_retrospective_gate.md`), a mandatory 3-sub-agent audit and explicit user approval are required before any further migration. Continue `/nacl-migrate` interactively." |
| Fallback | `/nacl-migrate` interactively from the retrospective gate forward |
| Logs to runs/ | Yes |
| Reference | `feedback_migration_retrospective_gate.md` (memory) |

## REFUSE_PRODUCTION_MUTATION

| | |
|---|---|
| Triggers | Universal denylist hit: `git push`, `gh pr merge`, `npm publish`, `gh release create`, production DB migration, or any action against `main`/`master`/`release/*` |
| Message | "`/nacl-goal` blocked an attempt to mutate a production target (`<command>`). Production mutations always require a human gate. The work up to the merge boundary was preserved; the wrapper has cleared the goal so you can run the production step interactively." |
| Fallback | Run the blocked command yourself, then a fresh `/nacl-goal` if more loop-able work remains |
| Logs to runs/ | Yes; `gate_violation_attempts[]` populated |
| Reference | `docs/guides/goal-permissions.md` |

## REFUSE_UNTIERED_CUSTOM_GOAL

| | |
|---|---|
| Triggers | `/nacl-goal custom` invoked without `--tier=` AND/OR without `--check-script=`, OR the supplied `--check-script` path does not exist / is not executable |
| Message | "`/nacl-goal custom` requires both `--tier=<S\|M\|L\|XL>` and `--check-script=<path>`. The check script must produce GOAL_PROOF-compatible output (see `docs/guides/goal-proof-protocol.md`). Without a script there is no way for the evaluator to verify your custom objective." |
| Fallback | Provide both flags, or use a built-in alias |
| Logs to runs/ | No (preview-time refusal) |
| Reference | `docs/guides/goal-command.md` §custom |

## REFUSE_UNTRUSTED_WORKSPACE

| | |
|---|---|
| Triggers | Workspace trust has not been granted in Claude Code (required for hooks, which `/goal` depends on) |
| Message | "`/nacl-goal` requires workspace trust, which `/goal` uses for its hook-based evaluator. Accept the trust dialog (`Esc` → workspace trust) and re-run." |
| Fallback | Accept the workspace trust dialog |
| Logs to runs/ | No (cannot write run file without trust) |
| Reference | Claude Code 2.1.139 release notes |

## REFUSE_HOOKS_DISABLED

| | |
|---|---|
| Triggers | The user has disabled hooks globally or for this workspace |
| Message | "`/nacl-goal` cannot run with hooks disabled — the runtime gate detector and stop-signal probe both depend on PostToolUse hooks. Re-enable hooks in `.claude/settings.json` and re-run." |
| Fallback | Re-enable hooks |
| Logs to runs/ | No |
| Reference | `docs/guides/goal-permissions.md` |

## REFUSE_CONCURRENT_GOAL_LOCKED

| | |
|---|---|
| Triggers | A node in this alias's `lock_scope` already has `goal_lock_until > now` set in the graph |
| Message | "`/nacl-goal <alias>` is already running under `run_id=<id>` (started at `<ts>`, lock expires at `<ts>`). Two concurrent runs over the same scope would corrupt the run file and double-spend tokens. Either wait, or run `/nacl-goal abort <run_id>` if you believe the lock is stale." |
| Fallback | Wait, or `/nacl-goal abort <run_id>` |
| Logs to runs/ | Yes (separate refused-due-to-lock entry, references blocking run_id) |
| Reference | Architecture §7 |

## REFUSE_DANGEROUSLY_SKIP_PERMISSIONS

| | |
|---|---|
| Triggers | Session was started with `--dangerously-skip-permissions` |
| Message | "`/nacl-goal` will not run when permissions are bypassed. The denylist (`git push`, `gh pr merge`, production mutations, secret-file writes) depends on the standard permission gate to enforce. Restart the session without `--dangerously-skip-permissions`." |
| Fallback | Restart Claude Code without the flag |
| Logs to runs/ | No |
| Reference | `docs/guides/goal-permissions.md` |

---

## Behavior contract for refusals

1. Refusals MUST name the specific gate they fired on, by ID from
   `nacl-tl-core/references/gate-fire-catalog.md` where applicable.
2. Refusals MUST offer a fallback. A flat "no" is not acceptable.
3. Where a "split-mode" path exists (interactive skill → wrapper), the
   refusal message MUST print the copy-paste command for the
   interactive path.
4. Tier-C refusals fire at **preview** time wherever statically
   possible (i.e. by alias identity). The runtime gate detector only
   exists to catch dynamic crossings that static resolution missed.
5. Refusal codes are part of the wire format. Renaming or removing a
   code is a major version bump for `/nacl-goal`.

---

# /nacl-goal intake-alias block codes (2.10.1)

The `intake` alias adds two new code families distinct from the `REFUSE_*`
codes above. They are SCOPED TO `intake` — none of them apply to `wave`,
`fix`, `validate`, or `reopened-drain`.

- `PLAN_BLOCKED_*` — fired BEFORE `/goal` is issued (precheck, classify,
  lock, strict pre-flight). Logged to `.tl/goal-runs/<run_id>/` if a
  run_id was assigned before the refusal; otherwise printed only.
  Index entry (when present) is set to `state: plan_blocked, resumable:
  false, reason: <code>`.
- `GOAL_BLOCKED_*` — fired DURING the `/goal` loop, by the check script
  emitting `result: GOAL_BLOCKED` with the matching sub-reason in
  `evidence`. Index entry is set to `state: goal_blocked, resumable:
  <per resumable state table in run-artifacts.md>, reason: <code>`.

All entries include a copy-paste fallback.

**Rendering rule — how to surface ANY refusal to the user.** Lead with the
plain-language `Message` field (the "why this goal cannot be safely driven
autonomously" copy), immediately followed by the copy-paste fallback. The
`PLAN_BLOCKED_*` / `GOAL_BLOCKED_*` code is wire-format: it may appear only as
a trailing tag on the last line (e.g. `— PLAN_BLOCKED_DIRTY_WORKTREE`), NEVER
as the headline. Never surface internal step numbers (`step 0`, `step 3`) or
tier vocabulary (`Tier-C`) in user-facing text. The code stays verbatim in the
PR body (`pr-body-template.md`) — that is a reviewer surface, not the local
user's console. See `feedback-autonomy-default-ux.md`.

---

## PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED

| | |
|---|---|
| Triggers | Flow step 0 detects that `.tl/goal-runs/` and/or `.tl/exceptions/goal-runs/` are NOT in the project's effective `.gitignore` |
| Message | "`/nacl-goal intake` refuses to write run artifacts because they would be committable. The wrapper's `request.json` contains your email, the full free-text goal, image references, and your project path — all PII. Add the following lines to your `.gitignore` and re-run:\n\n```\n# /nacl-goal wrapper run state and PII\n.tl/goal-runs/\n.tl/exceptions/goal-runs/\n```\n\nIn 2.10.2+, `/nacl-goal intake --auto-patch-gitignore` will append these for you." |
| Fallback | Manually append the two lines to `.gitignore`; re-run `/nacl-goal intake "<goal>"` |
| Logs to runs/ | No — refusal fires before any artifact write |
| Reference | `nacl-goal/run-artifacts.md` §Privacy |

## PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION

| | |
|---|---|
| Triggers | The current working tree is checked out on `main`, `master`, or a `release/*` branch |
| Message | "`/nacl-goal intake` refuses to run from a production branch (`<branch>`). The orchestrator pushes commits to a feature branch and opens a PR — running from `main` would mix in-progress goal-run commits with the production history. Check out a working branch (or just create a new one) and re-run." |
| Fallback | `git checkout -b feature/work-area && /nacl-goal intake "<goal>"` |
| Logs to runs/ | No |
| Reference | `nacl-goal/SKILL.md` Flow step 3 |

## PLAN_BLOCKED_DIRTY_WORKTREE

| | |
|---|---|
| Triggers | `git status --porcelain` is non-empty at precheck |
| Message | "`/nacl-goal intake` refuses to start with uncommitted changes in the working tree (`<file count>` files modified/added/deleted/untracked). The orchestrator captures a regression baseline against the current code and would otherwise conflate your uncommitted work with the goal-run diff. Commit, stash, or revert your changes and re-run." |
| Fallback | `git stash -u` (includes untracked) OR commit your work; then re-run |
| Logs to runs/ | No |
| Reference | `nacl-goal/SKILL.md` Flow step 3 |

## PLAN_BLOCKED_BASELINE_RED

| | |
|---|---|
| Triggers | Step 3 baseline capture: `(exit_code != 0 AND collected_count == 0)` OR `(collected_count > 0 AND passed_count == 0)` |
| Message | "`/nacl-goal intake` refuses to start because the test baseline is broken (`<reason>`). Without a green-ish baseline the wrapper cannot detect regressions caused by the goal-run, so an autonomous run would be unsafe. Fix the baseline (or stabilize the runner) and re-run.\n\nBaseline command: `<resolved command>`\nExit code: `<code>`, collected: `<N>`, passed: `<N>`." |
| Fallback | Fix the baseline interactively; then re-run |
| Logs to runs/ | Yes — partial `regression-baseline.json` retained at `.tl/goal-runs/<run_id>/` for debugging |
| Reference | `nacl-goal/regression-schema.md` §PLAN_BLOCKED_BASELINE_RED semantics |

## PLAN_BLOCKED_BASELINE_COMMAND_MISSING

| | |
|---|---|
| Triggers | Step 3 baseline resolution chain exhausted without finding a test command (config.yaml → package.json → pyproject → known defaults) |
| Message | "`/nacl-goal intake` cannot find a test command to capture a regression baseline against. Looked in: `config.yaml → test.baseline_command`, `package.json → scripts.test`, `pyproject.toml`/Poetry. None defined a runnable test command. Add one of these and re-run:\n\n- `config.yaml`: `test: { baseline_command: \"<your test cmd>\" }`\n- `package.json`: `\"scripts\": { \"test\": \"<your test cmd>\" }`" |
| Fallback | Add `test.baseline_command` to `config.yaml` or `scripts.test` to `package.json` |
| Logs to runs/ | No |
| Reference | `nacl-goal/SKILL.md` Flow step 3 |

## PLAN_BLOCKED_GH_AUTH_OR_CI_PERMISSION_MISSING

| | |
|---|---|
| Triggers | `gh auth status` fails OR `gh` lacks permission to read/write PRs and Actions runs on the current repo |
| Message | "`/nacl-goal intake` needs `gh` CLI authenticated with permission to read CI runs and create PRs on this repo. Detected: `<gh auth status output snippet>`. Run `gh auth login` (or refresh the token's scopes) and re-run." |
| Fallback | `gh auth login` with `repo,workflow` scopes |
| Logs to runs/ | No |
| Reference | `nacl-goal/SKILL.md` Flow step 3 |

## PLAN_BLOCKED_STAGING_REQUIRED_BUT_MISSING

| | |
|---|---|
| Triggers | `config.yaml → deploy.staging.url` is absent AND user did not pass `--target=dev-only` |
| Message | "`/nacl-goal intake` defaults to staging delivery, but this project's `config.yaml` does not define `deploy.staging.url`. Two ways forward:\n\n1. If you have staging, add `deploy: { staging: { url: \"https://...\", health_endpoint: \"/api/health\" } }` to `config.yaml`, then re-run.\n2. If you intend dev-only verification (PR open + tests green, NO staging delivery claim), re-run with `--target=dev-only`." |
| Fallback | Either option above |
| Logs to runs/ | No |
| Reference | `nacl-goal/SKILL.md` Flow step 2 |

## PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION

| | |
|---|---|
| Triggers | `/nacl-tl-intake --emit-state` reports `classification_metadata.ambiguous: true`, or classify-step detects contradictory atoms (e.g. one atom implies a fix to UC-X, another implies removing UC-X) |
| Message | "`/nacl-goal intake` could not classify your goal unambiguously: `<ambiguity reason from intake>`. Possible interpretations:\n\n- `<interpretation 1>`\n- `<interpretation 2>`\n\nRe-run with a more specific goal, OR run `/nacl-tl-intake \"<goal>\"` interactively to resolve the ambiguity step by step, then re-run `/nacl-goal intake \"<resolved goal>\"`." |
| Fallback | `/nacl-tl-intake "<goal>"` interactively; or rewrite the goal |
| Logs to runs/ | Yes — `intake.json` retained for inspection |
| Reference | `nacl-goal/SKILL.md` Flow step 4 |

## PLAN_BLOCKED_PLAN_SPLIT_REQUIRED

| | |
|---|---|
| Triggers | Classify-step detects a plan that would require multiple PRs to ship safely. Concrete criteria: atoms touch >1 top-level module AND no dependency path connects the groups AND total atoms ≥3; OR atoms require incompatible release targets; OR atoms mix normal feature-branch with hotfix/release routing; OR atoms imply mutually exclusive hard-refuse policies. |
| Message | "`/nacl-goal intake` would need to split this goal across multiple PRs to ship safely (reason: `<which criterion>`). One goal-run produces one PR; multi-PR orchestration is out of scope in 2.10.1. Either split the goal into separate `/nacl-goal intake` invocations yourself, OR run `/nacl-tl-intake \"<goal>\"` interactively to decide the breakdown.\n\nOffending atom set: `<list>`." |
| Fallback | Split the goal manually and run each piece separately, OR `/nacl-tl-intake` interactively |
| Logs to runs/ | Yes — `intake.json` and `plan.lock.json` retained |
| Reference | `nacl-goal/SKILL.md` Flow step 4 §PLAN_SPLIT_REQUIRED criterion |

## PLAN_BLOCKED_ATOM_DEPENDENCY_CYCLE

| | |
|---|---|
| Triggers | Step 5 topological sort detects a cycle in atom `depends_on` edges |
| Message | "`/nacl-goal intake` detected a circular dependency in the classified atoms: `<atom-A> → <atom-B> → <atom-A>`. This is almost always a classification bug. Re-run with `--plan-only` to inspect `intake.json`, OR run `/nacl-tl-intake` interactively to manually break the cycle." |
| Fallback | `/nacl-goal intake "<goal>" --plan-only` to inspect; or `/nacl-tl-intake` interactively |
| Logs to runs/ | Yes — `intake.json` and (partial) `plan.lock.json` retained |
| Reference | `nacl-goal/SKILL.md` Flow step 5 |

## PLAN_BLOCKED_FEATURE_REQUIRES_SCHEMA_MIGRATION

| | |
|---|---|
| Triggers | Classify-step detects `hard_refuse_triggers` ∈ {`schema_migration`, `public_api_contract`} on any atom |
| Message | "`/nacl-goal intake` refuses to autonomously execute work that includes a schema migration or public-API contract change. Trigger evidence: `<atom.trigger_evidence>`. Migrations and contract changes require deliberate review (compatibility, rollout order, downgrade path) that the orchestrator cannot make automatically.\n\nRun `/nacl-sa-feature` interactively to draft the spec amendment, then `/nacl-tl-dev` to implement, then `/nacl-tl-deliver`." |
| Fallback | Interactive `/nacl-sa-feature` → `/nacl-tl-dev` → `/nacl-tl-deliver` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/plan-lock-schema.md` §hard_refuse_triggers |

## PLAN_BLOCKED_FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE

| | |
|---|---|
| Triggers | Classify-step detects `hard_refuse_triggers` ∈ {`auth_or_security`, `permissions`} on any atom |
| Message | "`/nacl-goal intake` refuses to autonomously execute work that touches authentication, security, or permissions. Trigger evidence: `<atom.trigger_evidence>`. These changes require human review of attack surface and rollout — running them autonomously would be unsafe.\n\nRun `/nacl-sa-feature` interactively for the spec, then implement with a human in the loop, then `/nacl-tl-deliver`." |
| Fallback | Interactive `/nacl-sa-feature` → human-in-loop implementation → `/nacl-tl-deliver` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/envelope.md` §Hard-refuse list |

## PLAN_BLOCKED_FEATURE_REQUIRES_PRODUCT_DECISION

| | |
|---|---|
| Triggers | Classify-step detects `hard_refuse_triggers` ∈ {`billing`, `destructive_data_operation`, `l2_l3_architecture`, `product_decision_required`} on any atom |
| Message | "`/nacl-goal intake` refuses to autonomously execute work that requires a product decision (`<trigger>`). Trigger evidence: `<atom.trigger_evidence>`. The orchestrator can implement options once chosen but cannot choose between them.\n\nRun `/nacl-sa-feature` interactively to capture the decision points, then re-run `/nacl-goal intake \"<resolved spec ID>\"` for the implementation." |
| Fallback | Interactive `/nacl-sa-feature`; then `/nacl-goal intake` on the resolved spec |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/envelope.md` §Hard-refuse list |

## PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION

| | |
|---|---|
| Triggers | Classify-step types any atom as `FEATURE_HEAVY` (no hard_refuse trigger but the feature is too large/ambiguous for `--bounded-only` mode) |
| Message | "`/nacl-goal intake` classified `<N>` atom(s) as FEATURE_HEAVY — too large for autonomous bounded execution in 2.10.1. The wrapper has written planning artifacts to help you decide the breakdown:\n\n- `.tl/goal-runs/<run_id>/planning/feature-plan.md` — what we understood, candidate UCs, suggested module placement\n- `.tl/goal-runs/<run_id>/planning/open-decisions.md` — explicit decision points\n\nRun `/nacl-sa-feature` interactively using these artifacts as input, then re-run `/nacl-goal intake \"<resolved spec ID>\"`." |
| Fallback | Review planning artifacts, then interactive `/nacl-sa-feature` |
| Logs to runs/ | Yes — `planning/` populated |
| Reference | `nacl-goal/SKILL.md` Flow step 4 |

## PLAN_BLOCKED_DUPLICATE_GOAL_USE_NEW_RUN

| | |
|---|---|
| Triggers | Step 1 fingerprint matches an `index.json` entry with `state: goal_ok` AND `--new-run` was not passed |
| Message | "This exact goal already completed successfully: run `<run_id>`, PR `<pr_url>`. Re-running would create a duplicate. If you want to retry the work (e.g. revert and redo), re-invoke with `--new-run`. Note that `--new-run` does NOT close or reuse the prior PR in 2.10.1 — you'll get a new branch and a new PR." |
| Fallback | `/nacl-goal intake "<goal>" --new-run` if you really want to redo it |
| Logs to runs/ | No (no new run created) |
| Reference | `nacl-goal/run-artifacts.md` §Re-invocation rules |

## PLAN_BLOCKED_INDEX_LOCK_BUSY

| | |
|---|---|
| Triggers | `flock --timeout 30` on `.tl/goal-runs/index.lock` failed (another `/nacl-goal intake` process holds the exclusive lock for ≥30s) |
| Message | "Another `/nacl-goal intake` invocation is holding the run-index lock. This is a transient — wait a moment and re-run. If you suspect a stale lock (e.g. previous Claude process crashed mid-flock), inspect `.tl/goal-runs/index.lock` and remove it manually." |
| Fallback | Wait and retry; if stale, `rm .tl/goal-runs/index.lock` |
| Logs to runs/ | No (no new run created) |
| Reference | `nacl-goal/run-artifacts.md` §Index lock |

## PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW

| | |
|---|---|
| Triggers | `--strict` was passed AND step 6 pre-flight predicts at least one atom would hit a gate that the default envelope normally pre-authorizes |
| Message | "`/nacl-goal intake --strict` predicts this plan would halt at gate(s): `<gate names>`. Strict mode disables the default safe-exception envelope, so the wrapper would stop mid-flow asking for human authorization — defeating the purpose of an autonomous run. Two ways forward:\n\n1. Drop `--strict` to let the wrapper materialize the standard signed exceptions (audit retained at `.tl/exceptions/goal-runs/<run_id>/`).\n2. Run the inner skill interactively:\n   `<copy-paste interactive invocation per atom>`" |
| Fallback | Either drop `--strict`, or run interactive `/nacl-tl-fix` / `/nacl-tl-dev` per atom |
| Logs to runs/ | Yes — `plan.lock.json` retained (planning was successful; only execution was refused) |
| Reference | `nacl-goal/gate-prediction.md` |

---

## GOAL_BLOCKED_ATOM_FAILED

| | |
|---|---|
| Triggers | Inner skill (`/nacl-tl-fix`, `/nacl-tl-dev`, `/nacl-sa-feature --bounded-only`) returned a non-shippable status while implementing an atom |
| Message | "Atom `<atom_id>` failed during implementation: `<error from state.json>`. The goal-run is halted; the branch and any verified atoms remain. Inspect `<state.json path>` for the inner skill's exit detail. Re-run requires `--new-run` after manual investigation." |
| Fallback | Investigate the atom failure; either fix manually and re-run with `--new-run`, OR adjust the goal and re-run with `--new-run` |
| Logs to runs/ | Yes; `state.json.state = "failed"` |
| Reference | `nacl-goal/SKILL.md` Flow step 9 |

## GOAL_BLOCKED_CI_FAILED

| | |
|---|---|
| Triggers | `/nacl-tl-deliver` reports CI status `failure`, OR the wrapper exhausted retries on `gh` API queries (`gh_api_unavailable` sub-reason) |
| Message | "CI failed for the goal-run PR: `<pr_url>`. The failing checks are visible in the GitHub Actions run linked from the PR. Either fix CI on the existing branch and let `/nacl-tl-deliver` re-run, or re-invoke with `--new-run` after the fix." |
| Fallback | Inspect the failing CI run on GitHub; fix; re-run `/nacl-tl-deliver` manually OR `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/retry-policy.md` §Terminal failure mapping |

## GOAL_BLOCKED_STAGING_UNHEALTHY

| | |
|---|---|
| Triggers | After deliver, `curl <deploy.staging.url><health_endpoint>` returned non-200 across all retries (3× with 5s/15s/45s backoff), OR connection failed across all retries |
| Message | "Staging deploy completed but the health check at `<url>` did not return 200 OK after 3 retries. The PR was opened and CI passed, but autonomous delivery cannot claim success without a healthy stand. Re-run requires `--new-run` after diagnosing the staging health failure." |
| Fallback | Diagnose staging health (check logs, deploy pipeline); fix; `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/SKILL.md` Flow step 11 |

## GOAL_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION

| | |
|---|---|
| Triggers | DURING execution, `/nacl-sa-feature --bounded-only` discovers a product decision that classify-step did not catch (e.g. the spec exploration uncovered a hard-refuse trigger in a referenced UC) |
| Message | "While implementing atom `<atom_id>`, `/nacl-sa-feature --bounded-only` discovered an issue requiring a product decision: `<reason>`. Planning artifacts written to `.tl/goal-runs/<run_id>/planning/`. Re-run requires `--new-run` after the decision is made interactively." |
| Fallback | Review planning artifacts; interactive `/nacl-sa-feature`; `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes — `planning/` populated mid-run |
| Reference | `nacl-goal/SKILL.md` Flow step 9 |

## GOAL_BLOCKED_BUDGET_EXHAUSTED

| | |
|---|---|
| Triggers | Wrapper detects `now() - budget.started_at >= wall_clock_limit_seconds` (default 3h for Tier M) before an atom or deliver step |
| Message | "Goal-run budget exhausted: wall-clock limit `<limit>` reached. Current state: `<atoms_implemented>/<atoms_total>` atoms verified. Re-run requires `--new-run` (or `--budget=<larger profile>` if you want more headroom). Note that turn/token budgets are best-effort in 2.10.1 — only wall-clock is enforceable." |
| Fallback | `/nacl-goal intake --new-run` (optionally with `--budget=...`) |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/plan-lock-schema.md` §budget.json |

## GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED

| | |
|---|---|
| Triggers | Step 12 mechanical regression diff is non-empty (new failures, baseline-pass now failing, or baseline-pass now skipped) |
| Message | "Post-deliver regression check found `<N>` test(s) that regressed (`<N1>` new failures, `<N2>` baseline-passing now failing, `<N3>` baseline-passing now skipped). Mode: `<stable_ids|best_effort>`. See `.tl/goal-runs/<run_id>/regression-diff.json` for the full list. The PR remains open for manual review. Re-run requires `--new-run` after fixing or accepting the regression." |
| Fallback | Review the regression diff; fix; `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes — `regression-diff.json` written |
| Reference | `nacl-goal/regression-schema.md` |

## GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER

| | |
|---|---|
| Triggers | PRE-DELIVER (step 10) OR POST-DELIVER (step 11.5) drift check finds `branch_head_sha != goal_final_sha` OR `pr_head_sha != goal_final_sha` |
| Message | "The goal-run branch (`<branch>`) drifted from the SHA the wrapper froze at deliver time. Frozen `goal_final_sha`: `<sha>`. Current branch HEAD: `<sha>`. Current PR head: `<sha>`. Something (you, another process, a teammate) pushed to the branch during the deliver window. The PR remains as-is; the wrapper cannot safely claim staging delivery for a SHA it didn't verify.\n\nRe-run requires `--new-run` after deciding what to do with the drift." |
| Fallback | Investigate the drift; reset the branch if appropriate; `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/SKILL.md` Flow steps 10 + 11.5 |

## GOAL_BLOCKED_DEPLOYED_SHA_MISMATCH

| | |
|---|---|
| Triggers | `config.yaml → deploy.staging.version_endpoint` is configured AND the SHA returned by `curl <url><version_endpoint>` does not equal `goal_final_sha` |
| Message | "Staging health is 200 OK, but the deployed SHA reported by `<url><version_endpoint>` is `<sha>` — different from the PR head SHA `<goal_final_sha>`. Either the deploy pipeline served a stale build, or the wrong artifact was promoted. The wrapper cannot claim successful staging delivery for a SHA that isn't running.\n\nRe-run requires `--new-run` after the deploy pipeline serves the correct SHA." |
| Fallback | Investigate the deploy pipeline; redeploy if needed; `/nacl-goal intake --new-run` |
| Logs to runs/ | Yes |
| Reference | `nacl-goal/SKILL.md` Flow step 13 |

---

## Block-code lifecycle invariants

1. Block codes are part of the wire format. Renaming or removing a code is
   a major version bump for `/nacl-goal`.
2. Every block code MUST appear in `intake.sh`'s evidence emission table
   when the corresponding sub-reason is detected. If the check script
   reports a `result: GOAL_BLOCKED` without a matching code in its
   evidence, the evaluator treats the run as `GOAL_BLOCKED_UNKNOWN`
   (which is itself a bug to be fixed in the check script).
3. New block codes added in future point releases (2.10.2+, etc.) MUST be
   documented here in the same PR.

