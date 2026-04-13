#!/usr/bin/env python3
"""generate_sa_cypher.py — emit batched Cypher statements from SaIR + HandoffIR.

Produces a JSON plan that the SKILL executes via mcp__neo4j__write-cypher.
Never connects to Neo4j.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List


BATCH_SIZE = 100


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


def edge_cypher(src_label: str, dst_label: str, rel_type: str,
                rel_props: List[str] | None = None) -> str:
    set_clause = ""
    if rel_props:
        set_clause = "\nON CREATE SET r += row.rel_props\nON MATCH  SET r += row.rel_props"
    return (
        f"UNWIND $rows AS row\n"
        f"MATCH (a:{src_label} {{id: row.from}})\n"
        f"MATCH (b:{dst_label} {{id: row.to}})\n"
        f"MERGE (a)-[r:{rel_type}]->(b)"
        f"{set_clause}\n"
        f"RETURN count(r) AS n"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Cypher plan from SaIR + HandoffIR.")
    parser.add_argument("--input", required=True, help="Path to sa-ir.json")
    parser.add_argument("--handoff", required=True, help="Path to handoff-ir.json")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args(argv)

    for label, p in (("input", args.input), ("handoff", args.handoff)):
        if not Path(p).is_file():
            _emit_error(args.output, "INPUT_MISSING",
                        f"{label} file not found: {p}", "Run parse_sa.py first.")
            return 3

    ir = json.loads(Path(args.input).read_text(encoding="utf-8"))
    handoff = json.loads(Path(args.handoff).read_text(encoding="utf-8"))

    batches: List[Dict[str, Any]] = []
    batches.extend(_node_batches(ir, args.batch_size))
    batches.extend(_edge_batches(ir, args.batch_size))
    batches.extend(_handoff_batches(handoff, args.batch_size))

    node_count = sum(1 for b in batches if b["kind"] == "node")
    edge_count = sum(1 for b in batches if b["kind"] == "edge")
    handoff_count = sum(1 for b in batches if b["kind"] == "handoff")
    total_rows = sum(len(b["params"]["rows"]) for b in batches)

    payload = {
        "status": "ok",
        "summary": {
            "node_batches":    node_count,
            "edge_batches":    edge_count,
            "handoff_batches": handoff_count,
            "total_rows":      total_rows,
        },
        "batches": batches,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Cypher plan: {node_count} node, {edge_count} edge, {handoff_count} handoff batches, "
          f"{total_rows} rows total")
    return 0


# ---------------------------------------------------------------------------
# Nodes

def _node_batches(ir: Dict[str, Any], size: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    out.extend(_emit_nodes("Module", [
        {"id": m["id"], "source_file": m.get("source_file", ""),
         "props": {"name": m["name"], "description": m.get("description", ""),
                   "iteration": m.get("iteration", ""),
                   "related_process_ids": m.get("related_process_ids", [])}}
        for m in ir.get("modules", [])
    ], size))

    out.extend(_emit_nodes("UseCase", [
        {"id": uc["id"], "source_file": uc.get("source_file", ""),
         "props": {"name": uc.get("name", ""), "actor": uc.get("actor", ""),
                   "module": uc.get("module", ""), "priority": uc.get("priority", ""),
                   "iteration": uc.get("iteration", ""), "complexity": uc.get("complexity", ""),
                   "description": uc.get("description", ""),
                   "ba_trace": uc.get("ba_trace", []),
                   "original_id": uc.get("original_id") or ""}}
        for uc in ir.get("use_cases", [])
    ], size))

    step_rows: List[Dict[str, Any]] = []
    for uc in ir.get("use_cases", []):
        for s in uc.get("activity_steps", []):
            step_rows.append({
                "id": s["id"], "source_file": s.get("source_file", ""),
                "props": {"step_number": s["step_number"],
                          "description": s.get("description", ""),
                          "actor": s.get("actor") or ""},
            })
    out.extend(_emit_nodes("ActivityStep", step_rows, size))

    out.extend(_emit_nodes("DomainEntity", [
        {"id": de["id"], "source_file": de.get("source_file", ""),
         "props": {"name": de["name"], "module": de.get("module", ""),
                   "description": de.get("description", ""),
                   "stereotypes": de.get("stereotypes", []),
                   "ba_trace": de.get("ba_trace", [])}}
        for de in ir.get("domain_entities", [])
    ], size))

    attr_rows: List[Dict[str, Any]] = []
    for de in ir.get("domain_entities", []):
        for a in de.get("attributes", []):
            attr_rows.append({"id": a["id"], "source_file": a.get("source_file", ""),
                              "props": {"name": a["name"], "type": a.get("type", ""),
                                        "required": a.get("required", False),
                                        "description": a.get("description", ""),
                                        "constraints": a.get("constraints", "")}})
    out.extend(_emit_nodes("DomainAttribute", attr_rows, size))

    out.extend(_emit_nodes("Enumeration", [
        {"id": en["id"], "source_file": en.get("source_file", ""),
         "props": {"name": en["name"], "description": en.get("description", ""),
                   "ba_trace": en.get("ba_trace", [])}}
        for en in ir.get("enumerations", [])
    ], size))

    val_rows: List[Dict[str, Any]] = []
    for en in ir.get("enumerations", []):
        for v in en.get("values", []):
            val_rows.append({"id": v["id"], "source_file": v.get("source_file", ""),
                             "props": {"value": v["value"],
                                       "description": v.get("description", "")}})
    out.extend(_emit_nodes("EnumValue", val_rows, size))

    out.extend(_emit_nodes("Form", [
        {"id": f["id"], "source_file": f.get("source_file", ""),
         "props": {"name": f["name"], "module": f.get("module", ""),
                   "original_id": f.get("original_id") or ""}}
        for f in ir.get("forms", [])
    ], size))

    out.extend(_emit_nodes("Requirement", [
        {"id": r["id"], "source_file": r.get("source_file", ""),
         "props": {"description": r.get("description", ""),
                   "kind": r.get("kind", ""), "priority": r.get("priority", ""),
                   "uc_ids": r.get("uc_ids", []),
                   "ba_trace": r.get("ba_trace", [])}}
        for r in ir.get("requirements", [])
    ], size))

    out.extend(_emit_nodes("SystemRole", [
        {"id": r["id"], "source_file": r.get("source_file", ""),
         "props": {"name": r["name"],
                   "description": r.get("description", ""),
                   "auth": r.get("auth", ""),
                   "iteration": r.get("iteration", ""),
                   "ba_trace": r.get("ba_trace", [])}}
        for r in ir.get("system_roles", [])
    ], size))

    return out


# ---------------------------------------------------------------------------
# SA-internal relationships

def _edge_batches(ir: Dict[str, Any], size: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # CONTAINS_UC: Module -> UseCase, resolve by module name
    mod_by_name = {m["name"]: m["id"] for m in ir.get("modules", [])}
    contains_uc = []
    for uc in ir.get("use_cases", []):
        if uc.get("module") and uc["module"] in mod_by_name:
            contains_uc.append({"from": mod_by_name[uc["module"]], "to": uc["id"]})
    out.extend(_emit_edges("Module", "UseCase", "CONTAINS_UC", contains_uc, size))

    # CONTAINS_ENTITY: Module -> DomainEntity, resolve by module name
    contains_entity = []
    for de in ir.get("domain_entities", []):
        if de.get("module") and de["module"] in mod_by_name:
            contains_entity.append({"from": mod_by_name[de["module"]], "to": de["id"]})
    out.extend(_emit_edges("Module", "DomainEntity", "CONTAINS_ENTITY", contains_entity, size))

    # HAS_STEP: UseCase -> ActivityStep
    has_step_rows = []
    for uc in ir.get("use_cases", []):
        for s in uc.get("activity_steps", []):
            has_step_rows.append({"from": uc["id"], "to": s["id"],
                                  "rel_props": {"order": s["step_number"]}})
    out.extend(_emit_edges("UseCase", "ActivityStep", "HAS_STEP",
                           has_step_rows, size, rel_props=["order"]))

    # HAS_REQUIREMENT: UseCase -> Requirement (via Requirement.uc_ids)
    uc_set = {uc["id"] for uc in ir.get("use_cases", [])}
    has_req = []
    for r in ir.get("requirements", []):
        for uc_id in r.get("uc_ids", []):
            if uc_id in uc_set:
                has_req.append({"from": uc_id, "to": r["id"]})
    out.extend(_emit_edges("UseCase", "Requirement", "HAS_REQUIREMENT", has_req, size))

    # HAS_ATTRIBUTE: DomainEntity -> DomainAttribute
    has_attr = []
    for de in ir.get("domain_entities", []):
        for a in de.get("attributes", []):
            has_attr.append({"from": de["id"], "to": a["id"]})
    out.extend(_emit_edges("DomainEntity", "DomainAttribute", "HAS_ATTRIBUTE", has_attr, size))

    # HAS_VALUE: Enumeration -> EnumValue
    has_val = []
    for en in ir.get("enumerations", []):
        for v in en.get("values", []):
            has_val.append({"from": en["id"], "to": v["id"]})
    out.extend(_emit_edges("Enumeration", "EnumValue", "HAS_VALUE", has_val, size))

    # HAS_ENUM: DomainEntity -> Enumeration (only where the enum id exists)
    en_set = {en["id"] for en in ir.get("enumerations", [])}
    has_enum = []
    for de in ir.get("domain_entities", []):
        for en_ref in de.get("enumeration_refs", []):
            if en_ref in en_set:
                has_enum.append({"from": de["id"], "to": en_ref})
    out.extend(_emit_edges("DomainEntity", "Enumeration", "HAS_ENUM", has_enum, size))

    # USES_FORM: UseCase -> Form (via Form.used_by_uc)
    form_set = {f["id"] for f in ir.get("forms", [])}
    uses_form = []
    for f in ir.get("forms", []):
        for uc_id in f.get("used_by_uc", []):
            if uc_id in uc_set:
                uses_form.append({"from": uc_id, "to": f["id"]})
    out.extend(_emit_edges("UseCase", "Form", "USES_FORM", uses_form, size))

    return out


# ---------------------------------------------------------------------------
# Cross-layer handoff

def _handoff_batches(handoff: Dict[str, Any], size: int) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # AUTOMATES_AS — split by source-label based on ID shape
    bp_rows = []
    ws_rows = []
    for e in handoff.get("automates_as", []):
        if "-S" in e["from_id"]:
            ws_rows.append({"from": e["from_id"], "to": e["to_id"]})
        else:
            bp_rows.append({"from": e["from_id"], "to": e["to_id"]})
    out.extend(_emit_handoff("BusinessProcess", "UseCase", "AUTOMATES_AS", bp_rows, size))
    out.extend(_emit_handoff("WorkflowStep", "UseCase", "AUTOMATES_AS", ws_rows, size))

    # REALIZED_AS: BusinessEntity -> DomainEntity
    rows = [{"from": e["from_id"], "to": e["to_id"]} for e in handoff.get("realized_as", [])]
    out.extend(_emit_handoff("BusinessEntity", "DomainEntity", "REALIZED_AS", rows, size))

    # TYPED_AS: EntityAttribute -> DomainAttribute
    rows = [{"from": e["from_id"], "to": e["to_id"]} for e in handoff.get("typed_as", [])]
    out.extend(_emit_handoff("EntityAttribute", "DomainAttribute", "TYPED_AS", rows, size))

    # MAPPED_TO: BusinessRole -> SystemRole
    rows = [{"from": e["from_id"], "to": e["to_id"]} for e in handoff.get("mapped_to", [])]
    out.extend(_emit_handoff("BusinessRole", "SystemRole", "MAPPED_TO", rows, size))

    # IMPLEMENTED_BY: BusinessRule -> Requirement
    rows = [{"from": e["from_id"], "to": e["to_id"]} for e in handoff.get("implemented_by", [])]
    out.extend(_emit_handoff("BusinessRule", "Requirement", "IMPLEMENTED_BY", rows, size))

    # SUGGESTS: ProcessGroup -> Module (skipped here; emitted by the skill via
    # a Cypher derived from Module.related_process_ids + BA's CONTAINS.)

    return out


# ---------------------------------------------------------------------------

def _chunks(rows: List[Dict[str, Any]], size: int) -> Iterable[List[Dict[str, Any]]]:
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def _emit_nodes(label: str, rows: List[Dict[str, Any]], size: int) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cypher = NODE_CYPHER.format(label=label)
    return [{"label": label, "kind": "node", "cypher": cypher,
             "params": {"rows": chunk}} for chunk in _chunks(rows, size)]


def _emit_edges(src_label: str, dst_label: str, rel_type: str,
                rows: List[Dict[str, Any]], size: int,
                rel_props: List[str] | None = None) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cypher = edge_cypher(src_label, dst_label, rel_type, rel_props=rel_props)
    return [{"label": f"{rel_type} ({src_label}->{dst_label})", "kind": "edge",
             "cypher": cypher, "params": {"rows": chunk}}
            for chunk in _chunks(rows, size)]


def _emit_handoff(src_label: str, dst_label: str, rel_type: str,
                   rows: List[Dict[str, Any]], size: int) -> List[Dict[str, Any]]:
    if not rows:
        return []
    cypher = edge_cypher(src_label, dst_label, rel_type)
    return [{"label": f"{rel_type} ({src_label}->{dst_label})", "kind": "handoff",
             "cypher": cypher, "params": {"rows": chunk}}
            for chunk in _chunks(rows, size)]


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
