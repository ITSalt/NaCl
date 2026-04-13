#!/usr/bin/env python3
"""validate_ba_ir.py — validate a BaIR JSON for integrity.

Never connects to Neo4j. Pure IR introspection. Emits a structured validation
report and a summary line. Exit code 0 on success, 1 on failure.

Checks:
  V1  Every BusinessProcess.group_id resolves to a ProcessGroup.
  V2  Every WorkflowStep.performer_role_id resolves to a BusinessRole.
  V3  Every WorkflowStep reads/produces/modifies IDs resolve to BusinessEntities.
  V4  Every WorkflowStep.next_step_ids resolves to a WorkflowStep in the same BP.
  V5  Every BusinessEntity.related_process_ids resolves to a BusinessProcess.
  V6  Every BusinessRole.participates_in_process_ids resolves to a BusinessProcess.
  V7  Every BusinessRule cross-reference resolves (entities, BPs, steps, attrs).
  V8  No duplicate IDs per node type (including nested).
  V9  Every IR node has a non-empty source_file.
  V10 State transitions point to states declared on the same entity.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate BaIR JSON.")
    parser.add_argument("--input", required=True, help="Path to ba-ir.json")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    if not input_path.is_file():
        _emit_error(args.output, "IR_NOT_FOUND", f"IR file not found: {input_path}",
                    "Run parse_ba.py first.")
        return 3

    ir = json.loads(input_path.read_text(encoding="utf-8"))
    checks = _run_checks(ir)
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


def _run_checks(ir: Dict[str, Any]) -> List[Dict[str, Any]]:
    process_groups = {pg["id"] for pg in ir.get("process_groups", [])}
    bps = {bp["id"]: bp for bp in ir.get("business_processes", [])}
    entities = {e["id"]: e for e in ir.get("business_entities", [])}
    roles = {r["id"] for r in ir.get("business_roles", [])}
    rules = ir.get("business_rules", [])

    checks: List[Dict[str, Any]] = []

    # V1
    failures: List[str] = []
    for bp in bps.values():
        if bp["group_id"] not in process_groups:
            failures.append(
                f"BP {bp['id']} references group {bp['group_id']!r} not in process_groups"
            )
    checks.append(_check("V1", "BusinessProcess.group_id integrity", failures))

    # V2, V3, V4
    steps_by_bp: Dict[str, Dict[str, Dict[str, Any]]] = {}
    all_steps: Dict[str, Dict[str, Any]] = {}
    for bp in bps.values():
        steps_by_bp[bp["id"]] = {s["id"]: s for s in bp.get("workflow", [])}
        all_steps.update(steps_by_bp[bp["id"]])

    v2: List[str] = []
    v3: List[str] = []
    v4: List[str] = []
    for bp_id, bp_steps in steps_by_bp.items():
        for step in bp_steps.values():
            if step.get("performer_role_id") and step["performer_role_id"] not in roles:
                v2.append(f"{step['id']} performer_role_id={step['performer_role_id']!r} unknown")
            for key in ("reads_entity_ids", "produces_entity_ids", "modifies_entity_ids"):
                for eid in step.get(key, []):
                    if eid not in entities:
                        v3.append(f"{step['id']}.{key}: unknown entity {eid}")
            for nxt in step.get("next_step_ids", []):
                if nxt not in bp_steps:
                    v4.append(f"{step['id']} next_step_ids: {nxt} not a step in {bp_id}")
    checks.append(_check("V2", "WorkflowStep performer role integrity", v2))
    checks.append(_check("V3", "WorkflowStep entity reference integrity", v3))
    checks.append(_check("V4", "WorkflowStep next-step integrity", v4))

    # V5
    v5: List[str] = []
    for e in entities.values():
        for bp_id in e.get("related_process_ids", []):
            if bp_id not in bps:
                v5.append(f"OBJ {e['id']} references BP {bp_id} not in business_processes")
    checks.append(_check("V5", "BusinessEntity related_process_ids integrity", v5))

    # V6
    v6: List[str] = []
    for r in ir.get("business_roles", []):
        for bp_id in r.get("participates_in_process_ids", []):
            if bp_id not in bps:
                v6.append(f"ROL {r['id']} references BP {bp_id} not in business_processes")
    checks.append(_check("V6", "BusinessRole participates_in integrity", v6))

    # V7
    v7: List[str] = []
    attr_ids = {a["id"] for e in entities.values() for a in e.get("attributes", [])}
    for r in rules:
        for eid in r.get("constrains_entity_ids", []):
            if eid not in entities:
                v7.append(f"BRQ {r['id']} constrains unknown entity {eid}")
        for bp_id in r.get("applies_in_process_ids", []):
            if bp_id not in bps:
                v7.append(f"BRQ {r['id']} applies_in unknown BP {bp_id}")
        for step_id in r.get("applies_at_step_ids", []):
            if step_id not in all_steps:
                v7.append(f"BRQ {r['id']} applies_at unknown step {step_id}")
        for aid in r.get("affects_attribute_ids", []):
            if aid not in attr_ids:
                v7.append(f"BRQ {r['id']} affects unknown attribute {aid}")
    checks.append(_check("V7", "BusinessRule cross-reference integrity", v7))

    # V8
    v8: List[str] = []
    _dupes(v8, "ProcessGroup", [pg["id"] for pg in ir.get("process_groups", [])])
    _dupes(v8, "BusinessProcess", [bp["id"] for bp in ir.get("business_processes", [])])
    _dupes(v8, "WorkflowStep", list(all_steps.keys()))
    _dupes(v8, "BusinessEntity", [e["id"] for e in entities.values()])
    _dupes(v8, "EntityAttribute", [a["id"] for e in entities.values() for a in e.get("attributes", [])])
    _dupes(v8, "EntityState", [s["id"] for e in entities.values() for s in e.get("states", [])])
    _dupes(v8, "BusinessRole", [r["id"] for r in ir.get("business_roles", [])])
    _dupes(v8, "BusinessRule", [r["id"] for r in rules])
    _dupes(v8, "GlossaryTerm", [g["id"] for g in ir.get("glossary_terms", [])])
    checks.append(_check("V8", "ID uniqueness per node type", v8))

    # V9
    v9: List[str] = []
    for section, nodes in (
        ("process_groups", ir.get("process_groups", [])),
        ("business_processes", ir.get("business_processes", [])),
        ("business_entities", list(entities.values())),
        ("business_roles", ir.get("business_roles", [])),
        ("business_rules", rules),
        ("glossary_terms", ir.get("glossary_terms", [])),
    ):
        for n in nodes:
            if not n.get("source_file"):
                v9.append(f"{section}/{n.get('id')} has empty source_file")
    checks.append(_check("V9", "source_file populated on every node", v9))

    # V10
    v10: List[str] = []
    for e in entities.values():
        state_ids = {s["id"] for s in e.get("states", [])}
        for s in e.get("states", []):
            for t in s.get("transitions_to", []):
                if t["to_id"] not in state_ids:
                    v10.append(f"OBJ {e['id']} state {s['id']} transitions to unknown {t['to_id']}")
    checks.append(_check("V10", "EntityState transitions integrity", v10))

    return checks


def _check(check_id: str, name: str, failures: List[str]) -> Dict[str, Any]:
    return {
        "id": check_id,
        "name": name,
        "pass": len(failures) == 0,
        "failures": failures,
    }


def _dupes(sink: List[str], label: str, ids: List[str]) -> None:
    seen: Dict[str, int] = {}
    for i in ids:
        seen[i] = seen.get(i, 0) + 1
    for k, v in seen.items():
        if v > 1:
            sink.append(f"{label} id {k!r} appears {v} times")


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {
        "status": "error", "error_code": code,
        "message": message, "remediation": remediation,
    }
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
