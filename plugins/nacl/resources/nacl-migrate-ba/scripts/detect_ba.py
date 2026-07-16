#!/usr/bin/env python3
"""detect_ba.py — decide which BA adapter fits a project.

Usage:
    python3 detect_ba.py --project /path/to/project --output .nacl-migrate/detect-ba.json

Never connects to Neo4j. Only reads sample files from `docs/`.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _add_core_to_path() -> None:
    here = Path(__file__).resolve()
    # nacl-migrate-ba/scripts/detect_ba.py -> NaCl root -> nacl-migrate-core
    nacl_root = here.parents[2]
    core = nacl_root / "nacl-migrate-core"
    if str(core) not in sys.path:
        sys.path.insert(0, str(core))


_add_core_to_path()

from nacl_migrate_core.adapters.detect import detect_ba  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Detect BA adapter for a project.")
    parser.add_argument("--project", required=True, help="Project root directory")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args(argv)

    project_path = Path(args.project).resolve()
    if not project_path.is_dir():
        _emit_error(args.output, "PROJECT_NOT_FOUND",
                    f"Project directory {project_path} does not exist",
                    "Pass --project with an existing path.")
        return 3

    result = detect_ba(project_path)
    result["status"] = "ok"

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Detect: chosen={result.get('chosen')} "
          f"ambiguous={result.get('ambiguous')} "
          f"candidates={[c['adapter']+'='+str(c['confidence']) for c in result.get('candidates', [])]}")
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
