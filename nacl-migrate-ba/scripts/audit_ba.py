#!/usr/bin/env python3
"""audit_ba.py — compare live Neo4j counts to the BaIR.

Never connects to Neo4j directly. The skill is responsible for running the
count queries via mcp__neo4j__write-cypher (or equivalent) and writing them
to a JSON file in this shape:

  {
    "nodes":         {"BusinessProcess": 10, "WorkflowStep": 74, ...},
    "relationships": {"CONTAINS": 10, "HAS_STEP": 74, ...}
  }

This script compares those live counts against the IR and emits a report.
Exit 0 on clean match, 1 on any mismatch, 3 on missing input.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit live Neo4j counts vs BaIR.")
    parser.add_argument("--ir", required=True, help="Path to ba-ir.json")
    parser.add_argument("--counts", required=True, help="Path to live-counts JSON")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args(argv)

    ir_path = Path(args.ir)
    counts_path = Path(args.counts)
    for label, path in (("ir", ir_path), ("counts", counts_path)):
        if not path.is_file():
            _emit_error(args.output, "INPUT_MISSING",
                        f"{label} file not found: {path}",
                        f"Supply --{label} with an existing path.")
            return 3

    ir = json.loads(ir_path.read_text(encoding="utf-8"))
    live = json.loads(counts_path.read_text(encoding="utf-8"))

    expected_nodes = _expected_node_counts(ir)
    expected_edges = _expected_edge_counts(ir)

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

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Audit results:")
    for d in node_diffs:
        marker = "✓" if d["status"] == "match" else "✗"
        print(f"  {marker} {d['label']:<20} expected={d['expected']:>4} live={d['live']:>4}")
    print("Relationships:")
    for d in edge_diffs:
        marker = "✓" if d["status"] == "match" else "✗"
        print(f"  {marker} {d['label']:<20} expected={d['expected']:>4} live={d['live']:>4}")
    if payload["summary"]["blockers"]:
        print(f"\nBLOCKERS: {payload['summary']['blockers']}")
        return 1
    print("\nAll counts match.")
    return 0


def _expected_node_counts(ir: Dict[str, Any]) -> Dict[str, int]:
    """Mirror BaIR.counts()."""
    bp_list = ir.get("business_processes", [])
    entities = ir.get("business_entities", [])
    return {
        "SystemContext":   1 if ir.get("system_context") else 0,
        "Stakeholder":     len(ir.get("stakeholders", [])),
        "ExternalEntity":  len(ir.get("external_entities", [])),
        "DataFlow":        len(ir.get("data_flows", [])),
        "ProcessGroup":    len(ir.get("process_groups", [])),
        "BusinessProcess": len(bp_list),
        "WorkflowStep":    sum(len(bp.get("workflow", [])) for bp in bp_list),
        "BusinessEntity":  len(entities),
        "EntityAttribute": sum(len(e.get("attributes", [])) for e in entities),
        "EntityState":     sum(len(e.get("states", [])) for e in entities),
        "BusinessRole":    len(ir.get("business_roles", [])),
        "BusinessRule":    len(ir.get("business_rules", [])),
        "GlossaryTerm":    len(ir.get("glossary_terms", [])),
    }


def _expected_edge_counts(ir: Dict[str, Any]) -> Dict[str, int]:
    """Count every edge the Cypher plan will emit."""
    counts: Counter[str] = Counter()
    for bp in ir.get("business_processes", []):
        counts["CONTAINS"] += 1
        for step in bp.get("workflow", []):
            counts["HAS_STEP"] += 1
            counts["NEXT_STEP"] += len(step.get("next_step_ids", []))
            if step.get("performer_role_id"):
                counts["PERFORMED_BY"] += 1
            counts["READS"] += len(step.get("reads_entity_ids", []))
            counts["PRODUCES"] += len(step.get("produces_entity_ids", []))
            counts["MODIFIES"] += len(step.get("modifies_entity_ids", []))
    for r in ir.get("business_roles", []):
        counts["PARTICIPATES_IN"] += len(r.get("participates_in_process_ids", []))
    for e in ir.get("business_entities", []):
        counts["HAS_ATTRIBUTE"] += len(e.get("attributes", []))
        counts["HAS_STATE"] += len(e.get("states", []))
        for s in e.get("states", []):
            counts["TRANSITIONS_TO"] += len(s.get("transitions_to", []))
    for rule in ir.get("business_rules", []):
        counts["CONSTRAINS"] += len(rule.get("constrains_entity_ids", []))
        counts["APPLIES_IN"] += len(rule.get("applies_in_process_ids", []))
        counts["APPLIES_AT_STEP"] += len(rule.get("applies_at_step_ids", []))
        counts["AFFECTS"] += len(rule.get("affects_attribute_ids", []))
    if ir.get("system_context"):
        counts["HAS_STAKEHOLDER"] += len(ir.get("stakeholders", []))
        counts["HAS_EXTERNAL_ENTITY"] += len(ir.get("external_entities", []))
        counts["HAS_FLOW"] += len(ir.get("data_flows", []))
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
