# Intake self-diagnosis scoring

**Introduced in:** intake-self-diagnosis (post-2.15).
**Owners:** `nacl-tl-intake` Step 2a.5 PROBE; consumed by `/nacl-goal intake`
(Step 4 autonomous question policy), `nacl-goal/gate-prediction.md`, and the
`medium-confidence-routing` envelope gate.

This file is the **single source of truth** for the rubric, the config key
names, and the built-in defaults. Skills and the `config.yaml` template
comment point here; do not fork the table into other files.

---

## Why a score exists

When the project graph alone cannot classify an atom (no matching UC, draft
UC, or Neo4j down), `nacl-tl-intake` does NOT ask the user — it first runs a
bounded read-only probe (Step 2a.5): formulate falsifiable hypotheses, check
them against the actual code/DB, record per-hypothesis verdicts. "How sure am
I" must then be a number the user can audit and tune — not a vibe. The score
is therefore **rubric-derived**: a deterministic lookup on the verdict
pattern. The model never invents the number; it only reports which row the
verdicts landed in.

Rationale ADR: `docs/adr/002-intake-scoring-rubric.md`.

---

## The rubric (defaults)

The **leader** is the hypothesis with the strongest support after the probe.
Verdict vocabulary per hypothesis: `confirmed` (direct positive evidence),
`refuted` (direct negative evidence), `inconclusive` (probe could not tell).
"Supported indirectly" means the evidence is consistent with the hypothesis
but not direct proof (e.g. the mechanism's file exists but the defective path
was not pinpointed).

| Verdict pattern | config key (`intake.scores.*`) | default |
|---|---|---|
| Leader confirmed (direct evidence), ALL alternatives refuted | `leader_confirmed_all_refuted` | 0.95 |
| Leader confirmed, ≥1 alternative inconclusive (none confirmed) | `leader_confirmed_some_inconclusive` | 0.8 |
| Leader supported indirectly, all alternatives refuted | `leader_indirect_all_refuted` | 0.75 |
| Leader supported indirectly, alternatives inconclusive | `leader_indirect_inconclusive` | 0.55 |
| ≥2 hypotheses confirmed (contradiction) | `contradictory` | 0.4 |
| All inconclusive / probe budget exhausted | `all_inconclusive` | 0.2 |

## The thresholds (defaults)

| Threshold | config key | default | semantics |
|---|---|---|---|
| Routing | `intake.route_threshold` | 0.7 | `score >= route_threshold` → auto-route on the leader. Below → the (batched) question fires, carrying the diagnosis. |
| High confidence | `intake.high_confidence` | 0.9 | `score >= high_confidence` → confidence `HIGH`, evidence `CODE` — routes like a graph-backed atom, no tracked alternative required. Between the two thresholds → confidence `MEDIUM`: auto-route on the leader WITH the alternative + blocking fact recorded as a tracked `residual_note` (envelope gate `medium-confidence-routing`). |

Hard-refuse triggers are score-independent: a probe NEVER clears
`hard_refuse_triggers`, and no score auto-routes an atom that carries one.

---

## Resolution order

```
config.yaml → intake.*          (project override, per key)
  ↓ key absent
built-in defaults (this file)
```

- Missing `config.yaml`, missing `intake:` section, or a missing individual
  key — each falls back **independently** (overriding one score does not
  require restating the others).
- **Sanity clamp:** a value outside `(0, 1]`, or
  `route_threshold > high_confidence`, is a broken config — warn the user in
  the transcript and use the built-in defaults for the offending key(s). A
  broken config must not silently disable the question gate.
- The score actually used and the threshold in effect are frozen into the
  emitted atom (`diagnosis.score`, `diagnosis.threshold_used`) so downstream
  consumers and audit never re-read config to interpret a routing decision.

---

## Worked examples

1. **«Сессия пропала из „Мои сессии"», no UC in graph.** Probe greps the
   session-save mechanism → found (route + handler + table accessor); DB
   query → the record exists. H_bug confirmed, H_feature (persistence not
   implemented) refuted → row `leader_confirmed_all_refuted` → score 0.95 ≥
   0.9 → BUG, HIGH, evidence CODE → auto-routed to `/nacl-tl-fix`. **No
   question.**
2. **Same atom, but the save handler exists while the DB row is genuinely
   absent.** H_bug confirmed by code, contradicted by data; H_data (filter
   hides the record) also alive → row `contradictory` → score 0.4 < 0.7 →
   the consolidated question fires, listing what was checked, both verdicts,
   the leaning, and the blocking fact.
3. **Leader confirmed, one alternative inconclusive** (probe budget hit) →
   0.8 → between thresholds → auto-route on the leader; the alternative +
   what-would-tip-the-scale is recorded as `residual_note`
   (`medium_confidence_alternative`) with a durable follow-up.

## Tuning guidance

- Raise `route_threshold` (e.g. 0.85) on projects where a misrouted atom is
  expensive — more questions, fewer autonomous calls.
- Lower it (e.g. 0.55) on prototypes where `/nacl-tl-fix`'s own gap-check is
  an acceptable backstop (a bug-routed feature self-corrects via the
  L3-feature exit).
- The six `scores.*` values rarely need tuning; prefer moving the thresholds.
