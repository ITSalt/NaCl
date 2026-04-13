"""Regression tests for the inline_table_v1 adapter against family-cinema.

Uses real fixtures shipped under tests/fixtures/inline-table/. Keeps expected
counts small enough to be easy to maintain but precise enough to catch a
regression in parsing (e.g. the section-fullmatch fix).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.adapters.inline_table_v1 import (
    InlineTableV1BaAdapter,
    _parse_workflow_table,
)


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "inline-table"


class DetectTests(unittest.TestCase):
    def test_detect_on_inline_table_samples(self):
        samples = sorted((FIXTURES / "entities").glob("*.md"))
        self.assertTrue(samples, "Expected fixtures under fixtures/inline-table/entities")
        confidence = InlineTableV1BaAdapter.detect(samples)
        self.assertGreaterEqual(confidence, 0.8)

    def test_detect_rejects_frontmatter_files(self):
        samples = sorted((FIXTURES / "frontmatter-samples").glob("*.md"))
        if not samples:
            self.skipTest("no frontmatter fixture present")
        confidence = InlineTableV1BaAdapter.detect(samples)
        self.assertLess(confidence, 0.5)


class WorkflowTableTests(unittest.TestCase):
    def test_workflow_ignores_h1_with_workflow_in_title(self):
        """The H1 `# BP-001 Workflow: …` must not swallow the pattern."""
        text = (FIXTURES / "workflows" / "BP-001-workflow.md").read_text(encoding="utf-8")
        steps = _parse_workflow_table("BP-001", text, "workflows/BP-001-workflow.md")
        self.assertEqual(len(steps), 5)
        self.assertEqual(steps[0].id, "BP-001-S01")
        self.assertEqual(steps[1].stereotype, "Автоматизируется")
        self.assertEqual(steps[0].stereotype, "Бизнес-функция")  # "Ручной" normalised


class RoleIdNormalisationTests(unittest.TestCase):
    def test_act_id_normalised_to_rol(self):
        text = (FIXTURES / "roles" / "ACT-01-user.md").read_text(encoding="utf-8")
        adapter = InlineTableV1BaAdapter()
        # synthesise a minimal parse by running role parser directly
        import tempfile
        import os
        # Build a tiny project tree in a tempdir
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            target = project / "docs" / "03-business-roles" / "roles" / "ACT-01-user.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
            ir = adapter.parse(project)
        self.assertEqual(len(ir.business_roles), 1)
        role = ir.business_roles[0]
        self.assertEqual(role.id, "ROL-01")
        self.assertEqual(role.original_id, "ACT-01")


if __name__ == "__main__":
    unittest.main()
