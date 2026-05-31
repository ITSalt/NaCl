# Action plan: (1) build the `nacl-postmortem` workflow, (2) harden skills with the 8 techniques

**Status:** action plan (план действий) · **Date:** 2026-05-30 · **CC on this machine:** 2.1.156

## Context

A prior session ran an experiment — Claude Code **dynamic workflows** on the NaCl framework — and reached a
firm verdict that this plan executes against:

- A critic-panel **workflow costs ~15× the tokens** of a single strong agent *with repo access*, for the
  **same verdict** on real code (1.95M vs 126K on the family-cinema head-to-head). "Single agent wins" really
  meant **"repo access wins"** — scoping dominates architecture.
- For NaCl, **only one use-case justifies a workflow: the post-mortem / deep audit** — rare, read-only,
  high-stakes, genuinely helped by independent perspectives. Everything routine (review, validation, the
  `*-full` / `conductor` orchestrators) stays a markdown skill.
- **The cheapest, biggest wins were techniques, not workflows** — repo-read access, evidence-based
  verification, requirements-traceability, deterministic decision tables. Those go **into existing skills**.

So this plan has **two workstreams**: **A** = build the one workflow that is worth it; **B** = harvest the 8
techniques into existing skills. Both are sequenced, with concrete deliverables, acceptance criteria, and a
benchmark gate before anything ships broadly. **Scope of this document: the plan itself.** Execution is the
follow-up.

> **Out of scope here (separate track):** closing the 30+ "permitting clauses" / the G1–G11 strict-gate
> reform (`nacl-tl-core/references/gate-fire-catalog.md`, `docs/retrospectives/nacl-gate-baseline.md`). This
> plan only *consumes* that catalog (Step A4 maps post-mortem findings onto those gates); it does not modify
> gates. See "Out of scope" at the end.

## Prerequisites (read before executing, in order)

1. `docs/research/experiment-report-RU.md` — full technical log (RU): cause→effect, all token numbers.
2. `docs/research/workflows-for-nacl.md` — decision rule + Bucket A/B/C scenario taxonomy + §7 empirical verdict.
3. `docs/research/review-panel-vs-skill-family-cinema-UC033-BE.md` — the run where the 3 fixes worked.
4. `.claude/workflows/nacl-review-panel.js` + `.claude/workflows/README.md` — the **reference scaffold** (3
   fixes baked in) and the `args`/`scriptPath` gotcha.
5. Memories (via `MEMORY.md`): `skill-postmortem-algorithm`, `migration-retrospective-gate`,
   `adversarial-verify-needs-context`, `validate-on-real-project`, `publishable-benchmarks`,
   `baseline-failures-need-proof`, `no-private-info-in-public-repo`, `family-cinema-own-project`.

The reference scaffold provides every primitive this plan reuses: `meta` block; `phase()`; `parallel()`
(barrier); `pipeline()` (no barrier); `agent(prompt, { label, phase, model, schema })`; `log()`; the `args`
global; JSON `schema` per agent; and **JS decision tables** (`assignHeadline` / `computeVerdict`) instead of
agent re-derivation. Model Workstream A on it.

---

# Workstream A — `nacl-postmortem` workflow (additive, opt-in)

**Why this is the one NaCl workflow fit.** Post-mortem matches every condition that justifies a workflow's
cost: **rare** (once per finished project), **read-only** (no file/graph mutation → no worktree-isolation or
write-race risk), **high-stakes** (a missed systemic skill-gap propagates to the next 50-UC project), and it
**genuinely benefits from independent specialist perspectives** — exactly where fan-out earned its keep
(a dedicated reviewer found a concurrency race the generalist dismissed). The 15× cost amortizes against
rarity + stakes. It is **already a prose 3-agent recipe** (memory `skill-postmortem-algorithm`;
`nacl-migrate`'s canary retrospective gate runs 3 parallel auditors) → worth a saved, reproducible command.

**Additive, not a replacement.** Keep the `skill-postmortem-algorithm` memory recipe and `nacl-migrate`'s
retrospective gate intact. Ship the workflow as an **opt-in** alternative producer of the *same* deliverable,
with the markdown recipe as the portable fallback when workflows are unavailable (mirror the
`nacl-review-panel` README stance: CC ≥ 2.1.154 required).

**Trigger.** A project built end-to-end through `nacl-*` skills, with a git **dev→fix boundary** (feature
commits stopped, a wave of fix commits started). **Goal:** for each post-"done" bug, find **which skill gate
let it through**.

### Steps

**A1 — Scaffold the workflow file.**
- *Deliverable:* `.claude/workflows/nacl-postmortem-panel.js`, modeled structurally on `nacl-review-panel.js`
  (same `meta`/`phase`/`parallel`/`pipeline`/`agent`/`log` shape, same schema-per-agent discipline).
- *Accept when:* `meta` block validates (pure literal: `name`, `description`, `whenToUse`, `phases`); the
  script parses and runs end-to-end on the fixture (A-Val-1) without runtime errors.

**A2 — Five parallel auditors (Phase 1, `parallel()` barrier — synthesis needs all five).**
Made concrete from the recipe's "3 core + consider a 4th/5th":
  1. **Project shape & dev→fix boundary** — stack, `.tl/` tasks done/skipped, BA/SA artifact location (graph
     vs prose), git timeline pinpointing the boundary commit.
  2. **Fix-commit categorization** — every fix commit after the boundary → buckets (API-contract mismatch,
     UI/missing-element, config/infra, DB/migration, stub/mock leak, domain logic, auth, asset/build,
     CI-unblock); counts + 2–3 quoted examples per bucket; include PR descriptions if `gh` is available.
  3. **Spec-artifact drill** — for each notable fix, locate the spec in `.tl/tasks/<TASK>/`
     (api-contract.md, impl-brief\*.md, task\*.md) and classify with the **load-bearing trichotomy**:
     `SPEC WRONG` / `SPEC MISSING` / `SPEC RIGHT, DEV DRIFTED`.
  4. **Cross-UC connectivity** — the recipe's gotcha class: "UC-X declares an entry but UC-Y has no button to
     reach it," invisible to per-UC review.
  5. **`nacl-tl-qa` SKIPs** — missing-provider-key skips ("almost always a top-3 root cause").
- *Deliverable:* five `agent(...)` calls under `phase('Audit')`, each with a JSON `schema` (structured output,
  no prose parsing).
- *Accept when:* each auditor returns a schema-valid object; the run logs all five completing.

**A3 — Bake the experiment's 3 fixes from the start.**
- **Fix #1 (repo access):** auditors MUST read `.tl/`, the code, and `git log`/`git show` freely — intrinsic
  here, but state it explicitly in every prompt (reuse the `repoAccessNote` pattern from the scaffold).
- **Fix #2 (evidence, not paraphrase):** a verify stage re-reads each quoted spec/code span; drop a claim
  **only with positive counter-evidence** (high confidence), else **keep + `needs_context`** — exactly the
  `VERDICT_SCHEMA` + "refute only on high-confidence evidence" rule in the scaffold (lines ~373–391). This is
  the memory's hard rule: *"verify quotes by reading actual files, not agent output."*
- **Fix #3 (requirements traceability angle):** ensure the cross-UC and spec-drill auditors check that each
  fixed defect maps to a requirement that *should* have been specified/reachable — not just that code changed.
- *Accept when:* the verify stage demonstrably keeps an uncertain finding (logged `needs_context`) on the
  fixture and drops only an evidence-refuted one.

**A4 — Synthesis barrier + deterministic bucket→skill table.**
- One **Opus** agent (barrier) maps every fix category back to its owning `nacl-*` skill gate and dedups
  overlapping findings (same dedup role as the scaffold's `synth:dedup` stage).
- The bucket→owning-skill mapping is **fixed** → encode it as a **JS lookup**, not an agent re-derivation
  (same lesson as `assignHeadline`). Owning skills per the synthesis: `nacl-sa-uc`, `nacl-sa-architect`,
  `nacl-tl-plan`, `nacl-tl-sync`, `nacl-tl-verify-code`, `nacl-tl-qa`, `nacl-tl-stubs`, `nacl-tl-review`,
  `nacl-sa-ui`. Use `gate-fire-catalog.md` (G1–G11) + `nacl-gate-baseline.md` as the **mapping authority** so
  the table cites real gate IDs (read-only consumption — do not edit those files).
- *Deliverable:* a `BUCKET_TO_SKILL` const (JS object) + one synthesis agent.
- *Accept when:* every bucket in the run maps to exactly one owning skill via the table; no agent "decides"
  the mapping.

**A5 — Cost tiering (model overrides).**
- Auditors #1/#2 (shape, categorization — mechanical-ish) on **Sonnet**; pure git/file-scan sub-steps may drop
  to **Haiku**. Spec-drill #3, cross-UC #4, and synthesis on **Opus** (judgment-heavy). Expose a
  `modelOverrides` arg like the scaffold.
- *Reference cost:* `nacl-goal/pricing.json` — Opus 4.8 $5/$25, Haiku 4.5 $1/$5 (per Mtok in/out).
- *Accept when:* default model assignment matches the above and is overridable per stage.

**A6 — Thin skill wrapper + interchangeable output.**
- *Deliverable:* `nacl-postmortem/SKILL.md` (frontmatter `name`/`model`/`effort`/`description` per
  `nacl-core` convention) documenting the workflow, the **CC-version requirement**, and the **prose-recipe
  fallback** when workflows are unavailable.
- Output path/format **must match the recipe**: `docs/retrospectives/<project>-postmortem.md` — TL;DR with
  bucket %, a `SHA · description · bucket · owning skill · why missed` table, per-case sections with **verbatim
  quotes**, per-skill diagnosis, cross-cutting patterns, recommended skill PRs. So workflow output and
  prose-recipe output are byte-for-byte interchangeable in structure.
- *Accept when:* a reviewer cannot tell from the artifact's structure whether the workflow or the recipe
  produced it. (Codex sync: pair-edit `skills-for-codex/nacl-postmortem/SKILL.md` per the lint-skills rule.)

**A7 — Re-verify the `args`/`scriptPath` gotcha.**
- On CC 2.1.156 the tool-level `args` object did **not** reach the script via `scriptPath`. Before designing
  around it, re-test on the **current** CC version. If still broken, pass the script **inline** (the `script`
  param) with `args`, or bake the project path into the script (the Phase-2 approach).
- *Accept when:* a parameterized run (project path passed in) provably reaches the script's `args` global, or
  the inline/baked workaround is wired and documented in the skill.

### A — Validation gate (mandatory: `validate-on-real-project`)

- **A-Val-1 (fixture/dry pass):** add `bench/fixtures/postmortem/` (a tiny finished-project sample with a
  clear dev→fix boundary + 2–3 fix commits whose spec-fault class is *labeled* ground truth, mirroring the
  `bench/fixtures/review-panel/` pattern). Run the workflow hermetically; confirm the mechanism + the verify
  stage fire. *Accept:* the workflow recovers the labeled spec-fault classes and the verify stage neither
  drops a true finding nor keeps an evidence-refuted one.
- **A-Val-2 (real head-to-head):** run on **`family-cinema`** — the user's own finished nacl-built project,
  already the validation target for the Workstream-B bench runs (shared corpus; OK to name in this public
  repo per `family-cinema-own-project`). **Confirm a clear dev→fix boundary first** (feature commits stopped,
  a wave of fix commits started); if family-cinema lacks one, the post-mortem trigger does not apply and the
  run is invalid — pick another finished project instead. Compare the workflow's
  `docs/retrospectives/family-cinema-postmortem.md` against a single-agent run of the prose recipe on the same
  git history: same root-cause skill gaps? more? fewer false attributions? at what token cost?
- **A — Decision:** ship the workflow **only if** it adds real value over the prose recipe at acceptable cost
  (expected: independent auditors + the cross-UC angle do — but **measure**, don't assume). Otherwise keep the
  prose recipe and shelve the workflow.

---

# Workstream B — harden existing skills with the 8 techniques (NO workflow)

These are the mechanics that actually improved correctness/precision in the experiment. Each is a
**single-agent / skill-level** change — no fan-out, no workflow.

### Per-technique investigation protocol (run for EACH step below)

1. **Read** the target skill(s) end-to-end (`<skill>/SKILL.md` + its `nacl-tl-core/references/*`).
2. **Does it already do this?** Several are partly present (six-status vocab, worktree baselines, `nacl-goal`
   check-scripts). **Quote the existing lines** before changing anything — don't reinvent.
3. **State a falsifiable hypothesis** (e.g. "review misses cross-file bugs because it only reads the diff").
4. **Prototype minimally on ONE skill**, preserving the **output contract** (headline vocab, status-line
   format, six-status codes — breaking it broke `nacl-tl-reopened` once; see `nacl-tl-review` "Contract change
   discipline"). Honor `verify-before-bulk-changes` (SKILL.md vs subagent frontmatter differ).
5. **Validate head-to-head on a real project** via the `bench/` harness: old skill vs hardened skill on the
   same pinned input; measure finding precision/recall + token delta.
6. **Decide adopt/skip**, write it up, propose a focused PR.

### Step catalog (ROI-ranked; each row is one executable step)

| # | Technique | Target skill(s) | Hypothesis to test | Minimal change | Adopt when |
|---|-----------|-----------------|--------------------|----------------|------------|
| **B1** | **Repo-read access / cross-file tracing** — judge the change in context of imports, callers, the runtime producing the data, and consumers; not just the diff | `nacl-tl-review`, `nacl-tl-verify-code` (it already traces DB→service→route→hook→UI — check how far), `nacl-tl-sync` | "Diff-only scope makes review miss/refute real cross-file BLOCKERs" (the #1 lesson; repo access fixed it) | Add explicit "trace cross-file dependencies and consumers" instruction (reuse the `repoAccessNote` wording) | Head-to-head shows it catches a cross-file defect the diff-only version missed, contract unchanged. **Highest ROI.** |
| **B2** | **Requirements-traceability pass** — verify EACH acceptance criterion / REQ is implemented AND reachable end-to-end, as its own step | `nacl-tl-review`, `nacl-tl-verify-code`, `nacl-tl-qa` | "Checklist-category review is not REQ-driven, so missing/partial requirements slip through" (the 9th reviewer caught FC-BE-3/5/11) | Add a "for each acceptance criterion: implemented? reachable? tested?" pass (the `REQUIREMENTS_DIM` pattern) | It surfaces a missing-requirement defect category review misses, at acceptable token cost |
| **B3** | **Deterministic decision tables as check-scripts** — extract precedence/verdict logic from prose into code the skill calls | `nacl-tl-review` (Step 8b headline table), `nacl-tl-verify-code` (status precedence), `nacl-tl-release` (6 blocking conditions) | "Agents re-derive precedence each run → variance + cost; a JS table is deterministic + testable" (proven by `assignHeadline`) | Port the precedence table to a small script the skill invokes (NaCl already does this for `nacl-goal/checks/*.sh`); confirm inputs are structured enough | Verdict variance drops to zero on repeated runs of the same input; no contract change |
| **B4** | **Evidence-based judgment / "keep-if-uncertain"** — never dismiss a finding or downgrade a status without positive evidence; default to UNVERIFIED on uncertainty | `nacl-tl-review`, `nacl-tl-verify-code`, validators | "Skills silently drop concerns on uncertainty" (refute-if-uncertain killed a true BLOCKER) — likely PARTLY present (six-status `UNVERIFIED`, `baseline-failures-need-proof`) | Reinforce "refute only with evidence; else keep + flag" wording wherever the skill makes accept/reject calls | Confirm (quote lines) it never silently drops on uncertainty; tighten only where it does |
| **B5** | **Self-adversarial second pass (single-agent)** — after top findings, the same agent re-reads the code to try to refute its own BLOCKER/CRITICAL findings | `nacl-tl-review`, `nacl-tl-fix` (does the fix truly fix it — re-read), `nacl-tl-verify-code` | "A cheap second look kills false positives without fan-out" (the false-positive killer in single-agent form) | Add "now try to refute your own high-severity findings by reading the actual code" step; **pair with B4** so it doesn't over-refute | False-positive rate drops with no loss of true findings on the bench |
| **B6** | **Structured (schema'd) sub-agent → orchestrator handoffs** — sub-agents return validated JSON, not prose parsed by headline strings | orchestrators parsing `Status:` lines (`nacl-tl-full`, `nacl-tl-conductor`, `nacl-tl-review` consumers) | "Prose-headline parsing is fragile" (the 0.10.0→0.10.1 contract regression) | Evaluate a structured-return convention for the six-status handoff; **weigh against contract-churn risk** | Only if it removes a real parsing-fragility class without breaking downstream consumers |
| **B7** | **Model/cost tiering for sub-tasks** — mechanical sub-steps on Haiku, judgment on Opus | any skill spawning Task sub-agents for mechanical work | "Some delegated sub-steps (file scans, log parsing) are mechanical and overpriced on Opus" | Audit delegated sub-steps; pin the mechanical ones cheaper (ties to the `skill-inner-loop` ethos) | Measured cost drop with no quality regression. Lower ROI, easy win |
| **B8** | **Benchmark-as-validation method** — fixture go/no-go → real-project head-to-head → labeled ground truth, via `bench/` | the process / `bench/` itself | "Skill changes ship without measured proof" | Institutionalize: every non-trivial skill change gets a `bench/` head-to-head before merge (extends `publishable-benchmarks`); consider a reusable "skill A/B" harness | It becomes the standing gate for B1–B7 (it is the method, not a one-off) |

---

# Recommended global sequence

Front-load the cheap correctness wins that need no workflow; the workflow is rare/high-stakes and can follow.

1. **B1** (repo access) → **B2** (requirements traceability) → **B3** (decision-table scripts) — the high-ROI
   core; this is where most of the experiment's *correctness* gain came from, minus the 15× workflow cost.
2. **Workstream A** (`nacl-postmortem` workflow) — once B1–B3 prove the technique-level investigation loop.
3. **B4 / B5** (evidence + self-adversarial) → **B6 / B7 / B8** (handoffs / tiering / institutionalized bench).

B8 underpins everything: each of B1–B7 and Workstream A passes through a `bench/` head-to-head before merge.

# Guardrails (from memory — non-negotiable)

- `verify-before-bulk-changes` — prove on ONE skill before touching many; SKILL.md and subagent frontmatter differ.
- `validate-on-real-project` — fixtures alone never decide; always a real-project head-to-head.
- `publishable-benchmarks` — reproducible, N≥iterations, stated hypotheses; not subjective checks.
- `adversarial-verify-needs-context` — give reviewers/verifiers repo-read access; refute **only** with positive
  evidence (this is *why* B1/B4 are top-ranked).
- `no-private-info-in-public-repo` — no client names / local `/Users/` paths / dump metadata; run the canary
  grep before any commit. `family-cinema` is the user's own demo and OK to name; `project-alpha` /
  `project-beta` are the anonymized retrospective handles already in `docs/retrospectives/`.
- `memory-after-merge-not-after-plan` — record "shipped/exists" memories only after the merge commit.

# Out of scope

- Converting `*-full` / `nacl-tl-conductor` / `nacl-migrate` orchestrators to workflows (Bucket B —
  write-races / worktree cost).
- Bucket-A demotion: workflow versions of routine review / validators — single agent + repo access is the
  cost-effective default (`workflows-for-nacl.md` §7 updated rule). Only the post-mortem stays a workflow.
- The full statistical `bench/` sweep of any panel (separate, lower-priority follow-up).
- **The permitting-clause / G1–G11 strict-gate reform** (`gate-fire-catalog.md`, `nacl-gate-baseline.md`) — a
  separate, larger hardening track. This plan only *reads* that catalog (Step A4's bucket→skill mapping); it
  does not add, close, or modify gates.
