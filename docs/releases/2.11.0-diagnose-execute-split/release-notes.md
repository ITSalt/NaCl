# Release 2.11.0 — `diagnose-execute-split`

## Theme

Route the bug-fix skill's two halves to the model tier each deserves. `/nacl-tl-fix`
was a monolith running entirely on Sonnet because it ends in code generation and was
routed wholesale to the `developer` agent. But its first five steps are not code
generation — they are graph impact traversal, gap-check, L0/L1/L2/L3 classification,
correct-behavior definition, and spec authoring: the deep-reasoning work the framework
defines as strategist-tier. Running that on Sonnet under-powered the single most
important guardrail in the skill, the L3-feature classification. This release splits
the skill into a two-phase orchestrator: an Opus diagnostic phase and a Sonnet
execution phase.

## Background

`docs/agents.md` justifies the `developer` tier as "code generation **from complete
specifications** is a translation task." That premise holds for `nacl-tl-dev-be/fe`,
which receive a finished task from `nacl-tl-plan` (itself Opus). But `nacl-tl-fix`
never receives a complete spec — it *builds* one as it goes. So the same skill that
the framework defines as Sonnet-tier was doing the Opus-tier work of triage and
classification inline, on the weaker model. Design Principle 4 in `docs/agents.md`
anticipates exactly this: "assignments will go stale… those assumptions need to be
frequently questioned."

A second, older defect surfaced while reworking the skill: the spec-first gate (6.SF)
required a spec-update *commit* for "L1 or higher", but a pure L1 fix changes no docs
(they are already current), so it could never produce one. Every honest L1 was
structurally forced to either BLOCK or file a signed exception — turning a rare escape
hatch into a mandatory step for the most common fix class.

## What's New — the diagnose/execute split

- **New agent `diagnostician`** (`.claude/agents/diagnostician.md`) — Opus, high
  effort, tools `Read, Write, Edit, Grep, Glob, Bash`. It runs `/nacl-tl-fix`
  **Phase A (Steps 1–5)** as a sub-agent and returns a structured **fix-plan**
  artifact. It authors specs, docs, and graph nodes — but **never production code and
  never commits**. This grows the framework from six agents to seven.

- **`/nacl-tl-fix` is now a two-phase orchestrator:**
  - **Phase A — DIAGNOSE & SPEC (Steps 1–5)** delegated to `diagnostician` (Opus).
  - **USER GATE (L2/L3)** presented by the orchestrator between phases — a sub-agent
    cannot talk to the user; in autonomous `/nacl-goal` mode it auto-resolves as before.
  - **Phase B — EXECUTE (Steps 6–8)** runs inline on Sonnet: the honest-execution core
    (baseline → RED-first regression test → apply → six-status → impact survey →
    report). This is the same core that `nacl-tl-dev-be/fe --continue`,
    `nacl-tl-reopened`, and `nacl-tl-hotfix` already delegate into — they are thin
    wrappers over Phase B, not peers.

  The seam falls **after Step 5** so Phase B receives a *complete* spec, restoring the
  developer-tier premise. A skill executes in one model context, so delegating a phase
  to a sub-agent is the only way to change tier mid-skill — this mirrors the existing
  Step 6d test-author seam (`nacl-tl-regression-test`).

- **Spec-first ordering is now satisfied by construction.** The diagnostician leaves
  spec/doc changes uncommitted; the orchestrator commits them first (Phase B entry,
  before the 6.SF check), then the code fix.

- **`## Contract` section added to `nacl-tl-fix`** listing its output contract
  (six-status vocabulary, header strings, the `Status:` line, the regression-test seam)
  and its downstream consumers (`nacl-tl-dev-be/fe`, `nacl-tl-reopened`,
  `nacl-tl-hotfix`). The restructure changes the *internal* flow only — Steps 7–8 are
  unchanged, so no consumer needs updating.

## What's Fixed — the L1 spec-first gate

L1 now satisfies 6.SF with a **gap-check attestation** instead of a spec-update commit:
the diagnostician's Step 3 "docs current, no drift" verdict, recorded to
`.tl/status.json` (`phases.spec: gapcheck-no-drift`) and `.tl/changelog.md`, timestamped
before code. The gate reads it through the existing `spec-update-by-status-json`
channel, so the L1 verdict composes to PASS without a doc-change commit.

Anti-gaming is preserved: an L1 fix that reaches Step 6 with **no** attestation FAILs —
that means Phase A's gap-check never ran, the exact "jumped straight to code" case the
gate exists to catch — and the attestation is auditable post-hoc. The W10 binding logic
for L2/L3 is unchanged.

## Design principle refined

`docs/agents.md` Principle 1 ("thinkers don't write") is sharpened to "thinkers don't
write _code_." An Opus agent may write **specifications** (docs, `.tl/*` artifacts,
graph nodes) and still respect the firewall, as long as it writes no production code
and does not commit. The firewall that matters is **spec author ≠ code author** — the
diagnostician authors the spec, the Sonnet core writes and commits the code. (The
`analyst` agent is the same shape at Sonnet tier.)

## What did NOT change

- The output contract — so `nacl-tl-dev-be/fe --continue`, `nacl-tl-reopened`, and
  `nacl-tl-hotfix` keep delegating into the Phase B core unchanged.
- The six-status machine, the spec-first W10 gate logic for L2/L3, the 6M migration
  sub-flow, and the 7.5 impact survey.
- The **Codex variant** (`skills-for-codex/nacl-tl-fix`) is intentionally left
  monolithic on its current model: the Codex runtime has no sub-agent delegation, so
  the model seam cannot be expressed there. It is documented as the fallback path in
  the skill body.

## Housekeeping

The pre-release canary grep caught a leftover client-name fragment appended to the
sanitized `Project-Alpha` placeholder in post-mortem examples (skill bodies, two
fixture READMEs, an exception-id example, and one stale fixture path). All occurrences
are sanitized back to the neutral `Project-Alpha` placeholder; one fixture path is
corrected to the directory that actually exists. No behavior change.

## Files

- `.claude/agents/diagnostician.md` (new)
- `nacl-tl-fix/SKILL.md` (Two-Phase Architecture + Contract sections, phase markers,
  USER GATE relocation, L1 gap-check attestation, spec-first ordering by level,
  `--dry-run` + goal-context phase notes)
- `docs/agents.md`, `docs/agents.ru.md` (seventh agent, developer note, Principle 1
  refinement, distribution-diagram footnote)
- `README.md`, `README.ru.md` (seventh-agent note, repo-structure agent count)

No breaking changes — the split and the L1 fix are additive; the output contract and
default behavior are preserved.
