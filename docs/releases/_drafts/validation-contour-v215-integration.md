# Draft fragment: validation-contour v2.15 integration (absorb into next release-notes.md)

## Theme

The 2.15.0 validators were complete on day one — but a validator nobody
invokes at full strength, a goal contract that declares victory at L7, and a
finalizer blind to the new layers together quietly cap a release at its
previous scope. This change makes the *contour around* the validators speak
the same L1–L13 language as the validators themselves.

## Goal contract: validate alias learns L8–L13

The `/nacl-goal validate:<MOD-ID>` alias declared `GOAL_OK` on
`l1_pass..l7_pass` alone — an autonomous validation loop would have reported
success with screen-machine, slice, error-taxonomy, or cache CRITICALs in the
graph. The evidence contract now carries `l8_pass..l13_pass` (with the
opt-in vacuous-PASS semantics documented inline) and the decision rule
requires all thirteen.

## Finalization sees the extension layers

`nacl-sa-finalize` statistics and readiness were blind to all 12 extension
node types. Two new zero-safe named queries (`sa_statistics_extensions`,
`sa_extension_adoption` — `COUNT {}` subqueries, an unadopted layer returns
0, never an empty result) feed new adoption-aware readiness rows: a layer
with zero nodes reports "not adopted" and is excluded from readiness
averages — absence is a choice, not a gap. Non-zero FR-backfill candidates
route to the provenance-gap-closure runbook.

## Orchestrators reach the new layers

- `nacl-sa-full` gains optional **Phase 6b** (between UI and Validation, no
  renumbering): screen machines for UI UCs → slices → errors → resilience,
  dependency-ordered per the upgrade doc, verify-before-bulk after the first
  UC of each layer, resume-aware, and an explicit recorded skip — so the
  vacuous L10–L13 pass in Phase 7 is a documented decision.
- `nacl-tl-plan` embeds a **Screen State Machine** section into `task-fe.md`
  via the new `sa_uc_screen_machine` named query (UC-scoped sibling of
  `sa_screen_machine`): per screen — route, rendered form, one row per
  transition with effects and cross-layer targets. Task files stay
  self-sufficient; no TL overlay edges.

## Stale-span sweep

`L1-L6` / mislabeled XL ranges fixed across `nacl-sa-validate` (empty-BA
fallback said "run only L1-L11"), `nacl-core` routing, `nacl-sa-full`
Phase 7 (level names re-aligned to the canonical vocabulary),
`nacl-migrate` / `nacl-migrate-sa` (with pointers to
`docs/upgrade-graph-extensions.md`), `nacl-tl-reconcile` (ba-validate
cross-checks are XL1–XL5), the `claude-md-template` stamped into client
projects, and `docs/{skills-reference,migration,skill-modifiers*}`.

Known follow-up: `docs/methodology/*` still describe the SA catalog as six
internal checks — needs a content update (L7–L13 check descriptions), not a
span fix.

## Files

Skill text: `nacl-sa-validate`, `nacl-sa-finalize`, `nacl-sa-full`,
`nacl-tl-plan`, `nacl-core`, `nacl-migrate`, `nacl-migrate-sa`,
`nacl-tl-reconcile` (codex mirrors synced for the first four;
sync-exemptions recorded for the rest).
Supporting: `nacl-goal/{aliases.md,checks/validate.sh}`,
`graph-infra/queries/sa-queries.cypher` (3 new named queries),
`nacl-tl-core/templates/claude-md-template.md`.
Docs: `docs/{skills-reference,migration,skill-modifiers,skill-modifiers.ru}.md`.
