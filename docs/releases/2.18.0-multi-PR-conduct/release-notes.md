# Release 2.18.0 — `multi-PR-conduct`

## Theme

A `/nacl-goal` should be able to drive a **heterogeneous** goal to completion —
several unrelated changes spread across different modules — the way a human lead
would: break the work into piles, order them so dependencies land first, and ship
each pile as its own reviewable PR, iterating on each until it's green. NaCl
already had that machine for graph-resident work (`nacl-tl-conductor`: waves,
per-item lifecycle, max-3 retry, partial-completion handling). It just wasn't
reachable through `/nacl-goal`.

The only autonomous orchestrator was `intake`, which is **unitary by design** —
one intent, one branch, one PR — and it *refuses* a goal that would have to split
across modules with `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`. That refusal was a
signpost pointing at a feature that did not exist yet: it was on the roadmap as
the deferred "multi-PR orchestration" item. 2.18.0 builds it as a **new sibling
alias, `conduct`** — the explicit opt-in that turns that exact split into the
designed behavior.

`intake` is byte-unchanged. You never get multiple PRs by accident; you get them
only when you name `conduct`. The owner's "goal-run is unitary" principle holds —
now scoped to `intake`, with `conduct` as the deliberate multi-PR mode.

## One coherent change → `intake`. Several unrelated changes → `conduct`.

That is the whole decision rule. If you'd review it as one PR, use `intake`; if it
should be several PRs that ship and review independently, use `conduct`. The two
refuse *into each other* so neither silently does the other's job:

- `intake` on a heterogeneous goal → `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`, and the
  message now points at `conduct`.
- `conduct` on a homogeneous goal → `PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE`, and
  the message points back at `intake` (cheaper, unitary).
- `conduct --single-pr` forces unitary behavior from the `conduct` entry point.

## How `conduct` works

`/nacl-goal conduct "<free-text goal>"` classifies the goal exactly as `intake`
does, then partitions the atoms into module-aligned **clusters** — a cluster is a
maximal set of atoms that share a top-level module *or* are connected by a
`depends_on` path. This is precisely the inverse of the split detector that
`intake` uses to refuse. Cross-cluster dependencies form a **cluster DAG**;
topological order gives the **waves**.

Each cluster ships on its own branch, cut from a shared `integration/goal-<hash>`
branch and opened as its own PR, wave-ordered:

```
base_branch (main/master/release/*)        ← never committed to, never switched onto
 └─ integration/goal-<hash>                ← integration branch (wrapper never commits code here)
     ├─ feature/goal-<hash>-<clusterA>     ← Wave 0, cut from integration → its own PR
     ├─ feature/goal-<hash>-<clusterB>     ← Wave 0 (independent) → its own PR
     └─ feature/goal-<hash>-<clusterC>     ← Wave 1, cut AFTER its deps merge into integration
```

When a cluster finishes green, the wrapper merges it into the integration branch
(a merge into a non-protected working branch — permitted; merges into
`main`/`master`/`release/*` stay refused) so the next wave's branches are cut from
a base that already contains their dependencies.

**Graph-less by design.** `conduct` borrows `nacl-tl-conductor`'s *semantics* but
not its Neo4j dependency. It clusters the atoms itself and drives the **existing**
inner skills (`/nacl-tl-fix`, `/nacl-tl-dev*`, `/nacl-tl-qa`, `/nacl-tl-ship`,
`/nacl-tl-deliver`) once per cluster through the same `NACL_GOAL_*` env-var
integration `intake` already proved — so it runs on projects with no SA graph.

## Iterate-until-green, but bounded

The point of a goal-skill is to iterate as many times as needed — not once. Under
`conduct`, when a cluster's acceptance is UI-bearing, the per-cluster lifecycle
includes a **bounded E2E loop**: `/nacl-tl-qa` auto-generates a scenario from
`acceptance.md`, and on a CRITICAL or MAJOR-in-main-flow bug the wrapper routes to
`/nacl-tl-{dev-be,dev-fe,fix} --continue` and re-tests — up to 3 iterations per
cluster. MINOR bugs are deferred (filed, surfaced, never blocking) so a cosmetic
defect can't burn the cluster's budget. The cap plus stop-and-ask is deliberate:
"as many iterations as needed" without a ceiling is how a model thrashes a test to
green. The bounding lives in the orchestrator; `/nacl-tl-qa` itself is unchanged.

## Partial delivery is a first-class, honest state

A cluster that fails does **not** abort its siblings. Its failure is carried as a
`GOAL_BLOCKED_CLUSTER_*` code (atom / CI / staging / deployed-SHA / QA / branch
drift); clusters that depend on it become `skipped_blocked_dependency`,
independents keep going. When the wave drains with a mix of green and non-green
clusters, the run lands `GOAL_BLOCKED_PARTIAL_WAVE` — the honest "some PRs are open
and green, others need attention" state. It is **selectively resumable**:

```
/nacl-goal resume --clusters=<blocked_ids>
```

re-runs only the named blocked clusters against the existing integration branch and
leaves the already-green clusters and their open PRs untouched. `GOAL_OK` is
**unreachable** while any cluster is blocked, skipped, or unsupported — nothing is
ever dropped silently.

## What shipped

- **`nacl-goal/checks/conduct.sh`** (new) — scans `.tl/goal-runs/<run_id>/clusters/*/`,
  aggregates per-cluster state, emits the cluster-aware GOAL_PROOF (`clusters_total/
  shipped/deployed/blocked/skipped`, `prs_opened[]`, `per_cluster_status[]`, …).
- **`nacl-goal/aliases.md`** — the `conduct` binding contract (Tier L,
  autonomy-by-default, ordered evidence keys, result rule, tier-C collisions) and an
  `intake`→`conduct` cross-reference.
- **`nacl-goal/SKILL.md`** — §conduct UX, the cluster-wave Flow (delta over the 14-step
  `intake` Flow), the `NACL_GOAL_CLUSTER_ID` env var, conduct permissions, the
  resumable-state additions, and the version note flipping "multi-PR orchestration"
  from Deferred → shipped.
- **`nacl-goal/refusal-catalog.md`** — split-scope note on
  `PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`; 3 new `PLAN_BLOCKED_*`
  (`SINGLE_CLUSTER_USE_INTAKE`, `CLUSTER_DAG_CYCLE`, `INCOMPATIBLE_CLUSTER_TARGETS`);
  the `GOAL_BLOCKED_CLUSTER_*` family; `GOAL_BLOCKED_PARTIAL_WAVE`;
  `GOAL_BLOCKED_INTEGRATION_DRIFTED`.
- **Schema/contract docs** — `plan-lock-schema.md` (additive `orchestrator` /
  `integration_branch` / `clusters[]` + `clusters/<id>/` layout), `pr-body-template.md`
  (per-cluster bodies + Depends-on trailer), `run-artifacts.md` (per-cluster resume),
  `regression-schema.md` (one baseline, per-cluster postfix), `envelope.md`
  (per-run namespace across clusters).
- **Inner-skill integration** — `nacl-tl-ship` recognizes the additive
  `NACL_GOAL_CLUSTER_ID` (per-cluster artifact base, one PR per cluster, never
  switches branches); `nacl-tl-qa` documents the bounded loop. Both fully
  backward-compatible.
- **Codex mirrors** — `skills-for-codex/nacl-goal`, `…/nacl-tl-ship`, `…/nacl-tl-qa`
  (Codex previews `conduct` but never starts it).
- **Guides** — `goal-command.md`, `goal-proof-protocol.md`, `goal-permissions.md`.

## Verification

- Three new fixture tests under `nacl-goal/checks/tests/` —
  `test-conduct-all-green-goal-ok.sh` (every cluster deployed+green → GOAL_OK),
  `test-conduct-partial-wave.sh` (drained mixed wave → `GOAL_BLOCKED_PARTIAL_WAVE`,
  `resumable: partial`, green sibling survives), and
  `test-conduct-wave-not-drained-not-ok.sh` (blocked cluster + a live sibling stays
  `GOAL_NOT_OK`, never a premature partial). All pass; the five existing `intake`
  check-script tests are unbroken.
- Every `lint-skills.yml` gate replicated locally: frontmatter, hardcoded-paths,
  credential patterns, `check-branch-literals.sh`, `check-version-pins.sh`, and the
  **root/Codex sync gate VERIFIED** (all three changed root SKILL.md files
  co-modified with their mirrors).
- Privacy canary on the full diff: clean (no client names, local paths, or
  operational metadata).

## Validation status (honest)

`conduct` ships as **v1**: the alias contract, the check script, and the inner-skill
integration, fixture-tested and CI-gate-clean. v1 runs clusters **sequentially**
(`--max-parallel=1`) and targets cluster PRs at the base branch. The next milestones
are the **live multi-cluster acceptance run** against a real heterogeneous project,
concurrent cluster execution (`--max-parallel>1`), and best-effort graph
Task-status writes for graph-backed projects — all named in the `nacl-goal/SKILL.md`
version note. No live multi-cluster run is claimed in this release.

## Files

`nacl-goal/checks/conduct.sh` (new), `nacl-goal/checks/tests/test-conduct-{all-green-goal-ok,partial-wave,wave-not-drained-not-ok}.sh` (new),
`nacl-goal/{SKILL,aliases,refusal-catalog,plan-lock-schema,pr-body-template,run-artifacts,regression-schema,envelope}.md`,
`nacl-tl-ship/SKILL.md`, `nacl-tl-qa/SKILL.md`,
`skills-for-codex/{nacl-goal,nacl-tl-ship,nacl-tl-qa}/SKILL.md`,
`docs/guides/{goal-command,goal-proof-protocol,goal-permissions}.md`,
`CHANGELOG.md`, `docs/releases/2.18.0-multi-PR-conduct/`.
