---
name: nacl-postmortem
description: |
  Post-mortem of a project built end-to-end via nacl-* skills: for each
  post-"done" bug, find which skill gate let it through. Produces
  a project-named file under docs/retrospectives. Use when a finished nacl-built
  project has a git dev→fix boundary, "where did the skills break", deep skill-gap
  audit, or the user says `/nacl-postmortem`. RARE / read-only / high-stakes.
---

# NaCl Post-Mortem For Codex

Read `../nacl-tl-core/SKILL.md` before executing this workflow.

A post-mortem maps every post-"done" bug back to the `nacl-*` skill gate that should have
caught it. Trigger only on a project built end-to-end through `nacl-*` skills that has a git
**dev→fix boundary** (feature/FR commits stopped, a wave of fix/test-debt commits started).
This is the one rare, read-only, high-stakes audit worth fanning out for.

> The Claude Code repo ships a dynamic-workflow producer (`.claude/workflows/nacl-postmortem-panel.js`)
> for environments with the workflows runtime. In Codex, run the **prose recipe** below — it produces
> the identical deliverable.

## Procedure (prose recipe — portable)

Read the project's `.tl/tasks/*` specs (frozen at build time), its code, and `git log` directly —
**quote verbatim from files you open; never paraphrase a spec** (a paraphrased quote is unverified).

1. **Resolve the dev→fix boundary** — the commit where feature work stops and the fix wave begins.
   Analyse only `git log <boundary>..HEAD`.
2. **Five audits** (run as far in parallel as the environment allows):
   1. Project shape — stack, `.tl/` tasks done/skipped, BA/SA artifact location (graph vs prose).
   2. Fix-commit categorization — every fix-wave commit → buckets, counts + verbatim examples.
   3. Spec-artifact drill — locate the governing spec, quote it, classify each case
      `SPEC_WRONG` / `SPEC_MISSING` / `SPEC_RIGHT_DEV_DRIFTED` (load-bearing trichotomy).
   4. Cross-UC connectivity — "UC-X declares an entry but UC-Y has no button to reach it"
      (invisible to per-UC review).
   5. QA SKIPs — a mandatory QA stage recorded NOT_RUN; **a missing-provider-key skip is almost
      always a top-3 root cause** — flag it explicitly.
3. **Verify** — re-read each quoted span; keep a case unless you have positive evidence it is wrong.
4. **Synthesize** — map each case to its owning skill + gate via the fixed table below
   (do not re-derive the mapping); an unmappable fix is reported as `unmapped`, not force-attributed.

## GAP → owning skill (fixed mapping)

| GAP category | Owning skill(s) | Gate |
|---|---|---|
| `review_repo_checks` | nacl-tl-review | G1 |
| `sync_wire_evidence` | nacl-tl-sync | G2 |
| `qa_stage_missing` | nacl-tl-qa | G3 |
| `release_readiness` | nacl-tl-release | G4 |
| `artifact_drift` | nacl-tl-conductor | G5 |
| `external_contract_missing` | nacl-sa-architect, nacl-tl-plan | G2 |
| `ui_reachability_missing` | nacl-sa-ui, nacl-tl-review | G7 |
| `runtime_contract_missing` | nacl-sa-uc | G8 |
| `clean_checkout_failure` | nacl-tl-deliver, nacl-tl-deploy | G6 |
| `spec_first_violation` / `stub_shape_unvalidated` | nacl-tl-fix, nacl-tl-stubs | G9 / G10 |

## Deliverable

A single markdown at `docs/retrospectives/<project>-postmortem.md`, sections in this order:
TL;DR + bucket % → table (`SHA · description · bucket · owning skill · why missed`) →
per-case sections with verbatim quotes → per-skill diagnosis → cross-cutting patterns →
recommended next steps (one bullet per proposed skill PR). **No skill edits in this deliverable** —
recommendations only.
