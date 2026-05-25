# /nacl-goal Command

The NaCl wrapper around Anthropic's `/goal` command that adds alias resolution, GOAL_PROOF verification, tier caps, and a mandatory refusal catalog for human-gate skills.

---

## What `/goal` is

Anthropic's `/goal "<condition>"` (released in Claude Code 2.1.139, May 2026) sets a session-scoped objective. After every turn, a small fast evaluator model (Haiku 4.5 by default) reads the conversation transcript and decides whether the condition holds. If not, the primary Claude session is re-prompted to take another turn — potentially for hours or days — without user input.

Key properties:

- One goal per session. A new `/goal` replaces the active one.
- `◎ /goal active` indicator shows elapsed time. `/goal clear` ends the loop.
- Requires workspace trust (uses the hooks system).
- **No native hard cost cap.** Budget clauses inside the condition are soft — they work only if the primary session prints budget state into the transcript every turn and the evaluator respects the instruction.
- **The evaluator does not run tools.** It cannot execute Cypher, read `.tl/status.json`, call YouGile, or grep any file. It only reads what the primary session has written into the transcript.
- `/goal` starts a turn immediately on invocation. There is no built-in preview or confirm mode.

## What `/nacl-goal` adds

`/nacl-goal` wraps `/goal` with:

- **Alias resolution.** Human-readable aliases (`wave:5`, `fix:BUG-042`, `reopened-drain`, `validate:module:AUTH`) expand to the full GOAL_PROOF-instructing condition automatically.
- **GOAL_PROOF protocol.** The composed condition instructs the primary session to run a deterministic check script every turn and print a structured `GOAL_PROOF` block into the transcript. The evaluator reads that block — not raw filesystem state. See [./goal-proof-protocol.md](./goal-proof-protocol.md).
- **Mandatory tier cap.** Every alias carries a soft budget (turns, wall-clock hours, observed token target) from the tier table. See §Tier table below.
- **Refusal catalog.** Ten structured refusal codes prevent `/nacl-goal` from wrapping human-approval gates. See `nacl-goal/refusal-catalog.md`.
- **Dry-run-first invocation.** `/nacl-goal <alias>` without `--start` prints a full preview and exits. No `/goal` is issued, no turn is consumed.

## The three tiers of NaCl objectives

### Tier A — Pure execution loops (great fit)

These skills have graph-checkable finish lines and no mandatory human-approval step within the loop. `/nacl-goal` can wrap them cleanly.

Skills:

- `nacl-tl-full` — walking Wave N to N+1
- `nacl-tl-conductor` — running a task batch from backlog
- `nacl-tl-reopened` — draining QA failures from the Reopened column
- `nacl-sa-validate` — re-running validators until green
- `nacl-tl-fix` — resolving a specific bug (non-L0/L1)
- `nacl-tl-stubs` — cleaning up module stubs

### Tier B — Bounded orchestration (good fit with guards)

These skills can be wrapped when the alias is scoped tightly and the Tier-C collision check passes.

Skills:

- `nacl-migrate` — migration run, up to but not including the retrospective gate

### Tier C — Human-gate skills (MUST NOT wrap)

`/nacl-goal` refuses at preview time to wrap these. They contain mandatory human-approval gates that cannot be swallowed into a loop.

Skills:

- `nacl-ba-full` — BA intake requires user review of each phase output
- `nacl-sa-full` — SA phase confirmations between context, domain, roles, UC, UI, finalize
- `nacl-tl-hotfix` — emergency routing requires human judgment about urgency, scope, and target branch
- `nacl-migrate` past the canary retrospective gate — per `feedback_migration_retrospective_gate` memory, a mandatory 3-sub-agent audit and explicit user approval are required

See [./goal-permissions.md](./goal-permissions.md) for the full refusal logic.

---

## Invocation

### Phase 1 — Preview (default)

```
/nacl-goal <alias>
```

No `/goal` is issued. No turn is consumed. Prints:

- Resolved alias and tier
- Soft budget (turns, wall-clock, observed token target)
- `check_script` path and invocation pattern
- Full GOAL_PROOF-instructing completion condition, verbatim
- Human gates that would block the alias, or `"none detected"`
- Permissions denylist that will be enforced
- For Tier L/XL: estimated dollar cost (from `nacl-goal/pricing.json`)
- The exact `--start` command to copy-paste

### Phase 2 — Start

```
/nacl-goal <alias> --start
```

Issues `/goal` with the composed condition. In 2.10.0, `--start` warns and exits for Tier S/M and refuses outright for Tier L/XL. Full autonomous execution ships in 2.10.1.

---

## The four aliases shipped in 2.10.0

### `wave:<N>`

Tier M. Drives `nacl-tl-full` or `nacl-tl-conductor` through all tasks in Wave N until every task is PASS and no REGRESSION or UNVERIFIED tasks remain. Check script: `nacl-goal/checks/wave.sh <N>`.

### `fix:<BUG-NNN>`

Tier S. Resolves a specific bug: writes and verifies RED regression test, applies fix, verifies GREEN, opens PR. Does not apply to L0/L1 emergency bugs. Check script: `nacl-goal/checks/fix.sh <BUG-NNN>`.

### `validate:module:<MOD-ID>`

Tier S. Re-runs all seven NaCl validators (L1–L7 plus BA-SA cross-validation if applicable) for a module until all pass. Check script: `nacl-goal/checks/validate.sh <MOD-ID>`.

### `reopened-drain`

Tier M. Drains all items from the Reopened column of the current project board. Routes each item to `nacl-tl-fix`. Refuses any item tagged emergency or hotfix. Check script: `nacl-goal/checks/reopened-drain.sh`.

Full alias contracts are in [../../nacl-goal/aliases.md](../../nacl-goal/aliases.md).

---

## Mandatory tier cap convention

All three columns below are **soft** limits. `/goal` cannot hard-enforce any of them — the evaluator is transcript-only and the budget clause inside the condition works only if the primary session prints budget state every turn. A true hard cap requires an external runner, documented as future work for 2.10.2+.

**Do not run XL unattended overnight in 2.10.0 or 2.10.1.**

| Tier | turns_soft | wall_clock_soft | observed_token_target |
|------|----------:|-----------------|----------------------:|
| S    | 150        | 2 h             | 3,000,000             |
| M    | 500        | 6 h             | 8,000,000             |
| L    | 1,200      | 16 h            | 20,000,000            |
| XL   | 3,000      | 36 h            | 50,000,000            |

Turn and wall-clock are surfaced through `GOAL_PROOF` every turn and trigger `GOAL_BUDGET_EXHAUSTED` via the in-condition instruction.

---

## The gate-respect rule

`/nacl-goal` refuses — at preview time, statically — to wrap these skills:

| Skill | Refusal code | Reason |
|---|---|---|
| `nacl-ba-full` | `REFUSE_HUMAN_GATE_BA_SA_HANDOFF` | BA layer requires user review of each phase output |
| `nacl-sa-full` | `REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION` | Each SA phase has a mandatory confirmation gate |
| `nacl-tl-hotfix` | `REFUSE_HOTFIX_JUDGMENT` | Emergency routing requires human judgment about urgency and target branch |
| post-canary `nacl-migrate` | `REFUSE_POST_CANARY_RETROSPECTIVE` | Retrospective gate requires 3-sub-agent audit and explicit user approval |

Every refusal names the specific gate, cross-references `nacl-tl-core/references/gate-fire-catalog.md`, and prints the copy-paste command for the interactive fallback path.

See [./goal-permissions.md](./goal-permissions.md) for the full denylist, per-alias allowlist, and mode requirements.

---

## Crash / resume

Full crash/resume protocol ships in 2.10.1. Brief summary:

On `--start`, a `goal_in_progress` marker is written to the graph. On `/nacl-init` session start (or bare `/nacl-goal` invocation), any stale marker is detected and the following options are offered:

```
/nacl-goal resume               # re-runs check; if not GOAL_OK, re-issues /goal
                                # with same alias and remaining budget
/nacl-goal abort <run_id>       # clears marker, writes exit_reason=crashed
                                # to the run file
```

Run files are written to `.tl/goal-runs/`. Schema: [./goal-run-schema.md](./goal-run-schema.md).

---

## Worked examples

### Example 1 — Wave preview

```
/nacl-goal wave:5
```

Preview output (no `/goal` issued):

```
alias:       wave:5
tier:        M
check_script: nacl-goal/checks/wave.sh 5
soft_budget:
  turns:         500
  wall_clock:    6h
  observed_tokens: 8,000,000

Completion condition (verbatim):
  Continue working toward this alias: wave:5.

  At the end of EVERY turn, run this command and print its raw output:
      ./nacl-goal/checks/wave.sh 5

  Then print exactly one block, with no other prose between the
  command output and this block:

      GOAL_PROOF
      alias: wave:5
      ...
      END_GOAL_PROOF

  The goal is satisfied ONLY when the latest GOAL_PROOF block has
  result == GOAL_OK AND .tl/goal-runs/<run_id>.md exists AND that
  file contains the final proof.

human_gates_detected: none

denylist_active:
  - git push (any remote)
  - git merge into main/master/release/*
  - npm publish / gh release create
  - production DB migrations
  - rm -rf outside workspace
  - editing .env*, secrets, credentials

To start:
  /nacl-goal wave:5 --start
```

### Example 2 — Fix alias, no preview step

```
/nacl-goal fix:BUG-042 --start
```

Resolves to Tier S. Check script is `nacl-goal/checks/fix.sh BUG-042`. Soft budget: 150 turns, 2 h. The primary session drives `nacl-tl-fix` and prints a GOAL_PROOF block at the end of every turn. On `result: GOAL_OK` the evaluator clears the goal; the wrapper runs the post-completion re-check and writes `.tl/goal-runs/<run_id>.md`.

In 2.10.0 this prints a warning and exits without issuing `/goal`. Full execution in 2.10.1.

### Example 3 — Reopened drain

```
/nacl-goal reopened-drain --start
```

Tier M. Drains the Reopened column. Items tagged emergency trigger `REFUSE_HOTFIX_JUDGMENT` before any `/goal` is issued. On clean start, the condition instructs the session to drain items one at a time via `nacl-tl-fix`, checking the board state each turn via `nacl-goal/checks/reopened-drain.sh`.

---

## What to do when `/goal active` is stuck

If the `◎ /goal active` indicator is showing but no progress is visible:

1. Run `/goal clear` to end the loop immediately. The goal clears without writing a run file.
2. Check `.tl/goal-runs/` for a partial run file from this session. The `turns_so_far` and `elapsed` fields show how far the session got.
3. If the session crashed mid-run (2.10.1+), run `/nacl-goal resume` or `/nacl-goal abort <run_id>` to clean up the graph marker.
4. Review the transcript for the most recent `GOAL_PROOF` block. The `result` and `evidence` fields will show what state the session was in before it stalled.

---

## Custom alias

```
/nacl-goal custom \
  --tier=<S|M|L|XL>            # mandatory
  --check-script=<path>         # mandatory; must exist, executable,
                                # and produce GOAL_PROOF-compatible output
  --description="<one line>"    # recorded in run file
  --start                       # separate invocation required
```

Custom without `--check-script` or `--tier` returns `REFUSE_UNTIERED_CUSTOM_GOAL`. Custom may not target paths matching the Tier-C catalog in `nacl-goal/gate-fire-detector.md`.
