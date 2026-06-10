# Skill-tools benchmark

Reproducible, article-publishable measurement of the **skill-tools pilot** — the five
deterministic tools extracted from `nacl-*` skill prose (ship branch helpers, plan
wave-planner, sa-validate findings classifier, release CI/health helpers, ba-sync id
formatter).

## Hypotheses

- **H1 — determinism.** Each pure tool produces **byte-identical** output across `N=20`
  runs over its fixture matrix. This is the core claim: extracting the procedure into a
  script removes the run-to-run *derivation variance* an agent has when it re-derives a
  multi-step procedure from prose. Pass = 1 distinct output across 20 runs.
- **H2 — carried-procedure size.** The tool's typical *output* (what now enters the
  agent's context) is small relative to the inline procedural block removed from
  `SKILL.md` (the bash/Cypher/prose the agent previously had to internalise and execute
  every invocation). Measured as chars and a `chars/4` token estimate from `git diff`.

> Honest caveat baked into the result: the *static* `SKILL.md` byte-delta is modest (some
> files grew, because each extraction adds a short "why + invocation" note). The
> compounding win is at **runtime** — across a long autonomous loop (`/nacl-goal`,
> `conduct`, `tl-full`) the agent emits a fixed small token per invocation instead of
> re-deriving the procedure each time, and the verdict can no longer vary by run. H1 is
> the measurement that matters; H2 quantifies the procedure that no longer has to be
> carried.

## Run it

```bash
# from the repo root, with the pilot branch checked out
node bench/skill-tools/bench.mjs            # compares SKILL.md against `main`
node bench/skill-tools/bench.mjs HEAD~1     # or any other git base ref
```

Outputs a table to stdout and writes `results/summary.md` + `results/summary.json`.
Exit code is non-zero if H1 fails for any tool (so it doubles as a CI determinism check).

## Dual-terminal demo (for the article / stream)

- **Left terminal — the OLD path (prose):** ask an agent to perform one procedure from a
  pre-extraction `SKILL.md` (e.g. "assign waves for these UCs" or "classify these
  findings") several times; observe the wording/structure of the answer drift between
  runs, and the reasoning tokens spent re-deriving the rule.
- **Right terminal — the NEW path (tool):** run the corresponding tool from the matrix
  `N` times; observe byte-identical output and a fixed tiny token cost.

```bash
# right terminal, determinism of one tool, 20×:
for i in $(seq 20); do node nacl-tl-plan/scripts/wave-plan.mjs \
  '{"tech":["TECH-001"],"ucs":[{"id":"UC001","depends_on":[]},{"id":"UC002","depends_on":["UC001"]}]}' \
  | shasum; done | sort -u   # → exactly one hash
```

## What the tools' own tests cover (separate from this benchmark)

Equivalence to the documented behavior is pinned per tool (run in CI via
`.github/workflows/test-tools.yml`):

```bash
node --test nacl-tl-plan/scripts/wave-plan.test.mjs \
            nacl-core/scripts/classify-findings.test.mjs \
            nacl-core/scripts/nacl-ids.test.mjs \
            nacl-tl-verify-code/scripts/classify-status.test.mjs
bash nacl-core/scripts/branch.test.sh
bash nacl-core/scripts/wait-for-ci.test.sh
bash nacl-core/scripts/health-check.test.sh
```
