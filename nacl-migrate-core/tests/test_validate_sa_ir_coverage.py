"""Tests for the SC1–SC7 completeness/coverage dimension added to
nacl-migrate-sa/scripts/validate_sa_ir.py.

Background: the SV/HV checks are referential and audit_sa.py only proves
IR→graph fidelity, so neither can see *under-extraction* (the failure mode
where nearly every UC migrates as an empty shell while the audit still
reports "clean"). The coverage dimension measures how much of each node type
was actually populated.

Coverage policy:
  - default  → advisory: prints a Coverage section + writes a "coverage"
               block, but never changes the exit code.
  - --strict → gate at 100%: any metric below threshold exits non-zero.
  - --min-coverage PCT → gate at PCT.

The script is invoked as a subprocess (like test_generate_sa_cypher.py) so
exit codes are observed exactly as a migration / CI would see them.
Everything here is stdlib-only (Python 3.14, no pytest).
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
VALIDATE_SCRIPT = REPO_ROOT / "nacl-migrate-sa" / "scripts" / "validate_sa_ir.py"


# ---------------------------------------------------------------------------
# IR fixture builders — small, self-contained (NOT the real sa-ir.json).

def _uc(uc_id: str, *, steps: int = 1, module: str = "core") -> dict:
    activity_steps = [
        {
            "id": f"{uc_id}-A{n:02d}", "step_number": n,
            "description": f"step {n}", "source_file": "uc.md",
            "actor": None, "next_step_ids": [],
        }
        for n in range(1, steps + 1)
    ]
    return {
        "id": uc_id, "name": uc_id, "source_file": "uc.md",
        "original_id": uc_id, "actor": "", "module": module,
        "priority": "", "iteration": "", "complexity": "", "description": "",
        "ba_trace": [], "preconditions": [], "postconditions": [],
        "main_scenario": [], "activity_steps": activity_steps,
        "form_refs": [], "requirement_refs": [], "depends_on": [],
    }


def _form(form_id: str, *, used_by_uc=(), fields: int = 1) -> dict:
    return {
        "id": form_id, "name": form_id, "source_file": "scr.md",
        "original_id": None, "module": "core",
        "used_by_uc": list(used_by_uc),
        "fields": [
            {
                "id": f"{form_id}-F{n:02d}", "name": f"f{n}",
                "source_file": "scr.md", "type": "", "required": False,
                "maps_to_attribute_id": None,
            }
            for n in range(1, fields + 1)
        ],
    }


def _ir(*, use_cases, forms=None, domain_entities=None, enumerations=None) -> dict:
    return {
        "project_path": "/tmp/fake",
        "adapter": "inline-table-v1",
        "adapter_version": "1.0.0",
        "generated_at": "2026-05-26T00:00:00Z",
        "numbering": "10-16",
        "modules": [{
            "id": "MOD-core", "name": "core", "source_file": "x.md",
            "description": "", "iteration": "", "related_process_ids": [],
        }],
        "use_cases": use_cases,
        "domain_entities": domain_entities or [],
        "enumerations": enumerations or [],
        "forms": forms or [],
        "requirements": [],
        "system_roles": [],
        "warnings": [],
    }


def _handoff() -> dict:
    return {
        "project_path": "/tmp/fake",
        "adapter": "inline-table-v1",
        "adapter_version": "1.0.0",
        "generated_at": "2026-05-26T00:00:00Z",
        "automates_as": [], "realized_as": [], "typed_as": [],
        "mapped_to": [], "implemented_by": [], "suggests": [],
    }


def _run(ir: dict, *extra_args: str):
    """Run validate_sa_ir.py on `ir`; return (returncode, stdout, report_dict)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        ir_path = tmp_path / "sa-ir.json"
        ho_path = tmp_path / "handoff-ir.json"
        out_path = tmp_path / "sa-validation.json"
        ir_path.write_text(json.dumps(ir), encoding="utf-8")
        ho_path.write_text(json.dumps(_handoff()), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(VALIDATE_SCRIPT),
             "--input", str(ir_path),
             "--handoff", str(ho_path),
             "--output", str(out_path),
             *extra_args],
            capture_output=True, text=True,
        )
        report = json.loads(out_path.read_text(encoding="utf-8"))
    return proc.returncode, proc.stdout, report


class FullCoverageTests(unittest.TestCase):
    """(a) Every UC has steps + module + form → all coverage 100%, exit 0."""

    def setUp(self):
        ucs = [_uc("UC-001", steps=2), _uc("UC-002", steps=3), _uc("UC-003", steps=1)]
        forms = [_form("FORM-main", used_by_uc=["UC-001", "UC-002", "UC-003"], fields=2)]
        self.rc, self.out, self.report = _run(_ir(use_cases=ucs, forms=forms))

    def test_exit_zero(self):
        self.assertEqual(self.rc, 0)

    def test_all_metrics_full(self):
        cov = self.report["coverage"]
        for key in ("uc_with_steps", "uc_with_module", "uc_with_form",
                    "form_with_uc", "form_with_fields"):
            self.assertEqual(cov[key]["pct"], 100.0, f"{key} should be 100%")
            self.assertEqual(cov[key]["affected"], 0, f"{key} should have 0 affected")
            self.assertEqual(cov[key]["sample_missing"], [])

    def test_empty_populations_are_vacuously_complete(self):
        # No entities / enums in this IR → 100% (never trips the gate).
        cov = self.report["coverage"]
        for key in ("entity_with_module", "entity_with_attributes", "enum_with_values"):
            self.assertEqual(cov[key]["total"], 0)
            self.assertEqual(cov[key]["pct"], 100.0)

    def test_no_missing_lines_in_output(self):
        self.assertIn("Coverage", self.out)
        self.assertNotIn("missing:", self.out)

    def test_gate_not_active_by_default(self):
        self.assertFalse(self.report["coverage_gate"]["strict"])
        self.assertEqual(self.report["coverage_gate"]["below_threshold"], [])


class UnderExtractedAdvisoryTests(unittest.TestCase):
    """(b) Some empty UCs → correct affected/pct, advisory, exit STILL 0."""

    def setUp(self):
        # 1 of 4 UCs has steps; modules all present; 1 of 4 referenced by a form.
        ucs = [
            _uc("UC-001", steps=3),
            _uc("UC-002", steps=0),
            _uc("UC-003", steps=0),
            _uc("UC-004", steps=0),
        ]
        forms = [_form("FORM-one", used_by_uc=["UC-001"], fields=1)]
        self.rc, self.out, self.report = _run(_ir(use_cases=ucs, forms=forms))

    def test_exit_zero_by_default(self):
        self.assertEqual(self.rc, 0, "advisory coverage must not fail the run")

    def test_step_coverage_numbers(self):
        m = self.report["coverage"]["uc_with_steps"]
        self.assertEqual(m["total"], 4)
        self.assertEqual(m["covered"], 1)
        self.assertEqual(m["affected"], 3)
        self.assertEqual(m["pct"], 25.0)
        self.assertEqual(sorted(m["sample_missing"]), ["UC-002", "UC-003", "UC-004"])

    def test_form_coverage_numbers(self):
        m = self.report["coverage"]["uc_with_form"]
        self.assertEqual(m["covered"], 1)
        self.assertEqual(m["affected"], 3)

    def test_referential_checks_still_pass(self):
        # The SV/HV checks are blind to under-extraction — they must report
        # 13/13 even though coverage is poor (this is the documented blind spot).
        self.assertEqual(self.report["summary"]["failed"], 0)

    def test_advisory_lines_present(self):
        self.assertIn("UC activity steps: 1/4 (25.0%)", self.out)
        self.assertIn("missing:", self.out)


class StrictGateTests(unittest.TestCase):
    """(c) Same under-extracted IR with --strict / --min-coverage gates."""

    def _under_extracted_ir(self) -> dict:
        ucs = [
            _uc("UC-001", steps=3),
            _uc("UC-002", steps=0),
            _uc("UC-003", steps=0),
            _uc("UC-004", steps=0),
        ]
        forms = [_form("FORM-one", used_by_uc=["UC-001"], fields=1)]
        return _ir(use_cases=ucs, forms=forms)

    def test_strict_exits_non_zero(self):
        rc, out, report = _run(self._under_extracted_ir(), "--strict")
        self.assertNotEqual(rc, 0)
        self.assertTrue(report["coverage_gate"]["strict"])
        self.assertEqual(report["coverage_gate"]["threshold"], 100.0)
        self.assertIn("uc_with_steps", report["coverage_gate"]["below_threshold"])
        self.assertIn("COVERAGE GATE FAILED", out)

    def test_min_coverage_below_threshold_fails(self):
        rc, _out, report = _run(self._under_extracted_ir(), "--min-coverage", "50")
        self.assertNotEqual(rc, 0)
        self.assertEqual(report["coverage_gate"]["threshold"], 50.0)
        self.assertIn("uc_with_steps", report["coverage_gate"]["below_threshold"])

    def test_min_coverage_lenient_threshold_passes(self):
        # SC1 is 25% here; a 20% threshold clears it → exit 0.
        rc, _out, report = _run(self._under_extracted_ir(), "--min-coverage", "20")
        self.assertEqual(rc, 0)
        self.assertEqual(report["coverage_gate"]["below_threshold"], [])

    def test_min_coverage_overrides_strict(self):
        rc, _out, report = _run(
            self._under_extracted_ir(), "--strict", "--min-coverage", "20")
        self.assertEqual(rc, 0, "--min-coverage must override --strict's 100% default")
        self.assertEqual(report["coverage_gate"]["threshold"], 20.0)

    def test_full_coverage_passes_strict(self):
        ucs = [_uc("UC-001", steps=1), _uc("UC-002", steps=1)]
        forms = [_form("FORM-a", used_by_uc=["UC-001", "UC-002"], fields=1)]
        rc, _out, report = _run(_ir(use_cases=ucs, forms=forms), "--strict")
        self.assertEqual(rc, 0)
        self.assertEqual(report["coverage_gate"]["below_threshold"], [])


class SampleCapTests(unittest.TestCase):
    """(d) sample_missing is capped at 10 ids regardless of how many fail."""

    def setUp(self):
        ucs = [_uc(f"UC-{n:03d}", steps=0) for n in range(1, 16)]  # 15 empty UCs
        self.rc, _out, self.report = _run(_ir(use_cases=ucs))

    def test_sample_capped_at_ten(self):
        m = self.report["coverage"]["uc_with_steps"]
        self.assertEqual(m["total"], 15)
        self.assertEqual(m["affected"], 15)
        self.assertEqual(len(m["sample_missing"]), 10)

    def test_exit_zero_default(self):
        self.assertEqual(self.rc, 0)


class SevereUnderExtractionTests(unittest.TestCase):
    """A severely under-extracted shape: 1 of 50 UCs with steps reads 2.0%,
    advisory (exit 0) — the kind of gap a clean count-parity audit hides."""

    def setUp(self):
        ucs = [_uc("UC-001", steps=4)] + [
            _uc(f"UC-{n:03d}", steps=0) for n in range(2, 51)
        ]
        self.rc, self.out, self.report = _run(_ir(use_cases=ucs))

    def test_one_of_fifty(self):
        m = self.report["coverage"]["uc_with_steps"]
        self.assertEqual(m["total"], 50)
        self.assertEqual(m["covered"], 1)
        self.assertEqual(m["pct"], 2.0)
        self.assertIn("UC activity steps: 1/50 (2.0%)", self.out)

    def test_default_exit_still_zero(self):
        self.assertEqual(self.rc, 0)


class FormSideCoverageTests(unittest.TestCase):
    """SC3f: forms whose used_by_uc is empty or all-unresolved (USES_FORM=0)."""

    def test_unresolved_and_empty_forms_flagged(self):
        ucs = [_uc("UC-001", steps=1)]
        forms = [
            _form("FORM-ok", used_by_uc=["UC-001"]),       # resolves
            _form("FORM-empty", used_by_uc=[]),            # empty
            _form("FORM-ghost", used_by_uc=["UC-999"]),    # unresolved
        ]
        _rc, _out, report = _run(_ir(use_cases=ucs, forms=forms))
        m = report["coverage"]["form_with_uc"]
        self.assertEqual(m["total"], 3)
        self.assertEqual(m["covered"], 1)
        self.assertEqual(sorted(m["sample_missing"]), ["FORM-empty", "FORM-ghost"])


class EntityEnumCoverageTests(unittest.TestCase):
    """SC4/SC5/SC6: domain entity + enum completeness metrics."""

    def test_entity_and_enum_metrics(self):
        ucs = [_uc("UC-001", steps=1)]
        entities = [
            {"id": "DE-a", "name": "A", "source_file": "a.md", "module": "core",
             "stereotypes": [], "description": "",
             "attributes": [{"id": "DE-a-A01", "name": "x", "source_file": "a.md",
                             "type": "", "required": False, "description": "",
                             "constraints": ""}],
             "relates_to": [], "enumeration_refs": [], "ba_trace": []},
            {"id": "DE-b", "name": "B", "source_file": "b.md", "module": "",
             "stereotypes": [], "description": "", "attributes": [],
             "relates_to": [], "enumeration_refs": [], "ba_trace": []},
        ]
        enums = [
            {"id": "EN-x", "name": "X", "source_file": "x.md", "description": "",
             "values": [{"id": "EN-x-V01", "value": "a", "source_file": "x.md",
                         "description": ""}], "ba_trace": []},
            {"id": "EN-y", "name": "Y", "source_file": "y.md", "description": "",
             "values": [], "ba_trace": []},
        ]
        _rc, _out, report = _run(
            _ir(use_cases=ucs, domain_entities=entities, enumerations=enums))
        cov = report["coverage"]
        # DE-b has blank module
        self.assertEqual(cov["entity_with_module"]["covered"], 1)
        self.assertEqual(cov["entity_with_module"]["sample_missing"], ["DE-b"])
        # DE-b has no attributes
        self.assertEqual(cov["entity_with_attributes"]["covered"], 1)
        self.assertEqual(cov["entity_with_attributes"]["sample_missing"], ["DE-b"])
        # EN-y has no values
        self.assertEqual(cov["enum_with_values"]["covered"], 1)
        self.assertEqual(cov["enum_with_values"]["sample_missing"], ["EN-y"])


if __name__ == "__main__":
    unittest.main()
