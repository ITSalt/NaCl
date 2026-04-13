#!/usr/bin/env python3
"""validate_sa_ir.py — validate SaIR + HandoffIR for integrity.

Checks (SaIR):
  SV1  UseCase.module resolves to a Module name in IR.
  SV2  ActivityStep ids are unique (global).
  SV3  UseCase requirement_refs resolve to Requirements in IR.
  SV4  UseCase form_refs resolve to Forms in IR.
  SV5  Form.used_by_uc resolves to UseCases in IR.
  SV6  Requirement.uc_ids resolves to UseCases in IR.
  SV7  No duplicate IDs per node type.
  SV8  Every IR node has a non-empty source_file.

Checks (HandoffIR):
  HV1  REALIZED_AS.to_id resolves to a DomainEntity in IR.
  HV2  AUTOMATES_AS.to_id resolves to a UseCase in IR.
  HV3  MAPPED_TO.to_id resolves to a SystemRole in IR.
  HV4  No duplicate handoff edges.
  HV5  Every handoff edge has a non-empty from_id and to_id.

(Cross-checks against BA — e.g. that AUTOMATES_AS.from_id resolves to a
 BusinessProcess — are deferred to the skill's live-Neo4j audit in Phase 6.)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate SaIR + HandoffIR.")
    parser.add_argument("--input", required=True, help="Path to sa-ir.json")
    parser.add_argument("--handoff", required=True, help="Path to handoff-ir.json")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args(argv)

    sa_path = Path(args.input)
    ho_path = Path(args.handoff)
    for label, p in (("input", sa_path), ("handoff", ho_path)):
        if not p.is_file():
            _emit_error(args.output, "INPUT_MISSING",
                        f"{label} file not found: {p}",
                        "Run parse_sa.py first.")
            return 3

    ir = json.loads(sa_path.read_text(encoding="utf-8"))
    handoff = json.loads(ho_path.read_text(encoding="utf-8"))

    checks = _run_checks(ir, handoff)
    passed = sum(1 for c in checks if c["pass"])
    failed = len(checks) - passed

    report = {
        "status": "ok",
        "summary": {"total": len(checks), "passed": passed, "failed": failed},
        "checks": checks,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Validation: {passed}/{len(checks)} passed, {failed} failed")
    for c in checks:
        if not c["pass"]:
            print(f"  [{c['id']}] {c['name']}: {len(c['failures'])} failure(s)")
            for f in c["failures"][:5]:
                print(f"      - {f}")
            if len(c["failures"]) > 5:
                print(f"      (... {len(c['failures']) - 5} more)")
    return 0 if failed == 0 else 1


def _run_checks(ir: Dict[str, Any], handoff: Dict[str, Any]) -> List[Dict[str, Any]]:
    modules = {m["name"]: m["id"] for m in ir.get("modules", [])}
    uc_ids = {uc["id"] for uc in ir.get("use_cases", [])}
    de_ids = {de["id"] for de in ir.get("domain_entities", [])}
    form_ids = {f["id"] for f in ir.get("forms", [])}
    req_ids = {r["id"] for r in ir.get("requirements", [])}
    sr_ids = {r["id"] for r in ir.get("system_roles", [])}

    checks: List[Dict[str, Any]] = []

    # SV1
    sv1: List[str] = []
    for uc in ir.get("use_cases", []):
        if uc.get("module") and uc["module"] not in modules:
            sv1.append(f"UC {uc['id']} references unknown module {uc['module']!r}")
    checks.append(_check("SV1", "UseCase.module resolves to Module", sv1))

    # SV2
    sv2: List[str] = []
    all_steps: set[str] = set()
    dupes: list[str] = []
    for uc in ir.get("use_cases", []):
        for step in uc.get("activity_steps", []):
            if step["id"] in all_steps:
                dupes.append(step["id"])
            all_steps.add(step["id"])
    for d in dupes:
        sv2.append(f"Duplicate ActivityStep id {d}")
    checks.append(_check("SV2", "ActivityStep ids unique", sv2))

    # SV3
    sv3: List[str] = []
    for uc in ir.get("use_cases", []):
        for rr in uc.get("requirement_refs", []):
            if rr not in req_ids:
                sv3.append(f"UC {uc['id']} requirement_ref {rr} unknown")
    checks.append(_check("SV3", "UseCase requirement_refs resolve", sv3))

    # SV4
    sv4: List[str] = []
    for uc in ir.get("use_cases", []):
        for fr in uc.get("form_refs", []):
            if fr not in form_ids:
                sv4.append(f"UC {uc['id']} form_ref {fr} unknown")
    checks.append(_check("SV4", "UseCase form_refs resolve", sv4))

    # SV5
    sv5: List[str] = []
    for f in ir.get("forms", []):
        for uc in f.get("used_by_uc", []):
            if uc not in uc_ids:
                sv5.append(f"Form {f['id']} used_by_uc {uc} unknown")
    checks.append(_check("SV5", "Form.used_by_uc resolves", sv5))

    # SV6
    sv6: List[str] = []
    for r in ir.get("requirements", []):
        for uc in r.get("uc_ids", []):
            if uc not in uc_ids:
                sv6.append(f"Requirement {r['id']} uc_id {uc} unknown")
    checks.append(_check("SV6", "Requirement.uc_ids resolves", sv6))

    # SV7
    sv7: List[str] = []
    _dupes(sv7, "Module", [m["id"] for m in ir.get("modules", [])])
    _dupes(sv7, "UseCase", [uc["id"] for uc in ir.get("use_cases", [])])
    _dupes(sv7, "DomainEntity", [de["id"] for de in ir.get("domain_entities", [])])
    _dupes(sv7, "DomainAttribute", [a["id"] for e in ir.get("domain_entities", []) for a in e.get("attributes", [])])
    _dupes(sv7, "Enumeration", [en["id"] for en in ir.get("enumerations", [])])
    _dupes(sv7, "EnumValue", [v["id"] for en in ir.get("enumerations", []) for v in en.get("values", [])])
    _dupes(sv7, "Form", [f["id"] for f in ir.get("forms", [])])
    _dupes(sv7, "Requirement", [r["id"] for r in ir.get("requirements", [])])
    _dupes(sv7, "SystemRole", [r["id"] for r in ir.get("system_roles", [])])
    checks.append(_check("SV7", "ID uniqueness per node type", sv7))

    # SV8
    sv8: List[str] = []
    for section, nodes in (
        ("modules", ir.get("modules", [])),
        ("use_cases", ir.get("use_cases", [])),
        ("domain_entities", ir.get("domain_entities", [])),
        ("enumerations", ir.get("enumerations", [])),
        ("forms", ir.get("forms", [])),
        ("requirements", ir.get("requirements", [])),
        ("system_roles", ir.get("system_roles", [])),
    ):
        for n in nodes:
            if not n.get("source_file"):
                sv8.append(f"{section}/{n.get('id')} has empty source_file")
    checks.append(_check("SV8", "source_file populated on every node", sv8))

    # HV1
    hv1: List[str] = []
    for e in handoff.get("realized_as", []):
        if e["to_id"] not in de_ids:
            hv1.append(f"REALIZED_AS.to_id {e['to_id']} not in domain_entities")
    checks.append(_check("HV1", "REALIZED_AS.to_id resolves to DE", hv1))

    # HV2
    hv2: List[str] = []
    for e in handoff.get("automates_as", []):
        if e["to_id"] not in uc_ids:
            hv2.append(f"AUTOMATES_AS.to_id {e['to_id']} not in use_cases")
    checks.append(_check("HV2", "AUTOMATES_AS.to_id resolves to UC", hv2))

    # HV3
    hv3: List[str] = []
    for e in handoff.get("mapped_to", []):
        if e["to_id"] not in sr_ids:
            hv3.append(f"MAPPED_TO.to_id {e['to_id']} not in system_roles")
    checks.append(_check("HV3", "MAPPED_TO.to_id resolves to SYSROL", hv3))

    # HV4 — dupe edges per type
    hv4: List[str] = []
    for kind in ("automates_as", "realized_as", "typed_as", "mapped_to", "implemented_by", "suggests"):
        seen: set[tuple[str, str]] = set()
        for e in handoff.get(kind, []):
            key = (e["from_id"], e["to_id"])
            if key in seen:
                hv4.append(f"Duplicate {kind}: {key}")
            seen.add(key)
    checks.append(_check("HV4", "Handoff edge uniqueness", hv4))

    # HV5
    hv5: List[str] = []
    for kind in ("automates_as", "realized_as", "typed_as", "mapped_to", "implemented_by", "suggests"):
        for e in handoff.get(kind, []):
            if not e.get("from_id") or not e.get("to_id"):
                hv5.append(f"{kind}: empty from/to: {e}")
    checks.append(_check("HV5", "Handoff edges have non-empty endpoints", hv5))

    return checks


def _check(cid: str, name: str, failures: List[str]) -> Dict[str, Any]:
    return {"id": cid, "name": name, "pass": len(failures) == 0, "failures": failures}


def _dupes(sink: List[str], label: str, ids: List[str]) -> None:
    seen: Dict[str, int] = {}
    for i in ids:
        seen[i] = seen.get(i, 0) + 1
    for k, v in seen.items():
        if v > 1:
            sink.append(f"{label} id {k!r} appears {v} times")


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
