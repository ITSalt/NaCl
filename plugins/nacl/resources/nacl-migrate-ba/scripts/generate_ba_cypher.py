#!/usr/bin/env python3
"""generate_ba_cypher.py — emit batched Cypher statements from a BaIR.

Never connects to Neo4j. Produces a JSON plan that the SKILL executes via
mcp__neo4j__write-cypher.

Output shape:
{
  "batches": [
    {
      "label": "BusinessProcess",            # human-readable tag
      "kind":  "node" | "edge",
      "cypher": "UNWIND $rows AS row ...",
      "params": {"rows": [ ... ]}
    },
    ...
  ],
  "summary": {"node_batches": N, "edge_batches": M, "total_rows": K}
}

Idempotency: every statement is MERGE-based.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List


BATCH_SIZE = 100


# ---------------------------------------------------------------------------
# Cypher templates

NODE_CYPHER = """
UNWIND $rows AS row
MERGE (n:{label} {{id: row.id}})
ON CREATE SET n += row.props,
              n.source_file = row.source_file,
              n.migrated_at = datetime(),
              n.created     = datetime(),
              n.updated     = datetime()
ON MATCH  SET n += row.props,
              n.source_file = coalesce(row.source_file, n.source_file),
              n.migrated_at = datetime(),
              n.updated     = datetime()
RETURN count(n) AS n
""".strip()


def edge_cypher(
    src_label: str, dst_label: str, rel_type: str,
    rel_props: List[str] | None = None,
) -> str:
    """MERGE an edge between two labelled nodes.

    rel_props — names of properties on the relationship (taken from row.rel_props).
    """
    if rel_props:
        set_clause = "\nON CREATE SET r += row.rel_props\nON MATCH  SET r += row.rel_props"
    else:
        set_clause = ""
    return (
        f"UNWIND $rows AS row\n"
        f"MATCH (a:{src_label} {{id: row.from}})\n"
        f"MATCH (b:{dst_label} {{id: row.to}})\n"
        f"MERGE (a)-[r:{rel_type}]->(b)"
        f"{set_clause}\n"
        f"RETURN count(r) AS n"
    )


# ---------------------------------------------------------------------------
# Main

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Cypher plan from BaIR.")
    parser.add_argument("--input", required=True, help="Path to ba-ir.json")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    if not input_path.is_file():
        _emit_error(args.output, "IR_NOT_FOUND", f"IR file not found: {input_path}",
                    "Run parse_ba.py first.")
        return 3

    ir = json.loads(input_path.read_text(encoding="utf-8"))
    batches: List[Dict[str, Any]] = []
    batches.extend(_node_batches(ir, args.batch_size))
    batches.extend(_edge_batches(ir, args.batch_size))

    node_count = sum(1 for b in batches if b["kind"] == "node")
    edge_count = sum(1 for b in batches if b["kind"] == "edge")
    total_rows = sum(len(b["params"]["rows"]) for b in batches)

    payload = {
        "status": "ok",
        "summary": {
            "node_batches": node_count,
            "edge_batches": edge_count,
            "total_rows": total_rows,
        },
        "batches": batches,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Cypher plan: {node_count} node batches, {edge_count} edge batches, "
          f"{total_rows} rows total")
    return 0


# ---------------------------------------------------------------------------
# Node batches

def _node_batches(ir: Dict[str, Any], size: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # SystemContext
    sc = ir.get("system_context")
    if sc:
        out.extend(_emit_nodes("SystemContext", [{
            "id": sc["id"],
            "source_file": sc.get("source_file", ""),
            "props": {
                "name": sc.get("name", ""),
                "goals": sc.get("goals", []),
                "in_scope": sc.get("in_scope", []),
                "out_of_scope": sc.get("out_of_scope", []),
                "constraints": sc.get("constraints", []),
                "assumptions": sc.get("assumptions", []),
            },
        }], size))

    # Stakeholders / ExternalEntities / DataFlows
    out.extend(_emit_nodes("Stakeholder", [
        {"id": s["id"], "source_file": s.get("source_file", ""),
         "props": {"name": s["name"], "role": s.get("role", ""), "interest": s.get("interest", "")}}
        for s in ir.get("stakeholders", [])
    ], size))
    out.extend(_emit_nodes("ExternalEntity", [
        {"id": e["id"], "source_file": e.get("source_file", ""),
         "props": {"name": e["name"], "type": e.get("type", "")}}
        for e in ir.get("external_entities", [])
    ], size))
    out.extend(_emit_nodes("DataFlow", [
        {"id": d["id"], "source_file": d.get("source_file", ""),
         "props": {"name": d["name"], "direction": d.get("direction", "BOTH"),
                   "data_description": d.get("data_description", "")}}
        for d in ir.get("data_flows", [])
    ], size))

    # Process layer
    out.extend(_emit_nodes("ProcessGroup", [
        {"id": g["id"], "source_file": g.get("source_file", ""),
         "props": {"name": g["name"], "description": g.get("description", "")}}
        for g in ir.get("process_groups", [])
    ], size))
    out.extend(_emit_nodes("BusinessProcess", [
        {"id": bp["id"], "source_file": bp.get("source_file", ""),
         "props": {"name": bp["name"], "description": bp.get("description", ""),
                   "trigger": bp.get("trigger", ""), "result": bp.get("result", ""),
                   "automation_level": bp.get("automation_level") or ""}}
        for bp in ir.get("business_processes", [])
    ], size))

    # WorkflowStep nodes are flattened from BP.workflow
    ws_rows: List[Dict[str, Any]] = []
    for bp in ir.get("business_processes", []):
        for step in bp.get("workflow", []):
            ws_rows.append({
                "id": step["id"], "source_file": step.get("source_file", ""),
                "props": {
                    "function_name": step["function_name"],
                    "step_number": step["step_number"],
                    "stereotype": step["stereotype"],
                    "description": "",
                },
            })
    out.extend(_emit_nodes("WorkflowStep", ws_rows, size))

    # Entity layer
    out.extend(_emit_nodes("BusinessEntity", [
        {"id": e["id"], "source_file": e.get("source_file", ""),
         "props": {"name": e["name"], "type": e.get("type", ""),
                   "stereotype": e.get("stereotype", ""),
                   "has_states": e.get("has_states", False),
                   "description": e.get("description", "")}}
        for e in ir.get("business_entities", [])
    ], size))

    attr_rows: List[Dict[str, Any]] = []
    state_rows: List[Dict[str, Any]] = []
    for e in ir.get("business_entities", []):
        for a in e.get("attributes", []):
            attr_rows.append({"id": a["id"], "source_file": a.get("source_file", ""),
                              "props": {"name": a["name"], "type": a.get("type", ""),
                                        "required": a.get("required", False),
                                        "description": a.get("description", "")}})
        for s in e.get("states", []):
            state_rows.append({"id": s["id"], "source_file": s.get("source_file", ""),
                               "props": {"name": s["name"],
                                         "description": s.get("description", "")}})
    out.extend(_emit_nodes("EntityAttribute", attr_rows, size))
    out.extend(_emit_nodes("EntityState", state_rows, size))

    # Role / Rule / Glossary
    out.extend(_emit_nodes("BusinessRole", [
        {"id": r["id"], "source_file": r.get("source_file", ""),
         "props": {"full_name": r.get("full_name", ""),
                   "department": r.get("department", ""),
                   "responsibilities": r.get("responsibilities", []),
                   "original_id": r.get("original_id") or ""}}
        for r in ir.get("business_roles", [])
    ], size))
    out.extend(_emit_nodes("BusinessRule", [
        {"id": r["id"], "source_file": r.get("source_file", ""),
         "props": {"name": r.get("name", ""), "rule_type": r.get("rule_type", ""),
                   "formulation": r.get("formulation", ""),
                   "severity": r.get("severity", "")}}
        for r in ir.get("business_rules", [])
    ], size))
    out.extend(_emit_nodes("GlossaryTerm", [
        {"id": g["id"], "source_file": g.get("source_file", ""),
         "props": {"term": g.get("term", ""), "definition": g.get("definition", ""),
                   "synonyms": g.get("synonyms", [])}}
        for g in ir.get("glossary_terms", [])
    ], size))

    return out


# ---------------------------------------------------------------------------
# Edge batches

def _edge_batches(ir: Dict[str, Any], size: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # CONTAINS: ProcessGroup -> BusinessProcess
    rows = [{"from": bp["group_id"], "to": bp["id"]}
            for bp in ir.get("business_processes", [])]
    out.extend(_emit_edges("ProcessGroup", "BusinessProcess", "CONTAINS", rows, size))

    # HAS_STEP: BusinessProcess -> WorkflowStep (with order prop)
    rows = []
    has_step_rows = []
    for bp in ir.get("business_processes", []):
        for step in bp.get("workflow", []):
            has_step_rows.append({"from": bp["id"], "to": step["id"],
                                  "rel_props": {"order": step["step_number"]}})
    out.extend(_emit_edges("BusinessProcess", "WorkflowStep", "HAS_STEP",
                           has_step_rows, size, rel_props=["order"]))

    # NEXT_STEP: WorkflowStep -> WorkflowStep
    rows = []
    for bp in ir.get("business_processes", []):
        for step in bp.get("workflow", []):
            for nxt in step.get("next_step_ids", []):
                rows.append({"from": step["id"], "to": nxt})
    out.extend(_emit_edges("WorkflowStep", "WorkflowStep", "NEXT_STEP", rows, size))

    # PERFORMED_BY: WorkflowStep -> BusinessRole
    rows = []
    for bp in ir.get("business_processes", []):
        for step in bp.get("workflow", []):
            if step.get("performer_role_id"):
                rows.append({"from": step["id"], "to": step["performer_role_id"]})
    out.extend(_emit_edges("WorkflowStep", "BusinessRole", "PERFORMED_BY", rows, size))

    # READS / PRODUCES / MODIFIES
    for rel, key in (
        ("READS", "reads_entity_ids"),
        ("PRODUCES", "produces_entity_ids"),
        ("MODIFIES", "modifies_entity_ids"),
    ):
        rows = []
        for bp in ir.get("business_processes", []):
            for step in bp.get("workflow", []):
                for eid in step.get(key, []):
                    rows.append({"from": step["id"], "to": eid})
        out.extend(_emit_edges("WorkflowStep", "BusinessEntity", rel, rows, size))

    # PARTICIPATES_IN: BusinessRole -> BusinessProcess
    rows = []
    for r in ir.get("business_roles", []):
        for bp_id in r.get("participates_in_process_ids", []):
            rows.append({"from": r["id"], "to": bp_id})
    out.extend(_emit_edges("BusinessRole", "BusinessProcess", "PARTICIPATES_IN", rows, size))

    # HAS_ATTRIBUTE / HAS_STATE
    attr_edges: List[Dict[str, Any]] = []
    state_edges: List[Dict[str, Any]] = []
    transition_edges: List[Dict[str, Any]] = []
    for e in ir.get("business_entities", []):
        for a in e.get("attributes", []):
            attr_edges.append({"from": e["id"], "to": a["id"]})
        for s in e.get("states", []):
            state_edges.append({"from": e["id"], "to": s["id"]})
            for t in s.get("transitions_to", []):
                transition_edges.append({
                    "from": s["id"], "to": t["to_id"],
                    "rel_props": {"condition": t.get("condition", "")},
                })
    out.extend(_emit_edges("BusinessEntity", "EntityAttribute", "HAS_ATTRIBUTE",
                           attr_edges, size))
    out.extend(_emit_edges("BusinessEntity", "EntityState", "HAS_STATE",
                           state_edges, size))
    out.extend(_emit_edges("EntityState", "EntityState", "TRANSITIONS_TO",
                           transition_edges, size, rel_props=["condition"]))

    # Rule cross-refs
    for rel, src, dst, key in (
        ("CONSTRAINS", "BusinessRule", "BusinessEntity", "constrains_entity_ids"),
        ("APPLIES_IN", "BusinessRule", "BusinessProcess", "applies_in_process_ids"),
        ("APPLIES_AT_STEP", "BusinessRule", "WorkflowStep", "applies_at_step_ids"),
        ("AFFECTS", "BusinessRule", "EntityAttribute", "affects_attribute_ids"),
    ):
        rows = []
        for r in ir.get("business_rules", []):
            for tid in r.get(key, []):
                rows.append({"from": r["id"], "to": tid})
        out.extend(_emit_edges(src, dst, rel, rows, size))

    # SystemContext children
    sc = ir.get("system_context")
    if sc:
        sys_id = sc["id"]
        out.extend(_emit_edges("SystemContext", "Stakeholder", "HAS_STAKEHOLDER",
                               [{"from": sys_id, "to": s["id"]} for s in ir.get("stakeholders", [])], size))
        out.extend(_emit_edges("SystemContext", "ExternalEntity", "HAS_EXTERNAL_ENTITY",
                               [{"from": sys_id, "to": e["id"]} for e in ir.get("external_entities", [])], size))
        out.extend(_emit_edges("SystemContext", "DataFlow", "HAS_FLOW",
                               [{"from": sys_id, "to": d["id"]} for d in ir.get("data_flows", [])], size))

    return out


# ---------------------------------------------------------------------------
# Batching helpers

def _chunks(rows: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def _emit_nodes(label: str, rows: List[Dict[str, Any]], size: int) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cypher = NODE_CYPHER.format(label=label)
    return [
        {
            "label": label, "kind": "node",
            "cypher": cypher,
            "params": {"rows": chunk},
        }
        for chunk in _chunks(rows, size)
    ]


def _emit_edges(
    src_label: str, dst_label: str, rel_type: str,
    rows: List[Dict[str, Any]], size: int,
    rel_props: List[str] | None = None,
) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cypher = edge_cypher(src_label, dst_label, rel_type, rel_props=rel_props)
    return [
        {
            "label": f"{rel_type} ({src_label}->{dst_label})", "kind": "edge",
            "cypher": cypher,
            "params": {"rows": chunk},
        }
        for chunk in _chunks(rows, size)
    ]


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
