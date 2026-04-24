#!/usr/bin/env python3
"""Aggregate bench/outputs/**/metrics.json into a Markdown report.

For each (variant, input) cell we compute mean ± stdev. For the comparison
between baseline and each refactored variant we add:
  - Welch's t (approximate, without p-value — no scipy)
  - Cohen's d (effect size): (mean_a - mean_b) / pooled_stdev
  - verdict: PASS / FAIL per hypothesis H1–H5

Outputs Markdown on stdout. Safe to redirect to bench/report.md.
"""

from __future__ import annotations

import json
import math
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUTPUTS = HERE / "outputs"

METRICS = [
    "input_tokens_total",
    "output_tokens_total",
    "cache_read_tokens",
    "wall_ms",
    "cost_usd",
    "tool_calls_count",
    "files_read_count",
]

HYPOTHESES = {
    "H1 context": ("input_tokens_total", 0.30, "lower_better"),
    "H2 speed": ("wall_ms", 0.15, "lower_better"),
    "H3 cost": ("cost_usd", 0.25, "lower_better"),
}


def load_all() -> list[dict]:
    rows = []
    for p in OUTPUTS.rglob("metrics.json"):
        try:
            rows.append(json.loads(p.read_text()))
        except json.JSONDecodeError:
            continue
    return rows


def cell_stats(values: list[float]) -> dict:
    if not values:
        return {"n": 0, "mean": 0.0, "stdev": 0.0}
    return {
        "n": len(values),
        "mean": statistics.fmean(values),
        "stdev": statistics.stdev(values) if len(values) > 1 else 0.0,
    }


def cohen_d(a: list[float], b: list[float]) -> float:
    """Pooled-sd effect size. Positive = a > b."""
    if len(a) < 2 or len(b) < 2:
        return 0.0
    va = statistics.variance(a)
    vb = statistics.variance(b)
    pooled = math.sqrt(((len(a) - 1) * va + (len(b) - 1) * vb) / (len(a) + len(b) - 2))
    if pooled == 0:
        return 0.0
    return (statistics.fmean(a) - statistics.fmean(b)) / pooled


def welch_t(a: list[float], b: list[float]) -> float:
    if len(a) < 2 or len(b) < 2:
        return 0.0
    va = statistics.variance(a)
    vb = statistics.variance(b)
    se = math.sqrt(va / len(a) + vb / len(b))
    if se == 0:
        return 0.0
    return (statistics.fmean(a) - statistics.fmean(b)) / se


def pct(x: float) -> str:
    return f"{x * 100:+.1f}%"


def main() -> int:
    rows = load_all()
    if not rows:
        print("# Bench report\n\n_No runs found under `bench/outputs/`._")
        return 0

    # group by (variant, input, metric) -> list
    cells: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for r in rows:
        for m in METRICS:
            if m in r and isinstance(r[m], (int, float)):
                cells[(r["variant"], r["input"], m)].append(float(r[m]))

    variants = sorted({r["variant"] for r in rows})
    inputs = sorted({r["input"] for r in rows})

    print("# Bench report")
    commits = sorted({r.get("commit", "?") for r in rows})
    models = sorted({r.get("model", "?") for r in rows})
    print(f"\nRuns: **{len(rows)}** · variants: {', '.join(variants)} · inputs: {', '.join(inputs)} · models: {', '.join(models)} · commits: {', '.join(commits)}\n")

    if "baseline" not in variants:
        print("_No `baseline` variant found — per-metric deltas cannot be computed._\n")

    # Per-metric table
    for m in METRICS:
        print(f"## {m}\n")
        header = "| input | " + " | ".join(variants) + " | Δ vs baseline | Cohen's d |"
        sep = "|" + "|".join(["---"] * (len(variants) + 3)) + "|"
        print(header)
        print(sep)
        for inp in inputs:
            row = [inp]
            base_vals = cells.get(("baseline", inp, m), [])
            base = cell_stats(base_vals)
            for v in variants:
                vals = cells.get((v, inp, m), [])
                s = cell_stats(vals)
                row.append(f"{s['mean']:.2f} ± {s['stdev']:.2f} (n={s['n']})")
            non_base = [v for v in variants if v != "baseline"]
            if non_base and base["n"] > 0:
                vv = non_base[0]
                vvals = cells.get((vv, inp, m), [])
                if vvals and base_vals:
                    delta = (statistics.fmean(vvals) - base["mean"]) / base["mean"] if base["mean"] else 0.0
                    row.append(pct(delta))
                    row.append(f"{cohen_d(base_vals, vvals):.2f}")
                else:
                    row.append("—")
                    row.append("—")
            else:
                row.append("—")
                row.append("—")
            print("| " + " | ".join(row) + " |")
        print()

    # Hypothesis verdicts (only if we have baseline + exactly one variant)
    non_base = [v for v in variants if v != "baseline"]
    if "baseline" in variants and len(non_base) == 1:
        variant = non_base[0]
        print(f"## Hypothesis verdicts — `{variant}` vs `baseline`\n")
        print("| # | metric | target drop | observed | Cohen's d | verdict |")
        print("|---|---|---|---|---|---|")
        for name, (metric, target, direction) in HYPOTHESES.items():
            # Pool across inputs: simple mean of per-input deltas.
            deltas = []
            ds = []
            for inp in inputs:
                bv = cells.get(("baseline", inp, metric), [])
                vv = cells.get((variant, inp, metric), [])
                if not bv or not vv:
                    continue
                mean_b = statistics.fmean(bv)
                mean_v = statistics.fmean(vv)
                if mean_b:
                    deltas.append((mean_b - mean_v) / mean_b)
                ds.append(cohen_d(bv, vv))
            if not deltas:
                verdict = "N/A"
                obs = "—"
                d_str = "—"
            else:
                observed_drop = statistics.fmean(deltas)
                mean_d = statistics.fmean(ds)
                passed = observed_drop >= target and abs(mean_d) > 0.8
                verdict = "PASS" if passed else "FAIL"
                obs = pct(observed_drop)
                d_str = f"{mean_d:.2f}"
            print(f"| {name} | `{metric}` | ≥ {target * 100:.0f}% | {obs} | {d_str} | **{verdict}** |")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
