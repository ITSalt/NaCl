# Consolidated Analytical Report: NaCl Skill Chain Across Two Projects

## Position After Cross-Verification

There are no substantive conflicts between the external expert and my analysis. We independently arrived at the same core diagnosis and identified the same seven points of consensus across the four postmortems. The differences lie in emphasis and a few specific formulations. Below is a unified summary that incorporates elements from both analyses that reinforce each other, along with targeted counterarguments where the external expert's formulation needs refinement.

---

## Core Diagnosis (Consensus)

The failure did not occur because developers massively deviated from their tasks. In 10 of 12 deep cases in Project-Alpha and 8 of 8 in project-beta, dev agents executed what was written. The failure lies in the NaCl gate chain: specifications were incomplete or contradictory, while review, QA, status, and release accepted partial evidence as sufficient for PASS / done / production live.

In one sentence: **NaCl currently produces artifacts well but does not rigorously verify that those artifacts are complete, current, consistent with runtime, and actually prove product readiness.**

---

## Triple Ranking of "Where Are the Most Problems"

This is the external expert's most valuable synthesis, which I did not explicitly formalize in my analysis. Accepted and reinforced.

| Axis | Leader | Rationale |
|---|---|---|
| By fix count | Config / infra / CI / deploy — 17 of ~60 classified signals | Boring but numerous: pnpm, MinIO, Prisma generate, TEST_DATABASE_URL, tsconfig divergence, drizzle journal, pm2 entry |
| By product risk | API / wire / provider contracts — 13 cases | Exactly the cases that broke core flows in production: kie.ai in both projects, TUS upload, provider routing, base_url, file URL reachability. Local tests were green; the product did not work |
| By systemic cause | Gate / status / evidence model — pervades everything | UNVERIFIED, SKIP, PARTIAL, stale graph, skipped CI/health, deferred golden path were not converted into blocking states. This is what let every other problem reach "done" |

Three different rankings give three different repair priorities. This matters: fixing only the top of the count list would leave the same product damage in the next iteration — providers and FSM would still break, not CI.

---

## Combined Problem Table Across Both Projects

I accept the external expert's combined table with one clarification. Where he groups "process / docs catch-up" as one case, I consider this category under-counted: the Project-Alpha DIAGNOSTIC-REPORT measured 39% of fixes that never updated documentation. This is not a single case but a systemic Spec First violation pattern.

| Zone | Project-Alpha | project-beta | Total | Primary owners |
|---|---|---|---|---|
| Config / infra / CI / deploy | 13 | 4 | 17 | `nacl-sa-architect`, `nacl-tl-review` |
| API / wire / provider contracts | 8 | 5 | 13 | `nacl-sa-uc`, `nacl-tl-sync`, `nacl-sa-architect` |
| Domain logic / FSM / runtime | 8 | 2 | 10 | `nacl-sa-uc`, `nacl-sa-architect` |
| UI / navigation / cache | 7 | 2 | 9 | `nacl-sa-ui`, `nacl-tl-review` |
| Test infra | 4 | 1 | 5 | `nacl-tl-dev-be`, `nacl-tl-review` |
| Stub / mock / asset packaging | 2 | 1 | 3 | `nacl-tl-stubs`, `nacl-tl-plan` |
| Auth / RBAC | 2 | 0 | 2 | `nacl-sa-uc` |
| Process / Spec First drift | 1 explicit + 39% systemic pattern (project-alpha) | — | 1+ | `nacl-tl-fix` |

---

## Skill Ranking by Failure Count (Mine, Retained)

The external expert decomposes problems by lifecycle phase (BA → SA → TL plan → Dev → Sync → Review → QA → Release) but does not directly rank skills by mention frequency. This is a useful second view — it answers "where should engineering time go first":

1. `nacl-tl-review` — all four reports: PASS with red lint/typecheck/test, does not block UNVERIFIED, does not see missing nav, does not catch duplicate test setup.
2. `nacl-sa-architect` (TECH) — all four: missing external-provider contracts, framework gotchas, CI smoke gates.
3. `nacl-sa-uc` — all four: cross-document inconsistency, missing FSM edges (restart, cancel-while-failing), error envelope shape.
4. `nacl-tl-sync` — all four: TS types ≠ wire format.
5. `nacl-tl-qa` — all four: SKIP-as-PASS, no pre-provider / provider decomposition.
6. `nacl-sa-ui` — all four: navigation as negative space, cache invalidation, route mounting.
7. `nacl-tl-plan` — all four: opaque payload boundaries, non-TS asset packaging.

These seven skills cover 100% of the analyzed cases.

---

## Eight-Step "What's Happening" Model

I accept the external expert's formulation in full — it is more compact than mine and more precisely describes the causal chain:

1. BA/SA produce a useful but incomplete graph and markdown specs.
2. TL planning builds tasks from these artifacts without blocking opaque or external contracts.
3. Dev implements what is written.
4. TL sync confirms type consistency but not wire/runtime consistency.
5. Review accepts page-local or task-local correspondence but does not verify cross-UC story and production invariants.
6. QA verifies screens / components / mocks but not product-like contract flow.
7. Release / status / conductor convert UNVERIFIED, SKIP, PARTIAL, stale graph, skipped CI/health into "good enough to close."
8. Real usage or clean CI exposes what no gate made mandatory.

This explains why both projects show "simple" bugs (missing upload button) sitting next to "complex" bugs (wrong async provider protocol). They share one source: the gate verified a local artifact rather than the full user/protocol invariant.

---

## Targeted Refinements to the External Expert's Position

No substantive conflicts. Three places where I refine the formulation to avoid losing nuance.

### Refinement 1. Claude reports vs Codex reports — not only methodological difference

The external expert writes: "There is no substantive conflict between experts. There are different levels of analysis... different denominators." I agree there is no conflict, but softening it to "different denominator" misses something important: Codex performed a live Cypher check of the Neo4j graph in Project-Alpha and discovered what Claude could not see in principle — a stale handover artifact (970 nodes in snapshot vs 1083 live), `/nacl-sa-validate full` = FAIL with 1 CRITICAL and 156 WARNINGs, FR-007 in changelog but absent from the live graph.

This is a difference not only in "analysis scope" but in **evidentiary base**. Codex can detect a class of problems — "Status / Artifact Drift" — where `.tl/status.json`, conductor-state, changelog, live graph, and release metadata disagree. This class is invisible to analysis that relies only on files and git log. If NaCl repairs skills based on these postmortems without curing this drift, the next postmortem iteration will be built on a stale snapshot and miss part of the real picture.

### Refinement 2. "Detailed reports count only bugs" — inaccurate

The external expert writes: "The detailed report counts only bugs; the Codex report includes process state and control plane." This is an oversimplification. The Claude Project-Alpha report explicitly addresses process failures: case 3.12 (Wave 4 declared PASS with lint+typecheck red) is a process case, not a bug; the DIAGNOSTIC-REPORT metric of 39% of fixes without documentation updates is process analysis; "spec-first discipline eroded over time" is a formulation of systemic process degradation.

More precisely: both experts analyze both bugs and process. The difference is in **operationalization**: Claude describes process gaps qualitatively through artifact quotes; Codex supplements this with programmatic verification (`/nacl-sa-validate`, live Cypher, release-status.json fields, GitHub PR search). Different tools, not different coverage.

### Refinement 3. Reverse proxy in project-beta

The external expert correctly notes the different classification: Claude places `15c6a20 fix: TUS Location header uses https behind Caddy reverse proxy` in the "UI / missing-element" bucket, while Codex isolates it as a separate "runtime / prod-only" case. I agree the Claude classification is genuinely weaker here — this is not a UI bug nor a missing element, it is a runtime gap that no static check would have caught. The bucket in the Claude report is stretched.

This points to a broader classification problem: the "UI / missing-element" bucket in the detailed reports mixes three different failure natures (missing affordance, cache invalidation, reverse-proxy URL scheme). Reclassified carefully, the share of pure "missing UI" would shrink and the share of runtime / protocol gaps would grow — which only reinforces the existing main conclusion that wire / protocol / runtime is the riskiest cluster.

---

## The Most Telling Episode and Highest-Leverage Repair

Both experts cite the same case: **Wave 4 in Project-Alpha, 2026-05-11.** The wave closed at 17:07 as 6/6 PASS. An audit at 17:35 the same evening reproduced: `pnpm -r lint` red, `pnpm -r typecheck` red (3 errors), `publishTaskEvent` / `publishNotification` / `pushSseEvent` defined but never called. The `conductor-state.json` file literally stated `"typecheck": "clean across packages/shared, frontend, backend"` while CI said the opposite. Seven remediation commits followed.

This is the only case in the postmortems where a single invariant could prevent several subsequent fixes at once. The highest-leverage repair on which all four reports converge:

> `nacl-tl-review` cannot PASS-flag while `pnpm -r lint && pnpm -r typecheck && pnpm -r test` are red on the wave-tip commit.

One guard that would have prevented the entire Wave 4 audit cluster (~7 commits) and the systematic pattern "first CI run on a clean runner exposes drift" (~6 config/infra commits in Project-Alpha).

---

## Where the Experts Give Different Repair Priorities

This is the only practically meaningful divergence between Claude and Codex reports, and it deserves to be made explicit because the order of skill-file changes depends on it.

**Claude recommends incrementally, by descending leverage:**
1. `nacl-tl-review` guard on repo-wide green checks.
2. `external-contracts.md` per provider (endpoint, request/response shape, version, fallback).
3. `nacl-tl-sync` wire-format gate (contract test or recorded fixture).
4. CI smoke-test gate before DONE on a TECH task.
5. `nacl-sa-ui` nav-actions section in form spec.
6. `nacl-tl-stubs` shape validation instead of TODO-scan.

**Codex recommends a package-level redefinition of the gate model:**
> A wave cannot be closed if any of the following is true: repo-wide lint/typecheck/test not run or red OR sync verdict = UNVERIFIED OR graph validation stale or skipped OR conductor/status/changelog disagree OR PR/CI gate skipped without a named replacement.

Plus Priority 1 at the release level: blocking gates on stale graph status, missing health URL, skipped PR/CI without a prototype-mode exception.

The philosophical difference: Claude — low regression risk, gradual accumulation of guarantees. Codex — higher risk of changing the process at once but a guaranteed closed loop. The choice depends on the pace at which NaCl is currently used on other projects and how tolerable a 1-2 wave stoppage would be.

---

## What to Do First (Consolidated Priority)

I merge my leverage-ordered list with the external expert's priority frame (by product risk, not only by count).

**Level 1 — Blocking gates (prevent "done" without evidence):**

- `nacl-tl-review`: PASS requires green repo-wide lint/typecheck/test on the wave-tip commit.
- `nacl-tl-sync`: UNVERIFIED is not a PASS state for release / MVP completion. A runnable contract test or recorded fixture is required for any UC with `actor != SYSTEM`.
- `nacl-tl-qa`: SKIP = release blocker by default. For provider-gated UCs, decompose into pre-provider / provider stages — a missing provider key blocks only the provider stage, not ffmpeg / storage / queue.

**Level 2 — Contract modeling (closes the riskiest cluster):**

- `nacl-sa-architect`: an `external-contracts.md` artifact per provider — endpoint, request/response shape, sync vs async lifecycle, polling, model namespace, file URL reachability, failure codes. This single artifact covers ~4 of 8 API-contract fixes in Project-Alpha and most of the provider problems in project-beta.
- `nacl-sa-uc`: durable FSM transition contracts for queue/workflow with explicit DB transaction boundary, lock behavior, emitted events, retry/restart, recovery.
- `nacl-sa-ui`: nav-actions section in form spec; graph rule "user-triggered UC without an inbound action from a reachable screen = blocker."
- `nacl-tl-plan`: block task generation at an opaque payload boundary without a typed schema and consumer list; automatic non-TS asset packaging sub-tasks.

**Level 3 — Artifact synchronization and release gates (close status drift):**

- `nacl-tl-conductor`: reconcile `.tl/status.json`, conductor-state, changelog, live graph before close.
- Release flow: direct strategy without PR is allowed only for explicit local prototype; missing health URL = BLOCKED, not "done with skipped health"; stale graph status = release blocker or a signed exception with a follow-up task.
- `nacl-tl-fix`: refuse to continue L1+ classification without a spec-update commit first in the chain (would cure the 39% of fixes without doc updates from DIAGNOSTIC-REPORT).

---

## Main Conclusion

Converges with the external expert's final formulation, with one reinforcement.

The largest concentration of problems **by count** — config / infra / CI / deploy (17 of 60).
The most dangerous **by product impact** — external provider / wire protocol / runtime contract (13 of 60, but exactly the ones that broke production).
The deepest **systemic cause** — NaCl gates describe evidence but do not make missing evidence blocking.

Reinforcement: a fourth axis is added to these three, visible only in Codex checks — **artifact drift between sources of truth**. `.tl/status.json` says one thing, the live graph another, the changelog a third, release-status a fourth. This class falls into no quantitative bucket because it does not produce fix-commits in the usual sense, but it undermines the reliability of every other gate simultaneously. It is cured only by programmatic reconciliation in `nacl-tl-conductor` and `nacl-publish` — not by practices, not by code review.

For the two analyzed projects this means: NaCl can already produce many useful artifacts but does not yet reliably enough answer the question "can the wave/release be closed?" Right now "there is a spec," "there is a test," "there is a graph," "there is a status" too often means only the existence of the artifact, not its completeness, currency, and verification in real flow.
