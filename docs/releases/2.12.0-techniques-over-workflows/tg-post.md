NaCl 2.12.0 — techniques-over-workflows

We ran Claude Code dynamic workflows against our own framework and got a blunt verdict: a critic-panel workflow costs ~15× the tokens of a single strong agent *with repo access* — for the same result. "Single agent wins" really meant "repo access wins." The cheap, large wins were techniques, not workflows — and only one use-case justified a workflow at all. This release harvests both halves.

What ships:

— Skill hardening (validated head-to-head on a real project). The headline win: code review and verify-code now MUST trace cross-file — read the callees/runtime that produce the data and the consumers of what changed, not just the diff. On family-cinema UC033-BE a diff-only review missed a real BLOCKER (the "video"/"music" services both called an image-only client — dead config) and false-passed a requirement; the repo-tracing review caught it.

— Requirements traceability: review/verify-code/qa now check each acceptance criterion (implemented? reachable? tested?) — closing the "missing requirement" defect class where nothing in the diff is wrong, something required is simply absent.

— A deterministic status classifier for verify-code (a pure decision table + a 17/17 contract-pin test) replacing prose precedence the agent re-derived each run. Same status vocabulary — only the derivation moved to tested code.

— Keep-if-uncertain + a single-agent self-adversarial pass: refute your own high-severity findings by re-reading the code; drop only on positive evidence. nacl-tl-fix now re-reads the root cause — a GREEN test proves the symptom gone, not that a fix didn't narrow only one of several carriers.

— New: /nacl-postmortem — the one workflow worth its cost. Five parallel auditors → evidence verify → a deterministic GAP→owning-skill synthesis, for a once-per-project "which skill gate let this bug through" audit. Validated on a labeled fixture and head-to-head on family-cinema: 36 QA-skips + 4 cross-UC findings the single agent didn't fully surface, at ~7.7× cost (model tiering cut the experiment's 15× nearly in half). Opt-in (CC ≥ 2.1.154); the prose recipe stays the cheap default.

No breaking changes — every skill edit is additive and preserves the output contract; the new workflow and skill are opt-in. Codex mirrors updated in parity.

Release notes: docs/releases/2.12.0-techniques-over-workflows/release-notes.md
