# Workstream B — skill hardening (8 techniques): decision log

**Date:** 2026-05-30 · **Source plan:** `docs/research/plan-postmortem-workflow-and-skill-hardening.md`
**Method:** per-technique investigation protocol (read → quote existing → falsifiable hypothesis →
minimal change on ONE skill preserving the output contract → real-project head-to-head → adopt/skip).
**Guardrails honored:** `verify-before-bulk-changes` (prove on one skill before propagating),
`validate-on-real-project` (`family-cinema` is the corpus, OK to name per `family-cinema-own-project`),
`adversarial-verify-needs-context`, `no-private-info-in-public-repo`, `memory-after-merge-not-after-plan`
(no "shipped" memory until the merge commit). Codex mirrors (`skills-for-codex/`) kept in workflow parity
per the lint-skills rule — additive, reusing each mirror's existing closed status vocabulary.

| # | Technique | Skills touched | Decision | Validation |
|---|-----------|----------------|----------|------------|
| B1 | Repo-read / cross-file tracing | review, verify-code, sync (+3 codex) | **ADOPT** | 3-arm head-to-head on family-cinema UC033-BE — diff-only MISSED the BLOCKER |
| B2 | Requirements-traceability pass | review, verify-code, qa (+3 codex) | **ADOPT** | analytical (verify-code PASS rule lacked any AC term) + B1-run evidence |
| B3 | Deterministic decision-table scripts | **verify-code (adopted)**; review & release deferred | **PARTIAL-ADOPT** | 17/17 contract-pin `node --test` on `classify-status.mjs` |
| B4 | Evidence-based / keep-if-uncertain | review (tighten), verify-code & sa-validate (mostly present) | **ADOPT (tighten)** | audit: keep-if-uncertain already strong; 3 review gaps + 1 validator hole closed |
| B5 | Self-adversarial second pass | review, fix, verify-code (+codex) | **ADOPT** | single-agent analogue of the verify stage A-Val-1 validated; grounded in a real BUG-2 partial-fix |
| B6 | Structured sub-agent handoffs | orchestrators | **ADOPT-in-workflows / DECLINE-for-markdown** | evaluated: string contract churn risk > benefit; workflows already get structured returns free |
| B7 | Model/cost tiering | task-spawning skills | **ALREADY-ADOPTED** | skill `model:` frontmatter already tiered sensibly; workflow A5 tiering validated in A-Val-1 |
| B8 | Benchmark-as-validation method | the process / `bench/` | **INSTITUTIONALIZED** | the standing gate this whole report ran through; reusable postmortem fixture + contract-pin test added |

---

## B1 — Repo-read access / cross-file tracing — **ADOPTED**

**Hypothesis:** a skill lacking an explicit cross-file-trace step can stay diff-scoped and miss a real
cross-file BLOCKER invisible from the diff hunks.

**Change (additive, no contract change — findings ride existing severity vocabulary):**
- `nacl-tl-review` — new `#### 4a. Cross-file trace (Mandatory)` under Step 4 (callees/runtime → dead-config;
  callers/consumers via the Step-2.5 source roots) + a Code-Correctness checklist row. Refute a high-severity
  finding only with positive cross-file evidence (ties to `adversarial-verify-needs-context`).
- `nacl-tl-verify-code` — new `#### 2.6 Trace beyond the canonical chain (Mandatory)` after the Step-2
  per-step checks; emits `ISSUE`/`code-defect` → contributes to `FAIL`.
- `nacl-tl-sync` — Step 4 now binds the FE call-site pair to the BE route (not declarations-vs-contract);
  new Endpoint-Compliance row "Producer/consumer call-site" (BLOCKER). Rides the existing "8 static checks"
  count (Option A — no `9th category`, so the contract string is untouched).
- Codex mirrors for all three, in their idiom.

**Validation:** see `docs/research/B1-cross-file-trace-headtohead-UC033-BE.md`. Three reviewer arms on
family-cinema UC033-BE pinned at `d4f13b4`; the **diff-only arm missed** the `kie.client.ts` image-only
BLOCKER and **false-passed FC-BE-5**; both repo-access arms caught it; the hardened (Step-4a) arm produced
the only fully-correct verdict (`BLOCKED`). Confirms "repo access wins"; the explicit step makes tracing
mandatory rather than discretionary, at ~4% token cost over implicit access.

---

## B2 — Requirements-traceability pass — **ADOPTED**

**Hypothesis:** category-grouped or code-presence-only checking lets a *missing requirement* slip through —
a defect where nothing in the diff is wrong, something required is simply absent.

**Change (additive, reuses existing status vocabulary — no new statuses):**
- `nacl-tl-review` — Step 3 rewritten to **enumerate every criterion as its own row** and score
  PASS/PARTIAL/FAIL on three axes: **implemented?** (via the Step-4a cross-file trace, not a plausibly-named
  function — dead config ≠ implemented), **reachable?** (Nav-actions natural-entrypoint evidence as witness),
  **tested?**.
- `nacl-tl-verify-code` — new `#### 1.5 Enumerate acceptance criteria` (per-criterion checklist) + new
  `##### 5.3a Acceptance-criteria traceability gap`: a criterion neither implemented nor test-covered →
  `coverage-gap` finding → routed through the **existing** `coverage_gap → UNVERIFIED` mapping. A change can
  no longer reach `PASS` while a required behaviour is unverified.
- `nacl-tl-qa` — Step 1 "Requirements-coverage gate": build `criterion → stage → status` for every
  criterion; an unmapped UI-testable criterion forces aggregate `UNVERIFIED` via the existing weakest-stage
  floor; N/A may not be used to drop a provider/runtime-dependent criterion.
- Codex mirrors for all three, reusing each mirror's `UNVERIFIED`/`PARTIAL`/`FAILED` tokens.

**Validation (honest — B1/B2 are confounded on this fixture):**
- **Analytical proof for verify-code:** the baseline PASS rule was
  `Static checks pass AND tests_collected>0 AND new_failures empty AND postfix_failures empty AND
  coverage_gap=false AND no UI` — **no acceptance-criteria term**. So baseline `verify-code` provably could
  emit `PASS` while an acceptance criterion was entirely unimplemented, as long as the touched code traced
  cleanly and a test imported the module. The 5.3a edit closes this at the contract level, not just
  empirically.
- **Empirical (directional, from the B1 run):** the diff-only arm **punted** on FC-BE-11 ("GenerationLog
  not written" — a pure missing-requirement defect, marked "cannot confirm") and **false-passed** FC-BE-5,
  while the per-criterion repo-access arms caught both. FC-BE-11 is the archetypal B2 case: internally
  clean code, a required behaviour simply absent — caught only by enumerating each criterion and checking
  implementation across the repo.
- **Caveat:** with a strong agent + repo access, per-criterion vs category-grouped does not always
  differentiate on this fixture (both repo-access arms caught FC-BE-11). B2's value is defensive — it
  removes the *discretionary* gap and the provable verify-code PASS-despite-unmet-AC hole — at near-zero
  cost. A dedicated isolation run (baseline verify-code reaching PASS on a clean-tracing change with one
  unimplemented AC, vs hardened returning UNVERIFIED) would sharpen the empirical claim; deferred to the
  `bench/` sweep (B8) to avoid burning compute on a confounded fixture.

**Decision:** ADOPT — low-cost, contract-safe, closes a provable hole; the per-criterion pass is the
cheapest defence against the missing-requirement defect class.

---

## B3 — Deterministic decision-table scripts — **PARTIAL-ADOPT (verify-code)**

**Hypothesis:** agents re-derive verdict precedence each run → variance + cost; a pure decision table is
deterministic and testable.

**Prototyped on ONE skill (`verify-code`) per `verify-before-bulk-changes`:**
- New `nacl-tl-verify-code/scripts/classify-status.mjs` — a pure function mapping the computed inputs
  (`staticFail`, `scriptsTestMissing`, `emptyTestStubs`, `runnerCouldNotExecute`, `testsCollected`,
  `baselineResolved`, `newFailures`, `postfixFailures`, `coverageGap`, `uiChanges`) → one of the **8
  canonical tokens, unchanged**. The previously-stranded `FAIL` overlay ("regardless of tests") now has an
  explicit precedence (highest). `coverageGap` also carries the B2 5.3a signal, so B2 and B3 compose.
- New `scripts/classify-status.test.mjs` — written FIRST (`regression-test-before-fix`): **17 cases**, one
  per canonical status + the precedence ties the prose left implicit + a determinism loop. `node --test` →
  17/17 green. The skill (Step 5.4) now invokes the script and emits its token verbatim; the prose table
  remains as human-readable documentation of what the script implements.
- **No contract change**: the 8 tokens and the `VERIFY_CODE_RESULT:` shape are byte-identical; only the
  *derivation* moved from prose to a tested table. Variance on repeated runs of the same input → 0 (the
  determinism test proves it).

**Decisions on the other two B3 targets:**
- **`nacl-tl-review` (Step 8b headline table) — DEFER.** The strategist flagged this as *"the only one that,
  done carelessly, can break the contract."* The prose table has genuine gaps an executable table is forced
  to resolve: there is **no row for "all green but warnings over threshold"**, and the repo-gate-vs-nav-actions
  order is implicit. Encoding those forces precedence decisions that could diverge from current emergent
  behaviour — i.e. "no contract change" cannot be guaranteed without the skill owner's sign-off. The clean
  follow-up: write the 11-row equivalence test first (it will surface each ambiguity as an explicit, owner-
  reviewed case), then script it. Deferred, not rejected.
- **`nacl-tl-release` (6 blocking conditions) — DEFER (recommended next).** The strongest *deterministic*
  case (predicates already spec'd as regexes/deltas), but its inputs are I/O (live Cypher histograms for
  graph-staleness, upstream `tl-sync`/`tl-qa` verdicts, `.tl/exceptions/*` files), so a unit-testable script
  covers only the pure-logic subset. Recommended first slice: an **exception-validator** (`EXC-YYYY-MM-DD-slug`
  regex, required fields, expiry-not-past, blanket-`affected_gates` rejection, content-hash match) emitting the
  existing gate tokens — bash, matching the `nacl-goal/checks/*.sh` convention. Low contract risk; deferred to
  bound this pass and preserve budget for Workstream A.

**Codex parity — DEFERRED for B3 with rationale.** The Codex `verify-code` mirror uses a *coarser* status set
(`VERIFIED`/`PARTIALLY_VERIFIED`/`UNVERIFIED`/`FAILED`/`BLOCKED`), not the root's 8 tokens. The root script
emits tokens the Codex skill does not use, so referencing it from the mirror would emit the wrong vocabulary —
the exact contract violation B3 exists to prevent. A Codex-specific table mapping to the coarser set is the
correct follow-up; copying the root script was reverted.

**Decision:** PARTIAL-ADOPT — technique proven and shipped on `verify-code` with a passing contract-pin
suite; review and release deferred with explicit, contract-risk-based rationale (consistent with the adopt
criterion "no contract change" and the per-technique protocol's "prototype on ONE, then decide").

---

## B4 — Evidence-based judgment / keep-if-uncertain — **ADOPT (tighten)**

**Hypothesis:** skills silently drop a concern or downgrade a status on uncertainty (refute-if-uncertain
killed a true BLOCKER in the experiment).

**Audit result — largely already present (quoted):** `verify-code` defaults to `UNVERIFIED` on every
uncertainty axis (coverage gap, no baseline, unmet acceptance criterion) and its enum-drift step *escalates,
does not suppress* on a kind-mismatch; `sa-validate` clears a check only on a positive exemption property
(strict-by-default `coalesce`) and HALTs rather than trust zero-rows under schema drift; `nacl-tl-review`
already enforces "refute a BLOCKER/CRITICAL only with positive cross-file evidence" (the B1 Step 4a line) and
"no baseline → don't classify". So B4 is **mostly satisfied by existing design + the B1 edits** — adopt, with
targeted tightening only where the rule was not generalized.

**Tightenings applied (additive, no new status vocabulary):**
- `nacl-tl-review` — (1) Step 3: a criterion whose implemented/reachable/tested fact cannot be **positively
  confirmed** scores at most PARTIAL, never PASS on absence of evidence; (2) Step 7: a severity may be lowered
  or a finding dropped **only on positive evidence it is a non-issue** — on uncertainty keep it and flag a
  QUESTION (generalizes the cross-file rule to all findings).
- `nacl-sa-validate` — overall-status: a SKIP'd/timed-out check cannot roll up into a clean `PASS`; the status
  carries an `(incomplete: N checks skipped)` suffix (an unrun check is unverified, not passed).
- `nacl-tl-verify-code` — **ADOPT-as-is**; one low-priority suppression-branch tightening (umbrella-match +
  `code-defect` → keep pending confirmation) noted but deferred (the SPEC_DRIFT path can't reach FAIL and the
  kind-escalation guard already covers the main risk — contract-delicate, low ROI).

**Decision:** ADOPT (tighten). The principle was already the spine of the result vocabularies; the edits close
the specific decision points where uncertainty could still silently drop/downgrade a concern.

---

## B5 — Self-adversarial second pass (single-agent) — **ADOPT**

**Hypothesis:** a cheap second look kills false positives without fan-out — the same agent re-reads the code
to try to refute its own high-severity findings.

**Change (additive; the single-agent analogue of the workflow's verify stage):**
- `nacl-tl-review` — new `#### 7a. Self-adversarial pass (Mandatory for BLOCKER/CRITICAL)`: re-read each
  high-severity finding's code path + callers/consumers and try to refute it; drop **only** on positive
  counter-evidence (paired with B4 — never drop on uncertainty); log what was re-read.
- `nacl-tl-verify-code` — a self-adversarial check on the `FAIL` definition: before emitting a FAIL/CODE_DRIFT
  finding, re-read the cited path to try to refute it.
- `nacl-tl-fix` — new `#### 7.0 Self-adversarial root-cause re-read (Mandatory)`: a GREEN regression test
  proves the symptom is gone, not the cause; re-read to catch a fix that narrows **one of several** carriers,
  using the Step 1 graph neighbours + `impact_targets` to enumerate the others.

**Validation:** B5 is the single-agent form of the workflow's verify stage, which **A-Val-1 demonstrated**
behaves correctly (kept all 3 true cases; 0 false drops). It is grounded in a real defect the A-Val-2
prose-recipe comparator surfaced: family-cinema **BUG-2's fix narrowed only 1 of 4 prompt carriers** —
a fix that turned the test green while the root cause persisted in 3 paths. That is exactly the failure
`nacl-tl-fix` Step 7.0 now forces the agent to look for. Paired with B4 so it does not over-refute.

**Decision:** ADOPT — cheap, contract-safe, and it targets a real, observed partial-fix failure mode.

---

## B6 — Structured (schema'd) sub-agent handoffs — **ADOPT-in-workflows / DECLINE-for-markdown**

**Hypothesis:** prose-headline parsing (`Status:` lines) is fragile (the 0.10.0→0.10.1 contract regression).

**Evaluation (the plan's adopt bar: "only if it removes a real parsing-fragility class without breaking
downstream consumers"):**
- The fragility is real: `nacl-tl-full` and `nacl-tl-conductor` consume six-status handoffs by parsing
  headline strings, and `nacl-tl-review`/`verify-code`/`fix` each carry a **Contract-change-discipline** block
  precisely because a string-format change once broke `nacl-tl-reopened`.
- But converting the markdown skill↔orchestrator handoff to a structured-JSON contract is a **breaking change
  to every consumer at once** — exactly the churn the discipline blocks warn against — for a benefit (parse
  robustness) that the discipline + the now-deterministic headline derivation (B3 `classify-status.mjs`)
  already largely secure.
- **Where structured handoffs are free, they are already adopted:** the workflow producers
  (`nacl-review-panel.js`, `nacl-postmortem-panel.js`) use the `schema` option on every `agent()` call —
  sub-agents return validated objects, never prose the orchestrator string-parses. A-Val-1 proved this end to
  end (5 auditors + verify all returned schema-valid objects; zero parse failures).

**Decision:** ADOPT structured handoffs **inside workflow producers** (done — schema-per-agent); **DECLINE** to
restructure the markdown skill↔orchestrator string contract (churn risk > benefit; the string contract stays,
guarded by the Contract-change-discipline blocks and B3's deterministic derivation). This is the plan's "only
if it removes fragility *without breaking consumers*" — for markdown skills it cannot, so we don't.

---

## B7 — Model/cost tiering — **ALREADY-ADOPTED (no mis-tier found)**

**Hypothesis:** some delegated/mechanical sub-steps are overpriced on Opus.

**Audit (skill `model:` frontmatter, all `nacl-*`):** tiering is already sensible and matches the
mechanical/standard/judgment split:
- **haiku** — `nacl-tl-next`, `nacl-tl-status`, `nacl-ba-analyze`, `nacl-ba-sync`, `nacl-ba-import-doc`
  (lookups / mechanical scans).
- **sonnet** — most dev/qa/sync/ship/release/docs + BA modelling skills.
- **opus** — judgment-heavy only: `review`, `plan`, `architect`, `*-validate`, `diagnose`, `conductor`,
  `full`, `intake`, `reconcile`, `sa-uc`, `sa-domain`/`feature`.

No obvious mis-tier (e.g. `nacl-tl-review`=opus is correct for a judgment task; the `nacl-review-panel`
workflow then puts its *mechanical gates* on haiku and reserves opus for the requirements reviewer + dedup).
Skills that spawn sub-agents (`conductor`, `full`, `dev-*`, `fix`) delegate to **other skills that carry their
own frontmatter model**, so tiering propagates automatically. The **workflow A5 tiering**
(`modelOverrides`: boundary/qaskip=haiku, shape/categorize/verify=sonnet, spec-drill/cross-uc/synth=opus) is
the incremental win, and A-Val-1 validated it (10 agents, 362K tok on the fixture with the mix).

**Decision:** ALREADY-ADOPTED — both at the skill-frontmatter level and (newly) in the workflow producers. A
per-skill cost re-measurement is a standing follow-up (B8 harness), but no change is warranted now.

---

## B8 — Benchmark-as-validation method — **INSTITUTIONALIZED (the standing gate)**

**Hypothesis:** skill changes ship without measured proof.

**This report is the institutionalization.** Every technique above passed through a real validation before its
decision, not a subjective check:
- **B1** — a 3-arm head-to-head on a real project (`family-cinema` UC033-BE, pinned commit), documented
  reproducibly in `docs/research/B1-cross-file-trace-headtohead-UC033-BE.md`.
- **B3** — a contract-pin `node --test` suite (`classify-status.test.mjs`, 17/17) — fixture-grade,
  dependency-free, reproducible.
- **Workstream A** — a labeled hermetic fixture (A-Val-1) + a real-project head-to-head vs the prose recipe
  (A-Val-2).

**Reusable harness added this session (the durable B8 artifacts):**
- `bench/fixtures/postmortem/` — `build-fixture.sh` (deterministic labeled mini-project) + `GROUND-TRUTH.md`
  (answer key) + `expected-output.md` (reference output) — mirrors the `bench/fixtures/review-panel/` pattern.
- The `node --test` contract-pin pattern for any decision-table check-script (no package.json needed).
- This decision log as the standing record: each non-trivial skill change cites its validation here.

**Decision:** INSTITUTIONALIZED — the `bench/` head-to-head (fixture go/no-go → real-project diff) is the
standing gate for B1–B7 and Workstream A, extending `publishable-benchmarks`. It is the method, applied
throughout, not a one-off step.

---

## Net outcome (Workstream B)

| Technique | Decision | Shipped artifact |
|---|---|---|
| B1 repo-read / cross-file | ADOPT | Step 4a (review) + Step 2.6 (verify-code) + call-site bind (sync) + 3 codex |
| B2 requirements-traceability | ADOPT | per-criterion Step 3 (review) + 1.5/5.3a (verify-code) + qa coverage gate + 3 codex |
| B3 decision-table scripts | PARTIAL-ADOPT | `classify-status.mjs` + 17-test pin (verify-code); review/release deferred (contract risk) |
| B4 keep-if-uncertain | ADOPT (tighten) | review Step 3/7 + sa-validate skip-suffix; verify-code/sa-validate mostly already-present |
| B5 self-adversarial pass | ADOPT | review 7a + fix 7.0 + verify-code FAIL self-check + 3 codex |
| B6 structured handoffs | ADOPT-in-workflows / DECLINE-for-markdown | schema-per-agent in workflow producers; string contract kept (churn risk) |
| B7 model/cost tiering | ALREADY-ADOPTED | skill frontmatter already tiered; workflow A5 overrides |
| B8 benchmark-as-validation | INSTITUTIONALIZED | `bench/fixtures/postmortem/` + contract-pin test + this log |

All edits are additive and preserve each skill's output contract (no headline/status-vocabulary change → no
Contract-change-discipline trigger); Codex mirrors kept in parity reusing their own status tokens. One PR.

---

# Workstream A — `nacl-postmortem` workflow — **SHIP (opt-in)**

**Built (A1–A7):** `.claude/workflows/nacl-postmortem-panel.js` (5 parallel auditors → evidence verify →
deterministic `GAP_TO_SKILL` synthesis → writer), `nacl-postmortem/SKILL.md` wrapper + Codex mirror +
README section, the three experiment fixes baked in, A5 model tiering, and the A7 finding handled.

**A7 (args/scriptPath) — re-confirmed still present** on this CC version: a run launched via `scriptPath`
did **not** receive the tool-level `args` (it used script defaults). Workaround used for A-Val-2: a baked-config
`/tmp` script copy (keeps the local path out of the committed repo). The README gotcha note stands.

**A-Val-1 (hermetic fixture, labeled):** built `bench/fixtures/postmortem/` (deterministic 3-fix project +
`GROUND-TRUTH.md`). The workflow **recovered the labeled answer key exactly** — boundary = the "declared done"
commit; the 3 cases classified `SPEC_RIGHT_DEV_DRIFTED` / `SPEC_MISSING` / `SPEC_WRONG`; the
`LIVE_PROVIDER_SMOKE` missing-`STRIPE_API_KEY` skip flagged; GAP→skill mapping `review/G1 · qa/G3 · sync/G2`.
Verify stage kept all 3 true cases (0 false drops). Output (`expected-output.md`) matches the recipe structure.

**A-Val-2 (real head-to-head on `family-cinema`, boundary `5705a4b` = v0.12.0):**

| | Workflow (`nacl-postmortem-panel`) | Prose recipe (single agent) |
|---|---|---|
| Cases | 10 (across 10 owning skills, 0 unmapped) | 9 |
| qa-skips enumerated | **36** (incl. `kie.ai 422` provider skip) | ~3 categories |
| Cross-UC findings | **4** (incl. 2 the recipe missed: UC016→UC004 prompt-contract, UC005→UC006 cover-reconcile half-gap) | 2 (Living Moments, hub card) |
| Depth caught by the *other* | (recipe also caught BUG-2 = regression-of-a-documented-fix; 1-of-4-carriers nuance) | — |
| Tokens | ~728K | ~94K |
| Wall / agents | ~14 min / 16 agents | ~4 min / 1 agent |
| **Cost ratio** | **~7.7×** (down from the experiment's 15× — A5 tiering worked) | 1× |

**Decision: SHIP as an opt-in audit tool.** It adds *real* value over the recipe for a once-per-project
audit — exhaustive qa-skip enumeration and the cross-UC producer/consumer seams (the highest-severity blind
spot) where independent auditors earn their keep, including two cross-UC gaps the single agent missed. The
~7.7× cost amortizes against rarity + stakes (the plan's thesis), and A5 tiering nearly halved the experiment's
ratio. The **prose recipe stays the portable, cheap default** (`skill-postmortem-algorithm`); the workflow is
the deep-audit option, gated on CC ≥ 2.1.154. Artifact structure is interchangeable (A6 met). Both producers
emit `docs/retrospectives/<project>-postmortem.md`.

**Caveat:** the verify stage kept 10/10 real cases (correct — the auditors read real commits, no fabrications),
but A-Val-1/A-Val-2 did not exercise a *refuted-drop*. `GROUND-TRUTH.md` documents the fabricated-quote check
as the follow-up to demonstrate the drop path.
