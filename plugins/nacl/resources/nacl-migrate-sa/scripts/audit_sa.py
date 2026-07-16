#!/usr/bin/env python3
"""audit_sa.py — compare live Neo4j SA counts to SaIR + HandoffIR.

Same contract as audit_ba.py: reads IR + a live-counts JSON that the SKILL
gathered via mcp__neo4j__read-cypher.

COUNT-PARITY BLIND SPOT (read before trusting "All SA counts match")
--------------------------------------------------------------------
The expected counts below are derived from the *same IR* that was just
written to the graph (see _expected_node_counts / _expected_edge_counts).
So this audit can only ever prove "what we parsed got written" — it is
structurally incapable of detecting *under-extraction*. If the parser emits
4 ActivitySteps total, this script expects 4, finds 4 live, and reports a
clean match, even when nearly every UseCase is an empty shell.

The completeness dimension lives in validate_sa_ir.py (the SC1–SC7 "Coverage"
section), which measures how much of each node type was actually populated.
A green audit here is necessary but NOT sufficient for a complete migration —
always read the Coverage section in sa-validation.json alongside this report.
That is what the pointer line printed below directs the reader to.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit live Neo4j vs SaIR + HandoffIR.")
    parser.add_argument("--ir", required=True, help="Path to sa-ir.json")
    parser.add_argument("--handoff", required=True, help="Path to handoff-ir.json")
    parser.add_argument("--counts", required=True, help="Path to sa-live-counts.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)

    for label, p in (("ir", args.ir), ("handoff", args.handoff), ("counts", args.counts)):
        if not Path(p).is_file():
            _emit_error(args.output, "INPUT_MISSING",
                        f"{label} file not found: {p}",
                        f"Supply --{label} with an existing path.")
            return 3

    ir = json.loads(Path(args.ir).read_text(encoding="utf-8"))
    handoff = json.loads(Path(args.handoff).read_text(encoding="utf-8"))
    live = json.loads(Path(args.counts).read_text(encoding="utf-8"))

    expected_nodes = _expected_node_counts(ir)
    expected_edges = _expected_edge_counts(ir, handoff)

    node_diffs = _diff(expected_nodes, live.get("nodes", {}))
    edge_diffs = _diff(expected_edges, live.get("relationships", {}))

    node_failures = [d for d in node_diffs if d["status"] != "match"]
    edge_failures = [d for d in edge_diffs if d["status"] != "match"]

    payload: Dict[str, Any] = {
        "status": "ok",
        "summary": {
            "node_types_total": len(node_diffs),
            "node_types_ok":    sum(1 for d in node_diffs if d["status"] == "match"),
            "edge_types_total": len(edge_diffs),
            "edge_types_ok":    sum(1 for d in edge_diffs if d["status"] == "match"),
            "blockers":         len(node_failures) + len(edge_failures),
        },
        "nodes":         node_diffs,
        "relationships": edge_diffs,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print("SA audit — Nodes:")
    for d in node_diffs:
        marker = "✓" if d["status"] == "match" else "✗"
        print(f"  {marker} {d['label']:<20} expected={d['expected']:>4} live={d['live']:>4}")
    print("SA audit — Relationships:")
    for d in edge_diffs:
        marker = "✓" if d["status"] == "match" else "✗"
        print(f"  {marker} {d['label']:<22} expected={d['expected']:>4} live={d['live']:>4}")

    if payload["summary"]["blockers"]:
        print(f"\nBLOCKERS: {payload['summary']['blockers']}")
        return 1
    # Count parity proves IR→graph fidelity, NOT extraction completeness.
    # Point the reader at the Coverage section so this clean line is never
    # mistaken for a complete migration (see module docstring).
    print("\nAll SA counts match.")
    print("count parity ✓ — see validation coverage (SC1–SC7 in "
          "sa-validation.json) for completeness")
    return 0


def _expected_node_counts(ir: Dict[str, Any]) -> Dict[str, int]:
    use_cases = ir.get("use_cases", [])
    entities = ir.get("domain_entities", [])
    enums = ir.get("enumerations", [])
    forms = ir.get("forms", [])
    return {
        "Module":          len(ir.get("modules", [])),
        "UseCase":         len(use_cases),
        "ActivityStep":    sum(len(uc.get("activity_steps", [])) for uc in use_cases),
        "DomainEntity":    len(entities),
        "DomainAttribute": sum(len(e.get("attributes", [])) for e in entities),
        "Enumeration":     len(enums),
        "EnumValue":       sum(len(en.get("values", [])) for en in enums),
        "Form":            len(forms),
        "FormField":       sum(len(f.get("fields", [])) for f in forms),
        "Requirement":     len(ir.get("requirements", [])),
        "SystemRole":      len(ir.get("system_roles", [])),
    }


def _expected_edge_counts(ir: Dict[str, Any], handoff: Dict[str, Any]) -> Dict[str, int]:
    counts: Counter[str] = Counter()

    # Extended module lookup: name, English code (description), or ID suffix
    mod_by_name: Dict[str, str] = {m["name"]: m["id"] for m in ir.get("modules", [])}
    for m in ir.get("modules", []):
        if m.get("description"):
            mod_by_name.setdefault(m["description"], m["id"])
        mod_id = m.get("id", "")
        if mod_id.startswith("MOD-"):
            mod_by_name.setdefault(mod_id[4:], mod_id)
    uc_set = {uc["id"] for uc in ir.get("use_cases", [])}

    for uc in ir.get("use_cases", []):
        if uc.get("module") in mod_by_name:
            counts["CONTAINS_UC"] += 1
        counts["HAS_STEP"] += len(uc.get("activity_steps", []))

    for de in ir.get("domain_entities", []):
        if de.get("module") in mod_by_name:
            counts["CONTAINS_ENTITY"] += 1
        counts["HAS_ATTRIBUTE"] += len(de.get("attributes", []))

    en_set = {en["id"] for en in ir.get("enumerations", [])}
    for de in ir.get("domain_entities", []):
        for en_ref in de.get("enumeration_refs", []):
            if en_ref in en_set:
                counts["HAS_ENUM"] += 1

    for en in ir.get("enumerations", []):
        counts["HAS_VALUE"] += len(en.get("values", []))

    for f in ir.get("forms", []):
        counts["HAS_FIELD"] += len(f.get("fields", []))
        for uc_id in f.get("used_by_uc", []):
            if uc_id in uc_set:
                counts["USES_FORM"] += 1

    for r in ir.get("requirements", []):
        for uc_id in r.get("uc_ids", []):
            if uc_id in uc_set:
                counts["HAS_REQUIREMENT"] += 1

    counts["AUTOMATES_AS"]   = len(handoff.get("automates_as", []))
    counts["REALIZED_AS"]    = len(handoff.get("realized_as", []))
    counts["TYPED_AS"]       = len(handoff.get("typed_as", []))
    counts["MAPPED_TO"]      = len(handoff.get("mapped_to", []))
    counts["IMPLEMENTED_BY"] = len(handoff.get("implemented_by", []))
    counts["SUGGESTS"]       = len(handoff.get("suggests", []))

    return dict(counts)


def _diff(expected: Dict[str, int], live: Dict[str, int]) -> List[Dict[str, Any]]:
    labels = sorted(set(expected) | set(live))
    out: List[Dict[str, Any]] = []
    for label in labels:
        e = expected.get(label, 0)
        l = live.get(label, 0)
        if e == l:
            status = "match"
        elif l == 0 and e > 0:
            status = "missing_in_graph"
        elif e == 0 and l > 0:
            status = "extra_in_graph"
        else:
            status = "count_mismatch"
        out.append({"label": label, "expected": e, "live": l, "status": status})
    return out


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
