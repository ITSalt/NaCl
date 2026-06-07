# Release 2.16.0 — `intake-self-diagnosis`

## Theme

Two workstreams, one direction: the framework stops outsourcing its own
homework. An autonomous orchestrator that builds hypotheses and then asks the
user to verify them is not autonomous — this release makes hypothesis
verification a mandatory stage of intake classification ("the project graph
didn't resolve it" is no longer grounds to ask the user; it is grounds to
investigate). And the contour *around* the 2.15 validators — the goal
contract, the finalizer, the orchestrators, the docs — finally speaks the
same L1–L13 language the validators themselves shipped with.

## Intake self-diagnosis (PROBE)

`nacl-tl-intake` gains Step 2a.5 PROBE: for every atom the graph alone did
not resolve (no matching UC, draft UC, or Neo4j down), the skill formulates
2–3 falsifiable hypotheses (canonical pair: "the mechanism exists in code but
mishandles the record" vs "the mechanism is absent — it's a feature") and
verifies them with bounded read-only probes — grep/read of the codebase, at
most one read-only DB query, optional git log; max 6 tool calls + 1 DB query
per atom; never writes. A new `CODE` evidence tier means "verified against
the actual codebase/DB".

## Rubric-derived confidence scoring (configurable)

"How sure am I" is now a number the operator can audit and tune — not a vibe.
The score is a deterministic lookup on the per-hypothesis verdict pattern
(confirmed / refuted / inconclusive); the model never invents the number.
Two thresholds cut the scale into routing bands: at or above
`high_confidence` (0.9) the atom routes like a graph-backed one; between
`route_threshold` (0.7) and `high_confidence` it auto-routes on the leading
hypothesis with the alternative + blocking fact recorded as a tracked
follow-up; below `route_threshold` — and only there — a question fires, and
it must carry the diagnosis: what was checked, the per-hypothesis results,
the leaning, the single blocking fact. Bare "bug or feature?" prompts are
gone from the framework.

All numbers live in the project `config.yaml → intake.*` with independent
per-key fallback to built-in defaults (canonical home:
`nacl-tl-core/references/intake-scoring.md`; rationale:
`docs/adr/002-intake-scoring-rubric.md`). `/nacl-init` seeds the block in new
projects and add-only-injects it into existing ones (Migration check G).
Hard-refuse triggers are score-independent: no probe result auto-routes
billing / auth / schema-migration / destructive / product-decision atoms.

## Mid-run re-type instead of failure

A BUG atom that `/nacl-tl-fix` Phase A proves to be a feature (the L3-feature
exit: the code path does not exist) no longer kills the goal-run with
`GOAL_BLOCKED_ATOM_FAILED`. The `/nacl-goal` Step 9 RE-TYPE handler consumes
the identical routing report as a re-classification signal: FEATURE_SMALL
re-enters the same run (sa-feature → dev on the same branch, state machine
gains the only sanctioned backward transition `implementing → pending`);
FEATURE_HEAVY degrades the atom to the new terminal state `unsupported`
(counted in `unsupported_atoms_count`, GOAL_OK impossible, run continues).
This bounded miss cost is what justifies auto-routing at 0.7 instead of
asking.

## Pre-authorization unblocked for no-UC atoms

The `medium-confidence-routing` envelope gate's `linked_uc present`
precondition mechanically blocked every no-UC-match atom from auto-routing
(the precise cause of the reported over-asking incident). The gate now also
accepts code-anchored atoms: `diagnosis.evidence_refs` non-empty qualifies.

## Validation contour: the rest of the framework catches up with L8–L13

A post-release audit of 2.15.0 confirmed the validators themselves complete
(`nacl-sa-validate` L8–L13 = 52 label-qualified checks; `nacl-ba-validate`
structurally immune to the new SA labels; the verify/QA pipeline receives
slices/errors/resilience by design through task-file embedding) — and found
the surrounding contour still speaking pre-2.15:

- **Goal contract.** The `validate` alias declared `GOAL_OK` on
  `l1..l7_pass` alone — an autonomous validation loop would have reported
  success with L10–L13 CRITICALs in the graph. The evidence contract now
  carries `l8_pass..l13_pass` and the decision rule requires all thirteen.
- **Finalization.** `nacl-sa-finalize` statistics and readiness were blind to
  all 12 extension node types. Two new zero-safe named queries
  (`sa_statistics_extensions`, `sa_extension_adoption`) feed adoption-aware
  readiness rows: a layer with zero nodes reports "not adopted" and is
  excluded from readiness averages — absence of an opt-in layer is a choice,
  not a gap.
- **Orchestrators.** `nacl-sa-full` gains optional **Phase 6b** (between UI
  and Validation, no renumbering): screen machines → slices → errors →
  resilience, dependency-ordered, verify-before-bulk, resume-aware, with an
  explicit recorded skip. `nacl-tl-plan` embeds a **Screen State Machine**
  section into `task-fe.md` via the new `sa_uc_screen_machine` named query —
  the deterministic UI contract now reaches the FE dev agent.
- **Stale-span sweep.** "L1-L6" and mislabeled XL ranges fixed across
  `nacl-sa-validate` (its own empty-BA fallback said "run only L1-L11"),
  `nacl-core` routing, `nacl-migrate`/`nacl-migrate-sa`, `nacl-tl-reconcile`,
  the `claude-md-template` stamped into client projects, and the public
  methodology docs — which now carry the full L1–L13 catalog with narrative
  descriptions of L7–L13, the opt-in/vacuous-pass semantics, and the
  no-exemptions-by-design rationale for L11–L13 (EN+RU).

## Verification

Intake: codex-sync gate + lint checks VERIFIED; init fresh-seed / add-only /
no-overwrite cases; the `intake.sh` harness counts re-typed atoms by live
type; all five deterministic harness tests pass on the merged tree.
Validation contour: the new Cypher queries were run verbatim against live
project graphs — zero-safe behavior, real counts, and the screen-machine
query's positive / empty / null-filter-edge cases verified on a disposable
clone (test nodes created, checked, removed). Live PROBE replay on a real
project remains a tracked follow-up.

## Files

Intake workstream: `nacl-tl-intake`, `nacl-goal` (+ `aliases`, `envelope`,
`gate-prediction`, `plan-lock-schema`, `refusal-catalog`, `checks/intake.sh`),
`nacl-tl-fix` (one-liner), `nacl-init`,
`nacl-tl-core/references/{intake-scoring,config-schema}.md`,
`nacl-tl-core/templates/config-yaml-template.yaml`,
`docs/adr/002-intake-scoring-rubric.md`, `docs/configuration.md`
(+ four codex mirrors and the codex init runner).
Validation contour: `nacl-sa-validate`, `nacl-sa-finalize`, `nacl-sa-full`,
`nacl-tl-plan`, `nacl-core`, `nacl-migrate`, `nacl-migrate-sa`,
`nacl-tl-reconcile`, `nacl-goal/{aliases.md,checks/validate.sh}`,
`graph-infra/queries/sa-queries.cypher` (3 new named queries),
`docs/methodology/{validation,sa-layer,overview,graph-philosophy}{,.ru}.md`,
`docs/{skills-reference,migration,skill-modifiers,skill-modifiers.ru}.md`
(+ four codex mirrors, four sync-exemptions).
