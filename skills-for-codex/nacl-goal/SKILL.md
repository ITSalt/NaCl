---
name: nacl-goal
description: |
  Prepare and validate NaCl `/goal` aliases, GOAL_PROOF checks, structured
  refusals, and preview output for compatibility with `/nacl-goal`. Covers the
  autonomy-by-default `intake` (single-PR) and `conduct` (multi-cluster, one PR
  per cluster) orchestrators — Codex previews both but never starts them.
---

# NaCl Goal Compatibility For Codex

## Installation mode preflight

Before any workflow work, reuse a `nacl_installation_doctor` result from the
current invocation or call that tool once when it is available. Continue only
when it returns `status=VERIFIED`; a `FAILED` or `BLOCKED` result stops the
workflow with its actionable guidance.

If the tool is absent or cannot be called, never infer legacy-only mode.
Resolve the helper relative to the directory containing this loaded `SKILL.md`
(the symlink or canonical target is acceptable), never from the project cwd,
then run `node ../nacl-core/scripts/nacl-installation-fallback.mjs`; it reads only the
current environment's `codex plugin list --json` catalog. Continue only for
`status=VERIFIED` plus `mode=legacy-only`. An enabled NaCl plugin is `FAILED`;
a disabled artifact, unavailable CLI, nonzero command, or malformed catalog is
`BLOCKED`. Do not copy credentials or fall through on uncertainty.

Prepare goal-compatible NaCl previews and checks without pretending Codex has
Anthropic `/goal` control when the current runtime does not expose it.

## Required References

Read these references before composing previews, start instructions, or
compatibility reports:

- `../references/goal-codex-contract.md`
- `../references/verification-vocabulary.md`
- `../../nacl-goal/SKILL.md`
- `../../nacl-goal/aliases.md`
- `../../nacl-goal/refusal-catalog.md`
- `../../docs/guides/goal-command.md`
- `../../docs/guides/goal-proof-protocol.md`
- `../../docs/guides/goal-permissions.md`

`feedback_skill_vs_agent_frontmatter`: Codex SKILL.md frontmatter for this
package remains `name` and `description` only per `MIGRATION.md`.

## Codex Runtime Boundary

Codex may prepare `/nacl-goal` previews, resolve aliases, run local check
scripts, and report compatibility status. Codex must not claim Anthropic
`/goal` ran unless the active runtime exposes that command and evidence exists.

If autonomous start is requested and the runtime has no `/goal` primitive,
print the composed interactive fallback and report:

```text
Status: BLOCKED
Reason: goal-runtime-unavailable
```

If only preview was requested, report:

```text
Status: NOT_RUN
Reason: preview-only
```

## Invocation

Support the same user-facing intent as the root `/nacl-goal` skill:

```text
nacl-goal <alias>          # preview only
nacl-goal <alias> --start  # guarded start, runtime dependent
```

Preview is always the safe default. It consumes no `/goal` turn and performs no
irreversible mutation.

## Preview Semantics

Compose preview output with:

- resolved alias name and canonical form;
- tier and budget information from `../../nacl-goal/aliases.md`;
- check script path and arguments;
- GOAL_PROOF instruction block from the root protocol;
- human gates and structured refusal codes when statically detectable;
- permission denylist summary;
- exact interactive fallback when Codex cannot start `/goal`.

Preview may run a check script only as read-only evidence. When no script runs,
report `Status: UNVERIFIED`.

## Start Semantics

Guard `--start` strictly:

- If the active runtime exposes Anthropic `/goal`, print the composed command
  and require explicit user confirmation before invoking or advising it.
- If the active runtime does not expose Anthropic `/goal`, do not simulate it.
- Do not write `.tl/goal-runs/`, graph state, tracker state, release state, or
  production state from preview mode.
- Treat dynamic gate detection as runtime behavior; do not claim it is active
  without implementation evidence.

## Alias Resolution

Resolve built-in aliases from `../../nacl-goal/aliases.md`.

| Alias | Check command |
|---|---|
| `wave:<N>` | `../../nacl-goal/checks/wave.sh <N>` |
| `fix:<BUG-NNN>` | `../../nacl-goal/checks/fix.sh <BUG-NNN>` |
| `validate:module:<MOD-ID>` | `../../nacl-goal/checks/validate.sh <MOD-ID>` |
| `reopened-drain` | `../../nacl-goal/checks/reopened-drain.sh` |

Deferred 2.10.1 aliases are `stubs-cleanup:<MOD-ID>`, `migrate-canary`, and
`feature:<FR-NNN>`. Do not report them as 2.10.0-ready aliases.

The `intake` alias (2.10.1+, `../../nacl-goal/checks/intake.sh`) is
autonomy-by-default and Claude-runtime only; Codex previews it but never
starts it. When previewing, resolve and surface the branch/push dimensions
from `../../nacl-goal/aliases.md` §intake: `branch_mode`
(`current` default on a non-production branch | `new` via `--branch=new`),
`push_cadence` (`deferred` default in current mode — one push at deliver |
`per-atom` | `none`), and the Smart-WIP overlap protocol (uncommitted files
from concurrent agents do not refuse the run; overlap with an atom's
predicted zone resolves via one consolidated pre-start question). Preserve
the new codes `GOAL_BLOCKED_WIP_COLLISION` (the only resumable
GOAL_BLOCKED) and the mode-conditional `PLAN_BLOCKED_DIRTY_WORKTREE`
triggers exactly as catalogued. On the dev-only path the wrapper records
the local verify outcome to `.tl/goal-runs/<run_id>/dev-verified.json`
(read by `intake.sh`; absent → `n/a`); under `--push=none` the run ends at
verified local commits with no PR and `ci_status: n/a`.

Question policy (2.14+, probe-scored since intake-self-diagnosis): the
wrapper invokes `/nacl-tl-intake --autonomous --yes --emit-state`. Intake
self-diagnoses first (source Step 2a.5 PROBE): atoms the graph alone did not
resolve get their hypotheses verified against the actual code/DB and a
rubric score (`../nacl-tl-core/references/intake-scoring.md`; thresholds
from the project `config.yaml -> intake.*`). Surface in previews that L2/L3
launch-sanity auto-confirms, probe-scored atoms auto-route on the leading
hypothesis when the score clears the routing threshold (envelope gate
`medium-confidence-routing`, audit-logged; tracked alternative + blocking
fact), only sub-threshold atoms produce ONE consolidated pre-start question —
which carries each atom's diagnosis (what was checked, per-hypothesis
results, blocking fact) — and hard-refuse triggers (billing / auth / schema
migration / destructive ops / product decisions) still refuse before
`/goal`; a probe never clears them.
`PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION` now fires only for sub-threshold
atoms left unresolved after the probe AND that batch. Mid-run, a BUG atom
that `/nacl-tl-fix` proves to be a feature (`exit_reason: L3-feature`) is
re-typed, not failed: FEATURE_SMALL re-enters the same run; FEATURE_HEAVY
marks the atom `unsupported` (counts toward `unsupported_atoms_count`) and
the run continues.

The `conduct` alias (2.18.0+, `../../nacl-goal/checks/conduct.sh`) is the
multi-cluster sibling of `intake` — autonomy-by-default, Claude-runtime only;
Codex previews it but never starts it. It is for HETEROGENEOUS goals that span
several unrelated modules: where `intake` is unitary and refuses such a goal with
`PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`, `conduct` materializes that split as
module-aligned CLUSTERS, each shipping its OWN branch and PR, wave-ordered by
cross-cluster dependencies. When previewing, resolve from
`../../nacl-goal/aliases.md` §conduct: tier L, the per-cluster evidence keys
(`clusters_total/shipped/deployed/blocked/skipped`, `prs_opened[]`,
`per_cluster_status[]`), and the flags `--max-parallel` (v1 sequential, default 1),
`--clusters=` (selective resume), `--single-pr` (degrade to intake). Branches are
cut from a shared `integration/goal-<hash>` branch (never committed to as code;
never `main`/`master`/`release/*`). Preserve the conduct-scoped codes exactly:
`PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE`, `PLAN_BLOCKED_CLUSTER_DAG_CYCLE`,
`PLAN_BLOCKED_INCOMPATIBLE_CLUSTER_TARGETS`, the `GOAL_BLOCKED_CLUSTER_*` family
(per-cluster failures that do NOT abort siblings), `GOAL_BLOCKED_PARTIAL_WAVE`
(the only `resumable: partial` state — `resume --clusters=<ids>` re-runs only the
blocked clusters, leaving green PRs untouched), and `GOAL_BLOCKED_INTEGRATION_DRIFTED`.
Surface the user's decision rule: one coherent change to one area → `intake`;
several unrelated changes across modules → `conduct`. The two refuse into each
other (`intake`→`conduct` on a heterogeneous goal; `conduct`→`intake` on a
homogeneous one). The bounded per-cluster QA loop (`/nacl-tl-qa`, max 3 iterations;
CRITICAL/MAJOR iterate, MINOR defer) is Claude-runtime behavior — preview it but
do not execute it.

For `fix:<BUG-NNN>`, preserve RED-first and PR-open evidence requirements. L0
or L1 emergency bugs route to refusal or interactive handling, not the ordinary
fix loop.

For `validate:module:<MOD-ID>`, validator truth comes from graph-backed
validation evidence surfaced through GOAL_PROOF.

For `reopened-drain`, preserve tracker reachability and emergency or hotfix
refusal behavior.

When operating outside the NaCl checkout, resolve the checkout first and show
absolute check-script paths in the preview.

## GOAL_PROOF Contract

Keep GOAL_PROOF field names and refusal codes stable. GOAL_PROOF is transcript
evidence for the evaluator and a check-script output format. It is not a
replacement for local verification and is not proof that a goal loop ran.

Use the root schema in `../../docs/guides/goal-proof-protocol.md`.

## Refusal Catalog

Use `../../nacl-goal/refusal-catalog.md` for the full refusal catalog. Preserve
codes exactly, including:

- `REFUSE_HUMAN_GATE_BA_SA_HANDOFF`
- `REFUSE_HUMAN_GATE_SA_PHASE_CONFIRMATION`
- `REFUSE_HOTFIX_JUDGMENT`
- `REFUSE_POST_CANARY_RETROSPECTIVE`
- `REFUSE_PRODUCTION_MUTATION`
- `REFUSE_UNTIERED_CUSTOM_GOAL`
- `REFUSE_UNTRUSTED_WORKSPACE`
- `REFUSE_HOOKS_DISABLED`
- `REFUSE_CONCURRENT_GOAL_LOCKED`
- `REFUSE_DANGEROUSLY_SKIP_PERMISSIONS`

Refusal handling must fire at preview time wherever statically possible.

## Permissions And Human Gates

Never run with, recommend, or bypass:

- permission skipping;
- disabled hooks;
- untrusted workspace state;
- mandatory BA-SA handoff, SA phase confirmation, hotfix judgment, or
  post-canary retrospective gates;
- graph, git, tracker, release, or production mutation during preview.

If a mandatory gate blocks autonomous operation, report `Status: BLOCKED` or
`Status: NOT_RUN` and provide the interactive fallback.

## Capabilities

### May Do

- Resolve built-in aliases from `../../nacl-goal/aliases.md`.
- Read root `/goal` docs and root check scripts.
- Produce preview text without starting a goal loop.
- Run check scripts locally when the checkout and shell are available.
- Report compatibility status with the Codex closed vocabulary.

### Must Not Do

- Pretend Codex can issue Anthropic `/goal` unless the runtime exposes that
  command in the current environment.
- Suppress mandatory human gates.
- Rename GOAL_PROOF fields or refusal codes.
- Run with or recommend permission bypass.
- Mutate graph, git, tracker, release, or production state during preview.

### Conditional Tools And Actions

- Shell execution is conditional on local tool availability and permission.
- Graph and tracker reads are conditional on configured tools.
- Actual autonomous start is external-runtime dependent.
- If actual `/goal` is unavailable, print the exact interactive fallback and
  report `Status: BLOCKED` or `Status: NOT_RUN`, not success.

### Blocked Or Unverified Reporting

- Use `BLOCKED` for missing checkout, missing scripts, unavailable `/goal`,
  disabled hooks, untrusted workspace, or denied permissions.
- Use `UNVERIFIED` when preview can be composed but no check script ran.
- Use `NOT_RUN` when `--start` is intentionally not attempted by Codex.
- Lead the report with the plain-language reason + copy-paste fallback; the
  `PLAN_BLOCKED_*` / `REFUSE_*` code is a trailing tag, not the headline, and
  internal step numbers / `Tier-C` never appear in user-facing text (see the
  rendering rule in `../../nacl-goal/refusal-catalog.md`).

## Source Comparison

- Source Claude skill path: `../../nacl-goal/SKILL.md`

### Preserved Methodology

- Two-phase preview then start.
- Alias catalog and tier model.
- GOAL_PROOF wire format.
- Structured refusal catalog.
- Permission denylist and human-gate split-mode behavior.
- 2.10.0 versus 2.10.1 capability distinction.

### Removed Claude Mechanics

- Claude frontmatter fields.
- Instructions that assume Task-agent mechanics.
- Claims that Codex can directly issue Anthropic `/goal` when no such runtime
  primitive is available.
- Long duplicated guide prose already maintained under `docs/guides/`.
- Full refusal-message catalog text when a reference link is enough.

### Codex Replacement Behavior

- Prepare and verify goal-compatible commands.
- Execute deterministic local checks only when tools are available.
- Treat `/goal` start as an external runtime action unless proven available.
- Keep GOAL_PROOF and refusal codes as stable protocol references.
