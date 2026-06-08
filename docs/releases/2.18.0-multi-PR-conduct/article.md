# Should an autonomous "goal" iterate until done? Building multi-PR orchestration in NaCl

> **Draft.** Companion article to NaCl 2.18.0 (`multi-PR-conduct`). Publication
> targets: Habr, dev.to. Status: design + contract feature; the live
> multi-cluster benchmark is the next milestone (see "Honest status" below).

## The expectation that started it

Picture pointing an autonomous goal-runner at a mixed backlog — a dozen
unrelated changes spread across an admin UI, a calculation service, a database
procedure, some front-end styling, and stale docs. The natural expectation, and
the whole design question in one breath, is this:

> When I set a *goal*, I want it to break the tasks into piles, plan the waves to
> solve the whole pool in an optimal order, spin up sub-agents, and do the piles.
> If it's testing, write the test (including E2E), run it, read the errors, and
> immediately iterate on the critical and major ones. Using a goal-skill is
> exactly for this — to do not one iteration, but as many as it takes to reach
> the goal.

That is a completely reasonable mental model. It is also where most autonomous
orchestrators quietly fall short — and the gap is more interesting than "the
agent was lazy." What usually happens instead is one careful pass and a handoff,
because the safe defaults that prevent autonomy from hurting you also prevent it
from finishing a heterogeneous job. Untangling that is the rest of this article.

## Two true things that pull in opposite directions

**Truth one: a goal-skill should iterate.** The value of pointing an agent at an
objective and walking away is precisely that it loops — write a test, run it,
read the failure, fix the critical and major bugs, re-test — until the objective
is met. One bounded pass is just an expensive linter.

**Truth two: "as many iterations as it takes" is how autonomous agents hurt
you.** With no ceiling, a model under pressure to make a test pass will make the
*test* pass — mutate the assertion, mask the failure, narrow the scope — and
report green. Unbounded iteration is not thoroughness; it's thrash with a
confident voice. Every serious orchestrator caps retries (NaCl's inner loop is
max-3-then-stop-and-ask) for exactly this reason.

And there's a third pull. The backlog above isn't *one* change — it's a dozen
unrelated ones. Bundling an admin-flow E2E, an edge-function fix, a database RPC
change, and CSS tidy-ups into a single pull request produces a giant,
unreviewable diff where a failing CSS task blocks the merge of a real bug fix.
The safe unit of autonomous delivery is "one coherent change, one PR" — which is
exactly why the existing `intake` orchestrator *refuses* a heterogeneous goal
instead of silently splitting it.

So the honest verdict on the complaint: the user was ~70% right (a goal *should*
iterate, and the machine to do it already existed) and ~30% missing the reasons
the safe defaults exist (unbounded iteration and one-giant-PR are genuinely
dangerous). The fix isn't to remove the safety. It's to give the heterogeneous
case its own, properly-bounded mode.

## The machine already existed — in the wrong place

NaCl already had the loop the user described. `nacl-tl-conductor` takes a batch,
orders it into **waves** by dependency, runs each item through a full
lifecycle (develop → review → sync → QA → docs) with **max-3 retry per phase**,
and handles partial completion. Clusters, waves, bounded iteration, per-item
shipping — all of it.

It just wasn't reachable through `/nacl-goal`. The autonomous entry point was
`intake`, which is unitary by design — one intent, one branch, one PR — and
`conduct`'s predecessor refused anything heterogeneous with a block code named
`PLAN_BLOCKED_PLAN_SPLIT_REQUIRED`. That refusal turned out to be a *signpost*:
it marked a feature that was on the roadmap ("multi-PR orchestration") but not
built. The user hadn't hit a wall of cowardice; they'd hit a TODO.

## `conduct`: the heterogeneous sibling of `intake`

2.18.0 ships that TODO as a new alias, `conduct`, deliberately *next to* `intake`
rather than replacing it. The decision rule for a user is a single sentence:

> **One coherent change to one area → `intake`. Several unrelated changes across
> different modules → `conduct`.**

If you'd review it as one PR, use `intake`. If it should be several PRs that ship
and review independently, use `conduct`. And the two aliases refuse *into each
other*, so neither can silently do the other's job: `intake` on a heterogeneous
goal points you at `conduct`; `conduct` on a goal that turns out homogeneous
refuses with `PLAN_BLOCKED_SINGLE_CLUSTER_USE_INTAKE` and points you back. The
project owner's long-standing "a goal-run is unitary" principle is preserved —
now correctly scoped to `intake`, with multi-PR available only when you *name*
`conduct`.

Under the hood, `conduct`:

1. **Classifies** the free-text goal exactly as `intake` does (into bug / task /
   small-feature atoms).
2. **Clusters** the atoms into module-aligned piles — a cluster is a maximal set
   of atoms that share a top-level module *or* are connected by a dependency
   path. This is precisely the inverse of the detector `intake` uses to refuse.
3. **Waves** the clusters by topological order over their cross-cluster
   dependencies.
4. **Ships** each cluster on its own branch — cut from a shared
   `integration/goal-<hash>` branch — as its own PR, in wave order. A green
   cluster is merged into the integration branch so the next wave's branches are
   cut from a base that already contains their dependencies.

Crucially, `conduct` borrows the conductor's *semantics* without its Neo4j
dependency. It does the clustering itself and drives the **existing** inner
skills per cluster through the same environment-variable integration `intake`
already uses — so it works on projects that have no specification graph at all,
which is most real projects.

## Iterate-until-green — with a fuse

This is the part that answers the original complaint directly. When a cluster's
acceptance is UI-bearing, `conduct` runs a **bounded** end-to-end loop:
`/nacl-tl-qa` auto-generates a browser scenario from the acceptance criteria; on
a **critical** or **major-in-main-flow** bug it routes to the right fix skill and
re-tests; up to **three** iterations per cluster. **Minor** bugs are deferred —
filed and surfaced, never blocking — so a cosmetic defect can't consume the
cluster's iteration budget. On exhaustion the cluster stops and asks for a human,
rather than thrashing forever.

That's the resolution of the two opposing truths: the goal *does* iterate, write
test → run → fix critical/major → re-test, exactly as asked — but inside a fuse
that prevents the failure mode that makes "iterate forever" dangerous.

## Partial delivery, told honestly

Real heterogeneous runs don't finish cleanly. So `conduct` makes partial
completion a first-class state instead of a silent loss. A cluster that fails
does **not** abort its siblings: dependents are marked
`skipped_blocked_dependency`, independents keep going, and when the wave drains
with a mix of green and non-green clusters the run reports
`GOAL_BLOCKED_PARTIAL_WAVE` — "these PRs are open and green; these need
attention." It is **selectively resumable**:

```
/nacl-goal resume --clusters=<blocked_ids>
```

re-runs only the named blocked clusters against the existing integration branch
and leaves the already-green clusters and their open PRs untouched. And the
success state is conservative by construction: `GOAL_OK` is *unreachable* while
any cluster is blocked, skipped, or unsupported. Nothing is ever dropped to make
a green checkmark look earned.

## Reproduce it yourself

The orchestration is prose the agent executes, but the completion logic is a
deterministic shell script (`nacl-goal/checks/conduct.sh`) with fixture tests you
can run in seconds — no agent, no cloud, no live stand:

```bash
# from the NaCl checkout
bash nacl-goal/checks/tests/test-conduct-all-green-goal-ok.sh
#   → every cluster deployed+green, clean regression diff → result: GOAL_OK

bash nacl-goal/checks/tests/test-conduct-partial-wave.sh
#   → one green cluster + one blocked, wave drained
#   → result: GOAL_BLOCKED, blocking_reason: GOAL_BLOCKED_PARTIAL_WAVE,
#     resumable: partial, and the green sibling still counts as deployed

bash nacl-goal/checks/tests/test-conduct-wave-not-drained-not-ok.sh
#   → a blocked cluster while a sibling is still in progress
#   → result: GOAL_NOT_OK (never a premature partial)
```

Each test builds a synthetic run directory with `clusters/*/` state and asserts
the aggregated GOAL_PROOF result. They're the reproducible core of the feature —
the kind of artifact you can put on screen and re-run live.

## Honest status

`conduct` ships as **v1**: the alias contract, the completion check script, and
the inner-skill integration — fixture-tested and clean across every CI gate. v1
runs clusters **sequentially** and targets cluster PRs at the base branch. The
**live multi-cluster acceptance run** against a real heterogeneous project,
**concurrent** cluster execution, and best-effort graph status writes are the
named next milestones. This article does not claim a live end-to-end run has
happened — only that the contract and the deterministic completion logic are in
place and tested.

## The takeaway for anyone building agent orchestration

Three things generalized out of this:

- **"Iterate until done" needs a fuse, not faith.** Cap the retries, defer the
  cosmetic, and stop-and-ask on exhaustion. The cap is what makes autonomy
  trustworthy, not a limitation on it.
- **Refusals should be signposts.** The most useful thing the old orchestrator
  did was refuse *legibly* — it named exactly the shape it couldn't handle, which
  is what made the missing feature obvious and safe to build as an opt-in.
- **Partial success is the normal case — design for it.** A multi-step
  autonomous run that can't represent "three of five landed, two need you" will
  either lie or give up. A first-class partial state with a selective resume is
  worth more than a binary done/failed.
