# Release 2.19.0 — `skill-tools`

## Theme

The modern Agent-Skills methodology (Anthropic, June 2026) draws one line: **scripts for
deterministic operations, natural language only for genuine judgment calls.** When a
procedure is deterministic, leaving it in `SKILL.md` prose means the agent *re-derives and
re-executes it by reasoning every single run* — and reasoning varies between runs and
between models. In a long autonomous loop that is accumulating variance and silent error.

NaCl already had exactly one tool built this way — `nacl-tl-verify-code/scripts/classify-status.mjs`,
a pure function whose header says it plainly: *"an agent re-deriving that order each run is a
variance + cost source."* **2.19.0 generalizes that pattern across the framework.** Five
deterministic decisions move out of prose into single-authority scripts, each
equivalence-pinned by a test, consolidated in `nacl-core/`, and wired into **every** skill
that makes that decision.

This is not a faith-based change. It ships with the measurement.

## The five extractions

| Decision (was: prose the agent re-derived) | Tool |
|---|---|
| branch slug + base-branch safety guard | `nacl-core/scripts/branch.sh` |
| execution-wave assignment (topo-sort) | `nacl-tl-plan/scripts/wave-plan.mjs` |
| validation severity rollup + exemption filters | `nacl-core/scripts/classify-findings.mjs` |
| post-merge CI watch + production health probe | `nacl-core/scripts/{wait-for-ci,health-check}.sh` |
| BA-layer id formatting (`GPR-01`, `OBJ-001`, …) | `nacl-core/scripts/nacl-ids.mjs` |

Each is a **behaviour-neutral** refactor: the tool reproduces the documented behaviour
exactly (pinned by `*.test.mjs` / `*.test.sh`). It changes *how* a verdict / format /
sequence is derived, never *what* is emitted.

## The measurement

A reproducible A/B harness (`bench/skill-tools/`) ran the same decision two ways — **OLD**
(the prose rules in the prompt, the agent computes by hand) vs **NEW** (run the tool) —
across `{Haiku 4.5, Opus 4.8} × {slug, wave-plan, classify-findings} × N=20` = **240 paced
`claude -p` calls** (paced through `itsalt-pinch`). Ground truth = the tool output, pinned by
tests authored from the spec.

- **NEW: 6/6 cells were `1 distinct · 100% correct`**, both models — and the models reliably
  *deferred* to the script (no cell re-derived instead of running it).
- **OLD degraded by logic type:** the topo-sort wave assignment was **5% (Haiku) / 20% (Opus)**
  correct by hand with 2–4 distinct layouts; the validation rollup hit **40% on Opus** at the
  `5-warning + exempt-critical` boundary; the slug varied on Haiku (3 variants, 90%).
- A counterintuitive, honest finding: on the validation rollup the **stronger** model (Opus)
  did **worse** by hand than Haiku — you cannot predict which (model × rule) pair silently
  fails. That unpredictability is exactly what the tool removes.

The claim was then re-verified on a **live `family-cinema` run**: the actual
`/nacl-sa-validate` invocation called `classify-findings.mjs`, and re-running it on the exact
recorded input reproduced the verdict byte-for-byte and matched an independent hand-derived
oracle. With the *verbatim* skill prose (no hand-holding) on a boundary case, a weaker model
flipped the gate `PASS → WARN` 1-in-6 by missing an exemption; the tool did not.

## The audit: the same bug class was framework-wide

A live `--feature` plan revealed the real failure mode: `wave-plan.mjs` only covered the
from-scratch path, so the **incremental** `--feature` path (the common one on a mature
project) bypassed the tool entirely — the agent re-derived the waves. An audit of all five
tools found the same shape repeated:

- **`nacl-tl-deploy` / `nacl-tl-deliver`** reimplemented `gh run watch` + `curl` health with
  retries **by hand** instead of calling the release tools.
- **`nacl-ba-validate`** rolled up severity by hand (the same `any CRITICAL → FAIL; 5+ WARNING
  → WARN` math).
- **`nacl-tl-hotfix` / `nacl-tl-conductor`** slugified branch names by hand.
- **a correctness divergence:** `nacl-ba-sync` formatted ids with `right('0…'+n, w)` — which
  **truncates** the high digits at n≥10^width (`GPR-00` for the 100th group) — while
  `nacl-ba-process/-entities/-roles` used the canonical `apoc.text.lpad`. Same node type, two
  formats.

2.19.0 closes all of it.

## What shipped

- **Shared tools in `nacl-core/scripts/`** (resolve on every project via the `nacl-core`
  symlink): `branch.sh`, `classify-findings.mjs`, `nacl-ids.mjs`, `wait-for-ci.sh`,
  `health-check.sh`, each with a co-located `*.test.{mjs,sh}`. Single-consumer tools stay
  put (`wave-plan.mjs` in `nacl-tl-plan`, `classify-status.mjs` in `nacl-tl-verify-code`).
- **`wave-plan.mjs` gained an `assign` mode** — an explicit task DAG + `waveStart` →
  `wave = waveStart + topological-level` (with an implied same-`uc` BE→FE safety edge) — so
  the incremental `--feature` path routes through the tool and lands feature tasks on global
  waves. Verified on the real FR-041 14-task DAG: reproduced the by-hand BE waves and packed
  FE one wave tighter, dependency invariant intact.
- **`classify-findings.mjs` became layer-aware** (`layer: "sa" | "ba"`, default `sa`). BA's
  `L4.1/L5.1/L6.1` are different checks with no exemptions; `layer:"ba"` ensures SA's
  exemption rules never fire on them.
- **`nacl-ids.mjs` switched to canonical left-pad** (`padStart` == `apoc.text.lpad`), ending
  the truncation divergence. The three BA-modelling skills were already canonical;
  `nacl-core/SKILL.md` now documents the single format authority.
- **`.mjs` symlink fix** — the CLI main-check now compares realpaths, so tools run when
  invoked through the `~/.claude/skills` symlink (they previously printed nothing on real
  projects). A `symlink-cli.test.mjs` guards it for all four `.mjs` tools.
- **Consumers wired:** `nacl-tl-ship`, `nacl-tl-plan`, `nacl-sa-validate`, `nacl-ba-validate`,
  `nacl-ba-sync`, `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`,
  `nacl-tl-conductor`, `nacl-core`.
- **CI:** `.github/workflows/test-tools.yml` runs the Node + bash tool tests (and retro-covers
  the orphaned `classify-status.test.mjs`, which no CI ran before).
- **Benchmark + playbook:** `bench/skill-tools/` ships the A/B harness, the Tier-A findings,
  the real-data verification, and `VERIFICATION-PLAYBOOK.md` — a self-serve protocol for
  proving, on *your* project, that an extracted tool is both correct (vs an independent
  oracle) and strictly better than the prose it replaced.
- **Codex parity:** sync-exemptions added/refreshed for every changed root skill.

## Verification

- **84 tool tests green** — 58 `node --test` (wave-plan, classify-findings, nacl-ids,
  classify-status, symlink-cli) + 26 bash assertions (branch, wait-for-ci, health-check) —
  run locally and now in CI via `test-tools.yml`.
- **H1 determinism:** every pure tool byte-identical across N=20 runs.
- Every `lint-skills.yml` gate replicated locally: frontmatter, hardcoded-paths, credential
  patterns, `check-branch-literals.sh`, `check-version-pins.sh`, and the **root/Codex sync
  gate VERIFIED**.
- Privacy canary on the full diff: clean (no client names, local paths, or operational
  metadata; `family-cinema` is the owner's own public demo).

## Validation status (honest)

- The A/B and the live `family-cinema` `sa-validate` verification are real and reproducible.
  A live end-to-end **Tier B** (running the full skill old-vs-new on a project graph) was
  *not* run — Claude Code's keychain auth does not survive `CLAUDE_CONFIG_DIR` relocation, so
  the skill-version isolation it needed is infeasible; headless MCP against a safe graph clone
  was proven working for when that path is built.
- **`nacl-ids` is deliberately the lightest extraction.** Id formatting from a DB `max()+1`
  is naturally and efficiently done *in Cypher* (`apoc.text.lpad`), which the three
  BA-modelling skills already did correctly. The divergence (only `nacl-ba-sync`) is fixed and
  the single format authority documented; those three were **not** rewired to per-id JS calls
  (that would add round-trips for no correctness gain). This is the one place "wire every
  consumer to the JS tool" was traded for "make every consumer canonical", on purpose.

## Files

`nacl-core/scripts/{branch.sh,branch.test.sh,classify-findings.mjs,classify-findings.test.mjs,nacl-ids.mjs,nacl-ids.test.mjs,wait-for-ci.sh,wait-for-ci.test.sh,health-check.sh,health-check.test.sh}` (new/moved),
`nacl-tl-plan/scripts/{wave-plan.mjs,wave-plan.test.mjs}`,
`nacl-tl-verify-code/scripts/{classify-status.mjs,symlink-cli.test.mjs}`,
`nacl-core/SKILL.md`, `nacl-tl-ship/SKILL.md`, `nacl-tl-plan/SKILL.md`, `nacl-sa-validate/SKILL.md`,
`nacl-ba-validate/SKILL.md`, `nacl-ba-sync/SKILL.md`, `nacl-tl-release/SKILL.md`,
`nacl-tl-deploy/SKILL.md`, `nacl-tl-deliver/SKILL.md`, `nacl-tl-hotfix/SKILL.md`,
`nacl-tl-conductor/SKILL.md`,
`.github/workflows/test-tools.yml`,
`bench/skill-tools/**`,
`skills-for-codex/sync-exemptions/{nacl-tl-ship,nacl-tl-plan,nacl-sa-validate,nacl-ba-sync,nacl-ba-validate,nacl-tl-conductor,nacl-tl-deploy,nacl-tl-deliver,nacl-tl-release}.md`,
`CHANGELOG.md`, `docs/releases/2.19.0-skill-tools/`.
