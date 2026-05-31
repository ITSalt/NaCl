# Head-to-head #2 (after fixes): `nacl-review-panel` vs single-agent — family-cinema UC033 BE

**Date:** 2026-05-29 · **Target:** family-cinema `UC033` BE (memory video processing pipeline: audio-trimmer,
video-generator, music-generator, video-assembler, pipeline-orchestrator + ffmpeg wrapper + 6 unit-test
files). · **Input:** the 12 files' content as a 2,956-line review artifact, pinned at build commit
`d4f13b4` via a `git worktree` so **both reviewers had identical, consistent repo-access context**.

> **TL;DR — the three fixes closed the failure.** Where the UC-037-BE panel *over-approved* by refuting a
> real cross-file BLOCKER, the fixed panel returned the correct **`CHANGES REQUESTED`** and **caught the
> same class of cross-file BLOCKER** (the kie.ai integration submits the still-image model for both video
> and music — FC-BE-3/FC-BE-5 not really implemented), found by reading `kie.client.ts` *outside* the diff.
> It also surfaced several real issues the single agent missed (SSRF, a `pipeline_progress` lost-update
> race, music-step-marked-ready-on-failure). **Cost: ~1.95M tokens / ~18 min / 33 agents vs the single
> agent's 126K / ~4 min — roughly 15×.** Verdict: the pattern is now *viable*; whether it's *worth it* is a
> cost/stakes call, not a correctness one.

## The fixes, and the evidence each one worked

| Fix | Prior failure (UC-037-BE) | This run (UC033 BE) |
|---|---|---|
| **1. Repo-read access** for reviewers/verifiers (dropped "diff-only") | panel was blind to runtime files → couldn't see the bug's evidence | a reviewer read `kie.client.ts:50-58` and caught that `createTask` hardcodes the image model; the video/music model fields are dead config (only logged) |
| **2. Verifier: refute only with positive evidence; keep-if-uncertain; drop only on high-confidence** | a *medium*-confidence refutation dropped the real BLOCKER → `APPROVED` | **zero `✗ refuted` lines in the run log** — cross-file findings survived (`verified:true`) |
| **3a. Requirements-traceability reviewer** (dimensions went 8 → **9**) | missing-requirement defects (REQ-037-05) slipped through | FC-BE-3/5/6/11 + MEM-005 each flagged with the "Requirements Traceability" tag |
| **3b. Calibrated verdict** (a surviving CRITICAL now blocks, not only BLOCKERs) | 1 CRITICAL + refuted BLOCKER → wrongly `APPROVED` | 1 BLOCKER + 5 CRITICAL → correctly `CHANGES REQUESTED` |

## Findings comparison (panel 28 vs single agent 9)

**Both caught — including the headline cross-file defect:**
- ⭐ **kie.ai submits the image model, not Kling/Suno → FC-BE-3 / FC-BE-5 not implemented** (panel: BLOCKER+CRITICAL; baseline: BLOCKER). *This is the cross-file catch the previous panel refuted away — now kept.*
- Voice-to-photo pairing assumes `photos[k].index === k` (silent mis-association).
- FC-BE-11 GenerationLog not persisted for AI calls (panel MAJOR / baseline CRITICAL).
- `duration_sec <= 15` CHECK edge (panel MINOR / baseline CRITICAL — severity disagreement).

**Panel-only — real and valuable (the breadth win):**
- ⭐ **`pipeline_progress` JSONB lost-update race** during the parallel video+music step — *directly contradicts* the single agent, which judged the read-modify-write "sound." Parallel writers + read-modify-write on one JSONB column = a real race; the generalist under-analyzed it, the dedicated Correctness reviewer caught it.
- ⭐ **SSRF** — server-side fetch of unvalidated remote URLs returned by kie.ai.
- ⭐ Music step recorded `ready` even when generation failed (AF-2 not reflected in status).
- Raw internal errors (ffmpeg stderr, MinIO keys, task IDs) persisted/returned verbatim.
- FC-BE-6 voice concatenated into one track rather than overlaid on corresponding segments; MEM-005 music not *ducked under voice* (static volume only); orchestrator handler closures untested; misleading `UT-2.4` timeout test.

**Single-agent-only — panel missed:**
- ⭐ **Audio trim `-ss/-to` placed before `-i`** (input-seek) → wrong clip boundaries (CRITICAL).
- `concat -c copy` across heterogeneous ken_burns vs kie.ai clips will likely fail/corrupt (MAJOR).

**Noise:** the panel still over-produces at the low end (12 MAJOR / 10 MINOR), including two Git/commit
findings (squashed-commit / non-atomic) that the scope rule was meant to suppress — they leaked back via
repo access seeing the real 50-file build commit, so they're *defensible* but low-value here.

## Cost

| | Fixed panel | Single agent (baseline) |
|---|---|---|
| Verdict | `CHANGES REQUESTED` (1B/5C/12Maj/10Min) | `CHANGES REQUESTED` (2B/3C/2Maj/2Min) |
| Caught the cross-file BLOCKER | **yes** | yes |
| Tokens | **1,951,852** | 125,927 |
| Wall-clock | ~1,094 s (33 agents) | ~237 s (1 agent) |

## What this proves

1. **The failure mode is closed.** Repo access + a positive-evidence verifier + calibrated verdict turned a
   false `APPROVED` into a correct `CHANGES REQUESTED` that catches the same cross-file BLOCKER a strong
   single agent catches. The benchmark gate's bar ("catch the BLOCKERs, don't over-approve") is now met.
2. **Fan-out genuinely adds depth, not just breadth.** The dedicated Correctness reviewer found a
   concurrency race the generalist explicitly dismissed as "sound" — specialised attention beat one pass.
   Panel-only SSRF and AF-2-status bugs are real and severe.
3. **But neither is a superset, and cost is ~15×.** The single agent caught two real bugs the panel missed
   (the `-ss/-to` seek bug, the concat-copy bug) at 1/15th the tokens and 1/4.5th the time, reaching the
   same verdict.

## Recommendation (updated decision rule)

- **Default for routine per-UC review: a single strong agent *with repo access*.** It is ~15× cheaper and,
  on both real targets, reached the correct verdict and caught the headline bug. The earlier
  diff-only single-agent advantage was really a *repo-access* advantage — give the markdown skill's
  reviewer repo access and it is very hard to beat on cost-adjusted value.
- **Reach for the panel when breadth/depth is worth the spend** — a pre-release or high-stakes audit where
  surfacing the SSRF + the race + the AF-2 status bug + the requirement gaps in one pass justifies 15× the
  tokens. Then run it, and dedup/verify as configured.
- **Before a full `bench/` sweep, cut panel cost:** put the dimension reviewers on Sonnet (reserve Opus for
  the requirements reviewer + verifier + dedup), and cap verify to BLOCKER/CRITICAL (skip MAJOR) — the
  MAJOR-verify pass is most of the 15× and added little here. Re-measure cost-adjusted finding-quality
  (precision/recall vs a labeled set) before shipping the panel as anything other than an opt-in audit tool.

## Caveats

- Two runs, two tasks, non-deterministic agents — directional, not statistical.
- Both reviewers had identical repo access this time (the fair comparison the UC-037-BE run lacked); the
  remaining variable is fan-out (panel) vs one pass (agent).
- The panel-only "lost-update race" contradicts the baseline's judgment; it looks real but is exactly the
  kind of claim a labeled-ground-truth sweep should adjudicate.
