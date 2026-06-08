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
  alias (free-text/image goal → classified atoms → one PR → CI → staging) and
  the 2.18.0 `conduct` multi-cluster orchestrator (heterogeneous goal → clusters
  → one PR per cluster, wave-ordered).
  Use when: running a long NaCl loop autonomously, or the user says "/nacl-goal".
---

## Contract

**Inputs this skill consumes:**

- `<alias>` — required positional. One of the named aliases from `nacl-goal/aliases.md`
  (`wave:<N>`, `fix:<BUG-NNN>`, `validate:<MOD-ID>`, `reopened-drain`, `intake`, `conduct`,
  `custom`), or the special invocations `resume` and `abort <run_id>`.
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

Check script shipped in 2.18.0 (`conduct` multi-cluster orchestrator):

```
nacl-goal/checks/conduct.sh          --run-id <goal-run-id>     # ✅ scans clusters/*/
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
  • branch_mode = current when invoked from a non-production branch:
            atoms run ON the branch you are standing on, commits stay local,
            ONE push at DELIVER (push_cadence = deferred). The preview prints
            a one-line notice: "Running on your branch <name>; one push at
            deliver; do not commit to this branch while the run is active."
            From main/master/release/* the production refusal still fires —
            create a working branch first.
  • atoms BUG / TASK / FEATURE_SMALL run on that single branch, one PR
  • atoms FEATURE_HEAVY → PLAN_BLOCKED with planning artifacts (no silent split)
  • uncommitted changes (another agent's WIP) do NOT refuse the run in
    branch_mode=current — see Flow step 3 "Smart WIP" for the
    file-overlap protocol

Opt-outs (each disables a slice of the default):
  --plan-only        write planning artifacts only; no /goal, no branch, no PR,
                     no exception YAML, no source-code changes
  --strict           disable default safe-exception envelope; pre-flight refuses
                     if plan predicts a gate would need envelope auto-authorization
                     (PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW)
  --branch=current   run on the currently checked-out branch (default when on a
                     non-production branch)
  --branch=new       pre-2.14 behavior: create feature/goal-<short-hash>; requires
                     a clean worktree (PLAN_BLOCKED_DIRTY_WORKTREE applies)
  --push=deferred    atoms commit locally; single push at DELIVER (default when
                     branch_mode=current)
  --push=per-atom    push after every atom; PR opens on first push (default when
                     branch_mode=new — pre-2.14 behavior)
  --push=none        no push at all; run ends with local commits; ONLY valid with
                     --target=dev-only (with staging it is a usage error rejected
                     at argument parsing, before step 0 — no artifacts written);
                     deliver later with /nacl-tl-deliver
  --target=staging   require staging (default)
  --target=dev-only  local verify + PR only; final message MUST NOT claim staging
                     delivery; dev_verified is asserted via local /nacl-tl-verify
  --new-run          force fresh run-id even if goal_fingerprint matches an existing
                     run; does NOT close or reuse prior PR in 2.10.1
  --budget=<profile> optional budget override (default Tier M: 200 turns / 3h / 4M tokens)

Backward-compat invariant: `--branch=new` reproduces the pre-2.14 flow
byte-for-byte (new goal branch, per-atom pushes, dirty-worktree refusal).
The default changed ONLY for invocations from an existing feature branch.
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
   on main/master/release/*    → PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION
     (fires regardless of branch_mode; create a working branch first)
   resolve branch_mode / push_cadence:
     --branch absent  → branch_mode = current  (we are on a non-production branch)
     --branch=new     → branch_mode = new
     push_cadence = --push if given, else deferred (current) / per-atom (new)
   Smart WIP (branch_mode=current):
     preexisting_dirty_files[] = paths from `git status --porcelain`
       (including untracked); recorded in plan.lock.json at step 5
     non-empty does NOT refuse — uncommitted files are presumed to be
       another agent's in-flight work in the shared worktree. They are
       never staged, never committed, never reverted by the goal run.
     overlap resolution happens at step 5 (needs classified atoms);
       hard runtime backstop at step 9 (commit-time collision gate)
   branch_mode=new: dirty worktree → PLAN_BLOCKED_DIRTY_WORKTREE (pre-2.14 rule)
   resolve baseline_command chain (config.yaml → package.json → pyproject → defaults)
     missing → PLAN_BLOCKED_BASELINE_COMMAND_MISSING
   capture regression-baseline.json per regression-schema.md
     run the baseline in an ISOLATED throwaway worktree pinned to the
       current HEAD sha (`git worktree add --detach <tmp> HEAD`), so other
       agents' uncommitted WIP never contaminates the baseline; provision
       deps per regression-schema.md §Worktree isolation; if provisioning
       fails, fall back to in-tree run with worktree_isolated: false
       (disclosed in GOAL_PROOF)
     PLAN_BLOCKED_BASELINE_RED only fires if
       (exit_code != 0 AND collected_count == 0)
       OR (collected_count > 0 AND passed_count == 0)
     i.e. zero-tests-collected runner error, or all-tests-failing.
   missing gh auth / CI perms  → PLAN_BLOCKED_GH_AUTH_OR_CI_PERMISSION_MISSING

4. CLASSIFY  (/nacl-tl-intake --autonomous --yes --emit-state .tl/goal-runs/<run_id>/intake.json)
   atoms[] with: id, type, linked_uc, evidence, confidence, risk_level,
   depends_on, hard_refuse_triggers, trigger_evidence, spec_gap, residual_note,
   diagnosis, skill_path.
   Intake now SELF-DIAGNOSES before this policy applies (Step 2a.5 PROBE):
   for every atom the graph alone did not resolve it verifies the competing
   hypotheses against the actual code/DB (bounded read-only probes) and
   derives a rubric score (nacl-tl-core/references/intake-scoring.md;
   thresholds from the project's config.yaml -> intake.*, frozen into
   diagnosis.threshold_used). "The graph didn't resolve it" alone never
   reaches the user anymore.
   --autonomous question policy (2.14+, probe-scored; see nacl-tl-intake
   Step 2b case table):
     HIGH L0/L1, HIGH spec-gap-no-hard-refuse → auto-route (as before)
     HIGH + CODE (probe score >= high_confidence [0.9]) → auto-route
       (as HIGH+GRAPH; "verified against the code")
     HIGH L2/L3 launch-sanity (Template B)    → auto-confirmed; informational line
     MEDIUM with probe leaning (route_threshold [0.7] <= score <
       high_confidence [0.9]) (Template D)    → auto-route on the leading
       hypothesis; alternative + blocking_fact tracked as residual_note
       (reason medium_confidence_alternative);
       pre-authorized via envelope.md gate `medium-confidence-routing`;
       NEVER when the atom carries a hard_refuse_trigger
     Sub-threshold (probe ran, score < route_threshold) (Template E)
                                              → ONE consolidated batch question,
       asked HERE (pre-/goal interaction is allowed): list every unresolved
       atom WITH its diagnosis (what was checked, per-hypothesis results,
       leaning, blocking fact); the user answers once and the run proceeds
       fully autonomously. Non-interactive session or declined →
       PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION (as before)
     hard_refuse (Template C)                 → unchanged: PLAN_BLOCKED_* below —
       the user's "critical questions" always survive autonomy; a probe
       never clears a hard_refuse_trigger
   Refuse mapping (per plan-lock-schema.md §hard_refuse_triggers):
     billing | destructive | l2_l3 | product_decision → _FEATURE_REQUIRES_PRODUCT_DECISION
       (or _FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION if FEATURE)
     schema_migration | public_api_contract           → _FEATURE_REQUIRES_SCHEMA_MIGRATION
     auth_or_security | permissions                   → _FEATURE_REQUIRES_AUTH_OR_SECURITY_CHANGE
     hotfix_or_release_routing                        → REFUSE (interactive)
   FEATURE_HEAVY without trigger → write planning/feature-plan.md +
     planning/open-decisions.md → PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION
   ambiguous AFTER the probe AND the consolidated batch → PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION
     (MEDIUM-confidence atoms no longer reach this refusal — they auto-route;
      sub-threshold atoms reach it only with their diagnosis attached)
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
   branch = feature/goal-<short-hash>            (branch_mode=new)
   branch = $(git rev-parse --abbrev-ref HEAD)   (branch_mode=current)
   branch_mode=current bookkeeping (recorded in plan.lock.json):
     branch_base_sha        = git merge-base <branch> <base_branch>
     prior_unpushed_commits = git rev-list --count <base_branch>..HEAD
     preexisting_dirty_files[] (snapshot from step 3)
   WIP-overlap check (branch_mode=current, preexisting_dirty_files non-empty):
     predict each atom's touch zone from the graph (linked UC → Module →
       workspace directories + api-contracts paths) — coarse, directory-level
     predicted zone ∩ preexisting_dirty_files == ∅ →
       print one notice line ("N uncommitted files left untouched — presumed
       another agent's work") and proceed
     overlap → ONE consolidated plain-language question (pre-/goal, allowed):
       per overlapping atom: continue anyway / commit those files into the
       branch first / exclude the atom from this run
       non-interactive session or declined → PLAN_BLOCKED_DIRTY_WORKTREE
       (see refusal-catalog.md — the catalog entry covers both modes)
   write plan.lock.json (incl. branch_mode, push_cadence), authorization.json
   write atoms/<atom_id>.state.json with state="pending" for each atom
   render initial PR body (per pr-body-template.md) to pr-body.md — WIP, atom table.
     per-atom cadence: /nacl-tl-ship reads this file when it opens the PR on
       the first push. deferred cadence: /nacl-tl-deliver reads it at the
       single push. none: no PR in this run.
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
   branch_mode=new:     git checkout -b feature/goal-<short-hash>
                        (or fast-forward if RESUMED)
   branch_mode=current: verify git rev-parse --abbrev-ref HEAD == plan.branch
                        (FATAL mismatch — the user switched branches between
                         lock and execute; report and exit, resumable)
   ALWAYS re-export goal env vars at start of this step (resume safe):
     export NACL_GOAL_RUN_ID=<run_id>
     export NACL_GOAL_BRANCH=<plan.branch>
     export NACL_SHIP_MODE=append
     export NACL_SHIP_PUSH=<plan.push_cadence>     # per-atom | deferred | none
     export NACL_GOAL_BUDGET_FILE=<abs path to budget.json>
   for each atom in topological order:
     check budget.json wall-clock; if elapsed >= limit → GOAL_BLOCKED_BUDGET_EXHAUSTED
     skip if atoms/<atom_id>.state.json.state == "verified" or "unsupported"
     transition: pending → implementing  (update state.json + progress.jsonl)
     pre_atom_sha = git rev-parse HEAD
     BUG           → /nacl-tl-fix "<atom.title>" --auto-ship
     TASK          → /nacl-tl-dev <UC>           --auto-ship
     FEATURE_SMALL → /nacl-sa-feature <atom>     --bounded-only
                     followed by /nacl-tl-dev    --auto-ship
     RE-TYPE handler (BUG atoms; before the generic failure branch):
       if /nacl-tl-fix exits with exit_reason == "L3-feature" (its Phase A
       gap-check proved the code path does not exist — the atom is a feature
       that arrived typed as a bug), this is a RE-CLASSIFICATION SIGNAL, not
       a failure. The routing report is identical to a manual run; GOAL
       reconsiders its own routing decision:
         re-type the atom in place via the FEATURE size rule
           (nacl-tl-intake §FEATURE size class; atom.id stays frozen):
         FEATURE_SMALL (bounded, routing report names no hard_refuse trigger):
           state back to "pending" under the new type (the only sanctioned
           backward transition), retyped_to=FEATURE_SMALL, progress.jsonl
           event {"kind":"atom_retyped","from":"BUG","to":"FEATURE_SMALL"};
           re-enter the loop for this atom: /nacl-sa-feature --bounded-only
           then /nacl-tl-dev --auto-ship, SAME run, SAME branch
         FEATURE_HEAVY (routing report names a hard_refuse trigger, or
           unbounded): state="unsupported", retyped_to=FEATURE_HEAVY;
           write planning/feature-plan.md + planning/open-decisions.md for
           this atom; progress.jsonl event atom_retyped; DO NOT abort —
           continue the remaining atoms. Counts toward
           unsupported_atoms_count → final result is at best GOAL_NOT_OK
           (never a false GOAL_OK, never GOAL_BLOCKED for this alone)
       this re-type is the runtime backstop for any bug-vs-feature miscall
       the intake probe did not catch; it never fires a /goal-halting block
     WIP-collision gate (branch_mode=current, preexisting_dirty_files non-empty):
       git diff --name-only <pre_atom_sha>..HEAD ∩ preexisting_dirty_files ≠ ∅
         → the atom's commits touched a file another agent holds uncommitted
           edits in (the commit may have swallowed their work)
         → state.state="failed", index.json state: "goal_blocked", resumable: TRUE
         → GOAL_BLOCKED_WIP_COLLISION (resolve the overlap, then /nacl-goal resume)
       (first line of defense is /nacl-tl-ship's staging-time check — see
        nacl-tl-ship §Goal-context append mode; this gate is the backstop)
     on success: state.state="shipped", last_commit_sha=<HEAD>
                 append to budget.json inner_skill_runs[]
     run scoped verify; on PASS: state.state="verified"
     on failure: state.state="failed", error=...
                 index.json state: "goal_blocked", resumable: false
                 → GOAL_BLOCKED_ATOM_FAILED
     after each transition: re-render pr-body.md per pr-body-template.md
   The env vars instruct /nacl-tl-ship (PR2) to:
     • commit selectively (files this atom changed, NEVER preexisting_dirty_files)
     • NACL_SHIP_PUSH=per-atom: push to the goal branch; create the goal-run PR
       on first push using pr-body.md; write pr.json; on subsequent pushes:
       append commits; update pr.json.head_sha; refresh body; no additional PRs
     • NACL_SHIP_PUSH=deferred|none: local commit only — no push, no PR calls;
       the single push happens at DELIVER (deferred) or is left to the user (none)
   without env vars, --auto-ship behaves exactly as today (no silent change).
   after last atom reaches a terminal state (verified; or unsupported via re-type —
   an unsupported atom does not block the rest of the run):
     goal_final_sha = HEAD of <plan.branch>
     write goal-final-sha.txt
     render final PR body; refresh pr.json (per-atom cadence only — otherwise
       pr.json does not exist yet)

10. PRE-DELIVER DRIFT CHECK
    branch_head_sha = git rev-parse HEAD
    per-atom cadence:
      pr_head_sha = gh pr view --json headRefOid   (with retry-policy.md)
      if branch_head_sha != goal_final_sha OR pr_head_sha != goal_final_sha:
          index.json state: "goal_blocked", resumable: false
          → GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER
    deferred/none cadence:
      the PR does not exist yet (nothing has been pushed) — check ONLY
      branch_head_sha == goal_final_sha; the pr_head_sha comparison moves
      to step 11.5, after the single push opens the PR
    NOTE (branch_mode=current): concurrent COMMITS to the run branch by
      other agents during an active run are NOT supported in v1 — this
      check is exactly what catches them. Concurrent uncommitted WIP is
      supported (Smart WIP); concurrent commits block the deliver.

11. DELIVER
    deploy_target == staging  → /nacl-tl-deliver
       (gh run watch / staging health curl / functional verify wrapped per retry-policy.md)
       push_cadence=deferred: deliver's push IS the single push of the run —
         the PR opens here, reading .tl/goal-runs/<run_id>/pr-body.md
         (finalized at step 9) as its body; wrapper writes pr.json from the
         created PR; CI runs ONCE, on the full batch
    deploy_target == dev-only → run baseline_command + /nacl-tl-verify per linked UC locally
       set dev_verified accordingly; write dev-verified.json
         (per plan-lock-schema.md — intake.sh reads it; absent → n/a)
       push_cadence=deferred: perform the single push + open the goal-run PR
         here (reading pr-body.md) — dev-only changes the verification
         claim, not the PR; CI runs once on the batch
       push_cadence=none: do NOT push; print "local commits on <branch> ready;
         deliver later with /nacl-tl-deliver"; pr_url stays null
       otherwise print PR URL
       final message MUST NOT claim staging delivery

11.5 POST-DELIVER DRIFT CHECK
    (CI + deliver windows are exactly when a stray push happens — re-check.)
    push_cadence=none: pr_head_sha is n/a — check only branch_head_sha_now.
    if branch_head_sha_now != goal_final_sha OR pr_head_sha_now != goal_final_sha:
        index.json state: "goal_blocked", resumable: false
        → GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER

12. POST-DELIVER REGRESSION CHECK (mechanical)
    re-run baseline_command in an isolated worktree pinned to goal_final_sha
      (same protocol as step 3 — other agents' WIP must not contaminate the
       postfix run; fallback + disclosure rules identical);
      capture regression-postfix.json (same schema as baseline)
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
| `NACL_GOAL_BRANCH` | The goal-run branch name (a fresh `feature/goal-*` branch OR the user's current branch under `branch_mode=current`); ship target |
| `NACL_SHIP_MODE` | `append` — reuse the goal branch + goal PR (don't open new ones) |
| `NACL_SHIP_PUSH` | `per-atom` \| `deferred` \| `none` — push cadence for `/nacl-tl-ship` append mode. `per-atom`: push + PR per atom (pre-2.14 behavior, default when absent). `deferred`/`none`: local commit only, no push, no PR calls |
| `NACL_GOAL_BUDGET_FILE` | Absolute path to budget.json; inner skills append envelope entries |

**Backward compatibility invariant**: when these env vars are absent
(normal interactive invocation), inner skills behave EXACTLY as they do
today. With `NACL_SHIP_PUSH` absent, push cadence is `per-atom` (the
pre-2.14 behavior). The env-var-gated behavior is purely additive.

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
| `GOAL_BLOCKED_WIP_COLLISION` | true |
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

`GOAL_BLOCKED_WIP_COLLISION` resume protocol: the user resolves the overlap
(commits or reverts the colliding uncommitted files), then `/nacl-goal resume`.
On resume the wrapper re-snapshots `preexisting_dirty_files` (logged to
progress.jsonl as `{"kind":"wip_resnapshotted"}`), updates plan.lock.json,
and re-runs the failed atom. A `--commit-wip`-style auto-resolution is
deliberately NOT offered — the colliding files belong to another agent.

---

## `conduct` alias (2.18.0 — multi-cluster orchestrator)

`conduct` is the sibling of `intake` for HETEROGENEOUS goals — work that
legitimately spans several unrelated modules. `intake` is unitary (one intent →
one branch → one PR) and REFUSES such a goal with
`PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`. `conduct` is the explicit opt-in that takes
that exact split and ships it: each module-aligned **cluster** runs an
`intake`-scale lifecycle on its own branch and opens its own PR, wave-ordered by
cross-cluster dependencies.

**Unitary-rule reconciliation** ([[feedback-goal-run-is-unitary]]): `intake` is
unchanged — one goal-run still produces one PR, and multi-PR is NEVER a silent
default. You only get multiple PRs when you explicitly type `conduct`. The two
refuse into each other: `intake` refuses a heterogeneous goal and points at
`conduct`; `conduct` refuses a homogeneous goal
(`PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE`) and points at `intake`. The user's
one-line decision rule: **one coherent change to one area → `intake`; several
unrelated changes across different modules → `conduct`.**

`conduct` borrows the SEMANTICS of `/nacl-tl-conductor` (waves, per-item
lifecycle, max-3 retry, partial-completion handling) WITHOUT its Neo4j
dependency. The wrapper clusters the classified atoms itself and drives the
EXISTING inner skills per cluster through the same `NACL_GOAL_*` env-var
integration `intake` uses — no new inner-skill contracts beyond the additive
`NACL_GOAL_CLUSTER_ID`.

### `conduct` UX

```
/nacl-goal conduct "<free-text heterogeneous goal>"     # autonomous, default

Opt-out / tuning flags:
  --plan-only        cluster plan + per-cluster atom plans only; no branches, no PRs
  --strict           disable default safe-exception envelope (per-cluster pre-flight)
  --target=staging|dev-only       default: staging (auto from config)
  --budget=<profile> optional budget override (default Tier L: 1200 turns / 16h / 20M tokens)
  --new-run          force fresh run-id on goal_fingerprint match
  --max-parallel=<N> clusters run concurrently within a wave; v1 ships SEQUENTIAL (default 1)
  --clusters=<id,..> run/resume only a subset of the locked cluster set
  --single-pr        DEGRADE to intake semantics (refuse to split; behave as /nacl-goal intake)

NOTE: conduct does NOT expose --branch=current. Per-cluster isolation needs
  per-cluster branches off a controlled integration branch, so conduct always
  operates in a branch_mode=new-like posture rooted at integration/goal-<short-hash>.
  From main/master/release/* the production refusal still fires — create a
  working branch first (the integration branch is cut FROM a non-production checkout).
```

### `conduct` Flow (cluster-wave variant of the `intake` Flow)

Steps **0–4** are IDENTICAL to the `intake` Flow (privacy precheck, INIT_RUN,
RESOLVE_TARGET, PRECHECKS incl. the single regression baseline at the
integration base SHA, CLASSIFY via `/nacl-tl-intake --autonomous --emit-state`)
— see §`intake` Flow. The deltas begin at the cluster layer:

```
4b. CLUSTER  (conduct-only; runs after CLASSIFY)
    partition atoms into clusters: a cluster = a maximal set of atoms that
      (a) share a top-level module/workspace OR (b) are connected by a
      depends_on path. This is the inverse of the PLAN_SPLIT_REQUIRED detector.
      module attribution: linked_uc → Module from the graph if present, else
      /nacl-tl-intake's touch-zone inference (the Smart-WIP directory predictor).
    exactly 1 cluster        → PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE (use intake)
    residual b/c/d conflicts → PLAN_BLOCKED_INCOMPATIBLE_CLUSTER_TARGETS
    build the cluster DAG (edges = cross-cluster depends_on); topological sort
      → cycle = PLAN_BLOCKED_CLUSTER_DAG_CYCLE
    cluster_id = cl-<short_sha256(module + sorted_atom_ids)[:8]>   (immutable)

5'. LOCK PLAN  (conduct variant)
    integration_branch     = integration/goal-<short-hash>  (cut from base_branch;
                             the wrapper NEVER commits code to it)
    integration_base_sha   = git rev-parse <base_branch>    (base from config.yaml,
                             never a hardcoded main/master)
    write plan.lock.json with orchestrator="conduct", integration_branch,
      integration_base_sha, cluster_dag_valid, clusters[] (each: cluster_id,
      module, branch=feature/goal-<hash>-<cluster_id>, wave, depends_on_clusters,
      atoms[], push_cadence=deferred, state="pending", qa{required, max_iterations:3})
    mkdir clusters/<cluster_id>/{atoms/} per cluster; render per-cluster pr-body.md
    --plan-only: EXIT here

6'-8'. STRICT PRE-FLIGHT / ENVELOPE / ISSUE /goal — as intake, evaluated across
    ALL clusters' atoms (the exception envelope namespace is per-run).

9'. EXECUTE BY WAVE  (the core conduct loop; v1 sequential)
    for each wave W in topological order:
      for each cluster C in wave W (sequential in v1; --max-parallel>1 deferred):
        git checkout -b C.branch integration/goal-<hash>   (wrapper cuts the branch;
          /nacl-tl-ship only ever commits to the branch it is handed — never switches)
        export NACL_GOAL_BRANCH=C.branch ; export NACL_GOAL_CLUSTER_ID=C.cluster_id
          (+ the standard NACL_GOAL_* vars; ship artifacts under clusters/<id>/)
        run the intake per-atom EXECUTE→DRIFT→DELIVER→DRIFT→REGRESSION loop
          (steps 9–12) FOR THIS CLUSTER's atoms only, writing to clusters/<id>/.
          per-cluster regression postfix diffs against the SINGLE integration
          baseline captured at step 3 (catches cross-cluster regressions).
        BOUNDED E2E loop (when C.qa.required): /nacl-tl-qa (auto-scenario from
          acceptance.md) → CRITICAL / MAJOR-in-main-flow → route to
          /nacl-tl-{dev-be,dev-fe,fix} --continue and re-run, up to
          qa.max_iterations (3) → on exhaustion: C.state=blocked,
          block_code=GOAL_BLOCKED_CLUSTER_QA_UNRESOLVED. MINOR → defer
          (clusters/<id>/ deferred_minor_bugs[]; never consumes the budget).
        on cluster green (all atoms verified, CI success, deploy healthy, QA
          VERIFIED): C.state=deployed; MERGE C.branch INTO integration/goal-<hash>
          (a merge into a NON-protected working branch — permitted; merges into
          main/master/release/* remain REFUSE_PRODUCTION_MUTATION) so the next
          wave cuts its branches from a base that already contains C.
        on cluster failure (atom/CI/staging/sha/qa/drift): C.state=blocked with
          the matching GOAL_BLOCKED_CLUSTER_* code; SIBLINGS CONTINUE; clusters
          whose depends_on includes C become state=skipped_blocked_dependency.
      wave barrier: re-verify integration HEAD; unexpected move →
        GOAL_BLOCKED_INTEGRATION_DRIFTED (abort remaining waves).

13'-14'. OBSERVE & TERMINAL  (conduct.sh --run-id <run_id>)
    conduct.sh scans clusters/*/ and aggregates; emits GOAL_PROOF (alias: conduct;
    tier: L). Terminal states:
      GOAL_OK            — every cluster deployed+green; no blocked/skipped/unsupported
      GOAL_BLOCKED_PARTIAL_WAVE — a wave drained with a mix of green and non-green
                           clusters; index.json state goal_blocked, resumable: partial
      GOAL_BLOCKED_*     — run-level (integration drift, run-level regression)
```

### `conduct` cluster env var (additive to the `intake` integration)

| Variable | Meaning |
|---|---|
| `NACL_GOAL_CLUSTER_ID` | The current cluster's `cluster_id`. `/nacl-tl-ship` (append mode) reads `pr.json` / `pr-body.md` from `.tl/goal-runs/<run_id>/clusters/<cluster_id>/` instead of the run root, so each cluster maintains its OWN PR. Absent (normal `intake` / interactive use) → ship reads the run-root artifacts exactly as before. Purely additive — backward compatible. |

`NACL_GOAL_BRANCH` under `conduct` is a per-cluster `feature/goal-<hash>-<cluster_id>`
branch; everything else in the `intake` env-var table applies per cluster.

### `conduct` permissions

`conduct` inherits the full `/nacl-goal` denylist and adds NO new permissions:

- N × `gh pr create` (one PR per cluster) is permitted (not a production mutation).
- Wrapper-level `git merge` of a verified cluster branch INTO the
  `integration/goal-<hash>` working branch is permitted (non-protected target).
- `git merge` / `gh pr merge` into `main`/`master`/`release/*` is NOT permitted —
  `REFUSE_PRODUCTION_MUTATION` fires. Cluster PRs are OPENED, never merged, by the run.
- Staging deploy per cluster via `/nacl-tl-deliver`'s existing pipeline is permitted.

### `conduct` Resumable state table (additions to the `intake` table)

| Block code | `resumable` |
|---|---|
| `GOAL_BLOCKED_CLUSTER_ATOM_FAILED` | false (per-cluster; resume that cluster with `--clusters=`) |
| `GOAL_BLOCKED_CLUSTER_CI_FAILED` | false (per-cluster) |
| `GOAL_BLOCKED_CLUSTER_STAGING_UNHEALTHY` | false (per-cluster) |
| `GOAL_BLOCKED_CLUSTER_DEPLOYED_SHA_MISMATCH` | false (per-cluster) |
| `GOAL_BLOCKED_CLUSTER_QA_UNRESOLVED` | false (per-cluster) |
| `GOAL_BLOCKED_CLUSTER_BRANCH_DRIFTED` | false (per-cluster) |
| `GOAL_BLOCKED_PARTIAL_WAVE` | **partial** — `/nacl-goal resume --clusters=<blocked_ids>` re-runs ONLY the named blocked clusters against the existing integration branch; already-green clusters and their open PRs are left untouched |
| `GOAL_BLOCKED_INTEGRATION_DRIFTED` | false (the shared base is no longer trustworthy; `--new-run`) |

`GOAL_BLOCKED_PARTIAL_WAVE` selective-resume is the multi-PR analogue of `intake`'s
WIP-collision resume: the green PRs are preserved; only the broken clusters retry.
This mirrors `nacl-tl-conductor`'s partial-completion gate ("ship what's done" vs
"fix the rest").

---

## resume / abort

```
/nacl-goal resume               # re-run check; if not GOAL_OK, re-issue /goal
                                # with same alias and remaining budget (2.10.1)
/nacl-goal resume --clusters=<ids>   # conduct: re-run only the named blocked
                                # clusters; green clusters + their PRs untouched (2.18.0)
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
| `nacl-goal/checks/conduct.sh` | `conduct` check script; arg schema `--run-id <id>`; scans `clusters/*/` subdirs, aggregates per-cluster state, emits cluster-aware GOAL_PROOF (2.18.0) |
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
- **2.14.0 (`current-branch-batch-mode`)** — `branch_mode=current` is
  the new default when invoked from a feature branch: atoms run on the
  user's open branch, commits stay local, one push + one CI run at DELIVER
  (`push_cadence=deferred`). Smart WIP: uncommitted files from concurrent
  agents in a shared worktree no longer refuse the run — file-overlap is
  predicted at LOCK (graph zone vs dirty snapshot) and enforced at commit
  time (`GOAL_BLOCKED_WIP_COLLISION`, resumable). Regression baseline and
  postfix run in isolated throwaway worktrees. `--branch=new` restores the
  pre-2.14 flow byte-for-byte. New env var `NACL_SHIP_PUSH`.
- **2.18.0 (`multi-PR-conduct`)** — the `conduct` multi-cluster orchestrator
  ships (the former "multi-PR orchestration" Deferred item). A heterogeneous
  free-text goal is classified, then partitioned into module-aligned CLUSTERS
  (the inverse of `intake`'s `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED` detector); each
  cluster runs an `intake`-scale lifecycle on its OWN branch (cut off a shared
  `integration/goal-<hash>` branch) and opens its OWN PR, wave-ordered by
  cross-cluster `depends_on`. Borrows `nacl-tl-conductor` semantics (waves,
  per-item lifecycle, max-3 retry, partial-completion handling) WITHOUT the
  Neo4j dependency — graph-less, driving the existing inner skills per cluster
  through the same `NACL_GOAL_*` env-var integration `intake` uses (plus the
  additive `NACL_GOAL_CLUSTER_ID`). Per-cluster BOUNDED E2E loop via
  `/nacl-tl-qa` (max-3; CRITICAL/MAJOR iterate, MINOR defer). A cluster failure
  does not abort siblings (`GOAL_BLOCKED_CLUSTER_*`); a drained mixed wave lands
  `GOAL_BLOCKED_PARTIAL_WAVE`, selectively resumable via
  `/nacl-goal resume --clusters=`. `intake` stays unchanged and unitary —
  `conduct` is the explicit opt-in for heterogeneous goals (see
  [[feedback-goal-run-is-unitary]]: one intent = one PR remains the `intake`
  default; multi-PR is never silent, only the named `conduct` alias). New check
  script `nacl-goal/checks/conduct.sh`. v1 ships SEQUENTIAL clusters
  (`--max-parallel=1`); cluster PRs target the base branch.
- **Deferred** (post current-branch work): FEATURE_HEAVY autonomous
  execution; project-local exception policy file
  (`.tl/project-exception-policy.yaml`) and project-specific gates;
  explicit `/nacl-goal status|resume|abort <run_id>` commands;
  `deploy.dev.url` config schema extension; auto-close superseded PRs on
  `--new-run`; Codex variant of `intake`/`conduct`; wave-parallel atom execution
  via sub-agents (atoms are strictly sequential in v1); `conduct` concurrent
  cluster execution (`--max-parallel>1`); `conduct` best-effort graph Task-status
  writes for graph-backed projects; drift-check relaxation to "goal commits are
  ancestors of HEAD" (support concurrent commits to the run branch by other
  agents).
