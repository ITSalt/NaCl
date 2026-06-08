# /nacl-goal alias catalog

The four aliases shipped in 2.10.0 (preview-by-default; `--start` opt-in for autonomy).
2.10.1 adds `intake` (autonomy-by-default orchestrator with `--plan-only` /
`--strict` opt-outs — see SKILL.md §Alias UX modes). Three more aliases
(`stubs-cleanup`, `migrate-canary`, `feature`) remain deferred.

Each alias entry is the binding contract between the wrapper, the
check script, and the GOAL_PROOF protocol. All check scripts MUST
produce the `expected_evidence_keys` listed here, in the same order,
or v12 docs review fails.

Format:

```
alias_name              <string>
tier                    <S|M|L|XL>
default_mode            preview|autonomous       # 2.10.1+
check_script            <path under nacl-goal/checks/>
check_script_args_schema  <args contract>
expected_evidence_keys  <ordered list>
result_decision_rule    <when each result fires>
tier_c_collisions       <gates this alias must refuse to cross>
```

`default_mode` is absent on the four 2.10.0 aliases (they predate the
field; their behavior is `preview`). `intake` was added in 2.10.1 with
`default_mode: autonomous`. Future aliases MUST specify the field.

---

## wave

```
alias_name              wave
tier                    M
check_script            nacl-goal/checks/wave.sh
check_script_args_schema
  positional: <N: int>           # Wave number, e.g. 5
expected_evidence_keys
  - total_tasks                  # int
  - pass                         # int
  - unverified                   # int
  - blocked                      # int
  - regression                   # int
  - no_infra                     # int
  - runner_broken                # int
  - last_status_transition       # ISO-8601 of most recent Task.status change in wave
  - graph_state_hash             # SHA-1 of sorted (task_id, status) tuples in wave
result_decision_rule
  GOAL_OK
    when pass == total_tasks
    AND regression == 0
    AND unverified == 0
    AND blocked == 0
  GOAL_NOT_OK
    default
  GOAL_BLOCKED
    when probe-stop-signals.sh emitted any blocker
    OR runner_broken > 0 for 2 consecutive turns
    OR no_infra > 0 with reason set
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 500
    OR elapsed >= 6h
    OR observed_tokens >= 8_000_000
tier_c_collisions
  - REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION
      if the wave contains tasks that require SA phase approval
  - REFUSE_PRODUCTION_MUTATION
      if any task in the wave touches production migrations
```

---

## fix

```
alias_name              fix
tier                    S
check_script            nacl-goal/checks/fix.sh
check_script_args_schema
  positional: <BUG-NNN: string>  # e.g. BUG-042
expected_evidence_keys
  - test_status                  # red | green | not_found
  - regression_test_committed    # bool — the new regression test exists in HEAD
  - regression_test_was_red      # bool — verified RED at commit time per
                                 # feedback_regression_test_before_fix.md
  - pr_url                       # string | null
  - pr_state                     # open | merged | closed | none
  - no_new_regressions           # bool — full test suite green outside the bug area
  - linked_uc_or_tech            # the UC/TECH the bug belongs to, per
                                 # nacl-tl-fix spec-first rule
result_decision_rule
  GOAL_OK
    when test_status == green
    AND regression_test_committed == true
    AND regression_test_was_red == true
    AND pr_state == open
    AND no_new_regressions == true
  GOAL_NOT_OK
    default
  GOAL_BLOCKED
    when probe-stop-signals.sh emitted any blocker
    OR regression_test_was_red == false                # test never RED → invalid per
                                                       # feedback_regression_test_before_fix.md
    OR linked_uc_or_tech == null after 2 turns         # missing spec link
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 150
    OR elapsed >= 2h
    OR observed_tokens >= 3_000_000
tier_c_collisions
  - REFUSE_HOTFIX_JUDGMENT
      if the bug is classified L0/L1 emergency in nacl-tl-fix taxonomy
  - REFUSE_PRODUCTION_MUTATION
      if the fix touches production DB migrations
```

---

## validate

```
alias_name              validate
tier                    S
check_script            nacl-goal/checks/validate.sh
check_script_args_schema
  positional: <MOD-ID: string>   # e.g. module:AUTH
expected_evidence_keys
  - l1_pass                      # bool — L1 (data consistency) validator
  - l2_pass                      # bool — L2 (model connectivity)
  - l3_pass                      # bool — L3 (requirement completeness)
  - l4_pass                      # bool — L4 (form-domain traceability)
  - l5_pass                      # bool — L5 (UC-form validation)
  - l6_pass                      # bool — L6 (cross-module consistency)
  - l7_pass                      # bool — L7 (FeatureRequest consistency)
  - l8_pass                      # bool — L8 (staleness closure)
  - l9_pass                      # bool — L9 (decision provenance)
  - l10_pass                     # bool — L10 (screen state machines)
  - l11_pass                     # bool — L11 (behavior slices)
  - l12_pass                     # bool — L12 (domain error taxonomy)
  - l13_pass                     # bool — L13 (cache & degradation)
                                 # L10-L13 are opt-in layers: zero nodes of
                                 # the layer's labels = vacuous PASS (true)
  - xl_pass                      # bool — XL6-XL9 (BA→SA cross-validation)
                                 # only when MOD-ID has BA layer
  - failing_validators           # list of failing validator IDs
  - last_run_at                  # ISO-8601
result_decision_rule
  GOAL_OK
    when l1_pass..l13_pass all true
    AND (xl_pass == true OR xl_pass == "not_applicable")
  GOAL_NOT_OK
    default
  GOAL_BLOCKED
    when probe-stop-signals.sh emitted any blocker
    OR same validator has been failing for 4 consecutive turns
      with no change in graph_state_hash (loop suspected)
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 150
    OR elapsed >= 2h
    OR observed_tokens >= 3_000_000
tier_c_collisions
  - REFUSE_HUMAN_GATE_BA_SA_HANDOFF
      if validation fixes require BA-layer changes
      (nacl-ba-validate output must be GREEN first, interactively)
```

---

## reopened-drain

```
alias_name              reopened-drain
tier                    M
check_script            nacl-goal/checks/reopened-drain.sh
check_script_args_schema
  no positional args.
  optional flag: --board=<BOARD-ID>    defaults to current project
expected_evidence_keys
  - reopened_count               # int — items currently in Reopened column
  - drained_this_run             # int — items moved out of Reopened since --start
  - bugs_pending                 # int — items waiting for nacl-tl-fix
  - in_review_count              # int — items moved to Review/QA this run
  - new_arrivals_this_turn       # int — items moved INTO Reopened this turn
  - youGile_api_reachable        # bool
result_decision_rule
  GOAL_OK
    when reopened_count == 0
    AND in_review_count > 0
    AND new_arrivals_this_turn == 0 for 2 consecutive turns
  GOAL_NOT_OK
    default
  GOAL_BLOCKED
    when youGile_api_reachable == false for 2 consecutive turns
    OR same item has been stuck in Reopened for 4 consecutive turns
      with no nacl-tl-fix invocation
    OR probe-stop-signals.sh emitted any blocker
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 500
    OR elapsed >= 6h
    OR observed_tokens >= 8_000_000
tier_c_collisions
  - REFUSE_HOTFIX_JUDGMENT
      if any item in Reopened is tagged emergency / hotfix
  - REFUSE_HUMAN_GATE_BA_SA_HANDOFF
      if any item requires BA-level decision (per intake classification)
```

---

## intake (2.10.1)

The autonomous goal orchestrator. Ingests free-text + image intent, classifies
via `/nacl-tl-intake --autonomous --yes --emit-state` into BUG / TASK /
FEATURE_SMALL atoms (with `depends_on` topological execution), runs them on
one feature branch producing one PR, drives that PR through CI to a healthy
staging stand. `intake` is UNITARY by design — one intent, one branch, one PR —
and refuses a goal that would need splitting across modules
(`PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`). For a heterogeneous goal that legitimately
spans several unrelated modules, use the sibling `conduct` alias instead: it
materializes that split as per-module clusters, each shipping its own PR (see below). The `--autonomous` flag (2.14+) widens the auto-route set:
L2/L3 launch-sanity auto-confirms, probe-scored atoms (intake Step 2a.5
self-diagnosis — hypotheses verified against the actual code/DB, rubric
score per `nacl-tl-core/references/intake-scoring.md`) route on the leading
hypothesis with a tracked alternative when `score >= route_threshold`
(envelope gate `medium-confidence-routing`); only sub-threshold atoms batch
into ONE consolidated pre-`/goal` question — and that question carries the
diagnosis (what was checked, per-hypothesis results, blocking fact).
Hard-refuse triggers (billing, auth, schema migration, destructive ops,
product decisions) still refuse before `/goal` — autonomy never swallows
those, and a probe never clears them. Mid-run, a BUG atom that `/nacl-tl-fix`
proves to be a feature (L3-feature exit) is re-typed instead of failed:
FEATURE_SMALL self-heals in-run; FEATURE_HEAVY degrades the atom to
`unsupported` and the run continues.

`intake` is the FIRST alias with `default_mode: autonomous` — it runs without
`--start`. Opt out via `--plan-only`, `--strict`, or `--target=dev-only`.

See SKILL.md §`intake` alias UX, §Flow, §Default safe-exception envelope.

```
alias_name              intake
tier                    M
default_mode            autonomous
check_script            nacl-goal/checks/intake.sh
check_script_args_schema
  required:
    --run-id <goal-run-id>           # script reads ONLY .tl/goal-runs/<run_id>/
                                     # goal text / images / target / policy / budget
                                     # live in artifacts, not shell args
invocation_args (user-facing — NOT passed to check_script)
  positional: <goal: free-text string>     # may include image refs
  opt-out flags:
    --plan-only                            # planning artifacts only
    --strict                               # disable default safe-exception envelope
    --branch=current|new                   # default: current (when on a non-production
                                           # branch); new = pre-2.14 isolated goal branch
    --push=deferred|per-atom|none          # default: deferred (branch_mode=current),
                                           # per-atom (branch_mode=new); none requires
                                           # --target=dev-only
    --target=staging|dev-only              # default: staging (auto from config)
    --budget=<profile>                     # optional budget override
    --new-run                              # force fresh run-id on fingerprint match
expected_evidence_keys
  - intake_status                  # classified | ambiguous | refused
  - plan_locked                    # bool
  - dependency_graph_valid         # bool — topological sort succeeded
  - unsupported_atoms_count        # int — FEATURE_HEAVY or hard-refused atoms,
                                   # incl. atoms re-typed to FEATURE_HEAVY mid-run
                                   # via the tl-fix L3-feature exit (state.json
                                   # state == unsupported); read from live
                                   # atoms/*.state.json, not frozen plan.lock.json
  - atoms_total                    # int
  - atoms_implemented              # int — per-atom state.json == verified
                                   # (re-typed FEATURE_SMALL atoms count by their
                                   # live type from state.json)
  - feature_atoms_total            # int
  - feature_spec_delta_count       # int — UC/spec edits written for FEATURE atoms
  - feature_atoms_verified         # int — /nacl-tl-verify PASS for FEATURE atoms
  - branch                         # string — feature/goal-<short-hash> OR the user's
                                   # current branch (branch_mode=current)
  - branch_head_sha                # string — must equal goal_final_sha at deliver
  - pr_url                         # string | null — one PR per run; stays null when
                                   # push_cadence == none
  - pr_head_sha                    # string — must equal goal_final_sha (n/a when
                                   # push_cadence == none)
  - goal_final_sha                 # string — frozen after last atom verified
  - ci_status                      # success | pending | failure | n/a (push_cadence none)
  - no_new_regressions             # bool — mechanical baseline diff
  - regression_check_mode          # stable_ids | best_effort
  - baseline_command               # string — resolved test command (audit)
  - deploy_target                  # staging | dev-only | none
  - deploy_status                  # healthy | degraded | failed | n/a
  - deployed_sha_matches           # true | false | n/a
  - staging_functional_verified    # bool | n/a
  - dev_verified                   # bool | n/a — dev-only path only
  # --- optional advisory keys (appended 2.14+; absent on pre-2.14 runs) ---
  - branch_mode                    # current | new
  - push_cadence                   # per-atom | deferred | none
  - prior_commits_count            # int — commits already on the branch ahead of
                                   # base_branch when the run started (current mode)
  - branch_base_sha                # string — merge-base(branch, base_branch) at start
  - worktree_isolated              # bool — baseline/postfix ran in isolated worktree
result_decision_rule
  GOAL_OK
    when intake_status == classified
    AND plan_locked == true
    AND dependency_graph_valid == true
    AND unsupported_atoms_count == 0
    AND atoms_implemented == atoms_total
    AND feature_spec_delta_count >= feature_atoms_total
    AND feature_atoms_verified == feature_atoms_total
    AND branch_head_sha == goal_final_sha
    AND no_new_regressions == true
    AND (push_cadence == none            # PR/CI requirements apply only when the
         OR (pr_url != null              # run actually pushes; with none the run
             AND pr_head_sha == goal_final_sha   # ends at verified local commits
             AND ci_status == success))
    AND (
          (deploy_target == staging
           AND deploy_status == healthy
           AND (deployed_sha_matches == true
                OR (deployed_sha_matches == n/a AND staging_functional_verified == true)))
          OR (deploy_target == dev-only AND dev_verified == true AND no_new_regressions == true)
        )
    # push_cadence == none is only reachable with deploy_target == dev-only
    # (the flag combination none+staging is rejected at argument parsing)
  GOAL_NOT_OK
    default — atoms still implementing, CI still pending, etc.
  GOAL_BLOCKED
    when probe-stop-signals.sh emitted any blocker (when wired in 2.10.1)
    OR any of the runtime block codes from refusal-catalog.md GOAL_BLOCKED_*
       (atom failed, branch drifted, regressions detected, CI failed,
        staging unhealthy, deployed SHA mismatch, feature requires product decision)
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 200
    OR elapsed >= 3h
    OR observed_tokens >= 4_000_000   # token accounting is best-effort
tier_c_collisions
  - REFUSE_HUMAN_GATE_BA_SA_HANDOFF
      if classified atoms require BA-layer changes (must pre-run /nacl-ba-handoff)
  - REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION
      if classified atoms imply SA-phase confirmation (escalate to interactive /nacl-sa-full)
  - REFUSE_HOTFIX_JUDGMENT
      if any atom has hard_refuse_triggers including "hotfix_or_release_routing"
  - REFUSE_PRODUCTION_MUTATION
      if the working tree is on main/master/release/* (precheck refuses pre-/goal
      with PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION)
```

Additional intake-specific refusals (NOT covered by existing REFUSE_* codes;
see `refusal-catalog.md` for full entries):

- Pre-`/goal` refusals (`PLAN_BLOCKED_*`): fired by precheck, classify, lock,
  strict pre-flight, privacy precheck, fingerprint dedup.
- Runtime block codes (`GOAL_BLOCKED_*`): emitted during the autonomous loop
  via the check script's `result: GOAL_BLOCKED` + an evidence sub-reason.

---

## conduct (2.18.0)

The multi-cluster orchestrator — sibling of `intake`, for goals that legitimately
span several unrelated modules. Where `intake` is unitary (one intent → one branch →
one PR) and REFUSES a heterogeneous goal with `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`,
`conduct` is the explicit opt-in that materializes that same split as **clusters**:
each cluster ships on its own branch as its own PR, wave-ordered by cross-cluster
dependencies. It borrows the SEMANTICS of `/nacl-tl-conductor` (waves, per-item
lifecycle, max-3 retry, partial-completion handling) WITHOUT its Neo4j dependency —
the wrapper clusters the classified atoms itself (reusing `/nacl-tl-intake`'s
GROUP/SPLIT criteria, the exact inverse of the split detector) and drives the
EXISTING inner skills (`/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-qa`,
`/nacl-tl-ship`, `/nacl-tl-deliver`) once per cluster through the same `NACL_GOAL_*`
env-var integration `intake` uses.

**Decision rule for the user — one coherent change to one area → `intake`; several
unrelated changes across different modules → `conduct`.** The two refuse into each
other: `intake` refuses a heterogeneous goal and points at `conduct`; `conduct`
refuses a homogeneous goal (`PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE`) and points at
`intake`. `conduct --single-pr` forces unitary `intake` behavior from this entry point.

Per cluster, when the cluster's acceptance is UI-bearing, `conduct` runs a BOUNDED
E2E loop: `/nacl-tl-qa` (auto-generates the scenario from acceptance.md) → on a
CRITICAL / MAJOR-in-main-flow bug, route to `/nacl-tl-{dev-be,dev-fe,fix} --continue`
and re-run, up to `max_iterations` (3); MINOR bugs are deferred (filed, not blocking)
and never consume the iteration budget. A cluster that fails does NOT abort its
siblings: dependents become `skipped_blocked_dependency`, independents keep going, and
the run lands `GOAL_BLOCKED_PARTIAL_WAVE` — selectively resumable via
`/nacl-goal resume --clusters=<blocked_ids>` (the already-green PRs are never touched).

See SKILL.md §`conduct` alias UX, §`conduct` Flow.

```
alias_name              conduct
tier                    L
default_mode            autonomous
check_script            nacl-goal/checks/conduct.sh
check_script_args_schema
  required:
    --run-id <goal-run-id>           # script reads ONLY .tl/goal-runs/<run_id>/
                                     # (incl. clusters/<cluster_id>/ subdirs)
invocation_args (user-facing — NOT passed to check_script)
  positional: <goal: free-text string>     # may include image refs
  opt-out / tuning flags:
    --plan-only                            # cluster plan + per-cluster atom plans only;
                                           # no branches, no PRs
    --strict                               # disable default safe-exception envelope
    --target=staging|dev-only              # default: staging (auto from config)
    --budget=<profile>                     # optional budget override (default Tier L)
    --new-run                              # force fresh run-id on fingerprint match
    --max-parallel=<N>                     # clusters run concurrently per wave;
                                           # v1 ships sequential (default 1)
    --clusters=<id,...>                    # run/resume only a subset of locked clusters
    --single-pr                            # DEGRADE to intake semantics (refuse to split)
  NOTE: conduct does NOT expose --branch=current. Per-cluster isolation needs
    per-cluster branches off a controlled integration branch; conduct always operates
    in a branch_mode=new-like posture rooted at integration/goal-<short-hash>.
expected_evidence_keys
  - intake_status                  # classified | ambiguous | refused
  - plan_locked                    # bool
  - cluster_dag_valid              # bool — topological sort over the cluster DAG succeeded
  - clusters_total                 # int
  - clusters_shipped               # int — PR open AND cluster CI success
  - clusters_deployed              # int — deploy_status healthy (or dev_verified)
  - clusters_blocked               # int — clusters in a GOAL_BLOCKED_CLUSTER_* state
  - clusters_skipped               # int — skipped_blocked_dependency
  - clusters_unsupported           # int — all-atoms-unsupported clusters (FEATURE_HEAVY etc.)
  - prs_opened                     # JSON list[string] — one PR URL per shipped cluster
                                   # (ordered by wave, then cluster_id)
  - per_cluster_status             # JSON list[{cluster_id, wave, state, pr_url, ci_status,
                                   #            deploy_status, qa_aggregate,
                                   #            atoms_verified, atoms_total}]
  - atoms_total                    # int — across all clusters
  - atoms_implemented              # int — state==verified across all clusters
  - unsupported_atoms_count        # int — across all clusters
  - no_new_regressions             # bool — run-level postfix diff vs the single
                                   # integration baseline (catches cross-cluster regressions)
  - regression_check_mode          # stable_ids | best_effort
  - baseline_command               # string — resolved test command (audit)
  - deploy_target                  # staging | dev-only | none
  - integration_branch             # string — integration/goal-<short-hash>
  - integration_base_sha           # string — base_branch HEAD when the run started
  - dev_verified                   # bool | n/a — dev-only path (all clusters locally verified)
result_decision_rule
  GOAL_OK
    when intake_status == classified
    AND plan_locked == true
    AND cluster_dag_valid == true
    AND unsupported_atoms_count == 0
    AND clusters_skipped == 0
    AND clusters_blocked == 0
    AND atoms_implemented == atoms_total
    AND no_new_regressions == true
    AND for EVERY cluster c in per_cluster_status:
          c.state == "deployed"
          AND c.qa_aggregate == VERIFIED          # minor-deferred bugs still count VERIFIED
          AND (deploy_target == staging
                 ? (c.ci_status == success AND c.pr_url != null AND c.deploy_status == healthy)
                 : (deploy_target == dev-only ? c.dev_verified == true : true))
    # GOAL_OK is UNREACHABLE while any cluster is blocked, skipped, or unsupported —
    # a deferred cluster is accounted in clusters_blocked/_skipped/_unsupported, never
    # silently dropped, so the run lands GOAL_NOT_OK or GOAL_BLOCKED instead.
  GOAL_NOT_OK
    default — clusters still implementing, CI pending, QA iterating, etc.
  GOAL_BLOCKED
    when probe-stop-signals.sh emitted any blocker (when wired)
    OR a wave drained leaving >=1 cluster blocked/skipped while >=1 shipped green,
       and no sibling can still progress → GOAL_BLOCKED_PARTIAL_WAVE (selectively resumable)
    OR any run-level GOAL_BLOCKED_* (GOAL_BLOCKED_INTEGRATION_DRIFTED, run-level
       regression via GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED, cluster DAG cycle)
  GOAL_BUDGET_EXHAUSTED
    when turns_so_far >= 1200
    OR elapsed >= 16h
    OR observed_tokens >= 20_000_000   # token accounting is best-effort; only wall-clock enforceable
tier_c_collisions
  - REFUSE_HUMAN_GATE_BA_SA_HANDOFF
      if any atom in any cluster requires BA-layer changes (pre-run /nacl-ba-handoff)
  - REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION
      if any atom implies SA-phase confirmation (escalate to interactive /nacl-sa-full)
  - REFUSE_HOTFIX_JUDGMENT
      if any atom has hard_refuse_triggers including "hotfix_or_release_routing"
  - REFUSE_PRODUCTION_MUTATION
      if the working tree is on main/master/release/* (precheck refuses pre-/goal with
      PLAN_BLOCKED_UNSAFE_PRODUCTION_MUTATION; the integration branch is cut FROM a
      non-production checkout)
```

Additional conduct-specific refusals (NOT covered by existing codes; see
`refusal-catalog.md` for full entries):

- Pre-`/goal` (`PLAN_BLOCKED_*`): `PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE` (the goal was
  homogeneous — one cluster — so `intake` is the cheaper, unitary tool),
  `PLAN_BLOCKED_CLUSTER_DAG_CYCLE` (cycle in cross-cluster dependencies),
  `PLAN_BLOCKED_INCOMPATIBLE_CLUSTER_TARGETS` (the residual b/c/d cases of the old split
  criterion: incompatible release targets, mixed feature/hotfix routing, mutually
  exclusive hard-refuse policies). `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED` does NOT fire under
  `conduct` — the multi-module partition IS the cluster set, which is the alias's reason
  to exist.
- Runtime (`GOAL_BLOCKED_CLUSTER_*`): per-cluster failures (`_ATOM_FAILED`, `_CI_FAILED`,
  `_STAGING_UNHEALTHY`, `_DEPLOYED_SHA_MISMATCH`, `_QA_UNRESOLVED`, `_BRANCH_DRIFTED`) that
  do NOT abort sibling clusters; the run-level terminal aggregate `GOAL_BLOCKED_PARTIAL_WAVE`;
  and `GOAL_BLOCKED_INTEGRATION_DRIFTED` (the shared integration branch moved unexpectedly).

---

## Aliases deferred (post-2.10.1)

```
stubs-cleanup:<MOD-ID>       # Tier S; check stub-registry.json empty >= medium
migrate-canary               # Tier L; check MIGRATION-REPORT.md >= 98% coverage
feature:<FR-NNN>             # Tier L; check FR deployed to staging, health PASS
```

Contracts will be added here when their check scripts ship.

---

## Custom alias

```
alias_name              custom
tier                    REQUIRED via --tier=<S|M|L|XL>
check_script            REQUIRED via --check-script=<path>
check_script_args_schema  defined by user-supplied script
expected_evidence_keys  defined by user-supplied script; the wrapper
                        does not validate keys but warns if the
                        evidence block is empty for 3 consecutive turns
result_decision_rule    user-supplied script is responsible for emitting
                        valid result enum
tier_c_collisions       REFUSE_UNTIERED_CUSTOM_GOAL if --tier or
                        --check-script absent.
                        Refuses to start if check_script path matches
                        any path in nacl-goal/gate-fire-detector.md
                        Tier-C signatures.
```
