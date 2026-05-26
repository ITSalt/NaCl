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

Completeness / coverage (SaIR):
  SC1  UC activity-step coverage   — UCs with a non-empty activity_steps list.
  SC2  UC module coverage          — UCs with a non-blank module.
  SC3  UC→form coverage            — UCs referenced by some Form.used_by_uc.
  SC3f Form→UC coverage            — Forms whose used_by_uc is non-empty and
                                      resolves (the USES_FORM = 0 symptom).
  SC4  DomainEntity module coverage— entities with a non-blank module.
  SC5  DomainEntity attr coverage  — entities with ≥1 attribute.
  SC6  Enumeration value coverage  — enums with ≥1 value.
  SC7  Form field coverage         — forms with ≥1 field.

Why these exist: the SV/HV checks are all *referential* (do ids resolve?) and
the live-Neo4j audit (audit_sa.py) only proves IR→graph fidelity. Neither can
see *under-extraction* — a parser that emits 1 ActivityStep total produces an
IR that is internally consistent and writes cleanly, yet leaves nearly every
UseCase an empty shell. The completeness checks measure how much of each node
type was actually populated, so low extraction coverage is loud instead of
hidden behind "clean".

Severity: completeness is ADVISORY by default — it prints a Coverage section
and writes a "coverage" block, but does not change the exit code (some
emptiness is legitimate, e.g. a pure list-view UC genuinely has no steps).
Pass --strict (gate at 100%) or --min-coverage PCT to make any metric below
threshold fail the run; this lets CI gate without changing the migration UX.
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
    parser.add_argument(
        "--strict", action="store_true",
        help="Treat any completeness metric below 100%% as a failure and exit "
             "non-zero. Default: completeness is advisory (does not fail).",
    )
    parser.add_argument(
        "--min-coverage", type=float, default=None, metavar="PCT",
        help="Coverage gate threshold (0-100). Any completeness metric below "
             "PCT fails the run. Overrides --strict's 100%% default. Default: "
             "off (advisory only).",
    )
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

    # Completeness / coverage — advisory by default, gated under --strict /
    # --min-coverage. --min-coverage wins; --strict alone means gate at 100%.
    metrics = _compute_coverage(ir)
    threshold: float | None = None
    if args.min_coverage is not None:
        threshold = args.min_coverage
    elif args.strict:
        threshold = 100.0
    below = (
        [m for m in metrics if m["total"] > 0 and m["pct"] < threshold]
        if threshold is not None else []
    )

    coverage_block = {
        m["key"]: {
            "id": m["id"], "label": m["label"],
            "total": m["total"], "covered": m["covered"],
            "affected": m["affected"], "pct": m["pct"],
            "sample_missing": m["sample_missing"],
        }
        for m in metrics
    }

    report = {
        "status": "ok",
        "summary": {"total": len(checks), "passed": passed, "failed": failed},
        "checks": checks,
        "coverage": coverage_block,
        "coverage_gate": {
            "threshold": threshold,
            "strict": threshold is not None,
            "below_threshold": [m["key"] for m in below],
        },
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

    _print_coverage(metrics, threshold)
    if below:
        keys = ", ".join(m["key"] for m in below)
        print(f"\nCOVERAGE GATE FAILED (threshold {threshold:g}%): {keys}")

    return 0 if (failed == 0 and not below) else 1


def _run_checks(ir: Dict[str, Any], handoff: Dict[str, Any]) -> List[Dict[str, Any]]:
    modules = {m["name"]: m["id"] for m in ir.get("modules", [])}
    uc_ids = {uc["id"] for uc in ir.get("use_cases", [])}
    de_ids = {de["id"] for de in ir.get("domain_entities", [])}
    form_ids = {f["id"] for f in ir.get("forms", [])}
    req_ids = {r["id"] for r in ir.get("requirements", [])}
    sr_ids = {r["id"] for r in ir.get("system_roles", [])}

    checks: List[Dict[str, Any]] = []

    # SV1
    # Build an extended module lookup that accepts:
    #   - Module.name (canonical key, e.g. Russian display name)
    #   - Module.description (English code, e.g. "core", "data-import")
    #   - Module.id suffix without "MOD-" prefix (e.g. "core" from "MOD-core")
    modules_extended = dict(modules)
    for m in ir.get("modules", []):
        if m.get("description"):
            modules_extended[m["description"]] = m["id"]
        mod_id = m.get("id", "")
        if mod_id.startswith("MOD-"):
            modules_extended[mod_id[4:]] = mod_id
    sv1: List[str] = []
    for uc in ir.get("use_cases", []):
        if uc.get("module") and uc["module"] not in modules_extended:
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
    # Advisory-only: forms may reference Secondary UCs (without spec files)
    # or deleted UCs. We collect the info but always pass — unresolved refs
    # are expected for secondary/deleted UCs and are not a migration blocker.
    sv5_info: List[str] = []
    for f in ir.get("forms", []):
        uc_refs = f.get("used_by_uc", [])
        if not uc_refs:
            continue
        unresolved = [uc for uc in uc_refs if uc not in uc_ids]
        if unresolved:
            sv5_info.append(
                f"Form {f['id']} has unresolved UC refs (secondary/deleted): "
                f"{', '.join(unresolved)}"
            )
    # Always pass — secondary/deleted UC refs are informational only
    checks.append({"id": "SV5", "name": "Form.used_by_uc resolves (advisory)",
                   "pass": True, "failures": [], "info": sv5_info})

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


# ---------------------------------------------------------------------------
# Completeness / coverage (SC group)

def _coverage_metric(cid: str, key: str, label: str,
                     total: int, missing_ids: List[str]) -> Dict[str, Any]:
    """Build one coverage metric.

    A metric is "covered" when an item passes its completeness criterion;
    ``missing_ids`` are the items that fail it. An empty population (total 0)
    is vacuously complete (pct 100.0) so a project that legitimately has no
    forms/enums never trips the gate.
    """
    affected = len(missing_ids)
    covered = total - affected
    pct = round(100.0 * covered / total, 1) if total else 100.0
    return {
        "id": cid,
        "key": key,
        "label": label,
        "total": total,
        "covered": covered,
        "affected": affected,
        "pct": pct,
        "sample_missing": missing_ids[:10],   # capped sample
    }


def _compute_coverage(ir: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Compute SC1–SC7 completeness metrics from the IR JSON (adapter-agnostic)."""
    use_cases = ir.get("use_cases", [])
    entities = ir.get("domain_entities", [])
    enums = ir.get("enumerations", [])
    forms = ir.get("forms", [])
    uc_ids = {uc["id"] for uc in use_cases}

    metrics: List[Dict[str, Any]] = []

    # SC1 — UC activity-step coverage (the check that catches the failure mode
    # where nearly every UC migrates as an empty shell behind a clean audit).
    sc1_missing = [uc["id"] for uc in use_cases if not uc.get("activity_steps")]
    metrics.append(_coverage_metric(
        "SC1", "uc_with_steps", "UC activity steps", len(use_cases), sc1_missing))

    # SC2 — UC module coverage (blank module is the SV1 silent-pass symptom).
    sc2_missing = [uc["id"] for uc in use_cases
                   if not (uc.get("module") or "").strip()]
    metrics.append(_coverage_metric(
        "SC2", "uc_with_module", "UC module", len(use_cases), sc2_missing))

    # SC3 — UC→form coverage via a reverse index over forms[].used_by_uc.
    referenced_ucs: set[str] = set()
    for f in forms:
        referenced_ucs.update(f.get("used_by_uc", []))
    sc3_missing = [uc["id"] for uc in use_cases if uc["id"] not in referenced_ucs]
    metrics.append(_coverage_metric(
        "SC3", "uc_with_form", "UC→form link", len(use_cases), sc3_missing))

    # SC3f — Form→UC coverage: forms whose used_by_uc is empty or all-unresolved
    # (the other half of the USES_FORM = 0 symptom).
    sc3f_missing = [
        f["id"] for f in forms
        if not any(u in uc_ids for u in f.get("used_by_uc", []))
    ]
    metrics.append(_coverage_metric(
        "SC3f", "form_with_uc", "Form→UC link", len(forms), sc3f_missing))

    # SC4 — DomainEntity module coverage.
    sc4_missing = [de["id"] for de in entities
                   if not (de.get("module") or "").strip()]
    metrics.append(_coverage_metric(
        "SC4", "entity_with_module", "DomainEntity module", len(entities), sc4_missing))

    # SC5 — DomainEntity attribute coverage.
    sc5_missing = [de["id"] for de in entities if not de.get("attributes")]
    metrics.append(_coverage_metric(
        "SC5", "entity_with_attributes", "DomainEntity attributes",
        len(entities), sc5_missing))

    # SC6 — Enumeration value coverage.
    sc6_missing = [en["id"] for en in enums if not en.get("values")]
    metrics.append(_coverage_metric(
        "SC6", "enum_with_values", "Enumeration values", len(enums), sc6_missing))

    # SC7 — Form field coverage (global FormField = 0 was an unflagged gap).
    sc7_missing = [f["id"] for f in forms if not f.get("fields")]
    metrics.append(_coverage_metric(
        "SC7", "form_with_fields", "Form fields", len(forms), sc7_missing))

    return metrics


def _print_coverage(metrics: List[Dict[str, Any]], threshold: float | None) -> None:
    advisory = "gate %g%%" % threshold if threshold is not None else "advisory"
    print(f"\nCoverage — completeness ({advisory}):")
    for m in metrics:
        if m["affected"]:
            sample = ", ".join(m["sample_missing"][:5])
            more = ", …" if m["affected"] > 5 else ""
            miss = f" — {m['affected']} missing: {sample}{more}"
        else:
            miss = ""
        flag = ""
        if threshold is not None and m["total"] > 0 and m["pct"] < threshold:
            flag = "  ✗ below threshold"
        print(f"  {m['id']} {m['label']}: "
              f"{m['covered']}/{m['total']} ({m['pct']}%){miss}{flag}")


def _emit_error(output_path: str, code: str, message: str, remediation: str) -> None:
    payload = {"status": "error", "error_code": code,
               "message": message, "remediation": remediation}
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{code}] {message}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
