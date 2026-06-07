# Release 2.15.0 — `connected-spec-graph`

## Theme

Before 2.15, the spec graph described a system but did not react to change.
`nacl-sa-feature` wrote impact edges nobody downstream ever read; `nacl-tl-plan`
baked field types and role permissions into task files that silently aged;
nothing marked a downstream node "needs review" when its upstream moved; and
the *why* behind every decision lived only in git commit messages. Adding new
artifact types on top of that change model would have amplified drift — more
entities to forget to update.

2.15 ships a five-phase roadmap that fixes the change model first and only then
layers new artifact types on top. One invariant runs through every phase:
**every new node type is born with a required parent edge, a required
cross-layer anchor, registration in the impact-closure allow-list, and its own
validator level — a node structurally cannot be orphaned.** Pull any node (a
use case, a domain attribute, an endpoint) and the graph shows every place that
needs review and blocks closure until it happens; ask "why is it built this
way" a year later and the answer is one Cypher traversal over `:Decision`
chains, no Markdown archaeology.

In numbers: 12 new node types, ~28 edge types registered in the traversal
allow-list, six new validator levels (L8–L13, ~40 checks), three producer
skills extended, two consumer hooks, five lab reports with reference results,
and a five-article research series (RU).

## Phase 0 — change propagation + decision provenance (L8, L9)

- `sa_impact_closure` traversal computes the dependency set of any change;
  write-skills stamp a stored `review_status` on it (hybrid model). The stamp
  is **directed and tight** — affected UCs' tasks + transitive `DEPENDS_ON`
  dependents + the UCs themselves. The broad undirected walk is exploration
  /display ONLY: measured across the roadmap, it flags **20×→49×→51×→52×→52×**
  more work than the tight stamp — the false radius *grows* with every new
  layer, then saturates.
- `:Decision` nodes with `JUSTIFIES` / `SUPERSEDES` /
  `FeatureRequest-[:IMPLEMENTS]` make rationale graph-native. `nacl-sa-feature`
  and `nacl-tl-fix` (L2/L3) write them as part of their normal flow.
- `nacl-tl-plan` becomes idempotent (`spec_version` vs `planned_from_version`)
  and clears staleness on replan. `nacl-tl-release` gains a `stale-downstream`
  release condition.
- L8 (staleness closure) and L9 (decision provenance) gate the loop; a
  reproducible L9 gap-closure runbook
  (`nacl-tl-core/references/provenance-gap-closure.md` + `nacl-sa-finalize`
  FR-backfill) brings legacy graphs in honestly — backfill, never invent.

## Phase 1 — screen state machines (L10)

- `Screen` / `ScreenState` / `ScreenEvent` / **reified** `Transition` /
  `ScreenEffect` / `AnalyticsEvent`; `Screen-RENDERS->Form` is the bridge that
  lets a domain-attribute change reach the screen.
- L10.0–10.8: orphan/parent/anchor mirrors plus the hard ones — transition
  **determinism**, state **reachability** (QPP), **retry guarantee** for every
  error state, effect→endpoint integrity.
- Producer: `/nacl-sa-ui state-machine UC-NNN|SCR-Name` — two archetypes
  (data-loading, process screen), MERGE-idempotent, directed staleness stamp.

## Phase 2 — behavior slices (L11)

- `Slice` — a graph-native Given/When/Then acceptance scenario below UC, above
  Task (overlay). `then` is REQUIRED non-blank: a slice without an observable
  outcome is unverifiable.
- Anchor invariant (no exemption flag, deliberately): every slice carries ≥1 of
  `COVERS -> ScreenState|Transition` (same-UC) or `CALLS -> APIEndpoint`.
  An anchorless slice is prose that change cannot reach — exactly the drift
  this release exists to kill.
- L11.4 verification closure is a **self-healing gate**: `nacl-tl-plan` MERGEs
  `VERIFIED_BY` on (re)planning and bakes a "Behavior Slices" section into task
  files — the loop that earlier impact edges never had.

## Phase 3 — domain error taxonomy (L12)

- `DomainError` — transport-independent failure mode; `code` is the API-envelope
  join key (REQUIRED); `http_status` is only a hint, requirement-named statuses
  are verbatim-authoritative. `ErrorPresentation` — user-language `message`
  REQUIRED; deliberate silence is a `silent` presentation, not an absence.
- Errors are a **Module-level shared vocabulary** (`HAS_ERROR` parent);
  `HANDLES` uses a channel rule — the handling state's screen must actually
  call a raising endpoint.
- Calibration lesson baked into L12.7 (handling gap, WARNING): **a gate with no
  self-healing closer must not be CRITICAL** — teams switch off what they
  cannot routinely satisfy.
- Producers: `/nacl-sa-uc errors UC-NNN` + a `nacl-tl-fix` hook (error-class
  root causes update the taxonomy as part of the spec-first fix). Consumer:
  task files gain a "Domain Errors" section (BE envelope contract, FE handling
  table).

## Phase 4 — cache & degradation (L13)

- `CachePolicy` (Module catalog — caches are shared surfaces;
  `invalidation_kind` REQUIRED ∈ {ttl,event,manual,session,never} — "when the
  cache stops lying"; `ttl` requires `ttl_seconds`; `serves_stale` principle:
  false wherever a stale read causes a wrong decision).
- `DegradationRule` (UC scope — one BRQ principle becomes several per-experience
  rules; `behavior` REQUIRED — the observable degraded behavior, mirror of
  `slice.then`; anchors: `ON_ERROR -> DomainError` and/or
  `DEGRADES_TO -> ScreenState` — the state the user *lives in* during
  degradation).
- L13.0–13.9 includes the first consumer of Phase-3 groundwork: **retryable
  consistency** (a `backoff` fallback on a non-retryable error is a
  contradiction), plus cached-surface gap detection anchored on `CACHES` so the
  vacuous arm stays intact.
- Producers: `/nacl-sa-uc resilience UC-NNN` (one command for both node types;
  adoption-order chaining — error-triggered rules require the Phase-3 taxonomy
  first) + a `nacl-tl-fix` hook for cache-invalidation / offline / raw-provider
  -error bug classes. Consumer: task files gain a "Cache & Degradation" section.

## Proof

Every phase shipped through the same cycle: design → implementation → demo on
one real UC → graph benchmark on an isolated clone of a real project graph
(falsifiable H0–H3 hypotheses, full reset between arms) → independent
skill-level run (executor + blind verifier, test-author isolation) → fixes →
commit.

- Defect-injection matrices: **8/8, 14/14, 21/21, 27/27** defect classes caught
  by exactly their own check, zero cross-talk against the full check matrix of
  all previous levels.
- Vacuous-pass proven twice per phase: graphs that don't adopt a layer are
  untouched by its validators — every layer is strictly opt-in.
- Reference harnesses + JSON results + lab reports: `docs/research/phase{0..4}-*`.
  Research series (RU): `docs/research/article-*-RU.md` — five articles from
  change propagation to cache/degradation.
- The roadmap then passed an **external expert audit**, and the audit itself was
  verified claim-by-claim against the artifacts: every measurable claim was
  reproduced live — full replays of all four phase harnesses came back
  **byte-identical** to the committed reference results (phase 1 semantically
  identical; its one nondeterministic input choice is fixed in this release).
  Two confirmed gaps (validator pre-flight label lists, phase-1 evidence
  parity) were fixed before this release.
- Transparency note: the phase-4 benchmark harness `.py` file shipped one
  release early, inside the 2.14.0 release commit — a concurrent release
  process in a shared checkout swept it up. Its content is byte-for-byte what
  the replay above verified.

## Upgrading an existing graph

`docs/upgrade-graph-extensions.md` (RU) — an orchestration instruction you hand
to a clean-context agent in a project whose graph predates 2.15. The agent acts
as an orchestrator (subagents do the heavy reading; its own context stays for
analysis and control), asks ONE mandatory question up front — *what is the
source of truth: the written code or your answers* — then analyzes the graph,
builds an opt-in gap list, runs the producer skills in dependency order
(Phase 0 → machines → errors → slices/resilience), and finishes with a
code-vs-spec reconciliation routed by the source-of-truth mode. Questions to
the user are about business behavior only ("what should the user see when the
provider is down?"), never about edge types or methodology.

Key upgrade rule: set the `planned_from_version` baseline **once** on adoption,
or the first `tl-plan` run will flag everything as stale.

## Compatibility

Everything is additive and opt-in. Existing graphs validate exactly as before
until a layer is adopted (vacuous pass is a proven, benchmarked property, not a
hope). Existing skills' outputs are unchanged for projects that don't use the
new commands. Task-file format only *gains* sections.
