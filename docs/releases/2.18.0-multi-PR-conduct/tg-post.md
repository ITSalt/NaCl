NaCl 2.18.0 — multi-PR-conduct

A `/nacl-goal` should be able to drive a *heterogeneous* goal to completion — several unrelated changes across different modules — the way a human lead would: break the work into piles, order them so dependencies land first, ship each pile as its own reviewable PR, and iterate on each until it's green. NaCl already had that machine (`nacl-tl-conductor`: waves, per-item lifecycle, max-3 retry); it just wasn't reachable through `/nacl-goal`. The only autonomous orchestrator was `intake`, which is unitary by design — one intent, one branch, one PR — and *refuses* a goal that would split across modules. That refusal was a signpost for a deferred roadmap feature. 2.18.0 ships it: a new sibling alias, `conduct`.

What's inside:

— **One rule to choose.** One coherent change to one area → `intake`. Several unrelated changes across different modules → `conduct`. The two refuse *into each other* (`intake`→`conduct` on a heterogeneous goal; `conduct`→`intake` on a homogeneous one), so neither silently does the other's job. `intake` is byte-unchanged — multi-PR is never a default, only the named alias.

— **Clusters and waves.** `conduct` partitions the classified atoms into module-aligned clusters (the inverse of `intake`'s split detector), builds a cluster DAG, and ships each cluster on its own branch — cut from a shared `integration/goal-<hash>` branch — as its own PR, wave-ordered by cross-cluster dependencies. Graph-less by design: it borrows `nacl-tl-conductor`'s semantics without the Neo4j dependency, driving the existing inner skills per cluster — so it runs on projects with no SA graph.

— **Iterate-until-green, but bounded.** When a cluster's acceptance is UI-bearing, `conduct` loops `/nacl-tl-qa` → fix → re-test for CRITICAL / MAJOR bugs, capped at 3 iterations; MINOR bugs are deferred. "As many iterations as needed" without a ceiling is how a model thrashes a test to green — the cap plus stop-and-ask is deliberate.

— **Partial delivery is honest.** A cluster failure doesn't abort its siblings: dependents are skipped, independents keep going, and a drained mixed wave lands `GOAL_BLOCKED_PARTIAL_WAVE` — selectively resumable via `/nacl-goal resume --clusters=<ids>`, which re-runs only the blocked clusters and leaves the already-green PRs untouched. `GOAL_OK` is unreachable while any cluster is blocked — nothing is dropped silently.

Ships as v1: contract + check script + inner-skill integration, fixture-tested and CI-gate-clean. v1 is sequential; the live multi-cluster acceptance run, concurrent clusters, and graph Task-status writes are the next milestones.

Release notes: docs/releases/2.18.0-multi-PR-conduct/release-notes.md
