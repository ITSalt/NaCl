# /nacl-goal alias catalog

The four aliases shipped in 2.10.0. Three more (`stubs-cleanup`,
`migrate-canary`, `feature`) ship in 2.10.1.

Each alias entry is the binding contract between the wrapper, the
check script, and the GOAL_PROOF protocol. All check scripts MUST
produce the `expected_evidence_keys` listed here, in the same order,
or v12 docs review fails.

Format:

```
alias_name              <string>
tier                    <S|M|L|XL>
check_script            <path under nacl-goal/checks/>
check_script_args_schema  <args contract>
expected_evidence_keys  <ordered list>
result_decision_rule    <when each result fires>
tier_c_collisions       <gates this alias must refuse to cross>
```

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
  - xl_pass                      # bool — XL6-XL9 (BA→SA cross-validation)
                                 # only when MOD-ID has BA layer
  - failing_validators           # list of failing validator IDs
  - last_run_at                  # ISO-8601
result_decision_rule
  GOAL_OK
    when l1_pass..l7_pass all true
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

## Aliases deferred to 2.10.1

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
