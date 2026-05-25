# Handoff: Plan The Refinement Of Codex Skills (Post-2.10.0)

## Objective

Produce a phased, executable plan for bringing the Codex skill package
(`skills-for-codex/`) back into deliberate alignment with the root-level
Claude Code skill set after the 2.10.0 release. The deliverable is a **plan
file**, not refined skills. Skill authoring and migration work will be
executed in a follow-up handoff that consumes your plan.

This is a planning agent assignment. End with `ExitPlanMode` if invoked
from plan mode; otherwise produce a clearly demarcated plan document at
the path stated in **Output** below.

## Why now

NaCl 2.10.0 — `goal-protocol-foundation` — shipped on 2026-05-25 and added:

- A new root-level skill `nacl-goal/` (Anthropic `/goal` wrapper).
- `## Use with /goal` annotations on 7 orchestrator SKILL.md files
  (`nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-reopened`,
  `nacl-sa-validate`, `nacl-tl-fix`, `nacl-tl-stubs`, `nacl-migrate`).
- `## NOT for /goal` annotations on 3 gate skills
  (`nacl-ba-full`, `nacl-sa-full`, `nacl-tl-hotfix`).

None of this is reflected in `skills-for-codex/`. There is no
`skills-for-codex/nacl-goal/` directory, and the ten orchestrator/gate
Codex SKILL.md files have not been touched. A Codex user pulling this
repo and running the Codex installer today gets 58 skills (the count
before 2.10.0), not 59, and the Codex variants of orchestrators have no
mention of `/goal`-aware operation.

Beyond 2.10.0, there is a broader question your plan must address:
**there is no documented discipline for keeping Codex skills in sync with
root skills as the root set evolves**. Drift will keep accumulating on
every release. Mtimes already show this — sampled Codex SKILL.md files
were last edited 2026-05-13 to 2026-05-22, while their root counterparts
were edited as recently as 2026-05-25.

## Hard rule before you do anything else

**Read `skills-for-codex/MIGRATION.md` first.** It defines Codex's
deliberate philosophy: a minimal frontmatter (`name` + `description`
only — no `model:`/`effort:`), a standard `Capabilities` section, a
`Source Comparison` section, and a `references/verification-vocabulary.md`
that all skills must agree on. Codex skills are intentionally leaner than
their root counterparts; **the Codex distribution is not a byte-for-byte
mirror, it is a curated minimalist port**. Any plan that recommends
copy-pasting root SKILL.md into `skills-for-codex/` is wrong and must be
rejected by the user before execution.

## Required reading

In this order:

1. `skills-for-codex/MIGRATION.md` — design philosophy (mandatory, see
   above).
2. `skills-for-codex/HANDOFF-ba-skills-review.md`,
   `HANDOFF-sa-skills-review.md`,
   `HANDOFF-tl-skills-review.md` — prior review handoffs for each layer.
   Treat as priors: rules they established still hold unless your plan
   explicitly proposes superseding them, with reason.
3. `skills-for-codex/INSTALL.md` — install model. Notice the canonical
   user-level symlinks via
   `skills-for-codex/scripts/install-user-symlinks.{sh,ps1}`. Any new
   Codex skill directory will need this installer rerun on each user
   machine.
4. `skills-for-codex/references/` — read at least
   `verification-vocabulary.md`, `orchestration-model.md`, and
   `migration-rules.md`. These are the shared contract every Codex skill
   plugs into.
5. **One pair of SKILL.md files**, side by side, to internalize the
   format gap. Recommended pair:
   `nacl-tl-fix/SKILL.md` (root, ~59 KB) and
   `skills-for-codex/nacl-tl-fix/SKILL.md` (Codex, ~22 KB).
6. `docs/releases/2.10.0-goal-protocol-foundation/release-notes.md` —
   what 2.10.0 actually shipped (so you know what needs reflecting).
7. `docs/releases/2.10.1-autonomous-execution/release-notes.md` — what
   the next planned release adds (so your plan does not collide with
   2.10.1 scope on the Claude Code side).
8. `nacl-goal/SKILL.md` (root) plus `nacl-goal/aliases.md`,
   `nacl-goal/refusal-catalog.md`, and the 4 `docs/guides/goal-*` files
   — the source material a Codex variant of `nacl-goal` will have to
   distil down to the Codex format.
9. `docs/setup/install-skills.md` sections "Update Claude Code Skills"
   and "Update Codex Skills" — the user-facing update story your plan
   must keep consistent.

Optional but valuable:

- `nacl-tl-core/references/gate-fire-catalog.md` — the gate inventory
  `nacl-goal`'s refusal catalog cross-references.
- Memory notes (path: `~/.claude/projects/-Users-maxnikitin-projects-NaCl/memory/`):
  - `feedback_no_private_info_in_public_repo.md`
  - `feedback_release_artifacts.md`
  - `feedback_skill_vs_agent_frontmatter.md`
  - `feedback_evaluator_capability_check.md`
  - `project_goal_proof_pattern.md`
  - `project_goal_integration.md`

## Current state — drift inventory

You can re-derive this; the snapshot below is for orientation, not as
ground truth (re-run the comparison yourself before writing the plan):

```
Root has        60 nacl-* dirs (nacl-migrate-core has no SKILL.md → 59 effective)
Codex has       59 dirs (all with SKILL.md)
In root but NOT in skills-for-codex/:   nacl-goal
In skills-for-codex/ but NOT in root:   (none)
```

Sampled mtime / size drift on 2026-05-25:

```
nacl-tl-fix       root: 2026-05-25 (59 KB)   codex: 2026-05-22 (22 KB)
nacl-tl-full      root: 2026-05-25 (47 KB)   codex: 2026-05-22 (12 KB)
nacl-ba-full      root: 2026-05-25 (18 KB)   codex: 2026-05-13 (10 KB)
nacl-sa-feature   root: 2026-04-29 (29 KB)   codex: 2026-05-13  (6 KB)
nacl-tl-conductor root: 2026-05-25 (50 KB)   codex: 2026-05-22 (10 KB)
```

The size gap is **expected** (Codex skills are lean by design — see
`MIGRATION.md`). What is **not** expected is the date gap: ten root
SKILL.md files received new sections this morning (2026-05-25) that the
Codex variants do not reflect.

## Scope of the plan you should produce

Your plan must address all five of these, each in its own phase. Order
matters; do not promote later phases ahead of earlier ones.

### Phase A — Drift audit (write-up only)

Inventory the current divergence between the root nacl-* set and
`skills-for-codex/`. Per skill, classify as one of:

- `MISSING_IN_CODEX` — root skill exists, Codex skill does not.
- `STALE_CODEX` — Codex skill exists but predates a contract change in
  the root variant that the Codex variant must reflect (e.g. new
  `## Use with /goal` annotation, new status code in the
  six-status vocabulary, changed downstream consumer list).
- `INTENTIONAL_DIVERGENCE` — Codex variant deliberately omits content
  per `MIGRATION.md` philosophy. Distinguish this from
  `STALE_CODEX` — the test is whether the divergence is *documented as
  intentional* somewhere in `references/` or `MIGRATION.md`. If not, it
  is stale.
- `IN_SYNC` — Codex variant is current with respect to its intended
  scope.

Output: a table in the plan, with one row per nacl-* skill.

### Phase B — `nacl-goal` Codex variant authoring plan

Author the *plan* for `skills-for-codex/nacl-goal/SKILL.md`. Not the
file itself. The plan must specify:

- The Codex frontmatter (`name`, `description` — describe what the
  description should say in one sentence; do not write it).
- The `Capabilities` section topics, in order.
- The `Source Comparison` section: what is preserved from
  `nacl-goal/SKILL.md`, what is intentionally dropped for the Codex
  variant, and why.
- Which alias check scripts (`wave.sh`, `fix.sh`, `validate.sh`,
  `reopened-drain.sh`) need a Codex-friendly invocation form. Recall
  that Codex orchestration is **not** Task-agent based
  (per `references/orchestration-model.md`); the plan must describe how
  preview-vs-`--start`, GOAL_PROOF emission, and refusal-catalog
  handling translate to Codex semantics.
- Whether the four `docs/guides/goal-*` files need Codex-specific
  companions or whether the existing docs serve both runtimes (your
  plan must choose, with reason).
- Estimated effort (small / medium / large) and which other
  `skills-for-codex/references/` files might need additions.

### Phase C — Stale-Codex remediation plan for the ten annotated skills

The 7 + 3 SKILL.md files that gained `## Use with /goal` / `## NOT for
/goal` annotations in 2.10.0 need their Codex variants updated. For
each of the ten, specify in the plan:

- Whether the Codex variant needs the same section, an abbreviated
  Codex-flavoured equivalent (e.g. a single line in
  `Capabilities`), or no change at all (with reason).
- Where exactly the section goes in the Codex file structure.
- Whether any cross-references (to `nacl-goal/refusal-catalog.md` etc.)
  resolve correctly from inside `skills-for-codex/` or need path
  adjustment.

### Phase D — Ongoing sync discipline

Propose a maintenance regime so this drift does not silently
re-accumulate. Three concrete options to evaluate (you may propose
more):

1. **Manual checklist** — every release includes a "Codex sync TODO"
   item; rely on the release-author to remember.
2. **CI guard** — a script that runs in CI on every PR touching root
   SKILL.md files, flagging any nacl-* whose root SKILL.md changed
   without a corresponding `skills-for-codex/nacl-*` change in the same
   PR. Hard-fail vs warning is a sub-decision.
3. **Generation script** — a tool that re-derives the Codex SKILL.md
   skeleton from the root file via a documented transformation
   (frontmatter strip, section filter, length cap). Costly upfront but
   pays off across years.

For each option, list pros, cons, effort, and at least one prior
counter-example from NaCl's own history (some of these patterns have
failed in NaCl-adjacent projects already — check the retrospectives
under `docs/retrospectives/` for relevant analogues before proposing).

Your plan should recommend **one** option and explain why, not just
present the menu.

### Phase E — Release packaging

Propose how the work above slices into shippable releases. Constraints:

- Do not collide with 2.10.1 — that slot is reserved for
  `autonomous-execution` (the autonomous-execution layer of `/nacl-goal`
  for Claude Code; see `docs/releases/2.10.1-autonomous-execution/`).
- Codex-specific work should travel in its own release slug, e.g.
  `2.10.2 — codex-sync-2.10.0` or `2.11.0 — codex-refinement`, with the
  exact name your call.
- Every release that ships Codex-skill changes must include in its
  release-notes.md a re-run instruction for
  `skills-for-codex/scripts/install-user-symlinks.{sh,ps1}` and a
  pointer to `docs/setup/install-skills.md`'s "Update Codex Skills"
  section.

Output: a small release roadmap (2-4 releases at most). Each entry
states what ships, success criteria, and approximate effort.

## What is NOT in scope for the planner

- Writing or editing any `skills-for-codex/nacl-*/SKILL.md` file.
- Running the Codex installer.
- Touching root-level `nacl-*` skill files.
- Committing or pushing anything.
- Authoring the `nacl-goal` Codex variant (that is Phase B's plan,
  not Phase B's execution).
- Modifying `MIGRATION.md`'s rules. If you believe a rule should
  change, *propose* the change in the plan; do not silently apply it.
- Touching the Claude Code side of the integration (it shipped and
  works).

## NaCl operating constraints to honor in your plan

Quote these by name in the relevant phases:

- `feedback_no_private_info_in_public_repo` — Codex skills ship in the
  public repo. Run the canary grep on any text the plan proposes
  before recommending it land.
- `feedback_release_artifacts` — every release ships docs updates +
  TG-post draft in `docs/releases/<ver>-<slug>/`, plus release-notes.
  Plan must include these artifacts per release.
- `feedback_skill_vs_agent_frontmatter` — Codex SKILL.md frontmatter is
  not the same as either Claude SKILL.md or subagent frontmatter. Per
  `MIGRATION.md` it has `name` and `description` only.
- `feedback_baseline_failures_need_proof` — for any change the plan
  asserts is "safe" or "low-risk," cite the baseline test that would
  prove it (e.g. installer dry-run, count check). Plan should not rely
  on "looks fine."

## Output

**Format:** A single Markdown plan file. Use a top-level
`# Plan — Codex Skill Refinement Post-2.10.0`, then the five phases
above as `## Phase A …` etc. Each phase ends with a **Deliverables**
sub-list (concrete artifacts the execution agent will produce) and an
**Acceptance test** sub-list (how the user knows the phase is done).

**Where to write the plan:**

- If you are invoked in Claude Code plan mode: write to the plan-file
  path the system tells you; end with `ExitPlanMode`.
- Otherwise: write to
  `skills-for-codex/PLAN-codex-skills-refinement-2.10.x.md` and report
  the path.

**Length target:** 400–700 lines. Concise per phase. Resist the urge
to embed the full text of artifacts the execution agent will write —
that is the execution agent's job.

## How to start

1. Open this handoff and `skills-for-codex/MIGRATION.md` side by side.
   Internalize the Codex philosophy before doing anything else.
2. Read the three existing HANDOFF docs in `skills-for-codex/` to
   understand prior reviews and what they did and did not cover.
3. Re-derive the drift inventory (commands in this handoff are a
   snapshot; re-run them on the current tree).
4. Read the `nacl-tl-fix` SKILL.md pair (root vs Codex) end-to-end —
   this is the cheapest way to feel the format gap.
5. Draft the plan in the structure given under **Output**.
6. Before finalizing, validate against every "Hard rule" and every
   constraint in this handoff. Where your plan deviates from a
   constraint, surface the deviation explicitly with a one-line reason
   the user can approve or reject.

## Suggested agent type

This is deep-reasoning, cross-layer planning work without any code
writing — well-matched to the **strategist** subagent type (no Write
tool needed; Read/Grep/Glob/Bash for investigation). If invoked
directly by the user from the command line, plan mode is appropriate.
