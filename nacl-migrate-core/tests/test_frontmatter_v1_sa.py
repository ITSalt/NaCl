"""Regression tests for the frontmatter_v1 SA adapter (letter-suffix-frontmatter dialect)."""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.adapters.frontmatter_v1_sa import FrontmatterV1SaAdapter


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "frontmatter" / "sa"


def _build_project(tmp: Path) -> Path:
    project = tmp / "frontmatter-sa-fixture"
    docs = project / "docs"
    for src_rel, dst_rel in (
        ("usecases",     "14-usecases"),
        ("entities",     "12-domain/entities"),
        ("enumerations", "12-domain/enumerations"),
        ("screens",      "15-interfaces/screens"),
        ("requirements", "16-requirements"),
        ("meta",         "99-meta"),
    ):
        src = FIXTURES / src_rel
        dst = docs / dst_rel
        dst.mkdir(parents=True, exist_ok=True)
        for f in src.glob("*.md"):
            shutil.copy(f, dst / f.name)
    return project


class DetectTests(unittest.TestCase):
    def test_detect_on_sample_frontmatter(self):
        samples = sorted((FIXTURES / "usecases").glob("*.md")) + \
                  sorted((FIXTURES / "entities").glob("*.md")) + \
                  sorted((FIXTURES / "screens").glob("*.md"))
        self.assertTrue(samples)
        conf = FrontmatterV1SaAdapter.detect(samples)
        self.assertGreaterEqual(conf, 0.8)


class ParseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.project = _build_project(Path(cls._tmp.name))
        cls.ir, cls.handoff = FrontmatterV1SaAdapter().parse(cls.project)

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def test_usecase_id_and_name(self):
        self.assertEqual(len(self.ir.use_cases), 1)
        uc = self.ir.use_cases[0]
        self.assertEqual(uc.id, "UC-101")
        self.assertEqual(uc.original_id, "UC101")
        self.assertIn("Загрузка справочника", uc.name)
        self.assertEqual(uc.module, "data-import")
        # Activity steps from the mermaid flowchart
        self.assertGreater(len(uc.activity_steps), 5)
        # BA trace from "## Трассировка" section should include BP-001
        self.assertIn("BP-001", uc.ba_trace)

    def test_domain_entity_exclusion_list(self):
        by_id = {e.id: e for e in self.ir.domain_entities}
        self.assertIn("DE-exclusion-list", by_id)
        de = by_id["DE-exclusion-list"]
        self.assertEqual(de.name, "ExclusionList")
        self.assertEqual(de.module, "demand-planning")
        self.assertEqual(de.ba_trace, ["OBJ-021"])
        # Attributes come from the "## Атрибуты" table
        self.assertGreaterEqual(len(de.attributes), 6)

    def test_enumeration_system_role(self):
        by_id = {en.id: en for en in self.ir.enumerations}
        self.assertIn("EN-system-role", by_id)
        en = by_id["EN-system-role"]
        # Name is the PascalCase first part, not the full " — Системная роль ..."
        self.assertEqual(en.name, "SystemRole")
        self.assertGreaterEqual(len(en.values), 3)
        codes = [v.value for v in en.values]
        self.assertIn("DATA_MANAGER", codes)
        self.assertIn("ANALYST", codes)
        self.assertIn("MARKETPLACE_MANAGER", codes)

    def test_enumeration_ba_trace_from_csv_string(self):
        """BLOCKER-2 regression: frontmatter `ba_source: ROL-01, ROL-02, ...`
        (CSV string) must be split into `Enumeration.ba_trace`."""
        by_id = {en.id: en for en in self.ir.enumerations}
        self.assertIn("EN-system-role", by_id)
        en = by_id["EN-system-role"]
        self.assertEqual(en.ba_trace,
                         ["ROL-01", "ROL-02", "ROL-03", "ROL-04"])

    def test_system_roles_from_enumeration(self):
        by_id = {r.id: r for r in self.ir.system_roles}
        # The system-role.md fixture has three value rows. We document that
        # the letter-suffix-frontmatter dialect only ships 3 codes (WAREHOUSE_STAFF was removed),
        # so the adapter emits exactly those three SystemRole nodes.
        for expected in ("SYSROL-DATA_MANAGER",
                         "SYSROL-ANALYST",
                         "SYSROL-MARKETPLACE_MANAGER"):
            self.assertIn(expected, by_id, f"missing {expected}")
        self.assertEqual(by_id["SYSROL-DATA_MANAGER"].ba_trace, ["ROL-01"])
        self.assertEqual(by_id["SYSROL-ANALYST"].ba_trace, ["ROL-02"])
        self.assertEqual(by_id["SYSROL-MARKETPLACE_MANAGER"].ba_trace, ["ROL-03"])

    def test_form_scalar_uc(self):
        by_id = {f.id: f for f in self.ir.forms}
        self.assertIn("FORM-article-import-form", by_id)
        form = by_id["FORM-article-import-form"]
        self.assertEqual(form.original_id, "article-import-form")
        self.assertEqual(form.used_by_uc, ["UC-101"])
        self.assertEqual(form.module, "data-import")

    def test_form_csv_and_list_uc(self):
        by_id = {f.id: f for f in self.ir.forms}
        # delivery-order-list has `uc: UC301, UC304a` (CSV string)
        self.assertIn("FORM-delivery-order-list", by_id)
        csv_form = by_id["FORM-delivery-order-list"]
        self.assertIn("UC-301", csv_form.used_by_uc)
        self.assertIn("UC-304", csv_form.used_by_uc)
        # supply-create-form has `uc: [UC509, UC511]` (YAML list)
        self.assertIn("FORM-supply-create-form", by_id)
        list_form = by_id["FORM-supply-create-form"]
        self.assertIn("UC-509", list_form.used_by_uc)
        self.assertIn("UC-511", list_form.used_by_uc)

    def test_requirements_parsed(self):
        by_id = {r.id: r for r in self.ir.requirements}
        self.assertIn("REQ-RQ101-01", by_id)
        req = by_id["REQ-RQ101-01"]
        self.assertEqual(req.uc_ids, ["UC-101"])
        self.assertTrue(req.description.startswith("Система принимает файл"))
        # UI requirements (RQ101-08 — UI) should be present.
        self.assertIn("REQ-RQ101-08", by_id)
        # A data-validation requirement
        self.assertIn("REQ-RQ101-14", by_id)

    def test_traceability_sections_1_3(self):
        # The fixture matrix includes all four sections. Section 1-3 must
        # populate AUTOMATES_AS / REALIZED_AS / MAPPED_TO. Section 4 in
        # the letter-suffix-frontmatter dialect uses RQxxx-NN shorthand; edges may or may not emit
        # depending on which REQ ids were parsed — but the test fixture
        # only ships UC101-requirements, so only BRQ-001 → REQ-RQ101-03
        # would resolve.
        self.assertGreater(len(self.handoff.automates_as), 0)
        self.assertGreater(len(self.handoff.realized_as), 0)
        self.assertGreater(len(self.handoff.mapped_to), 0)
        # REALIZED_AS includes OBJ-021 -> DE-exclusion-list since we ship
        # that domain entity fixture.
        pairs = {(e.from_id, e.to_id) for e in self.handoff.realized_as}
        self.assertIn(("OBJ-021", "DE-exclusion-list"), pairs)

    def test_no_warnings_for_missing_section_4(self):
        # Even with a fixture matrix that has section 4, the adapter must
        # not warn for rows it couldn't resolve — it just skips them.
        codes = {w.code for w in self.ir.warnings}
        self.assertNotIn("HANDOFF_REQ_CATEGORY", codes)


class DescriptionBoldLeakTests(unittest.TestCase):
    """Regression guard: ``**Описание:**`` (colon INSIDE the bold markers)
    must not leak a trailing ``** `` into DomainEntity.description.

    Root cause: the old adapter matched ``\\*{0,2}Описание\\*{0,2}\\s*:`` and
    captured everything after the colon. With input ``**Описание:** text``,
    the regex matched ``**Описание`` + ``:`` and captured ``** text`` — an
    unpaired ``**`` that ``strip_markdown_inline`` cannot remove. The fix
    pre-strips markdown inline from the line before matching so the
    ``**Описание:**`` wrapper collapses to ``Описание:`` cleanly.
    """

    def test_direct_bold_wrapped_description(self):
        """Inline ``**Описание:** ...`` line with colon inside bold markers."""
        import tempfile

        source = (
            "---\n"
            "title: \"LeakSample\"\n"
            "type: entity\n"
            "module: m1\n"
            "---\n"
            "\n"
            "# LeakSample\n"
            "\n"
            "**Модуль:** m1\n"
            "**Описание:** Сессия загрузки файла с артикулами для исключения.\n"
            "\n"
            "## Атрибуты\n"
            "\n"
            "| Атрибут | Тип | Обязательность | Описание |\n"
            "|---------|-----|----------------|----------|\n"
            "| id | UUID | Required | primary key |\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "leak-fixture"
            dst = project / "docs" / "12-domain" / "entities"
            dst.mkdir(parents=True)
            (dst / "leak-sample.md").write_text(source, encoding="utf-8")
            ir, _ = FrontmatterV1SaAdapter().parse(project)

        by_id = {e.id: e for e in ir.domain_entities}
        self.assertIn("DE-leak-sample", by_id)
        de = by_id["DE-leak-sample"]
        self.assertEqual(
            de.description,
            "Сессия загрузки файла с артикулами для исключения.",
        )
        self.assertNotIn("**", de.description)

    def test_exclusion_list_fixture_has_no_bold_leak(self):
        """End-to-end: the ``exclusion-list.md`` fixture must parse a clean
        description — no ``**`` artefacts anywhere."""
        fixture = FIXTURES / "entities" / "exclusion-list.md"
        self.assertTrue(fixture.is_file(), f"missing fixture: {fixture}")

        with tempfile.TemporaryDirectory() as tmp:
            project = _build_project(Path(tmp))
            ir, _ = FrontmatterV1SaAdapter().parse(project)

        by_id = {e.id: e for e in ir.domain_entities}
        self.assertIn("DE-exclusion-list", by_id)
        de = by_id["DE-exclusion-list"]
        self.assertNotIn("**", de.description)
        self.assertTrue(de.description.startswith("Сессия загрузки файла"),
                        f"unexpected description: {de.description!r}")


class SystemRoleIdFormatTests(unittest.TestCase):
    """Regression guard for the SystemRole id pattern.

    the letter-suffix-frontmatter dialect encodes system-role codes as SCREAMING_SNAKE_CASE
    (DATA_MANAGER, MARKETPLACE_MANAGER, ...). The IR's SystemRole id
    validator originally allowed only [A-Z0-9-] — the underscore was a
    missing character class. Pattern fixed to [A-Z0-9_\\-]+.
    """

    def test_underscore_is_accepted(self):
        from nacl_migrate_core.ir_sa import SystemRole
        # Should not raise.
        role = SystemRole(
            id="SYSROL-DATA_MANAGER",
            name="DATA_MANAGER",
            source_file="fixtures/sa/enumerations/system-role.md",
        )
        self.assertEqual(role.id, "SYSROL-DATA_MANAGER")

    def test_hyphen_still_accepted(self):
        from nacl_migrate_core.ir_sa import SystemRole
        role = SystemRole(
            id="SYSROL-DATA-MANAGER",
            name="DATA-MANAGER",
            source_file="fixtures/sa/enumerations/system-role.md",
        )
        self.assertEqual(role.id, "SYSROL-DATA-MANAGER")


class EnumerationBaTraceTests(unittest.TestCase):
    """BLOCKER-2 regression: Enumeration.ba_source frontmatter → IR.ba_trace.

    Covers the three shapes the adapter must tolerate:
    - CSV string (``ba_source: ROL-01, ROL-02``)
    - YAML list (``ba_source:\\n  - ROL-01\\n  - ROL-02``)
    - missing key (``ba_trace`` must default to empty list, no crash).
    """

    def _parse_enum(self, fm_block: str):
        source = (
            "---\n"
            "title: \"SampleEnum\"\n"
            "type: enumeration\n"
            "module: core\n"
            f"{fm_block}"
            "---\n"
            "\n"
            "# SampleEnum\n"
            "\n"
            "## Значения\n"
            "\n"
            "| Код | Описание |\n"
            "|-----|----------|\n"
            "| A | alpha |\n"
            "| B | beta |\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "enum-fixture"
            dst = project / "docs" / "12-domain" / "enumerations"
            dst.mkdir(parents=True)
            (dst / "sample-enum.md").write_text(source, encoding="utf-8")
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        by_id = {en.id: en for en in ir.enumerations}
        self.assertIn("EN-sample-enum", by_id)
        return by_id["EN-sample-enum"]

    def test_ba_source_csv_string(self):
        en = self._parse_enum("ba_source: ROL-01, ROL-02\n")
        self.assertEqual(en.ba_trace, ["ROL-01", "ROL-02"])

    def test_ba_source_yaml_list(self):
        en = self._parse_enum("ba_source:\n  - ROL-01\n  - ROL-02\n")
        self.assertEqual(en.ba_trace, ["ROL-01", "ROL-02"])

    def test_ba_source_missing_is_empty_list(self):
        en = self._parse_enum("")
        self.assertEqual(en.ba_trace, [])

    def test_ba_source_sentinel_is_filtered(self):
        """NEW-B regression: sentinel ``—`` must yield an empty list."""
        en = self._parse_enum("ba_source: —\n")
        self.assertEqual(en.ba_trace, [])

    def test_ba_source_non_canonical_prefix_is_filtered(self):
        """NEW-B regression: ``KAR-44`` (unknown prefix) drops to []."""
        en = self._parse_enum("ba_source: KAR-44\n")
        self.assertEqual(en.ba_trace, [])

    def test_ba_source_canonical_tokens_preserved(self):
        """NEW-B regression: canonical ROL-* tokens survive whitelist."""
        en = self._parse_enum("ba_source: ROL-01, ROL-02\n")
        self.assertEqual(en.ba_trace, ["ROL-01", "ROL-02"])


class DomainEntityMixedPrefixBaTraceTests(unittest.TestCase):
    """NEW-A regression: DomainEntity ``ba_source`` regex must accept
    canonical OBJ-/BRQ-/ROL- prefixes, not just OBJ-. Prior version silently
    dropped BRQ-* / ROL-* tokens.
    """

    def _parse_de(self, ba_source_line: str):
        source = (
            "---\n"
            "title: \"MixSample\"\n"
            "type: entity\n"
            "module: m1\n"
            f"{ba_source_line}"
            "---\n"
            "\n"
            "# MixSample\n"
            "\n"
            "## Атрибуты\n"
            "\n"
            "| Атрибут | Тип | Обязательность | Описание |\n"
            "|---------|-----|----------------|----------|\n"
            "| id | UUID | Required | primary key |\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "de-fixture"
            dst = project / "docs" / "12-domain" / "entities"
            dst.mkdir(parents=True)
            (dst / "mix-sample.md").write_text(source, encoding="utf-8")
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        by_id = {e.id: e for e in ir.domain_entities}
        self.assertIn("DE-mix-sample", by_id)
        return by_id["DE-mix-sample"]

    def test_de_ba_source_mixed_prefixes(self):
        """NEW-A: OBJ/BRQ/ROL canonical tokens all preserved in one file."""
        de = self._parse_de("ba_source: OBJ-010, BRQ-008, ROL-02\n")
        self.assertEqual(de.ba_trace, ["OBJ-010", "BRQ-008", "ROL-02"])

    def test_de_ba_source_pure_obj_still_works(self):
        """NEW-A regression guard: the original OBJ-only shape is unchanged."""
        de = self._parse_de("ba_source: OBJ-021\n")
        self.assertEqual(de.ba_trace, ["OBJ-021"])


class LetterPrefixUcTests(unittest.TestCase):
    """Letter-prefix UC family (``UC-F01``, ``UC-G02``, ``UC-T03``).

    Infographic uses this convention. The R2 retrospective watch-item #4
    requires ``original_id`` to be populated even when the canonical and
    source values are identical.
    """

    def _parse_uc(self, *, filename: str, title: str, body: str = "") -> Path:
        source = (
            "---\n"
            f"title: \"{title}\"\n"
            "type: usecase\n"
            "priority: medium\n"
            "status: approved\n"
            "tags: [usecase]\n"
            "---\n"
            "\n"
            f"# {title}\n"
            "\n"
            "## Актор\nПользователь\n\n"
            "## Цель\nИспользовать функцию.\n\n"
            f"{body}"
        )
        tmp = tempfile.mkdtemp()
        project = Path(tmp) / "uc-fixture"
        usecases = project / "docs" / "14-usecases"
        usecases.mkdir(parents=True)
        (usecases / filename).write_text(source, encoding="utf-8")
        return project

    def test_uc_f01_canonical_round_trip(self):
        project = self._parse_uc(
            filename="UC-F01-leave-feedback.md",
            title="UC-F01: Leave feedback",
        )
        try:
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        finally:
            shutil.rmtree(project.parent, ignore_errors=True)
        self.assertEqual(len(ir.use_cases), 1)
        uc = ir.use_cases[0]
        self.assertEqual(uc.id, "UC-F01")
        # original_id MUST be populated even in the identity case
        self.assertEqual(uc.original_id, "UC-F01")
        self.assertEqual(uc.name, "Leave feedback")

    def test_uc101_three_digit_normalisation_unchanged(self):
        """3-digit family still normalises ``UC101`` to ``UC-101``."""
        project = self._parse_uc(
            filename="UC101-import.md",
            title="UC101. Import data",
        )
        try:
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        finally:
            shutil.rmtree(project.parent, ignore_errors=True)
        self.assertEqual(len(ir.use_cases), 1)
        uc = ir.use_cases[0]
        self.assertEqual(uc.id, "UC-101")
        self.assertEqual(uc.original_id, "UC101")

    def test_scr_f01_screen_parses(self):
        """SCR-F01-feedback-form.md → Form with original_id=SCR-F01."""
        screen_source = (
            "---\n"
            "title: \"SCR-F01: Форма обратной связи\"\n"
            "type: screen\n"
            "screen: SCR-F01\n"
            "uc: UC-F01\n"
            "tags: [screen]\n"
            "---\n"
            "\n"
            "# SCR-F01: Форма обратной связи\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "scr-fixture"
            screens = project / "docs" / "15-interfaces" / "screens"
            screens.mkdir(parents=True)
            (screens / "SCR-F01-feedback-form.md").write_text(screen_source, encoding="utf-8")
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        self.assertEqual(len(ir.forms), 1)
        form = ir.forms[0]
        self.assertEqual(form.original_id, "SCR-F01")
        self.assertTrue(form.id.startswith("FORM-"))
        # Linked UC should be the canonical UC-F01
        self.assertEqual(form.used_by_uc, ["UC-F01"])

    def test_letter_prefix_requirement_filename(self):
        """``UC-F01-requirements.md`` → Requirement.uc_ids = ['UC-F01']."""
        req_source = (
            "---\n"
            "title: \"Требования UC-F01\"\n"
            "type: requirements\n"
            "uc: UC-F01\n"
            "tags: [requirements]\n"
            "---\n"
            "\n"
            "# Требования UC-F01\n"
            "\n"
            "## Требования к данным\n"
            "\n"
            "| ID | Описание | Тип | Приоритет |\n"
            "|----|----------|-----|-----------|\n"
            "| RQ-F01-01 | Заполнить хотя бы одно поле | data | High |\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "req-fixture"
            reqs = project / "docs" / "16-requirements"
            reqs.mkdir(parents=True)
            (reqs / "UC-F01-requirements.md").write_text(req_source, encoding="utf-8")
            ir, _ = FrontmatterV1SaAdapter().parse(project)
        self.assertEqual(len(ir.requirements), 1)
        req = ir.requirements[0]
        self.assertEqual(req.uc_ids, ["UC-F01"])
        self.assertEqual(req.id, "REQ-RQ-F01-01")


class NumberingDetectionTests(unittest.TestCase):
    """``_detect_numbering`` picks the right layout based on disk layout."""

    def test_detect_00_06_layout(self):
        """Infographic-style ``00-06`` numbering is detected."""
        from nacl_migrate_core.adapters.frontmatter_v1_sa import (
            FrontmatterV1SaAdapter,
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "ig-fixture"
            for sub in ("01-overview", "02-domain", "03-roles",
                        "04-usecases", "05-interfaces", "06-requirements"):
                (project / "docs" / sub).mkdir(parents=True)
            numbering, dirs = FrontmatterV1SaAdapter._detect_numbering(project)
            self.assertEqual(numbering, "00-06")
            self.assertIsNotNone(dirs["usecases"])
            self.assertTrue(str(dirs["usecases"]).endswith("04-usecases"))

    def test_detect_10_16_layout(self):
        from nacl_migrate_core.adapters.frontmatter_v1_sa import (
            FrontmatterV1SaAdapter,
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "ko-fixture"
            for sub in ("10-architecture", "11-overview", "12-domain",
                        "13-roles", "14-usecases", "15-interfaces",
                        "16-requirements"):
                (project / "docs" / sub).mkdir(parents=True)
            numbering, dirs = FrontmatterV1SaAdapter._detect_numbering(project)
            self.assertEqual(numbering, "10-16")
            self.assertTrue(str(dirs["usecases"]).endswith("14-usecases"))

    def test_both_layouts_present_picks_10_16_and_warns(self):
        """Pathological case: both layouts on disk → prefer 10-16, warn."""
        from nacl_migrate_core.adapters.frontmatter_v1_sa import (
            FrontmatterV1SaAdapter,
        )
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "mixed-fixture"
            for sub in ("10-architecture", "11-overview", "12-domain",
                        "14-usecases", "15-interfaces", "16-requirements",
                        "01-overview", "02-domain", "04-usecases",
                        "05-interfaces", "06-requirements"):
                (project / "docs" / sub).mkdir(parents=True)
            numbering, dirs = FrontmatterV1SaAdapter._detect_numbering(project)
            self.assertEqual(numbering, "10-16")
            # Run a full parse to surface the NUMBERING_AMBIGUOUS warning.
            ir, _ = FrontmatterV1SaAdapter().parse(project)
            codes = {w.code for w in ir.warnings}
            self.assertIn("NUMBERING_AMBIGUOUS", codes)


if __name__ == "__main__":
    unittest.main()
