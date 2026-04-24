#!/usr/bin/env python3
"""Semantic diff between two Excalidraw JSON artifacts.

Compares:
  - counts of each element kind (rectangle, diamond, arrow, text, …)
  - counts grouped by customData.kind if present (swimlane, step, decision, document)
  - per-matched element: centroid delta

An element is matched across files by (text, customData.kind, customData.id)
with fallbacks. Unmatched elements are reported as added/removed.

Usage: diff-artifacts.py BASELINE VARIANT
Exit code 0 regardless of diff; the tool reports. CI gate belongs in aggregate.py.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def load_elements(p: Path) -> list[dict]:
    doc = json.loads(p.read_text())
    els = doc.get("elements") or []
    return [e for e in els if isinstance(e, dict)]


def kind_of(el: dict) -> str:
    cd = el.get("customData") or {}
    return cd.get("kind") or el.get("type") or "unknown"


def key_of(el: dict) -> tuple:
    cd = el.get("customData") or {}
    return (
        cd.get("id"),
        cd.get("kind"),
        (el.get("text") or "").strip().lower() or None,
        el.get("type"),
    )


def centroid(el: dict) -> tuple[float, float]:
    x = el.get("x") or 0
    y = el.get("y") or 0
    w = el.get("width") or 0
    h = el.get("height") or 0
    return (x + w / 2, y + h / 2)


def summarise(els: list[dict]) -> dict:
    by_kind = Counter(kind_of(e) for e in els)
    by_type = Counter(e.get("type", "?") for e in els)
    return {"total": len(els), "by_kind": dict(by_kind), "by_type": dict(by_type)}


def rel_delta(a: int, b: int) -> float:
    if a == 0 and b == 0:
        return 0.0
    denom = max(a, b) or 1
    return abs(a - b) / denom


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: diff-artifacts.py BASELINE VARIANT", file=sys.stderr)
        return 2

    a = Path(sys.argv[1])
    b = Path(sys.argv[2])

    if not a.exists() or not b.exists():
        print(json.dumps({"error": "missing artifact", "baseline": str(a), "variant": str(b)}))
        return 1

    els_a = load_elements(a)
    els_b = load_elements(b)

    sa = summarise(els_a)
    sb = summarise(els_b)

    kinds = sorted(set(sa["by_kind"]) | set(sb["by_kind"]))
    kind_deltas = {
        k: {
            "baseline": sa["by_kind"].get(k, 0),
            "variant": sb["by_kind"].get(k, 0),
            "rel_delta": round(rel_delta(sa["by_kind"].get(k, 0), sb["by_kind"].get(k, 0)), 4),
        }
        for k in kinds
    }

    idx_a = {key_of(e): e for e in els_a}
    idx_b = {key_of(e): e for e in els_b}

    matched = sorted(set(idx_a) & set(idx_b), key=lambda k: (k[1] or "", k[2] or "", str(k[0])))
    only_a = sorted(set(idx_a) - set(idx_b), key=lambda k: (k[1] or "", k[2] or "", str(k[0])))
    only_b = sorted(set(idx_b) - set(idx_a), key=lambda k: (k[1] or "", k[2] or "", str(k[0])))

    coord_deltas: list[float] = []
    for k in matched:
        ax, ay = centroid(idx_a[k])
        bx, by = centroid(idx_b[k])
        dx, dy = bx - ax, by - ay
        coord_deltas.append((dx * dx + dy * dy) ** 0.5)

    coord_summary = {
        "matched": len(matched),
        "mean_px": round(sum(coord_deltas) / len(coord_deltas), 2) if coord_deltas else 0.0,
        "max_px": round(max(coord_deltas), 2) if coord_deltas else 0.0,
        "over_10px": sum(1 for d in coord_deltas if d > 10),
    }

    report = {
        "baseline": str(a),
        "variant": str(b),
        "totals": {"baseline": sa["total"], "variant": sb["total"]},
        "by_kind": kind_deltas,
        "by_type": {
            "baseline": sa["by_type"],
            "variant": sb["by_type"],
        },
        "only_in_baseline": [list(k) for k in only_a],
        "only_in_variant": [list(k) for k in only_b],
        "coords": coord_summary,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
