#!/usr/bin/env python3
"""preflight_ids.py — scan a project for ID-pattern coverage before any
parse/migrate phase runs.

Usage:
    python3 preflight_ids.py --project PATH [--output FILE]

Exit codes:
    0  All ID-shaped tokens match a known adapter pattern.
    1  At least one unknown pattern was found (orchestrator decides whether
       this is a blocker — non-blocker by itself).
    2  I/O error or invalid input.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _add_core_to_path() -> None:
    here = Path(__file__).resolve()
    core = here.parents[2] / "nacl-migrate-core"
    if str(core) not in sys.path:
        sys.path.insert(0, str(core))


_add_core_to_path()

from nacl_migrate_core.preflight import scan_id_patterns, write_report  # noqa: E402


def _print_compact_table(report: dict) -> None:
    """Render ``patterns_found`` as a small console table."""
    layers = report.get("layers_detected", {})
    print(f"BA layer: {layers.get('ba')}, SA layer: {layers.get('sa')}, "
          f"SA numbering: {layers.get('sa_numbering')}")
    pats = report.get("patterns_found", [])
    if not pats:
        print("(no ID-shaped tokens found)")
    else:
        print(f"\n{'Category':<22} {'Pattern':<28} {'Example':<14} {'Count':>5}")
        print("-" * 72)
        for p in pats:
            print(f"{p['category']:<22} {p['pattern']:<28} "
                  f"{p['example']:<14} {p['count']:>5}")
    unknowns = report.get("patterns_unknown", [])
    if unknowns:
        print(f"\nUnknown patterns ({len(unknowns)}):")
        for u in unknowns[:20]:
            print(f"  - {u['token']:<20}  in {u['source_file']}")
        if len(unknowns) > 20:
            print(f"  ... and {len(unknowns) - 20} more")
    recs = report.get("adapter_recommendations", [])
    if recs:
        print(f"\nAdapter recommendation(s): {', '.join(recs)}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--project", required=True)
    p.add_argument("--output", default="")
    args = p.parse_args(argv)

    project_path = Path(args.project).resolve()
    if not project_path.is_dir():
        print(f"[PROJECT_NOT_FOUND] {project_path}", file=sys.stderr)
        return 2

    try:
        report = scan_id_patterns(project_path)
    except OSError as e:
        print(f"[IO_ERROR] {e}", file=sys.stderr)
        return 2

    if args.output:
        write_report(report, Path(args.output))

    _print_compact_table(report)

    if report.get("patterns_unknown"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
