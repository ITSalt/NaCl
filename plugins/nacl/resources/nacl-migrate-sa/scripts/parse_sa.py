#!/usr/bin/env python3
"""parse_sa.py — parse a project's SA markdown into an SaIR JSON + a HandoffIR JSON.

Usage:
    python3 parse_sa.py --project PATH --adapter inline-table-v1 \
        --output .nacl-migrate/sa-ir.json \
        --handoff-output .nacl-migrate/handoff-ir.json
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path


def _add_core_to_path() -> None:
    here = Path(__file__).resolve()
    core = here.parents[2] / "nacl-migrate-core"
    if str(core) not in sys.path:
        sys.path.insert(0, str(core))


_add_core_to_path()

from nacl_migrate_core.adapters import SA_ADAPTERS  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parse SA markdown -> SaIR + HandoffIR JSON.")
    parser.add_argument("--project", required=True)
    parser.add_argument("--adapter", required=True,
                        help=f"Adapter name. One of: {sorted(SA_ADAPTERS)}")
    parser.add_argument("--output", required=True)
    parser.add_argument("--handoff-output", required=True)
    args = parser.parse_args(argv)

    project_path = Path(args.project).resolve()
    if not project_path.is_dir():
        _emit_error(args.output, "PROJECT_NOT_FOUND",
                    f"Project directory {project_path} does not exist",
                    "Pass --project with an existing path.")
        return 3

    adapter_cls = SA_ADAPTERS.get(args.adapter)
    if adapter_cls is None:
        _emit_error(args.output, "ADAPTER_UNKNOWN",
                    f"Unknown SA adapter: {args.adapter!r}",
                    f"Choose one of {sorted(SA_ADAPTERS)}.")
        return 3

    try:
        sa_ir, handoff_ir = adapter_cls().parse(project_path)
    except Exception as exc:
        _emit_error(args.output, "ADAPTER_INTERNAL_ERROR",
                    f"{type(exc).__name__}: {exc}",
                    "Check the adapter implementation or file a bug report.")
        return 2

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(asdict(sa_ir), ensure_ascii=False, indent=2), encoding="utf-8")

    ho = Path(args.handoff_output)
    ho.parent.mkdir(parents=True, exist_ok=True)
    ho.write_text(json.dumps(asdict(handoff_ir), ensure_ascii=False, indent=2), encoding="utf-8")

    print("Parsed SA IR:")
    for label, count in sa_ir.counts().items():
        print(f"  {label:<20} {count}")
    print("Handoff IR:")
    for label, count in handoff_ir.counts().items():
        print(f"  {label:<20} {count}")
    warn_count = len(sa_ir.warnings)
    print(f"  warnings            {warn_count}")
    if warn_count:
        by_code: dict[str, int] = {}
        for w in sa_ir.warnings:
            by_code[w.code] = by_code.get(w.code, 0) + 1
        for code, n in sorted(by_code.items()):
            print(f"    - {code}: {n}")
    return 0


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
