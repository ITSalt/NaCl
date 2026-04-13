"""Regression tests for nacl-migrate-sa/scripts/generate_sa_cypher.py.

BLOCKER-1 + BLOCKER-2 (kartov-orders retrospective): the Cypher plan emitted
by generate_sa_cypher.py must include ``ba_trace`` in the per-row props for
both DomainEntity and Enumeration node batches. Prior versions silently
dropped the field, so every DomainEntity/Enumeration landed in the graph
without traceability metadata.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATE_SCRIPT = REPO_ROOT / "nacl-migrate-sa" / "scripts" / "generate_sa_cypher.py"


def _minimal_ir() -> dict:
    return {
        "project_path": "/tmp/fake",
        "adapter": "frontmatter-v1",
        "adapter_version": "1.0.0",
        "generated_at": "2026-04-12T00:00:00Z",
        "numbering": "10-16",
        "modules": [
            {"id": "MOD-core", "name": "core", "source_file": "x.md",
             "description": "", "iteration": "", "related_process_ids": []},
        ],
        "use_cases": [],
        "domain_entities": [
            {
                "id": "DE-sample", "name": "Sample", "source_file": "e.md",
                "module": "core", "stereotypes": [], "description": "",
                "attributes": [], "relates_to": [], "enumeration_refs": [],
                "ba_trace": ["OBJ-001", "OBJ-002"],
            },
        ],
        "enumerations": [
            {
                "id": "EN-sample", "name": "Sample", "source_file": "en.md",
                "description": "", "values": [],
                "ba_trace": ["ROL-01", "ROL-02"],
            },
        ],
        "forms": [],
        "requirements": [],
        "system_roles": [
            {
                "id": "SYSROL-ANALYST", "name": "ANALYST",
                "source_file": "r.md",
                "description": "Аналитик данных",
                "auth": "", "iteration": "",
                "ba_trace": ["ROL-02"],
            },
        ],
        "warnings": [],
    }


def _empty_handoff() -> dict:
    return {
        "project_path": "/tmp/fake",
        "adapter": "frontmatter-v1",
        "adapter_version": "1.0.0",
        "generated_at": "2026-04-12T00:00:00Z",
        "automates_as": [],
        "realized_as": [],
        "typed_as": [],
        "mapped_to": [],
        "implemented_by": [],
    }


class CypherPropsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        tmp = Path(cls._tmp.name)
        ir_path = tmp / "ir.json"
        handoff_path = tmp / "handoff.json"
        out_path = tmp / "plan.json"
        ir_path.write_text(json.dumps(_minimal_ir()), encoding="utf-8")
        handoff_path.write_text(json.dumps(_empty_handoff()), encoding="utf-8")
        subprocess.run(
            [sys.executable, str(GENERATE_SCRIPT),
             "--input", str(ir_path),
             "--handoff", str(handoff_path),
             "--output", str(out_path)],
            check=True, capture_output=True,
        )
        cls.plan = json.loads(out_path.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def _find_batch(self, label: str) -> dict:
        for b in self.plan["batches"]:
            if b.get("kind") == "node" and b.get("label") == label:
                return b
        self.fail(f"no node batch for label {label!r}")

    def test_domain_entity_ba_trace_in_props(self):
        """BLOCKER-1: DomainEntity props must carry ba_trace."""
        batch = self._find_batch("DomainEntity")
        rows = batch["params"]["rows"]
        self.assertEqual(len(rows), 1)
        props = rows[0]["props"]
        self.assertIn("ba_trace", props,
                      "DomainEntity props dropped ba_trace (BLOCKER-1 regressed)")
        self.assertEqual(props["ba_trace"], ["OBJ-001", "OBJ-002"])

    def test_enumeration_ba_trace_in_props(self):
        """BLOCKER-2 coupled: Enumeration props must carry ba_trace."""
        batch = self._find_batch("Enumeration")
        rows = batch["params"]["rows"]
        self.assertEqual(len(rows), 1)
        props = rows[0]["props"]
        self.assertIn("ba_trace", props,
                      "Enumeration props dropped ba_trace (BLOCKER-2 regressed)")
        self.assertEqual(props["ba_trace"], ["ROL-01", "ROL-02"])

    def test_system_role_description_in_props(self):
        """Round-3 regression: SystemRole props must carry description
        (previously dropped by the Cypher writer; IR already populated it)."""
        batch = self._find_batch("SystemRole")
        rows = batch["params"]["rows"]
        self.assertEqual(len(rows), 1)
        props = rows[0]["props"]
        self.assertIn("description", props,
                      "SystemRole props dropped description (regressed)")
        self.assertEqual(props["description"], "Аналитик данных")


if __name__ == "__main__":
    unittest.main()
