---
name: nacl-goal
model: opus
effort: high
description: |
  Safety-first wrapper around Anthropic's /goal command. Resolves a high-level
  NaCl alias into a deterministic GOAL_PROOF completion condition that the
  transcript-only evaluator can actually verify. Two UX modes coexist:
  preview-by-default for the 2.10.0 aliases (wave / fix / validate /
  reopened-drain); autonomy-by-default for the 2.10.1 `intake` orchestrator
  alias (free-text/image goal → classified atoms → one PR → CI → staging).
  Use when: running a long NaCl loop autonomously, or the user says "/nacl-goal".
---

## Contract

**Inputs this skill consumes:**

- `<alias>` — required positional. One of the named aliases from `nacl-goal/aliases.md`
  (`wave:<N>`, `fix:<BUG-NNN>`, `validate:<MOD-ID>`, `reopened-drain`, `intake`, `custom`),
  or the special invocations `resume` and `abort <run_id>`.
- `--start` — optional flag. Without it the **preview-mode aliases** (`wave`, `fix`,
  `validate`, `reopened-drain`, `custom`) run in preview/dry-run mode only. The
  `intake` alias has the inverse default: autonomy ON, with `--plan-only` as the
  opt-out (see §`intake` alias UX below).
- `--tier=<S|M|L|XL>` — optional override for `custom` alias (mandatory for custom).
- `--check-script=<path>` — path to executable check script for `custom` alias (mandatory for custom).
- `--description="<one line>"` — optional label recorded in the run file.
- `intake`-only opt-out flags: `--plan-only`, `--strict`, `--target=<staging|dev-only>`, `--new-run`. See §`intake` alias UX.

**Outputs this skill produces:**

- Without `--start`: a preview block containing the full resolution: alias, tier, soft budget,
  check_script path, GOAL_PROOF template, human gates, permissions denylist, and (for Tier L/XL)
  estimated dollar cost from `nacl-goal/pricing.json`. The exact `--start` command to copy-paste.
- With `--start` (2.10.0, Tier S/M): a warning that autonomous execution is 2.10.1 functionality,
  then issues `/goal` with the composed condition. Does NOT produce a `.tl/goal-runs/` file in 2.10.0.
- With `--start` (2.10.0, Tier L/XL): structured refusal `REFUSE_TIER_NOT_YET_ENABLED`.
- Refusal block (any tier, any phase) when a Tier-C gate is detected statically.

**Downstream consumers of this output:**

- Human user (preview, refusal, run summary)
- `.tl/goal-runs/` — run files written on `--start` (enforced from 2.10.1)

---

## Two-phase invocation (Architecture §2)

`/goal` starts a turn immediately on invocation. The preview/confirm UX lives
outside `/goal`, in this wrapper:

```
/nacl-goal <alias>            # preview only — no /goal issued, no turn consumed
/nacl-goal <alias> --start    # issues /goal with composed GOAL_PROOF condition
```

### Preview output must include all of:

1. Resolved alias name and canonical form
2. Tier and full soft budget (turns, hours, observed token target) from the tier table below
3. `check_script` path and how it is invoked each turn
4. Completion condition verbatim (including the GOAL_PROOF instruction block)
5. Human gates that would block this alias (or `"none detected"`)
6. Permissions denylist that will be enforced
7. For Tier L/XL: estimated dollar cost at current model pricing from `nacl-goal/pricing.json`
8. The exact `--start` command to copy-paste

### --start behavior in 2.10.0

- **Tier S / Tier M:** Issues `/goal` with the composed GOAL_PROOF condition, but emits this
  warning before doing so:

  ```
  WARNING (2.10.0): Autonomous execution via /nacl-goal --start is 2.10.1 functionality.
  In 2.10.0, /goal is issued but .tl/goal-runs/ write, concurrent-execution lock,
  crash/resume, and runtime gate detector are NOT active. Run interactively and monitor.
  ```

- **Tier L / Tier XL:** Refuses with `REFUSE_TIER_NOT_YET_ENABLED`:

  ```
  REFUSE_TIER_NOT_YET_ENABLED
  Tier L and XL autonomous execution is not enabled in 2.10.0.
  Use /nacl-goal <alias> (preview) to inspect the plan.
  Autonomous Tier L/XL arrives in 2.10.1.
  ```

---

## Tier table — v0 calibration defaults (Architecture §13)

All three columns are soft. `/goal` cannot hard-enforce them. A true hard cap
requires an external runner or Stop-hook script (future work, 2.10.2+).
Do not run XL unattended overnight in 2.10.0 or 2.10.1.

| Tier | turns_soft | wall_clock_soft | observed_token_target |
|------|------------|-----------------|----------------------|
| S    | 150        | 2 h             | 3,000,000            |
| M    | 500        | 6 h             | 8,000,000            |
| L    | 1,200      | 16 h            | 20,000,000           |
| XL   | 3,000      | 36 h            | 50,000,000           |

Turn and wall-clock are surfaced through GOAL_PROOF every turn and trigger
`GOAL_BUDGET_EXHAUSTED` via the in-condition instruction. To be calibrated in
2.10.2 from aggregated `.tl/goal-runs/`.

---

## GOAL_PROOF protocol (Architecture §1)

Every alias generates a `/goal` condition that instructs the primary session
to run the alias check script at the end of every turn and print a block of
this exact shape immediately after the raw command output:

```
GOAL_PROOF
alias: <alias>
tier: <S|M|L|XL>
check_command: <exact shell command run this turn>
result: GOAL_OK | GOAL_NOT_OK | GOAL_BLOCKED | GOAL_BUDGET_EXHAUSTED
evidence:
  - <key>: <value>
  - <key>: <value>
turns_so_far: <int>
observed_tokens: <int>
elapsed: <duration>
END_GOAL_PROOF
```

The evaluator (Haiku 4.5 by default) is transcript-only — it cannot run
tools, read files, or execute commands. GOAL_PROOF surfaces machine-checkable
state into the transcript so the evaluator's only job is: "did the last block
have result == GOAL_OK AND does .tl/goal-runs/<run_id>.md exist."

This block is a wire format. Field renames and delimiter changes are major
version bumps. No narrative is permitted between the command output and the
GOAL_PROOF block. See `docs/guides/goal-proof-protocol.md` for full schema,
semantics, and examples.

---

## Alias resolution and check scripts (Architecture §3)

Aliases and their binding contracts are defined in `nacl-goal/aliases.md`.
Do not duplicate alias definitions here — reference that file.

Check scripts shipped in 2.10.0 (stubs; truth-source wiring in progress):

```
nacl-goal/checks/wave.sh             <N>
nacl-goal/checks/fix.sh              <BUG-NNN>
nacl-goal/checks/validate.sh         <MOD-ID>
nacl-goal/checks/reopened-drain.sh
```

Check scripts shipped in 2.10.1 (`intake` ships in PR1; the others remain deferred):

```
nacl-goal/checks/intake.sh           --run-id <goal-run-id>     # ✅ PR1
nacl-goal/checks/stubs-cleanup.sh    <MOD-ID>                   # deferred
nacl-goal/checks/migrate-canary.sh                              # deferred
nacl-goal/checks/feature.sh          <FR-NNN>                   # deferred
nacl-goal/checks/probe-stop-signals.sh   (invoked each turn)    # deferred
```

Every check script:

- Takes its positional args per the contract in `nacl-goal/aliases.md`
- Reads its truth source directly (graph via Cypher, registry file, YouGile API, test runner)
- Prints stable, grep-friendly output followed immediately by a GOAL_PROOF block
- Always exits 0 — the evaluator cannot see exit codes; GOAL_PROOF carries the actual status

---

## Structured refusal flow (Architecture §5)

Tier-C refusals fire at preview time wherever statically possible (by alias identity).
The runtime gate detector catches dynamic crossings (2.10.1).

Every refusal must:

1. Name the specific gate by its `REFUSE_*` code from `nacl-goal/refusal-catalog.md`
2. Cross-reference `nacl-tl-core/references/gate-fire-catalog.md`
3. Offer a split-mode suggestion (interactive skill then wrapper)
4. Print copy-paste commands for the interactive path

User-facing rendering follows the rendering rule in `nacl-goal/refusal-catalog.md`:
lead with the plain-language reason + copy-paste fallback; the gate code is a
trailing tag, not the headline; and step numbers / `Tier-C` never appear in
user-facing text. (Items 1–2 above are satisfied by the trailing tag and the
internal cross-reference — they are not the headline.)

Refusal codes (full catalog in `nacl-goal/refusal-catalog.md`):

```
REFUSE_HUMAN_GATE_BA_SA_HANDOFF
REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION
REFUSE_HOTFIX_JUDGMENT
REFUSE_POST_CANARY_RETROSPECTIVE
REFUSE_PRODUCTION_MUTATION
REFUSE_UNTIERED_CUSTOM_GOAL
REFUSE_UNTRUSTED_WORKSPACE
REFUSE_HOOKS_DISABLED
REFUSE_CONCURRENT_GOAL_LOCKED
REFUSE_DANGEROUSLY_SKIP_PERMISSIONS
REFUSE_TIER_NOT_YET_ENABLED
```

Refusal codes are part of the wire format. Renaming or removing a code is a
major version bump for `/nacl-goal`.

---

## Permissions denylist (Architecture §6)

`/nacl-goal` runs only in default permissions with explicit approvals, OR in
auto mode with the NaCl allowlist active.

Full text in `docs/guides/goal-permissions.md`. Brief summary:

**Never allowed under any alias:**

- `--dangerously-skip-permissions` (triggers `REFUSE_DANGEROUSLY_SKIP_PERMISSIONS`)
- Any mode that disables hooks (triggers `REFUSE_HOOKS_DISABLED`)
- Any workspace where workspace trust is not granted (`REFUSE_UNTRUSTED_WORKSPACE`)
- `git push` to any remote
- `git merge` into `main`, `master`, or `release/*`
- Any release-publishing action (`npm publish`, `gh release create`, etc.)
- Production DB migrations
- `rm -rf` outside the current workspace
- Editing `.env*`, secrets, credentials, `.ssh/`, `~/.aws/`, `~/.config/gh`
- Changing CI/CD configuration or credentials
- Calling third-party paid APIs with side effects beyond test budget

**Per-alias allowlist (positive grants):**

- Local test execution
- Graph reads and writes scoped to current project
- Branch commits
- `gh pr create` (but never `gh pr merge`)
- YouGile column moves within the project board

---

## Custom alias (Architecture §12)

```
/nacl-goal custom \
  --tier=<S|M|L|XL>            # mandatory
  --check-script=<path>         # mandatory; must exist, be executable,
                                # and produce GOAL_PROOF-compatible output
  --description="<one line>"    # recorded in run file
  --start                       # must be a separate invocation
```

Custom without `--check-script` returns `REFUSE_UNTIERED_CUSTOM_GOAL`.
Custom without `--tier` returns `REFUSE_UNTIERED_CUSTOM_GOAL`.
Custom may not target paths matching the Tier-C catalog in
`nacl-goal/gate-fire-detector.md`.

---

## `intake` alias (2.10.1 — autonomous goal orchestrator)

`intake` is the FIRST alias with `default_mode: autonomous`. Where the four
2.10.0 aliases (`wave`, `fix`, `validate`, `reopened-drain`) require an
explicit `--start` to issue `/goal`, `intake` issues `/goal` by default and
provides opt-outs for previewing or strict mode.

This is intentional UX: `/nacl-goal intake "<goal>"` should be the short,
normal invocation. The user shouldn't need to remember internal flags or
gate names to drive a goal autonomously to a staging stand. See
[[feedback-autonomy-default-ux]] for the design rationale.

### `intake` UX

```
/nacl-goal intake "<goal>"

Default behavior:
  • autonomous execution is ON
  • standard safe-exception envelope is ON (see nacl-goal/envelope.md)
  • target = staging if config.yaml → deploy.staging.url exists,
            otherwise PLAN_BLOCKED_STAGING_REQUIRED_BUT_MISSING
  • atoms BUG / TASK / FEATURE_SMALL run on a single goal-run branch, one PR
  • atoms FEATURE_HEAVY → PLAN_BLOCKED with planning artifacts (no silent split)

Opt-outs (each disables a slice of the default):
  --plan-only        write planning artifacts only; no /goal, no branch, no PR,
                     no exception YAML, no source-code changes
  --strict           disable default safe-exception envelope; pre-flight refuses
                     if plan predicts a gate would need envelope auto-authorization
                     (PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW)
  --target=staging   require staging (default)
  --target=dev-only  local verify + PR only; final message MUST NOT claim staging
                     delivery; dev_verified is asserted via local /nacl-tl-verify
  --new-run          force fresh run-id even if goal_fingerprint matches an existing
                     run; does NOT close or reuse prior PR in 2.10.1
  --budget=<profile> optional budget override (default Tier M: 200 turns / 3h / 4M tokens)
```

### `intake` Flow (14 steps)

The Claude session running `/nacl-goal intake` executes the following flow.
For per-file schemas see `nacl-goal/plan-lock-schema.md`. For artifact
locations and idempotence see `nacl-goal/run-artifacts.md`. For the
exception envelope see `nacl-goal/envelope.md`. For gate prediction see
`nacl-goal/gate-prediction.md`. For retry semantics see
`nacl-goal/retry-policy.md`. For regression diff see
`nacl-goal/regression-schema.md`.

```
0. PRIVACY / IGNORE PRECHECK
   verify .tl/goal-runs/ AND .tl/exceptions/goal-runs/ are gitignored
     (use `git check-ignore` from project_root)
   if either is NOT ignored:
     → PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED
   The 2.10.1 wrapper does NOT auto-patch .gitignore. The user must do it.
   Writing PII (user email, free-text goal, image refs) into a non-ignored
   directory is irreversible if the user pushes by accident.

1. INIT_RUN
   compute goal_fingerprint (see run-artifacts.md §Goal fingerprint)
   acquire flock on .tl/goal-runs/index.lock (timeout 30s; else
   PLAN_BLOCKED_INDEX_LOCK_BUSY)
   consult index.json per the re-invocation rules in run-artifacts.md
     (RESUME for transient interruptions; refuse for non-resumable terminal
      states unless --new-run)
   run_id = goal-intake-<utc-iso>-<short-hash>
   mkdir .tl/goal-runs/<run_id>/{atoms/, planning/}
   write request.json, budget.json
   append index.json entry (state: "init", resumable: true)
   atomic rename; release flock

2. RESOLVE_TARGET
   --target=staging or default + deploy.staging.url present → deploy_target = staging
   --target=dev-only                                        → deploy_target = dev-only (WARN)
   else                                                     → PLAN_BLOCKED_STAGING_REQUIRED_BUT_MISSING

3. PRECHECKS  (Tier-C; /goal not yet issued)
   dirty worktree              → PLAN_BLOCKED_DIRTY_WORKTREE
   on main/master/release/*    → PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION
   resolve baseline_command chain (config.yaml → package.json → pyproject → defaults)
     missing → PLAN_BLOCKED_BASELINE_COMMAND_MISSING
   capture regression-baseline.json per regression-schema.md
     PLAN_BLOCKED_BASELINE_RED only fires if
       (exit_code != 0 AND collected_count == 0)
       OR (collected_count > 0 AND passed_count == 0)
     i.e. zero-tests-collected runner error, or all-tests-failing.
   missing gh auth / CI perms  → PLAN_BLOCKED_GH_AUTH_OR_CI_PERMISSION_MISSING

4. CLASSIFY  (/nacl-tl-intake --yes --emit-state .tl/goal-runs/<run_id>/intake.json)
   atoms[] with: id, type, linked_uc, evidence, confidence, risk_level,
   depends_on, hard_refuse_triggers, trigger_evidence, spec_gap, skill_path.
   Refuse mapping (per plan-lock-schema.md §hard_refuse_triggers):
     billing | destructive | l2_l3 | product_decision → _FEATURE_REQUIRES_PRODUCT_DECISION
       (or _FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION if FEATURE)
     schema_migration | public_api_contract           → _FEATURE_REQUIRES_SCHEMA_MIGRATION
     auth_or_security | permissions                   → _FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE
     hotfix_or_release_routing                        → REFUSE (interactive)
   FEATURE_HEAVY without trigger → write planning/feature-plan.md +
     planning/open-decisions.md → PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION
   ambiguous → PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION
   PLAN_BLOCKED_PLAN_SPLIT_REQUIRED fires when EITHER:
     (a) atoms touch >1 top-level module AND no dependency path connects the
         atom groups AND total atoms >= 3; OR
     (b) atoms require incompatible release targets; OR
     (c) atoms require both normal feature-branch and hotfix/release routing; OR
     (d) atoms imply mutually exclusive hard-refuse policies.

5. LOCK PLAN
   ATOM ID INVARIANT: atom.id is assigned here once and is immutable for the run.
     Form: atom-<short_sha256(type + linked_uc + normalized_title)[:12]>
     Resume reads plan.lock.json and atoms/*.state.json — never re-classifies.
   topological sort atoms by depends_on; cycle → PLAN_BLOCKED_ATOM_DEPENDENCY_CYCLE
   tie-break: BUG before FEATURE_SMALL, then by id lexicographically
   branch = feature/goal-<short-hash>
   write plan.lock.json, authorization.json
   write atoms/<atom_id>.state.json with state="pending" for each atom
   render initial PR body (per pr-body-template.md) to pr-body.md — WIP, atom table.
     /nacl-tl-ship will read this file when it opens the PR on the first push.
   index.json state: "planned", resumable: true (flock-protected, atomic rename)
   --plan-only: EXIT here

6. --STRICT PRE-FLIGHT (only when --strict)
   for each atom: predict which gates would fire via gate-prediction.md
     (uncertain prediction → block conservatively)
   if any predicted gate ∈ envelope.md §Auto-enabled gates:
     → PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW

7. MATERIALIZE EXCEPTION ENVELOPE (skipped if --strict)
   for each auto-enabled gate that the plan would hit:
     write .tl/exceptions/goal-runs/<run_id>/EXC-goal-<gate>.yaml
       owner: <git user.email>
       reason: pre-authorized; goal fingerprint + sanitized_preview only
         (full goal stays in gitignored request.json)
       expires: issued_at + 3h
   YAML sanitization rules per envelope.md §sanitized_preview (YAML-injection defense).

8. ISSUE /goal
   composed condition = success_condition (per aliases.md §intake) + budget envelope
     + run_id binding
   index.json state: "running", resumable: true
   open progress.jsonl (wrapper-level events only; inner-skill summaries flow
     through budget.json → inner_skill_runs[])

9. EXECUTE ON ONE BRANCH (atom-state-driven; same path for fresh run and resume)
   git checkout -b feature/goal-<short-hash>   (or fast-forward if RESUMED)
   ALWAYS re-export goal env vars at start of this step (resume safe):
     export NACL_GOAL_RUN_ID=<run_id>
     export NACL_GOAL_BRANCH=feature/goal-<short-hash>
     export NACL_SHIP_MODE=append
     export NACL_GOAL_BUDGET_FILE=<abs path to budget.json>
   for each atom in topological order:
     check budget.json wall-clock; if elapsed >= limit → GOAL_BLOCKED_BUDGET_EXHAUSTED
     skip if atoms/<atom_id>.state.json.state == "verified"
     transition: pending → implementing  (update state.json + progress.jsonl)
     BUG           → /nacl-tl-fix "<atom.title>" --auto-ship
     TASK          → /nacl-tl-dev <UC>           --auto-ship
     FEATURE_SMALL → /nacl-sa-feature <atom>     --bounded-only
                     followed by /nacl-tl-dev    --auto-ship
     on success: state.state="shipped", last_commit_sha=<HEAD>
                 append to budget.json inner_skill_runs[]
     run scoped verify; on PASS: state.state="verified"
     on failure: state.state="failed", error=...
                 index.json state: "goal_blocked", resumable: false
                 → GOAL_BLOCKED_ATOM_FAILED
     after each transition: re-render pr-body.md per pr-body-template.md
   The env vars instruct /nacl-tl-ship (PR2) to:
     • push to existing goal-run branch
     • create the goal-run PR on first push using pr-body.md; write pr.json
     • on subsequent pushes: append commits; update pr.json.head_sha; refresh body
     • do NOT create additional PRs
   without env vars, --auto-ship behaves exactly as today (no silent change).
   after last atom verified:
     goal_final_sha = HEAD of feature/goal-<hash>
     write goal-final-sha.txt
     render final PR body; refresh pr.json

10. PRE-DELIVER DRIFT CHECK
    branch_head_sha = git rev-parse HEAD
    pr_head_sha     = gh pr view --json headRefOid   (with retry-policy.md)
    if branch_head_sha != goal_final_sha OR pr_head_sha != goal_final_sha:
        index.json state: "goal_blocked", resumable: false
        → GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER

11. DELIVER
    deploy_target == staging  → /nacl-tl-deliver
       (gh run watch / staging health curl / functional verify wrapped per retry-policy.md)
    deploy_target == dev-only → run baseline_command + /nacl-tl-verify per linked UC locally
       set dev_verified accordingly; print PR URL
       final message MUST NOT claim staging delivery

11.5 POST-DELIVER DRIFT CHECK
    (CI + deliver windows are exactly when a stray push happens — re-check.)
    if branch_head_sha_now != goal_final_sha OR pr_head_sha_now != goal_final_sha:
        index.json state: "goal_blocked", resumable: false
        → GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER

12. POST-DELIVER REGRESSION CHECK (mechanical)
    re-run baseline_command; capture regression-postfix.json (same schema as baseline)
    regressions =
        (failed_now \ failed_baseline)                       # new failures
      ∪ (passed_baseline ∩ failed_now)                       # baseline-pass now failing
      ∪ (passed_baseline ∩ skipped_now)                      # baseline-pass now skipped
    no_new_regressions = (regressions == ∅)
    if not:
        index.json state: "goal_blocked", resumable: false
        → GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED (diff stored as artifact)
    If runner-to-test-ID extraction is unavailable for the resolved runner
    (regression-schema.md §unknown), no_new_regressions is computed best-effort
    AND this is disclosed in the emitted GOAL_PROOF (regression_check_mode).

13. OBSERVE & EMIT GOAL_PROOF  (intake.sh --run-id <run_id>)
    intake.sh reads only run artifacts + git + gh + curl per its arg schema.
    Emits sentinel-delimited GOAL_PROOF block (alias: intake; tier: M).

14. TERMINAL STATE
    GOAL_OK:
      EXC-goal-<run_id>-*.yaml stay in place at .tl/exceptions/goal-runs/<run_id>/
      append per-exception JSONL line → .tl/goal-runs/<run_id>/exceptions.log
      update PR body to final state; refresh pr.json
      index.json state: "goal_ok", resumable: false, ended_at: <ts>
      print PR URL + staging URL
    GOAL_BLOCKED / budget exhausted:
      leave artifacts and exception YAMLs in place
      index.json state: "goal_blocked" | "failed", resumable: <per state table>
      update PR body to "BLOCKED — <reason>"
      print user-facing reason + copy-paste fallback per refusal-catalog.md
        (lead with the reason; the code is a trailing tag, not the headline —
         see refusal-catalog.md "Rendering rule")
```

### Goal-context env vars (for `intake` inner-skill integration)

When `intake` invokes inner shipping skills (`/nacl-tl-fix --auto-ship`,
`/nacl-tl-dev --auto-ship`, `/nacl-tl-ship`), it exports the following env
vars that the inner skills recognize (added in PR2 of the 2.10.1
milestone):

| Variable | Meaning |
|---|---|
| `NACL_GOAL_RUN_ID` | The current run_id; used by inner skills to tag commits, exception lookups, log entries |
| `NACL_GOAL_BRANCH` | The goal-run feature branch name; ship target |
| `NACL_SHIP_MODE` | `append` — push to existing branch + reuse PR (don't open new ones) |
| `NACL_GOAL_BUDGET_FILE` | Absolute path to budget.json; inner skills append envelope entries |

**Backward compatibility invariant**: when these env vars are absent
(normal interactive invocation), inner skills behave EXACTLY as they do
today. The env-var-gated behavior is purely additive.

### `intake` permissions

`intake` inherits the full `/nacl-goal` denylist (production mutation,
hooks-disabled, etc.) and adds NO new permissions. In particular:

- Push to feature branch is permitted (not a production mutation).
- `gh pr create` for the goal-run PR is permitted.
- `gh pr merge` to main/master/release/* is NOT permitted — `REFUSE_PRODUCTION_MUTATION` fires.
- Staging deploy via `/nacl-tl-deliver`'s existing pipeline is permitted.

### Resumable state table (consulted at step 1 re-invocation)

| Block code | `resumable` |
|---|---|
| Transient interruption (no terminal state recorded) | true |
| `GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER` | false |
| `GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED` | false |
| `GOAL_BLOCKED_ATOM_FAILED` | false |
| `GOAL_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION` | false |
| `GOAL_BLOCKED_DEPLOYED_SHA_MISMATCH` | false |
| `GOAL_BLOCKED_CI_FAILED` | false |
| `GOAL_BLOCKED_STAGING_UNHEALTHY` | false |
| `GOAL_BLOCKED_BUDGET_EXHAUSTED` | false |
| All `PLAN_BLOCKED_*` | false |

Resume blindly only when the cause was external (process crash, transient
network). Anything that touched human-implication territory requires
explicit `--new-run`.

---

## resume / abort

```
/nacl-goal resume               # re-run check; if not GOAL_OK, re-issue /goal
                                # with same alias and remaining budget (2.10.1)
/nacl-goal abort <run_id>       # clear marker, write exit_reason=crashed (2.10.1)
```

Crash/resume protocol is 2.10.1 functionality. See `docs/guides/goal-command.md`.

---

## .tl/goal-runs/ schema (Architecture §4)

Run files are YAML-headed markdown at `.tl/goal-runs/<run_id>.md`.
Schema reference: `docs/guides/goal-run-schema.md`.
Enforced from 2.10.1. In 2.10.0 no run file is written.

---

## Referenced files (do not duplicate content here)

| File | Purpose |
|------|---------|
| `nacl-goal/aliases.md` | Binding alias contracts: check script, args schema, evidence keys, result decision rules, Tier-C collisions |
| `nacl-goal/refusal-catalog.md` | All REFUSE_* / PLAN_BLOCKED_* / GOAL_BLOCKED_* codes with triggers, messages, fallback commands |
| `nacl-goal/gate-fire-detector.md` | Tier-C gate signatures for runtime detection (populated 2.10.1) |
| `nacl-goal/pricing.json` | v0 Opus 4.8 + Haiku 4.5 rates for Tier L/XL dollar-cost preview |
| `nacl-goal/envelope.md` | `intake` default safe-exception envelope: auto-enabled gates, hard-refuse list, YAML template, namespace, lifecycle (2.10.1) |
| `nacl-goal/plan-lock-schema.md` | All `intake` artifact schemas: index.json, request.json, intake.json, plan.lock.json, authorization.json, budget.json, atoms/state.json, pr.json, goal-final-sha.txt, pr-body.md, progress.jsonl, exceptions.log, regression-{baseline,postfix}.json (2.10.1) |
| `nacl-goal/run-artifacts.md` | `intake` directory contract, fingerprint algorithm, flock-protected index.json, re-invocation rules, resumable state table, `--new-run` caveats (2.10.1) |
| `nacl-goal/gate-prediction.md` | Deterministic `(skill_path, risk/evidence) → predicted gates` table for `--strict` pre-flight and `--plan-only --strict` preview (2.10.1) |
| `nacl-goal/retry-policy.md` | Transient vs deterministic operation classification; backoff schedule (3× / 5s,15s,45s); idempotence requirements (2.10.1) |
| `nacl-goal/regression-schema.md` | Shared baseline/postfix JSON schema; per-runner test-ID extractor table (pytest/jest/vitest/go/unknown); best-effort fallback disclosure rule (2.10.1) |
| `nacl-goal/pr-body-template.md` | Goal-run PR body template rendered from plan.lock.json; footer invariant for traceability (2.10.1) |
| `nacl-goal/checks/intake.sh` | `intake` check script; arg schema `--run-id <id>`; reads run artifacts and emits GOAL_PROOF (2.10.1) |
| `docs/guides/goal-command.md` | Overview, when to use, invocation examples, resume/abort |
| `docs/guides/goal-proof-protocol.md` | GOAL_PROOF wire format schema, field reference, examples |
| `docs/guides/goal-run-schema.md` | .tl/goal-runs/ YAML schema reference (2.10.0 aliases). For 2.10.1 `intake` artifacts see `nacl-goal/plan-lock-schema.md`. |
| `docs/guides/goal-permissions.md` | Full denylist, per-alias allowlist, permitted modes |

---

## Use with /goal

This skill IS the `/goal` entry point for NaCl. It composes the condition
and issues `/goal` only after preview confirmation. Run:

```
/nacl-goal wave:5              # preview
/nacl-goal wave:5 --start      # start (Tier M; 2.10.0 warns, 2.10.1 fully enables)
```

Do not issue `/goal` directly for NaCl objectives — the raw `/goal` command
does not enforce the permissions denylist, does not surface GOAL_PROOF,
and does not write `.tl/goal-runs/` summaries. If you must use raw `/goal`,
embed a budget clause in the condition and check `.tl/goal-runs/` afterward.

---

## NOT for /goal (Tier-C skills)

Do not wrap these skills in `/nacl-goal` — they contain mandatory human-approval
gates that `/goal` must not swallow:

- `nacl-ba-full` — BA→SA handoff is a human gate
- `nacl-sa-full` — each SA phase requires user confirmation
- `nacl-tl-hotfix` — hotfix routing requires human judgment about urgency and branch

See `nacl-goal/refusal-catalog.md` for the exact refusal codes these trigger.

---

## Version note

- **2.10.0 (`goal-protocol-foundation`)** — shipped: preview-by-default for
  the four built-in aliases (`wave`, `fix`, `validate`, `reopened-drain`)
  and `custom`; GOAL_PROOF protocol; refusal catalog with 10 `REFUSE_*`
  codes; permissions denylist.
- **2.10.1 (`autonomous-goal-intake-orchestrator`)** — in progress, three
  sub-PRs into `release/2.10.1` branch:
  - **PR1** (this PR): `intake` alias contracts only — SKILL.md additions,
    aliases.md row, refusal-catalog.md extensions (PLAN_BLOCKED_* and
    GOAL_BLOCKED_* code families), 7 new contract files (envelope.md,
    plan-lock-schema.md, run-artifacts.md, gate-prediction.md,
    retry-policy.md, regression-schema.md, pr-body-template.md), check
    script (`intake.sh`), root `.gitignore` update. NO inner-skill
    changes — `intake` is contract-only at PR1 merge.
  - **PR2**: inner-skill env-var recognition (`/nacl-tl-fix`,
    `/nacl-tl-dev*`, `/nacl-tl-ship`, `/nacl-tl-intake --emit-state`,
    `/nacl-sa-feature --bounded-only`). `intake` becomes functional end-to-end
    at PR2 merge.
  - **PR3**: fixture-project acceptance run, `skills-for-codex/PLAN`
    doc update, memory flip to "shipped".
- **2.10.2 (`codex-sync`)** — shipped separately from autonomy work.
- **2.10.2+** (deferred): FEATURE_HEAVY autonomous execution; multi-PR
  orchestration; project-local exception policy file
  (`.tl/project-exception-policy.yaml`) and project-specific gates;
  explicit `/nacl-goal status|resume|abort <run_id>` commands;
  `deploy.dev.url` config schema extension; auto-close superseded PRs on
  `--new-run`; Codex variant of `intake`.
