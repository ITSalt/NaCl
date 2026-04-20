"""Regression tests for the inline_table_v1 SA adapter — letter-prefix
UC family + 3-digit family co-existence.

The adapter has six call sites that historically hardcoded ``\\d{3}`` for UC
and SCR ids; this suite covers each site against the letter-prefix UC
format (``UC-F01``) and confirms the 3-digit UC shape (``UC-001``) still
parses unchanged.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.adapters.inline_table_v1_sa import InlineTableV1SaAdapter


def _make_uc_md(uc_id: str, name: str) -> str:
    """Inline-table-v1 SA UC fixture (Метаданные table + sections)."""
    return (
        f"# {uc_id}: {name}\n"
        "\n"
        "## 1. Метаданные\n"
        "\n"
        "| Поле | Значение |\n"
        "|------|----------|\n"
        f"| ID | {uc_id} |\n"
        "| Название | " + name + " |\n"
        "| Актор | Пользователь |\n"
        "| Модуль | core |\n"
        "| Приоритет | medium |\n"
        "\n"
        "## 2. Описание\n"
        "Тестовый сценарий.\n"
        "\n"
        "## 3. Основной сценарий\n"
        "\n"
        "| # | Действие |\n"
        "|---|----------|\n"
        "| 1 | Открыть форму |\n"
        "| 2 | Заполнить поля |\n"
        "| 3 | Сохранить |\n"
    )


class UcExtractionTests(unittest.TestCase):
    def test_extract_uc_ids_three_digit(self):
        ids = InlineTableV1SaAdapter._extract_uc_ids("UC-001 also UC002 and UC 003")
        self.assertEqual(ids, ["UC-001", "UC-002", "UC-003"])

    def test_extract_uc_ids_letter_prefix(self):
        ids = InlineTableV1SaAdapter._extract_uc_ids(
            "see UC-F01 and UCG02 and UC T03"
        )
        self.assertEqual(ids, ["UC-F01", "UC-G02", "UC-T03"])

    def test_extract_uc_ids_mixed_families(self):
        ids = InlineTableV1SaAdapter._extract_uc_ids("UC-001, UC-F01, UC101")
        self.assertEqual(ids, ["UC-001", "UC-101", "UC-F01"])

    def test_extract_scr_ids_letter_prefix(self):
        ids = InlineTableV1SaAdapter._extract_scr_ids(
            "see SCR-F01 and SCRG02 and SCR-005"
        )
        self.assertEqual(ids, ["SCR-005", "SCR-F01", "SCR-G02"])


class UcParseTests(unittest.TestCase):
    def _parse(self, *, filename: str, uc_id: str, name: str):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            uc_dir = project / "docs" / "14-usecases"
            uc_dir.mkdir(parents=True)
            (uc_dir / filename).write_text(_make_uc_md(uc_id, name), encoding="utf-8")
            return InlineTableV1SaAdapter().parse(project)

    def test_uc_f01_round_trip(self):
        ir, _ = self._parse(
            filename="UC-F01-leave-feedback.md",
            uc_id="UC-F01",
            name="Leave feedback",
        )
        self.assertEqual(len(ir.use_cases), 1)
        uc = ir.use_cases[0]
        self.assertEqual(uc.id, "UC-F01")
        self.assertEqual(uc.original_id, "UC-F01")
        self.assertEqual(uc.name, "Leave feedback")
        # Activity steps id template
        self.assertEqual(uc.activity_steps[0].id, "UC-F01-A01")
        self.assertEqual(uc.activity_steps[2].id, "UC-F01-A03")

    def test_uc_001_three_digit_unchanged(self):
        ir, _ = self._parse(
            filename="UC-001-view-landing.md",
            uc_id="UC-001",
            name="View landing",
        )
        self.assertEqual(len(ir.use_cases), 1)
        uc = ir.use_cases[0]
        self.assertEqual(uc.id, "UC-001")
        # original_id is now always populated (was None before)
        self.assertEqual(uc.original_id, "UC-001")
        self.assertEqual(uc.activity_steps[0].id, "UC-001-A01")


class ScrParseTests(unittest.TestCase):
    def _scr_md(self, scr_id: str, name: str) -> str:
        return (
            f"# {scr_id}: {name}\n"
            "\n"
            "## 1. Метаданные\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            f"| ID | {scr_id} |\n"
            f"| Название | {name} |\n"
            "| Модуль | core |\n"
            "| Use Cases | UC-F01 |\n"
        )

    def test_scr_f01_screen_parses(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            screens = project / "docs" / "15-interfaces" / "screens"
            screens.mkdir(parents=True)
            (screens / "SCR-F01-feedback-form.md").write_text(
                self._scr_md("SCR-F01", "Форма обратной связи"), encoding="utf-8"
            )
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertEqual(len(ir.forms), 1)
        form = ir.forms[0]
        self.assertEqual(form.original_id, "SCR-F01")
        self.assertTrue(form.id.startswith("FORM-"))
        self.assertEqual(form.used_by_uc, ["UC-F01"])

    def test_scr_001_three_digit_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            screens = project / "docs" / "15-interfaces" / "screens"
            screens.mkdir(parents=True)
            (screens / "SCR-001-landing.md").write_text(
                self._scr_md("SCR-001", "Landing"), encoding="utf-8"
            )
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertEqual(len(ir.forms), 1)
        form = ir.forms[0]
        self.assertEqual(form.original_id, "SCR-001")


class RequirementsFilenameTests(unittest.TestCase):
    def _req_md(self, uc_id: str) -> str:
        return (
            f"# Requirements for {uc_id}\n"
            "\n"
            "## 1. Метаданные\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            f"| UC | {uc_id} |\n"
            "\n"
            "### FR-01: Test requirement\n"
            "\n"
            "| Параметр | Значение |\n"
            "|----------|----------|\n"
            "| Описание | The system MUST do X. |\n"
            "| Приоритет | High |\n"
        )

    def test_letter_prefix_requirement_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            reqs = project / "docs" / "16-requirements"
            reqs.mkdir(parents=True)
            (reqs / "UC-F01-requirements.md").write_text(
                self._req_md("UC-F01"), encoding="utf-8"
            )
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertEqual(len(ir.requirements), 1)
        req = ir.requirements[0]
        self.assertEqual(req.uc_ids, ["UC-F01"])

    def test_three_digit_requirement_filename_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            reqs = project / "docs" / "16-requirements"
            reqs.mkdir(parents=True)
            (reqs / "UC-001-requirements.md").write_text(
                self._req_md("UC-001"), encoding="utf-8"
            )
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertEqual(len(ir.requirements), 1)
        req = ir.requirements[0]
        self.assertEqual(req.uc_ids, ["UC-001"])


class ActivityStepSubsectionTests(unittest.TestCase):
    """Fix 2: UC with ## Основной поток + ### Шаг N subsections."""

    def test_sample_uc_activity_steps(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "sample"
            uc_dir = project / "docs" / "04-usecases"
            uc_dir.mkdir(parents=True)
            src = Path(__file__).parent / "fixtures" / "inline-table" / "usecases-sample" / "UC001-auth-otp.md"
            shutil.copy(src, uc_dir / "UC001-auth-otp.md")
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertTrue(len(ir.use_cases) >= 1, "Should parse at least 1 UC")
        uc = ir.use_cases[0]
        self.assertEqual(uc.id, "UC-001")
        self.assertGreater(len(uc.activity_steps), 0,
                           "Activity steps should be extracted from ### Шаг subsections")
        self.assertEqual(len(uc.activity_steps), 5)


class DomainAttributeMultiTableTests(unittest.TestCase):
    """Fix 3: Entity with ## Схема таблицы + Колонка|Тип multi-subsection."""

    def test_sample_entity_attributes(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "sample"
            ent_dir = project / "docs" / "02-domain" / "entities"
            ent_dir.mkdir(parents=True)
            src = Path(__file__).parent / "fixtures" / "inline-table" / "entities-sample" / "order.md"
            shutil.copy(src, ent_dir / "order.md")
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertTrue(len(ir.domain_entities) >= 1, "Should parse at least 1 entity")
        de = ir.domain_entities[0]
        self.assertGreater(len(de.attributes), 0,
                           "Attributes should be extracted from Колонка|Тип tables")
        # 3 from Идентификация + 3 from Местоположение = 6
        self.assertEqual(len(de.attributes), 6)


class NfrRequirementsTests(unittest.TestCase):
    """Fix 4: nfr.md parsed as fallback when no per-UC requirement files exist."""

    def test_nfr_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "sample"
            req_dir = project / "docs" / "06-requirements"
            req_dir.mkdir(parents=True)
            src = Path(__file__).parent / "fixtures" / "inline-table" / "requirements-sample" / "nfr.md"
            shutil.copy(src, req_dir / "nfr.md")
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertGreater(len(ir.requirements), 0,
                           "Requirements should be extracted from nfr.md")
        # 4 rows total (2 from NFR-01 table + 2 from NFR-02 table)
        self.assertEqual(len(ir.requirements), 4)
        for req in ir.requirements:
            self.assertEqual(req.kind, "NFR")
            self.assertTrue(req.id.startswith("REQ-NFR"))


if __name__ == "__main__":
    unittest.main()
