"""Regression tests for the frontmatter_v1 BA adapter (letter-suffix-frontmatter dialect).

Fixtures under ``tests/fixtures/frontmatter/ba/`` are sample documents in the
letter-suffix-frontmatter dialect. The tests assemble a minimal docs/ tree
in a tempdir, point the adapter at it, and assert on the emitted IR.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.adapters.frontmatter_v1 import FrontmatterV1BaAdapter
from nacl_migrate_core.adapters.inline_table_v1 import InlineTableV1BaAdapter


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "frontmatter" / "ba"
INLINE_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "inline-table"


def _build_project(tmp: Path) -> Path:
    """Materialise the fixture tree into a tempdir shaped like a project."""
    project = tmp / "frontmatter-ba-fixture"
    docs = project / "docs"
    for src_rel, dst_rel in (
        ("entities",  "02-business-entities/entities"),
        ("roles",     "03-business-roles/roles"),
        ("groups",    "01-business-processes/groups"),
        ("processes", "01-business-processes/processes"),
        ("workflows", "01-business-processes/workflows"),
        ("rules",     "04-business-rules"),
        ("glossary",  "99-meta"),
    ):
        src = FIXTURES / src_rel
        dst = docs / dst_rel
        dst.mkdir(parents=True, exist_ok=True)
        for f in src.glob("*.md"):
            shutil.copy(f, dst / f.name)
    return project


class DetectTests(unittest.TestCase):
    def test_detect_on_sample_entities(self):
        samples = sorted((FIXTURES / "entities").glob("*.md"))
        self.assertTrue(samples, "expected ba/entities fixtures")
        confidence = FrontmatterV1BaAdapter.detect(samples)
        self.assertGreaterEqual(confidence, 0.8)

    def test_detect_rejects_inline_table_samples(self):
        samples = sorted((INLINE_FIXTURES / "entities").glob("*.md"))
        self.assertTrue(samples, "expected inline-table entities fixtures")
        confidence = FrontmatterV1BaAdapter.detect(samples)
        self.assertLessEqual(confidence, 0.2)

    def test_inline_detect_rejects_frontmatter_samples(self):
        samples = sorted((FIXTURES / "entities").glob("*.md"))
        confidence = InlineTableV1BaAdapter.detect(samples)
        self.assertLessEqual(confidence, 0.2)


class ParseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.project = _build_project(Path(cls._tmp.name))
        cls.ir = FrontmatterV1BaAdapter().parse(cls.project)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_process_group_parsed(self):
        by_id = {pg.id: pg for pg in self.ir.process_groups}
        self.assertIn("GPR-01", by_id)
        self.assertEqual(by_id["GPR-01"].name, "Подготовка данных")
        self.assertTrue(by_id["GPR-01"].description)

    def test_business_process_parsed(self):
        by_id = {bp.id: bp for bp in self.ir.business_processes}
        self.assertIn("BP-001", by_id)
        bp = by_id["BP-001"]
        self.assertEqual(bp.group_id, "GPR-01")
        self.assertTrue(bp.name)
        self.assertTrue(bp.description)

    def test_workflow_steps_stereotype_mapping(self):
        bp = next(bp for bp in self.ir.business_processes if bp.id == "BP-001")
        self.assertGreaterEqual(len(bp.workflow), 5)
        # S01 is an "Событие" (event) which collapses to "Бизнес-функция"
        first = bp.workflow[0]
        self.assertEqual(first.id, "BP-001-S01")
        self.assertEqual(first.stereotype, "Бизнес-функция")
        # S02 ("Ручная") must normalise to "Бизнес-функция"
        second = next(s for s in bp.workflow if s.step_number == 2)
        self.assertEqual(second.stereotype, "Бизнес-функция")
        # S05 ("Результат") also collapses to "Бизнес-функция"
        last = bp.workflow[-1]
        self.assertEqual(last.stereotype, "Бизнес-функция")

    def test_business_entity_parsed(self):
        by_id = {e.id: e for e in self.ir.business_entities}
        self.assertIn("OBJ-001", by_id)
        entity = by_id["OBJ-001"]
        self.assertEqual(entity.stereotype, "Внешний документ")
        self.assertTrue(entity.attributes)
        self.assertIn("BP-001", entity.related_process_ids)
        self.assertIn("BP-002", entity.related_process_ids)
        # Attributes are pulled from the "## Атрибуты" table.
        attr_names = [a.name for a in entity.attributes]
        self.assertIn("Артикул 1С", attr_names)

    def test_business_role_parsed(self):
        by_id = {r.id: r for r in self.ir.business_roles}
        self.assertIn("ROL-01", by_id)
        role = by_id["ROL-01"]
        self.assertEqual(role.full_name, "Товарник")
        self.assertEqual(role.department, "Товарный отдел")
        # original_id is None because this dialect uses ROL-NN natively.
        self.assertIsNone(role.original_id)

    def test_business_rules_catalog_parsed(self):
        rules = self.ir.business_rules
        self.assertEqual(len(rules), 26, f"expected 26 rules, got {len(rules)}")
        by_id = {r.id: r for r in rules}
        self.assertIn("BRQ-001", by_id)
        brq1 = by_id["BRQ-001"]
        self.assertEqual(brq1.rule_type, "constraint")
        self.assertIn("OBJ-001", brq1.constrains_entity_ids)
        self.assertIn("BP-001", brq1.applies_in_process_ids)
        self.assertIn("BP-001-S03", brq1.applies_at_step_ids)
        # A rule with multi-entity / multi-process / step range
        brq3 = by_id["BRQ-003"]
        self.assertIn("OBJ-007", brq3.constrains_entity_ids)
        self.assertIn("OBJ-015", brq3.constrains_entity_ids)
        # BRQ-005 uses step range S05–S09
        brq5 = by_id["BRQ-005"]
        self.assertIn("BP-002-S05", brq5.applies_at_step_ids)
        self.assertIn("BP-002-S09", brq5.applies_at_step_ids)

    def test_glossary_parsed(self):
        self.assertGreaterEqual(len(self.ir.glossary_terms), 40)
        terms = [g.term for g in self.ir.glossary_terms]
        self.assertIn("ABC-анализ", terms)
        # SA-term code is captured as a synonym
        abc = next(g for g in self.ir.glossary_terms if g.term == "ABC-анализ")
        self.assertIn("AbcCategory", abc.synonyms)

    def test_warnings_empty(self):
        # None of the fixtures should produce warnings.
        self.assertFalse(self.ir.warnings,
                         f"unexpected warnings: {self.ir.warnings}")


if __name__ == "__main__":
    unittest.main()
