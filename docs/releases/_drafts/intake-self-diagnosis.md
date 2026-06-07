# Draft fragment: intake self-diagnosis (absorb into next release-notes.md)

## Theme

An autonomous orchestrator that builds hypotheses and then asks the user to
verify them is not autonomous — it verifies them itself. This change makes
hypothesis verification a mandatory stage of intake classification: "the
project graph didn't resolve it" is no longer grounds to ask the user; it is
grounds to investigate.

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

## Schema & tooling (all additive, no schema_version bump)

- `intake.json` atom: `diagnosis` object (hypotheses, checks, score,
  threshold_used, leaning, blocking_fact, evidence_refs), `CODE` in the
  evidence enum, `residual_note` documented in plan-lock-schema.md (fixes
  pre-existing drift).
- `atoms/<id>.state.json`: state enum += `unsupported`, optional
  `retyped_to`.
- `checks/intake.sh`: counters read live atom state — re-typed FEATURE_SMALL
  atoms count toward feature totals; `unsupported` atoms count toward
  `unsupported_atoms_count`.
- `PLAN_BLOCKED_AMBIGUOUS_CLASSIFICATION` tightened: may not fire merely
  because the graph didn't resolve an atom — the probe must have run first,
  and the refusal message includes what was checked.

## Files

Skill text: `nacl-tl-intake`, `nacl-goal`, `nacl-tl-fix` (one-liner),
`nacl-init` (+ all four codex mirrors and the codex init runner).
Supporting: `nacl-goal/{plan-lock-schema,envelope,gate-prediction,refusal-catalog,aliases}.md`,
`nacl-goal/checks/intake.sh`, `nacl-tl-core/references/{intake-scoring,config-schema}.md`,
`nacl-tl-core/templates/config-yaml-template.yaml` (+ codex copy).
Docs: `docs/adr/002-intake-scoring-rubric.md`, `docs/configuration.md`.
