# Release 2.13.0 — `calibrated-question-gates`

## Theme

A skill gate exists to catch the decisions a machine shouldn't make alone. But a gate
that fires on everything — and speaks in its own internal vocabulary — trains the
operator to rubber-stamp and buries the decisions that actually matter. This release
recalibrates the question-gates in `nacl-tl-intake` and `nacl-tl-fix` along one
principle: **decide what is decidable, and ask the user only what is genuinely a human
call — in plain, observable language.**

## Background

A crash bug surfaced the gap. An audio-trimming pipeline step died on an out-of-range
trim window (a negative duration handed to the encoder). The fix had two parts: a
defensive clamp that stops the crash under *every* interpretation of the data, and a
deeper, genuinely-open question about what the timing fields *mean* (positions within
each clip, or positions on a global output timeline).

Intake classified it correctly — and then blocked. It fired a mandatory, non-bypassable
spec-gap gate and asked the operator a bug-vs-feature question phrased as
`L1 vs L2 vs FEATURE` and "re-anchor to a global timeline" — terms the operator could
not be expected to parse. Worse, a second question re-asked a handling decision the
request had *already stated verbatim*. The unconditionally-correct crash fix — which
needed no decision at all — was held hostage behind a jargon prompt.

Three defects, one root cause: the gate was **atom-level** (it couldn't separate the safe
part from the ambiguous part), it had **no memory of what the request already said**, and
it **leaked internal tokens** to the user.

## What's New — honor the input (intake Step 2b-pre)

Before any per-atom gate fires, intake scans the atom's own source text for an explicit
decision answering the gate's question — a named level, a sub-mode instruction ("guard
regardless", "reproduce on the real path first", "downgrade if not reproducible"), or an
explicit bug-vs-feature call. If it's there, the resolution is recorded with
`USER_OVERRIDE` provenance and the prompt is skipped. Ambiguity falls through to the
prompt — the skill never guesses an answer the user didn't give.

## What's New — aspect split (intake Step 2b-split)

A spec-gap atom is split in two:

- the **unconditionally-correct defensive part** — a guard / clamp / graceful-degrade
  that is correct under every interpretation *and* touches no external contract. Litmus:
  it changes observable behaviour in no case where current behaviour is already correct (a
  negative-duration clamp only fires on the already-broken path);
- the **ambiguous residual** — the genuinely-unspecified semantic.

The defensive part ships at `L1` with no prompt. The residual routes `L2-with-flag` (or
becomes a tracked note) — **never silent `L1`**: a spec gap *is* doc-staleness, and an
`L1` "no-drift" attestation would let `nacl-tl-fix` ship code against a stale spec. Its
spec-first gate checks commit *ordering*, not *staleness*, so the safe routing has to be
enforced here. (This preserves the W10 "no code ships against a stale spec" invariant.)

## What's New — proceed-and-flag, block only when costly

The mandatory spec-gap prompt becomes a proceed-and-flag default. The skill continues on
the working assumption and asks for a human decision — in plain language — only when
getting the residual wrong is genuinely costly: the residual carries a
`hard_refuse_trigger` (external/breaking API contract, schema migration, auth, billing,
destructive data). Documenting consumer-side input tolerance (a clamp table, a
field-interpretation note) is reversible internal spec work and no longer blocks. This
brings the interactive path in line with what autonomous `/nacl-goal` mode already does.

## What's New — a durable sink for deferred findings

Demoting a block to a note is only safe if the note can't be lost. "Defer" is therefore
*defined* as emitting a tracked follow-up: a `residual_note` recorded on the atom and
persisted as a tracker `[open-question]` subtask (or a `.tl/open-questions.md` entry when
no tracker is configured) that **gates the parent work-item's closure**. A demotion with
no recorded `followup_task` is invalid and falls back to the prompt. The deferred question
re-surfaces at the staging-verify step and in the status rollups, and the parent card
cannot be marked done until it resolves.

This is *stricter* than the gate it replaces: a blocking prompt can be clicked away with
the check never actually happening; a closure-gating follow-up is tracked until it is
genuinely resolved.

## What's New — plain-language prompts

Every string printed to the user must now use observable, behavioural language. Internal
tokens — `L0`–`L3`, `spec_gap`, `POLICY_CALL`, "re-anchor", `gate_payload` — are scrubbed
from all prompt templates, the classification-evidence block, and the triage box, and kept
only where machines read them (the `--emit-state` JSON, the decision tree, the case table,
the headline-selection rules). "This also needs the spec updated first" replaces `L2`;
"the spec doesn't currently say how X should behave" replaces `spec_gap`; "a judgment call:
was X always expected, or is it genuinely new?" replaces `POLICY_CALL`.

## What's New — the same calibration in `nacl-tl-fix`

The fix skill's post-diagnosis **L2 USER GATE** got the identical treatment. The
unconditionally-correct defensive part ships without sign-off. When the diagnostician's
interpretation is confident, reversible, and verifiable later, the gate proceeds-and-flags
— it states the working assumption in plain language, writes it into the spec as an
explicit `> [!WARNING] working assumption — pending verification` callout, emits a
follow-up task, and continues — instead of blocking on a diff approval. Explicit sign-off
is reserved for the cases that genuinely warrant it: an interpretation the agent is not
confident in (it needs the operator's domain knowledge), or a change that is
external-contract-breaking or otherwise irreversible. Spec-first commit ordering is
untouched.

## Schema

`intake.json` atoms gain an additive, nullable `residual_note`
(`summary`, `working_assumption`, `verify_by`, `followup_task`, `route`). Existing
consumers ignore the unknown-null field, so nothing downstream needed a change.

## Codex parity

`skills-for-codex/nacl-tl-intake` and `skills-for-codex/nacl-tl-fix` mirror the calibrated
gate behaviour (honor-the-input, aspect split, proceed-and-flag with a durable follow-up,
plain-language prompts), changed in the same commit per the root↔Codex sync gate
(`skills-for-codex/scripts/check-root-codex-sync.sh`).

## What did NOT change

- **Spec-first discipline (W10).** No code ships against a stale spec. The residual is
  routed `L2-with-flag` (or deferred with a tracked follow-up) precisely so the gate can't
  be relaxed into shipping against an undocumented semantic.
- **The `--emit-state` contract.** `residual_note` is additive and nullable; all existing
  fields and the six-status / headline vocabulary are unchanged.
- **Genuine escalation.** A framework/global-skill defect still triggers surface-and-wait;
  a genuinely irreversible or external-contract decision still stops for explicit,
  plain-language sign-off. The change is *which* questions are asked and *how* they are
  phrased — not whether the agent escalates.

## Files

- `nacl-tl-intake/SKILL.md` — Step 2b-pre (honor the input), Step 2b-split (aspect split),
  recalibrated spec-gap gate, `residual_note` schema, durable-sink follow-up (Step 6),
  plain-language templates (A / A-note / B–E) and classification-evidence block, and the
  user-facing vocabulary rule.
- `nacl-tl-fix/SKILL.md` — calibrated L2 USER GATE (decouple the guard, proceed-and-flag,
  plain language, W10 ordering preserved).
- `skills-for-codex/nacl-tl-intake/SKILL.md`, `skills-for-codex/nacl-tl-fix/SKILL.md` —
  mirrored gate behaviour.

No breaking changes — additive schema, retained machine-facing tokens, preserved
spec-first invariant; the gates become more autonomous and their prompts plain-language.
