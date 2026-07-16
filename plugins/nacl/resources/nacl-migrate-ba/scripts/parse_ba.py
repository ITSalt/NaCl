#!/usr/bin/env python3
"""parse_ba.py — parse a project's BA markdown into a BaIR JSON.

Usage:
    python3 parse_ba.py \\
        --project /path/to/project \\
        --adapter inline-table-v1 \\
        --output .nacl-migrate/ba-ir.json

Never connects to Neo4j. Emits JSON IR; logs parse warnings; exit code 0
on success, 2 on adapter-internal error, 3 on I/O failure.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path


def _add_core_to_path() -> None:
    here = Path(__file__).resolve()
    nacl_root = here.parents[2]
    core = nacl_root / "nacl-migrate-core"
    if str(core) not in sys.path:
        sys.path.insert(0, str(core))


_add_core_to_path()

from nacl_migrate_core.adapters import BA_ADAPTERS  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parse BA markdown -> BaIR JSON.")
    parser.add_argument("--project", required=True)
    parser.add_argument("--adapter", required=True,
                        help=f"Adapter name. One of: {sorted(BA_ADAPTERS)}")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)

    project_path = Path(args.project).resolve()
    if not project_path.is_dir():
        _emit_error(args.output, "PROJECT_NOT_FOUND",
                    f"Project directory {project_path} does not exist",
                    "Pass --project with an existing path.")
        return 3

    adapter_cls = BA_ADAPTERS.get(args.adapter)
    if adapter_cls is None:
        _emit_error(args.output, "ADAPTER_UNKNOWN",
                    f"Unknown adapter: {args.adapter!r}",
                    f"Choose one of {sorted(BA_ADAPTERS)} or add a new adapter.")
        return 3

    try:
        ir = adapter_cls().parse(project_path)
    except Exception as exc:
        _emit_error(args.output, "ADAPTER_INTERNAL_ERROR",
                    f"{type(exc).__name__}: {exc}",
                    "Check the adapter implementation or file a bug report.")
        return 2

    payload = asdict(ir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = ir.counts()
    print("Parsed IR:")
    for label, count in counts.items():
        print(f"  {label:<20} {count}")
    warn_count = len(ir.warnings)
    print(f"  warnings            {warn_count}")
    if warn_count:
        # Print a concise tally of warning codes
        by_code: dict[str, int] = {}
        for w in ir.warnings:
            by_code[w.code] = by_code.get(w.code, 0) + 1
        for code, n in sorted(by_code.items()):
            print(f"    - {code}: {n}")
    return 0


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {
        "status": "error",
        "error_code": code,
        "message": message,
        "remediation": remediation,
    }
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
