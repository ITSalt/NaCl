# B1 head-to-head: cross-file tracing in `nacl-tl-review` — family-cinema UC033-BE

**Date:** 2026-05-30 · **Technique:** B1 (repo-read access / cross-file tracing) · **Status:** ADOPTED
**Target:** `family-cinema` `UC033` BE (memory video pipeline: audio-trimmer, video-generator,
music-generator, video-assembler, pipeline-orchestrator) · pinned at build commit `d4f13b4` via a
detached `git worktree` so every arm saw identical repo context.

## Hypothesis (falsifiable)

> `nacl-tl-review`, lacking an explicit cross-file-trace step, can stay diff-scoped and **miss a real
> cross-file BLOCKER** that is invisible from the diff hunks but visible by reading the callees/runtime
> the change depends on. An explicit, mandatory "trace callees/consumers/runtime" step closes this.

## Ground truth (the defect a diff-only review cannot see)

`backend/src/services/kie.client.ts` at `d4f13b4` is an **image-only** client: `createTask` always submits
`envConfig.KIE_MODEL` with `aspect_ratio:'3:4'`/`resolution` and returns `imageUrl`. The change under
review adds `video-generator.service.ts` and `music-generator.service.ts`, both of which call this client.
So the "video" and "music" steps actually request a still image — the `KIE_VIDEO_MODEL` / `KIE_MUSIC_MODEL`
config is **dead config (only logged)**. Per `acceptance.md`, **FC-BE-3** requires video via kie.ai
(Kling/Veo) and **FC-BE-5** requires music via kie.ai Suno — so both are **not actually implemented**.
`kie.client.ts` is **not in the diff**; it is a callee of the changed services.

## Method

Three reviewer arms, identical task spec + identical diff (`backend/src/` production hunks, 1376 lines),
differing on exactly two controlled variables: **repo access** and the **explicit cross-file instruction**.
Each arm is one independent agent asked to (a) score every acceptance criterion PASS/PARTIAL/FAIL and
(b) emit findings (BLOCKER/CRITICAL/MAJOR/MINOR) and a verdict, in `nacl-tl-review` vocabulary.

| Arm | Repo access | Explicit cross-file step (B1) | Mirrors |
|---|---|---|---|
| **Diff-only** | no (diff + spec only) | no | pre-repo-access skill / the experiment's UC-037-BE failure |
| **Repo-access (implicit)** | yes | no | current `nacl-tl-review` (access available, tracing discretionary) |
| **Hardened (B1)** | yes | **yes (new Step 4a)** | `nacl-tl-review` after this change |

## Results

| Arm | Caught the `kie.client.ts` cross-file BLOCKER? | FC-BE-5 (music) scored | Top severity | Verdict | Output tokens | Tool calls |
|---|---|---|---|---|---|---|
| Diff-only | ❌ **MISSED** | **PASS** (wrong — judged from prompt text) | MAJOR | `CHANGES REQUESTED` | ~55K | 3 |
| Repo-access (implicit) | ✅ caught (read `kie.client.ts` on its own) | FAIL | BLOCKER | `CHANGES REQUESTED` | ~91K | 30 |
| Hardened (B1) | ✅ caught **+ "i2v never sends the photo" CRITICAL + concat-codec MAJOR** | FAIL | BLOCKER | **`BLOCKED`** | ~95K | 27 |

### Reading

1. **The failure mode is real and reproduced.** The diff-only arm could not see `kie.client.ts`, so it
   reasoned from the prompt string `"{mood}, instrumental, no vocals"` and **falsely passed FC-BE-5**,
   never escalating past MAJOR. This is precisely the cross-file BLOCKER the experiment's diff-only panel
   refuted away on UC-037-BE.
2. **Repo access closes it** — both repo-access arms caught the BLOCKER. This re-confirms the experiment's
   core verdict: *"single agent wins" really meant "repo access wins."*
3. **The explicit B1 step adds value over discretionary access**, in two ways: it makes the cross-file
   pass **mandatory** rather than relying on the reviewer choosing to read outside the diff; and the
   hardened arm produced the only **fully-correct verdict** (`BLOCKED`, FC-BE-3/5 classified as
   unimplemented) and the only arm to flag the distinct "image-to-video never sends the photo" CRITICAL
   and the concat-codec MAJOR. The marginal token cost over the implicit arm was ~4% (95K vs 91K).

## Decision

**ADOPT.** The minimal edit — a mandatory `#### 4a. Cross-file trace` step plus one Code-Correctness
checklist row — converts a diff-scoped review (misses the BLOCKER, false PASS) into a repo-tracing review
that catches it, at no contract change (findings ride the existing severity vocabulary; no new headline/
status). The same pattern was propagated to `nacl-tl-verify-code` (Step 2.6 "trace beyond the canonical
chain") and `nacl-tl-sync` (Step 4 call-site binding + Endpoint-Compliance row), and mirrored into the
three `skills-for-codex/` variants for workflow parity.

## Caveats

- **N=1 per arm** — directional, not statistical (matches the parent experiment's framing). The
  `bench/` harness can scale N for a publication-grade sweep; the effect here (false PASS vs caught
  BLOCKER) is categorical, not a token-delta that needs σ separation.
- Both repo-access arms were strong agents; a weaker model may need the explicit step more, not less —
  which is the argument for making it mandatory.
- The diff-only arm was *instructed* not to browse, to isolate the variable; the pre-B1 skill did not
  forbid browsing, it simply didn't mandate it. The risk B1 removes is the **discretionary** gap.

## Reproduction

```bash
# pin the build commit in an isolated worktree (identical context for every arm)
cd /path/to/family-cinema
git worktree add --detach /tmp/fc-uc033-d4f13b4 d4f13b4
git diff d4f13b4^ d4f13b4 -- backend/src/ > /tmp/fc-uc033-be.diff
cp .tl/tasks/UC033/{task-be,acceptance,api-contract}.md /tmp/fc-uc033-d4f13b4/.tl/tasks/UC033/

# three review arms (one agent each), same diff + spec; vary repo-access and the Step-4a instruction:
#   arm 1: diff + spec only, no browsing               → misses the BLOCKER, false-PASS FC-BE-5
#   arm 2: + full repo read access, no Step-4a          → catches the BLOCKER
#   arm 3: + full repo read access + Step-4a (B1)       → catches it, BLOCKED verdict, most complete

git worktree remove --force /tmp/fc-uc033-d4f13b4   # cleanup
```

Ground-truth check: `git show d4f13b4:backend/src/services/kie.client.ts` — confirm `createTask` submits
`this.model` (image) and returns `imageUrl`; no video/music path exists.
