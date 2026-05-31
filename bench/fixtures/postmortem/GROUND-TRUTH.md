# Post-mortem fixture — labeled ground truth (A-Val-1)

Built by `build-fixture.sh`. The fixture is a tiny finished "nacl-built" project (UC001 order
checkout) with a clear **dev→fix boundary**: two build commits (`feat(UC001)` + `docs(UC001) … declared done`)
then a wave of three fix commits. A correct post-mortem run must recover the labels below.

## Dev→fix boundary
The boundary is the `docs(UC001): QA report (staging) — declared done` commit; the three `fix(UC001): …`
commits after it are the post-done bugs.

## The three fix cases (expected classification)

| Fix subject | Trichotomy | GAP category | Owning skill(s) | Why missed |
|---|---|---|---|---|
| reject empty cart with 400 (AC-1 was unguarded) | `SPEC_RIGHT_DEV_DRIFTED` | `review_repo_checks` *or* `unmapped` | nacl-tl-review | AC-1 was specified + acceptance-listed; the dev dropped the guard and review/verify didn't trace the route against AC-1 |
| charge real Stripe provider (was a fake client; AC-2 never live-smoked) | `SPEC_MISSING` (provider contract) **+** qa SKIP | `qa_stage_missing` (and/or `external_contract_missing`) | nacl-tl-qa (+ nacl-sa-architect) | **LIVE_PROVIDER_SMOKE was NOT_RUN — no STRIPE_API_KEY.** Missing-provider-key skip = the canonical top-3 root cause. AC-2 passed on a fake client. |
| surface payment failure as HTTP 402 (contract was ambiguous/wrong) | `SPEC_WRONG` | `sync_wire_evidence` *or* `unmapped` | nacl-tl-sync / nacl-tl-review | api-contract.md listed 402 but did not bind it to behaviour; code returned 200 ok:false; wire-evidence/contract review didn't catch the divergence |

## What the run MUST get right
1. Find the boundary (the "declared done" commit) and analyse only the 3 fix commits after it.
2. Recover the three trichotomy labels (one each of `SPEC_RIGHT_DEV_DRIFTED`, `SPEC_MISSING`, `SPEC_WRONG`).
3. Flag the **LIVE_PROVIDER_SMOKE NOT_RUN / missing STRIPE_API_KEY** qa-skip (auditor #5) as a likely top-3 root cause.
4. Map the qa-skip case to `qa_stage_missing` → `nacl-tl-qa` (G3) via the deterministic GAP table.
5. **Verify stage:** the spec quotes are real (they exist verbatim in the committed files), so the verify
   stage must **keep** all three cases (none should be dropped). If a case is fabricated (a quote that does
   not exist in the repo), the verify stage must drop it on positive counter-evidence — exercise this by
   confirming no case survives with an unfindable quote.

## Reproduce
```
bench/fixtures/postmortem/build-fixture.sh /tmp/pm-fixture
# then run the workflow with args: { "projectPath": "/tmp/pm-fixture", "project": "pm-fixture",
#   "artifactOut": "/tmp/pm-fixture-postmortem.md", "modelOverrides": {"specdrill":"sonnet","crossuc":"sonnet","synth":"sonnet"} }
```
