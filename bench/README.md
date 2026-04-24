# NaCl skills benchmark harness

Reproducible benchmark for comparing two variants of a skill (baseline vs refactored) by token cost, wall-time, and artifact equivalence.

Designed to back the `references/`+`assets/` refactor (see `docs/skills-structure.md`).

## Layout

```
bench/
├── README.md              # this file
├── run-variant.sh         # one full run; args: variant input run_n
├── parse-stream.py        # stream-json → metrics.json
├── diff-artifacts.py      # semantic diff of two Excalidraw JSON artifacts
├── aggregate.py           # outputs/ → report.md with mean±stdev + Cohen's d
├── lint-asset-vars.sh     # grep {VAR} consistency check assets/ ↔ SKILL.md
├── inputs/                # fixed test corpus (committed for reproducibility)
│   └── README.md          # what inputs are expected
└── outputs/               # generated per run; gitignored
    └── <variant>/<input>/run-<N>/
        ├── stream.jsonl   # raw claude -p output
        ├── metrics.json   # parsed
        ├── artifact.*     # what the skill produced
        └── stderr.log
```

## Prerequisites

- `claude` CLI (Claude Code) on PATH
- `python3` ≥ 3.10 (stdlib only)
- `uuidgen` (macOS / util-linux)
- `jq` for ad-hoc inspection (optional)
- Two git branches: `bench/baseline` (pre-refactor commit) and `bench/refactor-a` (post-refactor)

## Typical run

Single run (manual):

```bash
bench/run-variant.sh baseline small 1
bench/run-variant.sh refactor-a small 1
```

Full sweep (5 runs × 2 variants × 3 inputs, interleaved to hedge against model-update drift):

```bash
for n in 1 2 3 4 5; do
  for input in small medium large; do
    bench/run-variant.sh baseline "$input" "$n"
    bench/run-variant.sh refactor-a "$input" "$n"
  done
done
```

Interleaving matters: do all `baseline small 1` then `refactor small 1`, not all-baseline-first-then-all-refactor.

Aggregate:

```bash
python3 bench/aggregate.py > bench/report.md
```

## Hypotheses tested

- **H1 (context):** total `input_tokens` drops ≥30% after refactor.
- **H2 (speed):** wall-clock drops ≥15%.
- **H3 (cost):** USD cost drops ≥25%.
- **H4 (quality):** artifact semantically equivalent (±5% element counts, ±10px coords).
- **H5 (progressive disclosure):** on simpler inputs, fewer `references/*.md` files are read.

Confirmation threshold: mean difference > 2σ AND Cohen's d > 0.8 (large effect).

## Session-id policy

Each run uses a **fresh UUID** passed via `--session-id`. We do NOT reuse sessions between runs (no warm cache across runs). `cache_read_input_tokens` is logged per-run so any prompt-cache effect is visible.

## Video-demo setup

Two tmux panes, left `baseline`, right `refactor-a`:

```bash
# left pane
git checkout bench/baseline
bench/run-variant.sh baseline medium 1

# right pane (same input, fresh session)
git checkout bench/refactor-a
bench/run-variant.sh refactor-a medium 1
```

After both finish:

```bash
python3 bench/diff-artifacts.py \
  bench/outputs/baseline/medium/run-1/artifact.excalidraw \
  bench/outputs/refactor-a/medium/run-1/artifact.excalidraw
```

## Limitations

- Model variability absorbed by N=5 per cell. For publication-grade claims consider N≥10.
- Prompt-caching server-side is logged but not controlled. Deltas should be read after subtracting `cache_read_input_tokens`.
- Semantic-diff is coarse: element counts + matched-coord deltas. Pixel-perfect diff requires a separate rendering step (out of scope for MVP).
