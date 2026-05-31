# Head-to-head: `nacl-review-panel` (workflow) vs single-agent review — family-cinema UC-037-BE

**Date:** 2026-05-29 · **Target:** family-cinema `UC-037-BE` (admin pipeline dashboard backend:
Fastify list/detail/SSE routes + repository + Zod schemas + shared types + tests). · **Input:** the
identical 1,484-line implementation patch (`6618ae9~1..5e3a303`, 7 files) + `task.md` + `result-be.md`.

> **TL;DR — the panel was 12× more expensive and reached the *wrong* verdict on the most important
> axis.** The single agent caught the two production-breaking bugs and said `CHANGES REQUESTED`; the
> panel caught more *breadth* of medium issues but **its own adversarial-verify stage refuted and dropped
> the real BLOCKER**, so it returned `APPROVED`. Adoption is **not** justified as-is. The cause is
> precise and fixable (below), so the pattern isn't dead — but this run is a STOP, not a GO, until the
> three fixes land and a re-measure favors it.

## Method

| | Panel (`nacl-review-panel`) | Baseline (single agent) |
|---|---|---|
| Shape | gates (provided) → 8 parallel category reviewers → adversarial verify (BLOCKER/CRITICAL/MAJOR) → dedup → JS headline | one senior reviewer, all 8 BE categories, opus/high |
| Repo access | **diff-only** (reads the patch file; reviewers told "review ONLY what's in the diff") | **free** (read ~10 surrounding runtime files: orchestrator, types, migrations, auth plugin) |
| Gates | held constant (provided all-GREEN) | held constant (not run) |
| Tokens | **1,072,026** | **89,417** |
| Wall-clock | ~619 s (22 agents) | ~170 s (1 agent) |
| Verdict | **`APPROVED`** (0 BLOCKER / 1 CRIT / 8 MAJOR / 9 MINOR) | **`CHANGES REQUESTED`** (2 BLOCKER / 3 CRIT / 3 MAJOR / 3 MINOR) |

Gates are held constant deliberately: they are deterministic and identical regardless of reviewer
architecture, so they're not the variable under test. The asymmetry that *is* under test — diff-only vs
free repo access — turned out to be the whole story.

## The decisive event

The panel's Correctness reviewer **did find** the production-breaking bug and rated it **BLOCKER**:

> *SSE step-event status mapping does not match the statuses the orchestrator actually emits —
> `step_completed`/`step_failed`/`step_skipped_on_error` are dead branches.*

Then the panel's **adversarial-verify skeptic refuted it** (confidence: medium) and dropped it. It also
refuted a real MAJOR ("route handlers don't wrap DB calls — raw error leaks"). Both refutations happened
because the skeptic, reading **only the diff**, could not see the runtime files
(`pipeline-orchestrator.service.ts`) that prove the orchestrator emits `'ready'`/`'error'`, and my
verifier prompt says *"default to refuted=true if you are not confident."* **Uncertainty + diff-only +
refute-by-default turned the false-positive killer into a true-positive killer for cross-file bugs.**

With the BLOCKER gone, `assignHeadline` saw 0 blockers → `APPROVED`. The single agent, reading the
runtime, confirmed the same bug (and that the *test fixtures use the fake vocabulary, masking it*) and
correctly returned `CHANGES REQUESTED`. The on-disk post-fix version of this file already corrected the
vocabulary — i.e. this was a **historically real production bug**, and the panel approved it.

## Findings comparison

**Both caught (overlap):** LIKE-wildcard escaping in the search filter; SSE auth weaknesses around
`JWT_SECRET` handling; heavyweight `getMemoryVideoDetail()` on the SSE connect path; happy-path-only test
coverage / missing error-path tests.

**Baseline-only — the severe ones (panel missed or refuted):**
- ⭐ **Step-status vocabulary mismatch (BLOCKER)** — panel found it, *verifier dropped it*.
- ⭐ **Test fixtures use fake `'running'`/`'completed'` values, masking the bug (BLOCKER).**
- ⭐ **REQ-037-05 (`/admin/prompts` links) not implemented; REQ-037-02 preview not populated (CRITICAL)** —
  a *missing-requirement* defect; the panel never cross-checked the spec REQ-by-REQ, so it missed this.
- SSE auth returns 403 where the contract demands 401.

**Panel-only — real catches the single agent missed (the breadth win):**
- ⭐ **Static `ADMIN_API_KEY` accepted as a URL `?token=` → secret leaks into access/proxy logs (CRITICAL).** Strong.
- ⭐ **Heartbeat `setInterval` not cleared on the completed/error close paths → per-connection leak (MAJOR).**
- Non-constant-time admin-token comparison (timing side-channel) (MAJOR).
- SSE handler is one ~210-line function, >3 nesting levels (MAJOR).
- `Number(prompt_version)` → `NaN` on non-numeric versions; `durationMs` → `NaN` on malformed timestamps;
  Date→ISO duplicated 4× (DRY); cost LEFT JOIN fan-out risk; nested-ternary dead branch (MINORs).

**Scope discipline worked:** the Git-and-Commits reviewer correctly reported the diff as *un-reviewable
for commit metadata* and downgraded to informational — it did **not** fabricate "no commit message"
findings (the noise the untuned fixture run produced). And the tuning measurably cut noise: on the
identical fixture, untuned = 26 findings (2B/0C/14Maj/10Min); tuned = 12 findings with the dedup barrier
firing (`19→18` here, `14→12` on the fixture).

## What this proves

1. **Fan-out buys breadth, not severity.** Eight specialised reviewers each dig deeper into their lane
   and surfaced real issues one generalist missed (secret-in-URL, heartbeat leak, NaN coercions). That is
   a genuine, repeatable advantage.
2. **But scoping dominates architecture.** The single agent caught the *worst* bugs purely because it
   read beyond the diff. My anti-noise "review ONLY the diff" constraint — plus the verifier's
   refute-if-uncertain default — made the panel **structurally blind to, and actively suppress,
   cross-file and missing-requirement defects.** That blindness produced a **false `APPROVED`**, which for
   a review *gate* is the worst possible failure.
3. **Cost is real:** ~12× tokens and ~3.6× wall-clock for a verdict that was wrong on the severe axis.

## Required fixes before re-measuring (this is the gate, and it says STOP)

1. **Give reviewers + verifiers repo-read access.** Drop "review ONLY the diff"; instruct them to read the
   files the diff *touches* (imports, called functions, the API contract, the entity/runtime that
   produces the data). This is the #1 fix.
2. **Fix the adversarial-verify default.** "Refute if uncertain" must become "**refute only with positive
   evidence the finding is wrong**; if you cannot confirm, *gather the referenced files* before deciding,
   and if still unsure, KEEP the finding and flag `needs-context` rather than drop it." A real BLOCKER must
   never be dropped on mere uncertainty.
3. **Calibrate the verdict.** `APPROVED` currently requires only 0 blockers; a surviving CRITICAL (e.g.
   secret-in-URL) should force `CHANGES REQUESTED`. Add a **requirements-traceability reviewer** (verify
   each REQ-0xx against the implementation) so missing-requirement defects can't pass.

Only after 1–3 land and a re-run on this same UC-037-BE patch shows the panel **catching the two BLOCKERs
and not over-approving** is a full `bench/` statistical sweep (H1 tokens / H2 wall-clock / H3 cost / H6
finding-quality) worth funding. Until then: **the markdown single-agent review remains canonical**, exactly
as the additive-optional stance intended.

## Caveats

- One run, one task; LLM reviewers are non-deterministic. The numbers are directional, not statistical.
- The repo-access asymmetry was the independent variable; the fair *next* experiment is panel-**with**-repo
  -access vs single-agent-with-repo-access, to isolate fan-out from scoping.
- Cost excludes the deterministic gates (held out); a live run adds the monorepo `pnpm -r` gate cost to
  both sides.
