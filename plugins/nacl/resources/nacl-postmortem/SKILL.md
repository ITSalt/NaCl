---
name: nacl-postmortem
model: opus
effort: high
description: |
  Post-mortem of a project built end-to-end via nacl-* skills: for each
  post-"done" bug, find which skill gate let it through. Produces
  docs/retrospectives/<project>-postmortem.md.
  Use when: a finished nacl-built project with a git dev→fix boundary, "where did
  the skills break", post-mortem, deep skill-gap audit, or the user says
  "/nacl-postmortem". RARE / read-only / high-stakes.
---

## Contract

**Inputs this skill consumes:**
- A project built end-to-end through `nacl-*` skills, with a git **dev→fix boundary**
  (feature/FR commits stopped, a wave of fix/bugfix/test-debt commits started).
- The project's `.tl/tasks/*` specs (frozen at build time), its code, and `git log`.
- `nacl-tl-core/references/gate-fire-catalog.md` (G1–G11) +
  `project-gap-closure.md` (the ten GAP categories) — the **mapping authority**
  (read-only).

**Output this skill produces:**
- A single retrospective at `docs/retrospectives/<project>-postmortem.md`, sections in
  this exact order (so the workflow and the prose-recipe outputs are structurally
  interchangeable):
  1. **TL;DR** — headline finding + bucket percentages.
  2. **Table**, one row per fix case: `SHA · description · bucket · owning skill · why missed`.
  3. **Per-case sections** with **verbatim** spec quotes (no paraphrase).
  4. **Per-skill diagnosis** — which cases hit it, the systemic gap, a recommendation
     (no skill edits in this deliverable — that is a separate user decision).
  5. **Cross-cutting patterns.**
  6. **Recommended next steps** — one bullet per proposed skill PR.

## Two producers, one deliverable

This skill has **two interchangeable producers**. Pick by environment; the artifact
structure is identical either way.

### A. Workflow (preferred when available) — `.claude/workflows/nacl-postmortem-panel.js`

Five **parallel** auditors → an evidence **verify** stage → a deterministic
**GAP→owning-skill** synthesis → one writer agent. Matches every condition that justifies
a workflow's cost: rare, read-only, high-stakes, genuinely helped by independent
specialist perspectives.

- **Requirements:** Claude Code **≥ 2.1.154** (dynamic workflows). Spawns ~8–12 agents and
  costs meaningfully more tokens than the prose recipe — that is the trade for breadth +
  adversarial verification on a once-per-project audit. Watch `/workflows` for per-phase totals.
- **Invoke** (the project path is the only required arg):

  ```
  Run the nacl-postmortem-panel workflow with args:
  { "projectPath": "/abs/path/to/project", "project": "<name>",
    "boundaryHint": { "sha": "<sha>", "subject": "<subj>" },   // optional; else auto-resolved
    "artifactOut": "docs/retrospectives/<project>-postmortem.md",
    "modelOverrides": { "specdrill": "opus", "qaskip": "haiku" } }  // optional (A5 cost tiering)
  ```

- **The five auditors** (`parallel` barrier — synthesis needs all five):
  1. **Project shape** — stack, `.tl/` tasks done/skipped, BA/SA artifact location (graph vs prose).
  2. **Fix-commit categorization** — every fix-wave commit → buckets, counts + verbatim examples.
  3. **Spec-artifact drill** — locate the governing spec, quote it verbatim, classify each case
     with the load-bearing trichotomy `SPEC_WRONG` / `SPEC_MISSING` / `SPEC_RIGHT_DEV_DRIFTED`.
  4. **Cross-UC connectivity** — "UC-X declares an entry but UC-Y has no button to reach it"
     (invisible to per-UC review).
  5. **`nacl-tl-qa` SKIPs** — missing-provider-key skips are almost always a top-3 root cause.
- **Three fixes baked in** (from the workflows experiment): (1) **repo access** — auditors read
  `.tl/`, code, and git freely; (2) **evidence, not paraphrase** — a verify stage re-reads each
  quoted span and drops a case **only** on high-confidence positive counter-evidence, else keeps it
  and flags `needs_context`; (3) **requirements traceability** — each fixed defect maps to a
  requirement that should have been specified/reachable (`whyMissed`).
- **Deterministic synthesis** — the `GAP_TO_SKILL` JS table maps each finding's GAP category to its
  owning skill(s) + gate IDs (G1–G11). No agent decides the mapping; an unmappable fix is reported
  as `unmapped` (an honest "no NaCl gate would have caught this"), not force-attributed.

### B. Prose recipe (portable fallback) — memory `skill-postmortem-algorithm`

When workflows are unavailable, run the recipe by hand: three (→ five) sequential/parallel
Explore agents (same auditor responsibilities), then synthesis, then write the same artifact.
`nacl-migrate`'s canary retrospective gate runs the 3-auditor core. The recipe is canonical;
the workflow is an opt-in alternative producer of the **same** deliverable.

## Guardrails

- **Verify quotes by reading actual files**, not agent output — agents paraphrase. The workflow's
  verify stage enforces this; in the prose recipe, re-open the file.
- **No skill edits in this deliverable.** Recommendations only; editing a skill is a separate,
  user-approved step.
- **no-private-info-in-public-repo** — the artifact lives in this framework repo only when the
  audited project is the user's own (e.g. `family-cinema`); otherwise keep it in the project repo.
  Never include developer-specific home-directory paths or dump metadata in the artifact body.

## References

- `.claude/workflows/nacl-postmortem-panel.js` — the workflow producer.
- `.claude/workflows/README.md` — workflow runtime requirements + the `args`/`scriptPath` note.
- `nacl-tl-core/references/gate-fire-catalog.md`, `project-gap-closure.md` — G1–G11 + ten GAP
  categories (mapping authority, read-only).
