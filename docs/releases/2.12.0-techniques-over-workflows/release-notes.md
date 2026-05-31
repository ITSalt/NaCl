# Release 2.12.0 — `techniques-over-workflows`

## Theme

Harvest the dynamic-workflows experiment's verdict into the framework. The experiment
(`docs/research/experiment-report-RU.md`) found that a critic-panel **workflow costs
~15× the tokens** of a single strong agent *with repo access* for the same verdict —
"single agent wins" really meant **"repo access wins"**. The cheap, large wins were
**techniques, not workflows**, and **only one use-case justifies a workflow: the
post-mortem / deep audit.** This release does both: it hardens existing skills with the
high-ROI techniques (Workstream B), and ships the one workflow worth its cost
(Workstream A — `nacl-postmortem`). Every skill edit is additive and preserves the
output contract; the new workflow is opt-in with the prose recipe as the fallback.

## Background

A prior session ran Claude Code dynamic workflows against NaCl on a real target
(`family-cinema`) and reached a firm decision rule: reach for a workflow only when the
work is LLM-judgment-heavy **and** parallelizable **and** benefits from independent
perspectives — everything routine stays a markdown skill, given repo-read access. The
plan (`docs/research/plan-postmortem-workflow-and-skill-hardening.md`) turned that into
two workstreams; this release is their execution, with a head-to-head validation behind
every adopted change (`docs/research/workstream-B-skill-hardening-report.md`).

## What's New — Workstream B (techniques into skills)

- **B1 — repo-read / cross-file tracing.** `nacl-tl-review` gains a mandatory
  `4a. Cross-file trace` step (read callees/runtime → catch *dead config*; grep
  callers/consumers of changed symbols) + a Code-Correctness checklist row;
  `nacl-tl-verify-code` gains `2.6 Trace beyond the canonical chain`; `nacl-tl-sync`
  now binds the FE call-site pair to the BE route (not declarations-vs-contract).
  Validated head-to-head on `family-cinema` UC033-BE: a diff-only review **missed** the
  `kie.client.ts` image-only BLOCKER and **false-passed** a requirement; the
  repo-tracing review caught it (`docs/research/B1-cross-file-trace-headtohead-UC033-BE.md`).
- **B2 — requirements traceability.** `nacl-tl-review` Step 3 is now per-criterion
  (implemented? reachable? tested?); `nacl-tl-verify-code` enumerates acceptance
  criteria (`1.5`) and routes an unmet one through `coverage-gap → UNVERIFIED` (`5.3a`);
  `nacl-tl-qa` adds a requirements-coverage gate (an unmapped UI-testable criterion
  cannot read as VERIFIED). Closes the "missing-requirement" defect class.
- **B3 — deterministic decision tables.** New `nacl-tl-verify-code/scripts/classify-status.mjs`
  + a contract-pin `node --test` suite (**17/17**) port the 8-status precedence (incl.
  the previously prose-only `FAIL` overlay) into one tested table. Same 8 tokens — only
  the *derivation* moved from prose to code (no contract change).
- **B4 — keep-if-uncertain.** Generalized the "refute only with positive evidence" rule
  in `nacl-tl-review` (Step 3 / Step 7) and closed a validator hole in `nacl-sa-validate`
  (a SKIP'd check can no longer roll up into a clean `PASS`).
- **B5 — self-adversarial pass.** A second-look refute step in `nacl-tl-review` (`7a`)
  and `nacl-tl-verify-code` (FAIL self-check), and a root-cause re-read in
  `nacl-tl-fix` (`7.0`) that catches a fix which narrows only one of several carriers
  of a defect.

## What's New — Workstream A (`nacl-postmortem`)

- **New skill `nacl-postmortem`** + **new workflow `.claude/workflows/nacl-postmortem-panel.js`.**
  Five parallel auditors (project shape · fix-commit categorization · spec-artifact
  drill with the `SPEC_WRONG`/`SPEC_MISSING`/`SPEC_RIGHT_DEV_DRIFTED` trichotomy ·
  cross-UC connectivity · `nacl-tl-qa` SKIPs) → an evidence verify stage → a
  deterministic `GAP_TO_SKILL` synthesis (ten GAP categories → owning skill + G1–G11) →
  one writer. The three experiment fixes (repo access, evidence-not-paraphrase,
  requirements traceability) are baked in; A5 model tiering puts mechanical auditors on
  Haiku/Sonnet and judgment + synthesis on Opus.
- **Validated.** A-Val-1 recovered a labeled fixture's answer key exactly
  (`bench/fixtures/postmortem/`). A-Val-2 ran head-to-head on `family-cinema`: the
  workflow surfaced **10 cases / 36 QA-skips / 4 cross-UC** findings (two the single
  agent missed) at **~7.7× cost** (down from the experiment's 15× — tiering worked).
  Output is structurally interchangeable with the prose recipe; both emit
  `docs/retrospectives/<project>-postmortem.md`.
- **Opt-in.** Requires Claude Code ≥ 2.1.154; the prose recipe
  (`skill-postmortem-algorithm`) is the portable fallback. Documented in
  `.claude/workflows/README.md`.

## What's evaluated (not blindly adopted)

- **B6 (structured handoffs):** adopted **inside** the workflow producers (schema per
  `agent()` — free there); **declined** for the markdown skill↔orchestrator string
  contract (the JSON conversion would break every consumer at once — the 0.10.0→0.10.1
  regression class).
- **B7 (model tiering):** already sensible at the skill `model:` frontmatter level;
  the workflow A5 tiering is the incremental win (validated).
- **B8 (benchmark-as-validation):** institutionalized as the standing gate — every
  decision above passed a `bench/` head-to-head; a reusable labeled post-mortem fixture
  and a dependency-free contract-pin test pattern are added.

## Codex parity

`skills-for-codex/nacl-tl-{review,verify-code,sync,qa,fix}` mirror the B1/B2/B4/B5
changes in the Codex idiom, reusing each mirror's own status vocabulary; new
`skills-for-codex/nacl-postmortem` documents the prose-recipe producer (the Codex
runtime has no workflows). B3's script was intentionally **not** copied to the Codex
`verify-code` mirror — it uses a coarser status set, so the root script would emit the
wrong vocabulary.

## What did NOT change

- **Output contracts.** Every edit is additive — no headline/status-vocabulary change,
  so no Contract-change-discipline trigger and no downstream consumer needs updating.
- **Deferred (documented, not rejected):** the `nacl-tl-review` headline table and the
  `nacl-tl-release` six-gate scripts (B3) — their prose has genuine ambiguities an
  executable table would have to resolve, so "no contract change" can't be guaranteed
  without owner sign-off.

## Known issue (re-confirmed)

The Workflow tool's `args` object does **not** reach a script launched via `scriptPath`
on this CC version; the A-Val-2 run used a baked-config `/tmp` copy. The
`.claude/workflows/README.md` gotcha note stands (pass the script inline, or bake
config).

## Files

- `nacl-tl-review/SKILL.md`, `nacl-tl-verify-code/SKILL.md`, `nacl-tl-sync/SKILL.md`,
  `nacl-tl-qa/SKILL.md`, `nacl-sa-validate/SKILL.md`, `nacl-tl-fix/SKILL.md` (technique edits)
- `nacl-tl-verify-code/scripts/classify-status.mjs` + `classify-status.test.mjs` (new, B3)
- `nacl-postmortem/SKILL.md` (new) + `.claude/workflows/nacl-postmortem-panel.js` (new)
  + `.claude/workflows/README.md` (workflow section + `args` reference)
- `skills-for-codex/nacl-tl-{review,verify-code,sync,qa,fix}/SKILL.md`,
  `skills-for-codex/nacl-postmortem/SKILL.md` (Codex parity)
- `bench/fixtures/postmortem/` (new labeled fixture: `build-fixture.sh`,
  `GROUND-TRUTH.md`, `expected-output.md`)
- `docs/research/workstream-B-skill-hardening-report.md`,
  `docs/research/B1-cross-file-trace-headtohead-UC033-BE.md`,
  `docs/research/article-techniques-over-workflows-RU.md` (decision log, validation, draft article)
- `docs/retrospectives/family-cinema-postmortem.md` (A-Val-2 deliverable)

No breaking changes — all skill edits are additive and preserve the output contract; the
new workflow and skill are opt-in.
