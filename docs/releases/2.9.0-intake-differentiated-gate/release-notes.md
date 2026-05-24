# NaCl 2.9.0 — Intake Differentiated Confirmation Gate

This minor release replaces the single generic *"Correct? [yes / adjust /
skip]"* confirmation that `/nacl-tl-intake` fired after every atom
classification with a **differentiated gate**: five prompt templates
selected by a small case table, plus a new `SPEC_GAP` branch in the
classification decision tree that surfaces the bug-vs-feature *policy
call* the skill used to bury inside its own reasoning paragraph. Clean
HIGH-confidence graph-backed classifications now auto-route without
asking; HIGH-confidence atoms with a *detected spec gap* prompt with the
named ambiguity instead of a generic confirmation. The `--yes` flag's
auto-confirm scope is tightened accordingly. Downstream skills
(`/nacl-tl-fix`, `/nacl-sa-feature`, `/nacl-tl-dev`) and the
intake-input/output contracts are unchanged.

---

## Why This Release

Intake's job is to **classify** a user request — BUG vs FEATURE vs TASK
— using the Neo4j graph for evidence. When the graph yields a matched
UC with `detail_status: detailed | approved` AND the reported behavior
clearly violates that UC, intake is making its strongest possible call:
`confidence: HIGH, evidence: GRAPH`. Asking the user "are you sure?"
*after* that call accomplishes two anti-goals at once:

1. **It teaches the user to rubber-stamp.** Confirmations without
   discrimination become muscle memory. The confidence label loses
   meaning when intake hedges on every call regardless of evidence
   strength.

2. **When confirmation *was* warranted, it asked the wrong question.**
   Intake's own reasoning could surface a real ambiguity — e.g. *"UC-X
   does not currently specify the per-iteration naming convention the
   user is asking for"* — and yet the prompt rendered as a generic
   "Confirm?". The named ambiguity (spec gap → bug-vs-feature is a
   policy call) never reached the user as a question they could
   actually answer.

The 2.9.0 gate maps each combination of `(confidence, evidence,
spec_gap, classification level)` to a specific prompt — or to no prompt
at all. Where the call is unambiguous, intake commits. Where it is
ambiguous, intake names the ambiguity instead of asking a question that
hides it.

---

## Per-Skill Changes

### `nacl-tl-intake`

**Before:** Step 2b's decision tree resolved each atom to one of `BUG`,
`FEATURE`, `TASK` with a `confidence` and `evidence` label, then fired a
single uniform prompt:

```
Atom #N: "[atom title]"
  Classified as: [TYPE]
  Evidence: [GRAPH | HEURISTIC]
  Reasoning: [one sentence]

  Correct? [yes / adjust / skip]
```

`--yes` was the only mechanism to bypass — and only at `HIGH+GRAPH`.
The decision tree had no representation for the common case where a UC
*exists and is detailed* but does not specify the sub-aspect the atom
is asking about (a per-X qualifier, a refinement noun like ordering or
naming convention, a UI element absent from the UC's forms). Such atoms
landed in the `behavior IS specified → BUG` arm with HIGH confidence
even though the bug-vs-feature decision was actually a policy call.

**After:**

- **New `SPEC_GAP` branch in Step 2b.** Under the existing
  `detail_status = 'detailed' | 'approved'` arm, three outcomes are now
  possible: `YES (matches existing spec) → BUG`, `NO (wants different
  existing behavior) → FEATURE`, and the new
  `SPEC_GAP → BUG (L2), spec_gap: true, POLICY_CALL on bug-vs-feature`.
  Classification confidence stays HIGH, but the bug-vs-feature
  resolution is escalated to a mandatory user gate.

- **SPEC_GAP detection heuristics.** Four heuristics, any one of which
  is sufficient to set `spec_gap: true`:
  1. Atom mentions a per-X qualifier (per-iteration, per-step,
     per-attempt, per-row, per-version) absent from the matched UC's
     name / description.
  2. Atom requests a refinement noun (naming convention, ordering,
     chronology, count, format detail, label, sort order) not in the
     matched UC's acceptance criteria / form fields.
  3. Atom names a UI element or artifact type unreachable from the
     matched UC via `HAS_FORM → HAS_FIELD` or `PRODUCES` edges
     (text-level check now; structured Cypher follow-up is noted as
     out of scope).
  4. Reasoning paragraph naturally contains *"spec gap also present"*
     or *"UC-X does not currently specify ..."* — the signal the skill
     was already writing but not acting on.

- **Differentiated confirmation gate (case table).** The single
  generic prompt is replaced with a five-row case table that selects
  one of five templates:

  | Case | Template |
  |---|---|
  | HIGH+GRAPH, no spec gap, L0/L1 | **A — auto-route, no prompt** |
  | HIGH+GRAPH, no spec gap, L2/L3 | **B — launch-sanity check** |
  | HIGH+GRAPH, `spec_gap: true` | **C — SPEC_GAP policy-call prompt** |
  | MEDIUM+GRAPH | **D — recommendation prompt** |
  | LOW / HEURISTIC | **E — open-disambiguation prompt** |

  Each template has a fixed shape documented inline:

  - **Template A** prints a one-line `auto-routed` confirmation and
    fires the downstream skill immediately. No interactive prompt.
  - **Template B** asks *"Routing to /nacl-tl-fix --uc UC-XXX. L2 spans
    N UCs / API contract — proceed?"* with `proceed / skip` only. It
    is explicitly a launch-readiness question, not a re-classification
    question; the classification is already settled.
  - **Template C** names the spec gap, names the bug-vs-feature
    policy call (implicit-requirement → BUG vs. new-scope → FEATURE),
    and offers `BUG / FEATURE / SKIP`. A user pick of FEATURE re-routes
    the atom to `/nacl-sa-feature` and records
    `evidence: USER_OVERRIDE (spec_gap)`.
  - **Template D** is the closest analogue to the pre-2.9.0 generic
    prompt — but with an *explicit recommendation* and named
    alternatives (e.g. *"Best guess: FEATURE. Alternatives: BUG if
    existing behavior expected"*).
  - **Template E** presents BUG / FEATURE / TASK / SKIP with equal
    weight and no recommendation, used when the graph yielded nothing
    or when Neo4j was unavailable.

- **`--yes` flag scope tightened.** Pre-2.9.0, `--yes` auto-confirmed
  any `HIGH + GRAPH` atom. Post-2.9.0, auto-confirm fires Template A
  (no prompt) ONLY when ALL of the following hold:
  `confidence: HIGH`, `evidence: GRAPH`, `spec_gap: false`, and
  classification level `L0` or `L1` (low blast radius, per
  `nacl-tl-core/references/fix-classification-rules.md`). The flag
  does NOT bypass:
  - SPEC_GAP atoms (template C policy call)
  - L2/L3 atoms (template B launch-sanity)
  - MEDIUM atoms (template D)
  - LOW / HEURISTIC atoms (template E)

  Two behavioral implications: a clean L0/L1 HIGH+GRAPH atom now
  auto-routes **even without `--yes`** (because the gate logic, not the
  flag, makes that call); and a high-blast-radius L2/L3 atom now
  prompts (template B) **even with `--yes`** because launch readiness
  for cross-module fixes is a separate consideration from
  classification certainty.

- **Step 2d evidence display.** Every per-atom evidence block now
  prints explicit `Spec gap:`, `Evidence:`, `Confidence:`, and (where
  applicable) `Level:` lines. The display is the single source of
  truth for which template the user is about to see — making the gate
  selection auditable from the printed output rather than implicit in
  the prompt that follows.

- **New final-summary headline rule.** The first-match-wins headline
  selection list gains one rule:

  ```
  Any atom resolved via SPEC_GAP gate with user choosing FEATURE
  (evidence USER_OVERRIDE (spec_gap)) ⇒
    INTAKE TRIAGE APPLIED — REROUTED (spec-gap policy call:
    N atoms moved to /nacl-sa-feature)
  ```

  All other headline rules are unchanged. The new rule sits between
  the `Status: BLOCKED` rule and the catch-all `USER_OVERRIDE`
  heuristic-backed rule, so spec-gap reroutings surface as a
  first-class outcome rather than being collapsed into the generic
  heuristic-backed bucket.

- **Edge-case wording alignment.** The "Neo4j unavailable" edge case
  previously said "heuristic classifications are MEDIUM confidence" —
  inconsistent with the decision tree's own `confidence: LOW`
  assignment for the same path. Re-worded to "Template E (LOW
  confidence, HEURISTIC evidence — `--yes` does NOT bypass; no forced
  recommendation)" so the edge case, the decision tree, and the case
  table all agree.

### `skills-for-codex/nacl-tl-intake`

**Before:** The Codex contract variant had a single line under
**Source-Parity Requirements**: *"Do not auto-execute the downstream
workflow unless the user explicitly confirms that exact scope in the
current turn."* The variant does not own the decision tree and never
re-stated the gate rules.

**After:** One additional bullet under **Source-Parity Requirements**
references the differentiated gate by case (HIGH+GRAPH+no-spec-gap+L0/L1
may auto-route; SPEC_GAP atoms always prompt the policy call; L2/L3 fire
launch-sanity; MEDIUM/LOW always prompt) and points back to the main
intake skill for the decision tree and templates. No other changes.

---

## Migration Impact

None for downstream projects. The change is internal to
`/nacl-tl-intake`'s confirmation flow:

- **Inputs unchanged.** The `/nacl-tl-intake "<request>"` invocation
  shape is identical, including the optional `--yes` flag.
- **Outputs unchanged where they were already structured.** The final
  summary table columns, the headline vocabulary (with one new
  REROUTED rule appended), and the downstream skill invocations
  (`/nacl-tl-fix`, `/nacl-sa-feature`, `/nacl-tl-dev` with the same
  argument shapes) are byte-for-byte unchanged.
- **`--yes` behavior change is intentional and additive.** Users who
  ran `/nacl-tl-intake --yes` previously will now see *more* auto-route
  cases (clean L0/L1 HIGH+GRAPH atoms route without prompt regardless
  of the flag) and *one new prompt* case (L2/L3 HIGH+GRAPH atoms fire
  the launch-sanity check even with `--yes`). The new prompt is
  intentional — high-blast-radius routing decisions are not the same
  question as classification confidence.
- **No `config.yaml` keys, no YouGile schema changes, no Neo4j schema
  changes.** SPEC_GAP detection is text-heuristic over query results
  the skill already fetches.

Projects that have wrapped `/nacl-tl-intake` in scripts assuming a
single prompt-per-atom shape should expect zero or one prompt per atom
under the new gate, with the prompt content varying by template. The
templates are documented inline in `nacl-tl-intake/SKILL.md` Step 2b.

---

## How to Verify the Change

Three contrived atom batches exercise the new gate behavior. None
require code execution beyond invoking `/nacl-tl-intake` interactively
in a project with a populated graph.

1. **Clean BUG (Template A, auto-route)**
   - Input: a request describing broken behavior of a UC whose
     `detail_status` is `detailed` and whose name/description fully
     cover the broken aspect.
   - Expected: classification BUG, HIGH+GRAPH, `spec_gap: false`,
     level L0 or L1. **No prompt fires** — Template A's one-line
     `auto-routed` confirmation prints and the downstream
     `/nacl-tl-fix` invocation runs immediately.

2. **SPEC_GAP (Template C, mandatory policy call)**
   - Input: a request that names a per-X qualifier or refinement noun
     not specified in the matched UC. The current screenshot example
     ("task artifacts page missing per-iteration verifier reports
     with iteration-aware naming/ordering") is canonical.
   - Expected: classification BUG (L2), HIGH+GRAPH, `spec_gap: true`,
     `POLICY_CALL` flagged. Template C prompt fires, naming the
     specific sub-aspect ("UC-XXX does not currently specify ...") and
     offering BUG / FEATURE / SKIP with the implicit-requirement vs.
     new-scope distinction explained. `--yes` does NOT bypass this
     prompt.

3. **MEDIUM (Template D, recommendation)**
   - Input: a request with no matching UC ("Add a way to export
     reports as CSV").
   - Expected: classification FEATURE, MEDIUM+GRAPH, Template D fires
     with the leading recommendation ("Best guess: FEATURE") and
     named alternatives.

For each case, confirm:

- The Step 2d evidence block prints `Spec gap:` and `Confidence:`
  lines that match the template selection.
- The final summary headline reflects the outcome — including the new
  `REROUTED (spec-gap policy call: N atoms moved to /nacl-sa-feature)`
  headline if any SPEC_GAP atom was rerouted to FEATURE.
- The `skills-for-codex/nacl-tl-intake/SKILL.md` Source-Parity bullet
  references the differentiated gate.

No automated tests cover intake gate behavior at present; the three
manual batches above are the acceptance check. A structured Cypher
follow-up — querying the matched UC's `HAS_FORM → HAS_FIELD` and
`PRODUCES` subtrees to graph-back the SPEC_GAP detection instead of
text-heuristics — is tracked as an out-of-scope follow-up for a future
patch.

---

## Files Changed

- `nacl-tl-intake/SKILL.md` — Step 2b decision tree (SPEC_GAP branch +
  heuristics block), Step 2b confirmation gate (case table + five
  templates), `--yes` flag scope, Step 2d evidence display, Step 7
  headline-selection rules (one rule added), Neo4j-unavailable
  edge-case wording alignment.
- `skills-for-codex/nacl-tl-intake/SKILL.md` — one bullet added under
  **Source-Parity Requirements** referencing the differentiated gate.

Full release notes path:
`docs/releases/2.9.0-intake-differentiated-gate/release-notes.md`.
