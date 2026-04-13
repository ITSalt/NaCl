"""Adapter auto-detection.

Samples a handful of representative files and asks each registered adapter
for a confidence score. Emits a result dict suitable for the detect_ba.py
CLI.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from . import BA_ADAPTERS

# Directories worth sampling, in priority order.
_SAMPLE_HINTS_BA = [
    "docs/02-business-entities/entities",
    "docs/01-business-processes/processes",
    "docs/04-business-rules/rules",
    "docs/03-business-roles/roles",
    "docs/02-business-entities",
    "docs/01-business-processes",
]


def sample_files_for_ba(project_path: Path, max_files: int = 3) -> List[Path]:
    """Pick up to `max_files` representative BA files."""
    picked: List[Path] = []
    for rel in _SAMPLE_HINTS_BA:
        folder = project_path / rel
        if not folder.is_dir():
            continue
        for entry in sorted(folder.iterdir()):
            if entry.is_file() and entry.suffix == ".md" and not entry.name.startswith("_"):
                picked.append(entry)
                if len(picked) >= max_files:
                    return picked
    return picked


def detect_ba(project_path: Path) -> Dict[str, Any]:
    """Run every registered adapter's `detect()` on sample files and aggregate."""
    samples = sample_files_for_ba(project_path)
    if not samples:
        return {
            "sampled_files": [],
            "candidates": [],
            "chosen": None,
            "ambiguous": False,
            "reason": "no_ba_files_found",
        }

    candidates = []
    for name, adapter_cls in BA_ADAPTERS.items():
        confidence = adapter_cls.detect(samples)
        candidates.append({"adapter": name, "confidence": round(confidence, 3)})

    candidates.sort(key=lambda c: c["confidence"], reverse=True)

    top = candidates[0]
    second = candidates[1] if len(candidates) > 1 else {"confidence": 0.0}
    chosen: str | None = None
    ambiguous = False

    if top["confidence"] >= 0.8 and top["confidence"] - second["confidence"] >= 0.2:
        chosen = top["adapter"]
    elif top["confidence"] >= 0.4:
        ambiguous = True

    return {
        "sampled_files": [str(s) for s in samples],
        "candidates": candidates,
        "chosen": chosen,
        "ambiguous": ambiguous,
    }
