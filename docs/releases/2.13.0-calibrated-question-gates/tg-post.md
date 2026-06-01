NaCl 2.13.0 — calibrated-question-gates

A skill gate should catch the decisions a machine shouldn't make alone — but a gate that fires on everything, in its own internal vocabulary, trains the operator to rubber-stamp and buries the decisions that matter. This release recalibrates the question-gates in `nacl-tl-intake` and `nacl-tl-fix` around one rule: decide what's decidable, and ask the user only what's genuinely a human call — in plain language.

The trigger: a crash bug (an audio-trimming step dying on an out-of-range window) had a defensive clamp that fixes the crash under every interpretation, plus a genuinely-open question about what the timing fields mean. Intake classified it right, then blocked — a mandatory spec-gap gate asked a bug-vs-feature question phrased as `L1 vs L2 vs FEATURE` / "re-anchor to a global timeline", and a second question re-asked a decision the request had already stated. The safe crash fix was held hostage behind jargon.

What ships:

— Honor the input: before any gate fires, intake checks whether the request text already answered the question (a named level, a handling instruction, a bug/feature call) and skips the prompt if so. Ambiguity → still prompts; never guesses.

— Aspect split: the unconditionally-correct defensive part (guard/clamp, touching no external contract) ships at L1 with no prompt; the genuine residual routes L2-with-flag — never silent L1, so code can't ship against a stale spec (W10 preserved).

— Proceed-and-flag: the mandatory spec-gap prompt becomes default-proceed; a human decision is asked (in plain words) only when the residual is costly to get wrong — external/breaking API, schema, auth, billing, destructive data.

— Durable sink: "defer" means a tracked follow-up (an `[open-question]` subtask / `.tl/open-questions.md`) that gates the parent's closure — never a console note that scrolls away. A demotion with no follow-up falls back to the prompt. Stricter than the old gate, which could be rubber-stamped.

— Plain language: `L0`–`L3`, `spec_gap`, `POLICY_CALL`, "re-anchor", `gate_payload` are scrubbed from every user-facing prompt and kept only where machines read them.

— Same calibration in `nacl-tl-fix`'s L2 USER GATE, and mirrored into both Codex variants per the sync gate.

No breaking changes — additive `residual_note` schema, retained machine-facing tokens, preserved spec-first ordering. The gates get more autonomous; their prompts get readable.

Release notes: docs/releases/2.13.0-calibrated-question-gates/release-notes.md
