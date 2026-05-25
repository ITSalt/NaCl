# /nacl-goal gate prediction table

Deterministic table used by the `intake` alias `--strict` pre-flight check
(SKILL.md Flow step 6) to predict which inner-skill gates a plan would
fire on, so the wrapper can refuse before issuing `/goal`.

This is also surfaced to the user by `/nacl-goal intake "<goal>" --plan-only --strict`
so they can see the predicted refusal before committing to a strict run.

---

## Table

| skill_path | risk/evidence condition | predicted gates |
|---|---|---|
| `nacl-tl-fix` | `risk_level == L1` AND evidence includes `GRAPH` AND linked UC spec is prose-level (column/step granularity not described in graph) AND `hard_refuse_triggers == []` | `spec-first-prerequisite` |
| `nacl-tl-fix` | `risk_level == L1` AND evidence includes `GRAPH` AND linked UC spec is concrete (graph describes the affected surface at component granularity) AND `hard_refuse_triggers == []` | none |
| `nacl-tl-fix` | `risk_level == L1` AND evidence == `HEURISTIC` only | `spec-first-prerequisite` |
| `nacl-tl-fix` | `risk_level == L2 \|\| L3` (any) | hard-refuse — not eligible for `intake` autonomy |
| `nacl-tl-fix` | any with `hard_refuse_triggers` non-empty | hard-refuse — corresponding `PLAN_BLOCKED_FEATURE_REQUIRES_*` |
| `nacl-tl-dev` | UC explicitly present in graph; tests scaffold exists | none |
| `nacl-tl-dev` | linked_uc absent or graph entry missing | `spec-first-prerequisite` |
| `nacl-tl-dev` | UC requires migration / schema change | hard-refuse |
| `nacl-sa-feature` → `nacl-tl-dev` | atom typed `FEATURE_SMALL`; intake reports `spec_gap: false`; same UC + module + gate-family as a routed precedent in last 30d; `risk_level == L1`; `confidence == HIGH`; evidence includes `GRAPH`; no hard-refuse triggers | `spec-gap-routing` |
| `nacl-sa-feature` → `nacl-tl-dev` | atom typed `FEATURE_SMALL`; intake reports `spec_gap: true` AND none of the spec-gap-routing preconditions hold | `spec-first-prerequisite` (plus possibly hard-refuse depending on triggers) |
| `nacl-sa-feature` → `nacl-tl-dev` | atom typed `FEATURE_HEAVY` | NOT applicable — classification step refuses with `PLAN_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION` before this lookup runs |

`hard_refuse_triggers` are the closed set from `plan-lock-schema.md`:
`schema_migration`, `public_api_contract`, `auth_or_security`, `permissions`,
`billing`, `destructive_data_operation`, `l2_l3_architecture`,
`product_decision_required`, `hotfix_or_release_routing`.

---

## Uncertain predictions

The table covers expected combinations only. When a plan atom does not
match any row above unambiguously (e.g. a custom `skill_path` from a future
alias variant, or a combination of evidence the table doesn't enumerate),
the prediction MUST be conservative:

> **Default for unmatched rows: `predicted gates = ["unknown"]`**

`--strict` pre-flight treats `unknown` exactly the same as any auto-enabled
gate: it refuses with `PLAN_BLOCKED_STRICT_REQUIRES_INTERACTIVE_FLOW`. The
user is then asked to run interactively, at which point the inner skill
makes the real call.

This conservatism is intentional: the cost of a false-positive refusal
(user runs interactively) is small; the cost of a false-negative
("we predicted nothing, but the inner skill halted at a gate two hours in")
is large.

---

## Update protocol

Adding a row to this table requires:

1. A real precedent (at least one observed run that hit the gate as
   predicted).
2. A code change to the gate-prediction lookup in `/nacl-goal intake`'s
   `--strict` pre-flight implementation.
3. A documentation update here in the same PR.
4. If the new row enables a previously-unknown auto-enabled gate, the
   `envelope.md` auto-enabled list must also be updated.

Removing a row requires either:

1. The inner skill removed the gate entirely (in which case all references
   should be cleaned up in the same PR), OR
2. The inner skill renamed the gate (cross-reference both names for one
   minor version, then remove the old reference).

Renames or removals are major-version bumps for `/nacl-goal` if they
change observable wrapper behavior.

---

## Why this lives in a separate file

The prediction table is consulted in three places:

- `--strict` pre-flight (SKILL.md Flow step 6) — refuses if any row matches an auto-enabled gate
- `--plan-only --strict` preview — shows the user what would refuse
- `envelope.md` materialization step (Flow step 7) — knows which gates to write YAMLs for (intersection of "auto-enabled gates" and "predicted to fire for some atom in plan")

Centralizing the table here keeps these three consumers consistent. A drift
between them would be a real bug (auto-enabled gate that pre-flight didn't
predict, or predicted gate that materialization forgot about), so they
share one source of truth.
