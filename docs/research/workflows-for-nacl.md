# Claude Code dynamic workflows for NaCl — fact-check, decision rule, scenarios

**Date:** 2026-05-29 · **Status:** research + pilot (`nacl-review-panel`) · **CC on this machine:** 2.1.156

This note (1) fact-checks the public claims about Opus 4.8 + dynamic workflows, (2) gives a decision
rule for *when* a workflow beats a markdown skill or plain deterministic code, and (3) maps NaCl's
orchestration surface into build / defer / keep-as-skill buckets. It backs the `nacl-review-panel`
pilot in `.claude/workflows/`.

---

## 1. Fact-check

A Telegram post described the launch. Verified against Anthropic + press sources:

| # | Claim | Verdict | Note |
|---|-------|---------|------|
| 1 | Opus 4.8 released; beats 4.7 / GPT-5.5 / Gemini 3.1 Pro; ~4× less likely to silently miss a bug in its own code | **Confirmed** | Released 2026-05-28, same $5/$25 pricing. Anthropic's phrasing: ~4× less likely to "allow flaws … to go unremarked". |
| 2 | Workflows = JS script run in the background; primitives `phase` / `agent` / `parallel` / `pipeline` | **Confirmed (shape), signatures undocumented** | Docs describe phases, schema'd agents, parallel exec (≤16 concurrent, ≤1000/run), pipelines — but the exact function names are not in public docs. They match the runtime we actually have. |
| 3 | Say "workflow" in a prompt → Claude writes one; save a run → it becomes a slash command | **Confirmed** | `/workflows` → select run → `s`. |
| 4 | Built-in `/deep-research`: 5 angles, 3 critics, reject if 2-of-3 refute | **Partially** | `/deep-research` exists and "fans out across angles, cross-checks sources, votes on claims, filters out unsupported ones". The exact "5 / 3 / 2-of-3" numbers are the blogger's reconstruction, not documented. |
| 5 | Needs v2.1.154+; Max/Team default-on; Pro via `/config`; CLI + Desktop | **Confirmed, with correction** | All true **except Desktop is GA, not "coming soon"** (launched across CLI, Desktop, VS Code on 2026-05-28). |
| 6 | Burns far more tokens; "70% of limit on a trivial query" | **Directionally true; figure unverified** | Docs warn a run "can use meaningfully more tokens"; recommend starting narrow. The 70% anecdote is not substantiated. |
| 7 | Confirmation prompt before first run | **Confirmed** | CLI shows planned phases + Yes / Yes-don't-ask / View raw script / No. |
| 8 | Fast mode Opus 4.8 (~2.5× faster, 3× cheaper, $10/$50); effort slider on claude.ai | **Confirmed** | Fast mode $10 in / $50 out (was $30/$150 on 4.7). Effort control now on claude.ai + Cowork. |

**Sources:** anthropic.com/news/claude-opus-4-8 · code.claude.com/docs/en/workflows ·
claude.com/blog/introducing-dynamic-workflows-in-claude-code · code.claude.com/docs/en/changelog ·
code.claude.com/docs/en/desktop · the-decoder.com (Opus 4.8 vs GPT-5.5) · venturebeat.com (3× cheaper fast mode).

**Bottom line:** the post is ~90% right. Corrections worth carrying: Desktop is GA; treat the
`/deep-research` internals and the 70%-token figure as folklore, not spec.

---

## 2. Two framing corrections before any "use workflows" decision

1. **NaCl does not do "parallel skill calls" today.** Its orchestrators (`*-full`, `nacl-tl-conductor`,
   `nacl-migrate`) are *mostly sequential* Task-tool delegation with human gates. So the question isn't
   "swap parallel skill calls for workflows" — it's "introduce parallelism + voting + loops where prose
   currently forces a sequence," **and pay for it in tokens.**

2. **Don't fan mechanical work out to LLM agents.** Running NaCl's 50+ Cypher validation checks as 50
   *agents* would be wasteful — each agent is a full model. The mechanical parts (Cypher, shell, git,
   file scans) stay deterministic inside *one* agent (or a script); the **fan-out is for judgment.**

### Decision rule

> Reach for a **workflow** only when the work is **LLM-judgment-heavy AND parallelizable AND benefits
> from independent perspectives or adversarial verification.** Otherwise keep a **markdown skill** (for
> interactive, gate-heavy, sequential processes) or **deterministic code** (for mechanical query/file/git
> work).

**Cost lever ("small models, big tasks"):** workflows let you pin each agent to a model. Put mechanical
gate agents on **Haiku 4.5** (already priced in `nacl-goal/pricing.json`: $1/$5 vs Opus $5/$25) and
reserve Opus for synthesis and adversarial verification. This is how a workflow can be *cheaper per unit
of judgment* even though it spawns more agents.

---

## 3. Scenario taxonomy for NaCl

### Bucket A — strong fit (build as workflows)

| Candidate | Pattern | Why it fits |
|-----------|---------|-------------|
| **Code-review critic panel** (`nacl-tl-review`) — **the pilot** | gates → fan-out 8/10 categories → adversarial verify → JS headline | Clean split of deterministic gates from judgment; the ~12-row headline table becomes testable JS; adversarial verify kills LLM review's main failure mode (plausible-but-wrong findings). |
| **Audit / post-mortem panel** (migration-retrospective gate; skill-postmortem algorithm) | parallel independent auditors → synthesis | Already a 3-agent-with-synthesis recipe in our docs/memory; read-only; recurring → ideal saved `/workflow`. Catches cross-cutting issues (e.g. cross-UC reachability) that per-item review misses. |
| **Validation *finding* triage** (`nacl-sa-validate` / `nacl-ba-validate`) | run check groups deterministically → fan-out triage + adversarially verify each CRITICAL | Keep the 50+ Cypher checks deterministic; use the panel only to triage/verify the *findings* before reporting, cutting false-positive validation noise. |
| **Diagnose sweep** (`nacl-tl-diagnose`) | multi-modal fan-out (git history / doc drift / code health / regression patterns) → synthesized report | Independent search angles, each blind to the others; classic "understand" workflow. |

### Bucket B — possible, with caveats (defer)

- **`nacl-tl-conductor` / `nacl-tl-full` wave execution**, **`nacl-tl-plan` per-UC generation.** These
  *mutate* files and the Neo4j graph in parallel → require **worktree isolation** (expensive) and risk
  **write races** on `Task.phase_*`. They're already autonomous via `/nacl-goal`. Marginal gain, real
  risk — defer until the read-only panels prove the pattern.

### Bucket C — keep as markdown skills

- **`nacl-ba-full` / `nacl-sa-full`** — gate-dominated, interactive, human-judgment confirmations that
  *cannot* be delegated (the `REFUSE_HUMAN_GATE_*` codes exist for exactly this). Background autonomous
  runs are the wrong execution model.
- **Single-step mechanical skills** (`nacl-tl-ship`, `nacl-tl-deploy`, `nacl-tl-release`) — sequential,
  no parallelism to exploit.

---

## 4. Workflows ≠ `/goal` (they compose)

`/goal` (wrapped by `nacl-goal`) is a **long-running single-agent loop** with a transcript-only evaluator
and the GOAL_PROOF wire format. Workflows are **deterministic multi-agent orchestration in JS** with their
own progress/verification model. They are **complementary, not substitutes**: a `/goal` loop body could
invoke a workflow per iteration; a workflow stage could shell out to a `nacl-goal` check script. Keep the
autonomy story coherent — don't reframe `nacl-goal` as "the old way."

---

## 5. Adoption discipline (benchmark gate)

Per NaCl's standing rules — *verify before bulk changes*, *publishable benchmarks*, *validate on a real
project* — **no workflow ships broadly until it's measured head-to-head against its markdown baseline.**
The path:

1. **Fixture dry-run** (hermetic go/no-go) — `bench/fixtures/review-panel/`.
2. **Real-project head-to-head** — same pinned UC/SHA, markdown skill vs workflow, diff the verdicts /
   findings / cost. (Programmatic `claude -p` baselines go through the `itsalt-pinch` Pacer.)
3. **Full `bench/` sweep** (only if step 2 justifies it): H1 tokens, H2 wall-clock, H3 cost, plus a new
   **H6 finding-quality** (precision/recall vs the labeled fixture set), N≥5 interleaved, dual-pane video.

**The empirical delta — not the architecture argument — decides adoption.**

---

## 6. Pricing note

Fast-mode Opus 4.8 ($10 in / $50 out, ~2.5×) is a new cost/speed lever for autonomous loops and benchmark
runs. `nacl-goal/pricing.json` currently has only standard Opus 4.8 ($5/$25) and Haiku 4.5 ($1/$5); adding
a fast-mode entry is a small follow-up (tracked, not done here).

---

## 7. Pilot + Phase-2 result (the empirical verdict)

`.claude/workflows/nacl-review-panel.js` — see `.claude/workflows/README.md`. An **additive, optional**
drop-in producer of `nacl-tl-review` output (identical contract), built to test the decision rule above.

- **Phase 1 (fixture):** mechanism works end-to-end; adversarial verify correctly killed over-stated
  findings; tuning cut noise 26 → 12 findings (dedup barrier fired).
- **Phase 2 (real project, family-cinema UC-037-BE):** head-to-head vs a single-agent review on the
  identical 1,484-line patch — full report in
  [`review-panel-vs-skill-family-cinema-UC-037-BE.md`](./review-panel-vs-skill-family-cinema-UC-037-BE.md).
  **Result: STOP, not GO.** The panel cost **~12× the tokens** and returned **`APPROVED`** while the
  single agent returned the correct **`CHANGES REQUESTED`** — because the panel's own adversarial-verify
  stage (diff-only context, "refute if uncertain") **refuted and dropped a real production-breaking
  BLOCKER** that the single agent caught by reading runtime files outside the diff. Fan-out won on
  *breadth* (secret-in-URL, heartbeat leak, NaN coercions the single agent missed) but lost on *severity*
  and over-approved. **Lesson: scoping dominates architecture** — and the benchmark gate, per design,
  blocks adoption until three fixes land (repo-read access for reviewers/verifiers; refute-only-with
  -positive-evidence; verdict calibration + a requirements-traceability reviewer) and a re-measure favors
  the panel. Markdown `nacl-tl-review` stays canonical.
- **Phase 2b (after fixes, family-cinema UC033 BE, 2,956-line diff):** the three fixes (repo-read access;
  positive-evidence verifier that keeps-if-uncertain; requirements reviewer + calibrated verdict) **closed
  the failure** — full report in
  [`review-panel-vs-skill-family-cinema-UC033-BE.md`](./review-panel-vs-skill-family-cinema-UC033-BE.md).
  The panel now returns the correct **`CHANGES REQUESTED`** and **catches the cross-file BLOCKER** (kie.ai
  submits the image model for video+music → FC-BE-3/5 unmet), found by reading `kie.client.ts` outside the
  diff; the verifier dropped **nothing** (vs refuting the real BLOCKER last time); fan-out even found a
  `pipeline_progress` race the single agent dismissed as "sound." **But cost is ~15×** (1.95M vs 126K
  tokens) and the single agent caught two bugs the panel missed at the same verdict. **Updated rule:** a
  single strong agent *with repo access* is the cost-effective default for routine review; the panel is an
  opt-in **audit** tool for high-stakes breadth — and even then, move dimension reviewers to Sonnet and cap
  verify to BLOCKER/CRITICAL before any full `bench/` sweep. The earlier "single agent wins" was really a
  *repo-access* win, not an architecture win.
