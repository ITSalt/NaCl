---
name: nacl-goal
model: opus
effort: high
description: |
  Safety-first wrapper around Anthropic's /goal command. Resolves a high-level
  NaCl alias into a deterministic GOAL_PROOF completion condition that the
  transcript-only evaluator can actually verify. Preview by default — no /goal
  is issued without an explicit --start flag.
  Use when: running a long NaCl loop autonomously, or the user says "/nacl-goal".
---

## Contract

**Inputs this skill consumes:**

- `<alias>` — required positional. One of the named aliases from `nacl-goal/aliases.md`
  (`wave:<N>`, `fix:<BUG-NNN>`, `validate:<MOD-ID>`, `reopened-drain`, `custom`),
  or the special invocations `resume` and `abort <run_id>`.
- `--start` — optional flag. Without it the skill runs in preview/dry-run mode only.
- `--tier=<S|M|L|XL>` — optional override for `custom` alias (mandatory for custom).
- `--check-script=<path>` — path to executable check script for `custom` alias (mandatory for custom).
- `--description="<one line>"` — optional label recorded in the run file.

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

Check scripts shipped in 2.10.1 (stubs in 2.10.0):

```
nacl-goal/checks/stubs-cleanup.sh    <MOD-ID>
nacl-goal/checks/migrate-canary.sh
nacl-goal/checks/feature.sh          <FR-NNN>
nacl-goal/checks/probe-stop-signals.sh   (invoked each turn alongside alias proof)
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
| `nacl-goal/refusal-catalog.md` | All REFUSE_* codes with triggers, messages, fallback commands |
| `nacl-goal/gate-fire-detector.md` | Tier-C gate signatures for runtime detection (populated 2.10.1) |
| `nacl-goal/pricing.json` | v0 Opus 4.7 + Haiku 4.5 rates for Tier L/XL dollar-cost preview |
| `docs/guides/goal-command.md` | Overview, when to use, invocation examples, resume/abort |
| `docs/guides/goal-proof-protocol.md` | GOAL_PROOF wire format schema, field reference, examples |
| `docs/guides/goal-run-schema.md` | .tl/goal-runs/ YAML schema reference |
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

This SKILL.md is the 2.10.0 release (`goal-protocol-foundation`).
Autonomous execution (`--start` fully enabled, `.tl/goal-runs/` enforced,
concurrent lock, crash/resume, runtime gate detector) ships in 2.10.1
(`autonomous-execution`).
