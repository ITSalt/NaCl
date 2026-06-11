# NaCl 2.21.0 — requirement-anchoring

**Requirements stop floating: every functional/validation/behavioral/interface requirement
is now anchored, in the graph, to the step / field / form that realizes it.**

## The problem

In the graph a `Requirement` was connected **only** to its `UseCase`/`Module` via
`HAS_REQUIREMENT` (plus incoming `IMPLEMENTED_BY` from a BA rule, `RAISES_REQUIREMENT`,
`JUSTIFIES`). It had **no outgoing edge** to the artifact that implements it. So a
requirement reachable from its UC floated above the steps and fields that realize it: you
could not ask *which step breaks which requirement*, change-propagation could not reach it,
and coverage gates stopped at the UC boundary. For a methodology whose entire value is a
*connected* spec graph, a requirement anchored only at UC level was barely better than a
markdown bullet.

The diagnosis sharpened once we looked one layer down. **The BA layer already does this
right**: `nacl-ba-rules` writes `BusinessRule -[:APPLIES_AT_STEP]-> WorkflowStep` (plus
`CONSTRAINS`/`APPLIES_IN`/`AFFECTS`), enforced by `nacl-ba-validate`. The SA `Requirement`
simply never got the connectivity discipline the BA `BusinessRule` already had. This release
copies a proven, in-repo pattern downward — it does not invent one.

## What's inside

— **One idiomatic edge.** `Requirement -[:REALIZED_BY {provenance, anchor_kind}]-> (target)`,
`target ∈ {ActivityStep | FormField | Form | Screen}`, keyed by class: `functional`/
`behavioral` → `ActivityStep`, `validation` → `FormField`, `interface` → `Form` (or `Screen`
for formless screens). One polymorphic edge — matching the existing `Decision-[:JUSTIFIES]->`
and `Slice-[:COVERS]->` shape — so the validator carries one anchor invariant, not three.
Many-valued: a requirement realized by N steps is N edges.

— **Authoring persists what it already computed.** `nacl-sa-uc` Phase 4 already derived each
requirement from a BA rule, a form-field constraint, or an activity-step — i.e. it already
knew the anchor and threw it away. Phase 4 now captures the anchor in the proposal table (a
confirmable **Anchor** column) and writes `REALIZED_BY` alongside `HAS_REQUIREMENT`. Almost
no new authoring burden — it stops discarding information already in hand.

— **A hard gate.** New validator **L3.7 (CRITICAL)**: a functional/validation/behavioral/
interface requirement with no `REALIZED_BY` fails the spec. `L3.7b (WARNING)` cross-checks
the target label against the class (catches a `validation` requirement pointed at a whole
`Form` instead of the field). `L3.8 (WARNING, opt-in)` flags System steps that no requirement
realizes. NFRs and reserved classes are exempt **by design**; the rare genuinely-unanchorable
functional requirement carries a durable `anchor_exempt=true` flag — so a hard gate stays
clearable without disabling it.

— **The tool layer moved too, not just the prose.** The deterministic gate classifier
`classify-findings.mjs` (the single authority for the PASS/WARN/FAIL rollup) re-applies the
property-based exemptions. L3.7's `anchor_exempt` exemption is registered there and pinned by
a test — without it the escape-valve flag would be silently ignored in the actual verdict.
This is the v2.19.0 lesson applied: editing the SKILL.md prose alone would have left the tool
stale.

— **A discriminator that matches real data.** Four writers disagreed on where the requirement
class lived (`rq_type` / `req_type` / `type`), and `type` is overloaded with reserved values
(`nfr`/`adr`/`question`/`assumption`) read by `nacl-sa-finalize`. Checking real project
snapshots showed the class most often lives in `type:'functional'` — so the validator reads
`coalesce(rq.rq_type, rq.req_type, rq.type, 'unknown')` and filters the reserved values
explicitly. New writes converge on canonical `rq_type`.

— **An upgrade path for existing graphs.** Because the gate is hard from day one, every
pre-existing graph needs anchoring. `docs/runbooks/requirement-anchoring-upgrade.md` is a
self-contained, agent-runnable, idempotent per-project runbook: backup → normalize the
discriminator → re-derive anchors with **high/low confidence** (high auto-written with
`provenance:'backfill'`; low surfaced for human resolution — never silently guessed) →
flag legitimate exemptions → verify L3.7 clean → rollback by `provenance` filter.

## Scope

- **SA `Requirement` only.** The BA side already anchors rules to steps (`APPLIES_AT_STEP`);
  no BA change.
- **Additive.** No downstream consumer query (`nacl-render`, `nacl-tl-plan`,
  `nacl-sa-finalize`, `nacl-ba-handoff`) changes; `REALIZED_BY` is added to the L8.2 scoped
  staleness closure only (bounded, returns only already-stale dependents).
- Legacy `req_type`/`type` properties stay readable for one release.

## Files

Schema: `graph-infra/schema/sa-schema.cypher` (REALIZED_BY doc block, `anchor_exempt`,
L8.2 fan-out), `graph-infra/schema/seed-data.cypher` (canonical `rq_type` + REALIZED_BY
examples). Skills: `nacl-sa-uc` (Phase 4 anchor write + Anchor column), `nacl-sa-validate`
(L3.7/L3.7b/L3.8 + normalization + exemption table), `nacl-sa-architect` (NFR exemption note),
`nacl-sa-domain` (canonical `rq_type` + anchor guidance) — each mirrored to `skills-for-codex/`.
Tool: `nacl-core/scripts/classify-findings.mjs` + `.test.mjs`. Docs:
`docs/runbooks/requirement-anchoring-upgrade.md` + pointer from `docs/upgrade-graph-extensions.md`.

## Verification

- `classify-findings.test.mjs` green (13 tests; new L3.7/`anchor_exempt` cases pinned).
- Discriminator normalization validated against real project snapshots
  (`tests/fixtures/graph-snapshots/*`): confirmed the class lives in `type` on
  project-alpha/beta/gamma — the reason the validator reads `type`, not just `rq_type`.
- Seed graph stays L3.7-clean (all five requirements anchored to real seed nodes).
- Recommended before tagging: run the upgrade runbook on an isolated `family-cinema`
  clone — confirm a sane high/low-confidence split, no NFR false-positives, L3.7 green after
  anchoring, and bounded staleness after editing one `ActivityStep`.
