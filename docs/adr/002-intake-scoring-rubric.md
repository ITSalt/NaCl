# ADR-002: Rubric-Derived Confidence Scoring for Intake Self-Diagnosis

**Status:** Accepted
**Date:** 2026-06-07
**Author:** NaCl Architecture

---

## Context

`/nacl-goal intake` (and `/nacl-tl-intake` underneath) classifies goal atoms
as BUG / TASK / FEATURE. Through 2.15 the confidence ladder was graph-only:
HIGH meant "a detailed/approved UC matched", MEDIUM meant "partial match or
no match", LOW meant "Neo4j down". When the graph did not resolve an atom,
the skill's only remaining move was to ask the user — even though the agent
has full read access to the codebase and the project database.

A live run exposed the failure mode: for the atom «Сессия пропала из „Мои
сессии"» the agent itself articulated two perfectly checkable hypotheses
(the save mechanism exists but loses the record vs. persistence was never
implemented), had already observed that the record was alive in the DB — and
then asked the user "Как маршрутизировать?". Three structural causes:

1. **No CODE evidence channel.** The atom schema had no slot for "verified
   against the actual code/DB", so the agent's own findings could not raise
   confidence.
2. **No diagnosis obligation.** The open-disambiguation prompt fired straight
   from "the graph didn't resolve it" — investigation was optional.
3. **Graph-anchored pre-authorization.** The `medium-confidence-routing`
   envelope gate required `linked_uc present`, so a no-UC atom mechanically
   could never auto-route, regardless of how good the evidence was.

The fix introduces a self-diagnosis stage (intake Step 2a.5 PROBE): formulate
falsifiable hypotheses, verify them with bounded read-only probes, and decide
from the results. That raises the question this ADR answers: **how does the
agent decide whether the probe result is "confident enough" to route without
asking?**

---

## Options Considered

### Option 1 — Model-judged confidence (free-form)

Let the agent state "I am confident / not confident" (or emit an arbitrary
0–1 number) after the probe and route accordingly.

Pros:
- No new machinery; flexible.

Cons:
- An LLM-invented number is arbitrary: not reproducible across runs, not
  auditable, not comparable between projects.
- "Confident" drifts with phrasing and model version; the same evidence can
  route differently on different days.
- Impossible to tune per project — there is nothing to tune.

### Option 2 — Hard categorical rules (no numbers)

Encode routing directly as verdict-pattern rules ("leader confirmed + all
alternatives refuted → route; anything else → ask").

Pros:
- Deterministic, simple.

Cons:
- The route/ask boundary is frozen in skill text; projects with different
  risk tolerance (prototype vs. billing system) cannot move it without a
  framework release.
- Intermediate evidence patterns ("leader confirmed, one alternative
  inconclusive") force a binary choice the operator never gets to calibrate.

### Option 3 — Rubric-derived score + configurable thresholds (chosen)

The probe records a verdict per hypothesis (`confirmed | refuted |
inconclusive`, each with an evidence reference). The score is a
**deterministic lookup** on the verdict pattern — a fixed table maps patterns
to numbers (leader confirmed + all alternatives refuted → 0.95; contradiction
→ 0.4; all inconclusive → 0.2). Two thresholds cut the scale into routing
bands: `route_threshold` (default 0.7) and `high_confidence` (default 0.9).
All numbers live in the project `config.yaml → intake.*`; every key falls
back independently to built-in defaults.

Pros:
- The model never invents the number — it only reports which row the
  verdicts landed in. Same evidence → same score, every run.
- Auditable: the emitted atom carries `diagnosis.score` and
  `diagnosis.threshold_used`, so any routing decision can be replayed
  without re-reading config.
- Tunable per project: raising `route_threshold` buys more questions on
  high-stakes projects; lowering it buys more autonomy on prototypes where
  `/nacl-tl-fix`'s gap-check backstop makes misrouting cheap.
- The bands compose with the existing case table (HIGH/MEDIUM/sub-threshold)
  without inventing a parallel mechanism.

Cons:
- The rubric is coarse (six rows). Accepted: coarse-and-deterministic beats
  fine-and-arbitrary for a gate decision.
- One more config section to maintain — mitigated by independent per-key
  fallback and `nacl-init` seeding.

---

## Decision

Option 3. Specifics:

- **Canonical home of the rubric and defaults:**
  `nacl-tl-core/references/intake-scoring.md`. Skills and the config template
  point there; the table is not forked into other files.
- **Score bands** (defaults; thresholds from `config.yaml → intake.*`):
  - `score ≥ high_confidence [0.9]` → confidence HIGH, evidence `CODE`,
    auto-route like a graph-backed atom.
  - `route_threshold [0.7] ≤ score < high_confidence [0.9]` → confidence
    MEDIUM, auto-route on the leading hypothesis under `--autonomous` with
    the alternative + blocking fact recorded as a tracked `residual_note`
    (envelope gate `medium-confidence-routing`, now accepting code-anchored
    atoms without a linked UC).
  - `score < route_threshold [0.7]` → the only path to a question; the
    question must carry the diagnosis (what was checked, per-hypothesis
    results, leaning, blocking fact).
- **Hard-refuse triggers are score-independent.** No probe result clears
  billing / auth / schema-migration / destructive / product-decision
  triggers; no score auto-routes an atom carrying one.
- **Sanity clamp:** values outside `(0, 1]` or
  `route_threshold > high_confidence` → warn + built-in defaults for the
  offending keys. A broken config must not silently disable the question
  gate.
- **Seeding:** the config template ships the `intake:` block;
  `nacl-init` Migration check G appends it (add-only, never overwriting) to
  existing projects.

---

## Consequences

What changes:

- "The graph didn't resolve it" no longer reaches the user as a question.
  The agent investigates first; the screenshot-class atom (mechanism present
  in code, record present in DB) now scores 0.95 and auto-routes to
  `/nacl-tl-fix` with `CODE` evidence — zero questions.
- When a question does fire, its shape is fixed: «сделал то-то, проверил
  гипотезы, результаты противоречивые, склоняюсь к X, мешает принять решение
  факт Y». Bare "bug or feature?" prompts are gone.
- Routing decisions become replayable: `diagnosis.score` +
  `diagnosis.threshold_used` + `evidence_refs` are frozen into
  `intake.json`.
- A bug-routed atom that turns out to be a feature self-corrects at runtime:
  `/nacl-tl-fix`'s L3-feature exit is consumed by `/nacl-goal` as a re-type
  signal (FEATURE_SMALL re-enters the run; FEATURE_HEAVY degrades the atom to
  `unsupported` and the run continues) — so the cost of a leading-hypothesis
  miss is bounded, which is what justifies routing at 0.7 instead of asking.

What stays the same:

- The graph remains the first and cheapest evidence source; HIGH+GRAPH atoms
  skip the probe entirely.
- Hard-refuse semantics, Template C, and all `PLAN_BLOCKED_*` refusals.
- The probe affects ONLY intake routing and the question gate today. Other
  skills (`nacl-tl-fix` Phase A, `nacl-tl-verify-code`) keep their own deeper
  diagnostic machinery; the rubric is not a general-purpose confidence system.

Scope of the numbers today: intake routing only. If a future skill wants
scored gates, it must add its own ADR — this one deliberately does not
generalize.
