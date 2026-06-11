NaCl 2.19.0 — skill-tools

The June 2026 Agent-Skills methodology draws one line: scripts for deterministic operations, natural language only for genuine judgment. The mechanism matters: when a deterministic procedure lives in `SKILL.md` prose, the agent doesn't recall it — it **re-derives and re-executes it by reasoning every run**, and reasoning isn't reproducible between runs or models. Across a long autonomous loop that's a steady drip of variance and silent error. NaCl already had exactly one tool built this way (`classify-status.mjs`); 2.19.0 generalizes the pattern — and ships with the measurement.

What's inside:

— **Five extractions.** branch slug + base-branch guard, wave assignment, the validation severity rollup, CI-watch + health-probe, BA id formatting — now single-authority scripts, test-pinned, consolidated in `nacl-core/`, and wired into **every** skill that makes the decision. Each is a behaviour-neutral refactor.

— **Measured, not asserted.** An A/B harness ran the same decision two ways — OLD (prose rules, model computes by hand) vs NEW (run the tool) — `{Haiku 4.5, Opus 4.8} × 3 decisions × N=20` = **240 `claude -p` calls** (paced via `itsalt-pinch`). NEW: 6/6 cells `1 distinct · 100%`, and the models actually deferred. OLD degrades by logic type: by-hand wave assignment **5% (Haiku) / 20% (Opus)**; the validation rollup **40% on Opus** at a boundary. Counterintuitive: the stronger model was *worse* by hand — you can't predict which (model × rule) pair silently fails. That's what the tool removes. ($16; run it: `node bench/skill-tools/ab/ab.mjs`.)

— **Re-verified live.** On a real `/nacl-sa-validate` run against `family-cinema` the tool actually executed (visible in the transcript); re-running it on the exact input reproduced the verdict byte-for-byte and matched a hand-derived oracle. With the verbatim skill prose on a boundary case, a weaker model flipped the gate `PASS→WARN` 1-in-6; the tool didn't.

— **The same bug was framework-wide.** A live `--feature` plan revealed `wave-plan.mjs` was bypassed on the incremental path (grep of 127 transcripts: never executed). The audit found the shape repeated: deploy/deliver reimplemented `gh run watch` + health `curl` by hand; ba-validate the rollup; hotfix/conductor the slug; and `ba-sync` formatted ids with a truncating `right()` (`GPR-00` at the 100th group) vs the modelling skills' canonical `apoc.text.lpad`. All consolidated into `nacl-core`, wired, divergence closed on the canon.

— **Take it to your project.** `VERIFICATION-PLAYBOOK.md` — a protocol for proving, on your own project, that an extracted tool is accurate *and* better than prose (independent oracle, edge cases, the V1∧V2∧V3 verdict, downstream checks).

84 tool tests green, CI gates clean, root/Codex sync VERIFIED, privacy canary clean. Honest: `nacl-ids` is the lightest extraction (id formatting is more natural in Cypher) and the modelling skills weren't rewired; no live end-to-end Tier B (auth doesn't survive `CLAUDE_CONFIG_DIR`).

Release notes: docs/releases/2.19.0-skill-tools/release-notes.md
