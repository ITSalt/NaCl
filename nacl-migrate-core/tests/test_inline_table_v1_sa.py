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


# ---------------------------------------------------------------------------
# Regression tests for bug: ActivityStep.actor is never populated by the
# inline-table adapter.  Tests are written RED-first; they MUST FAIL until
# the fix is applied in inline_table_v1_sa.py lines 645-652.
# ---------------------------------------------------------------------------


def _make_uc_md_with_actor_prefixes(uc_id: str, name: str) -> str:
    """Inline-table UC fixture where each scenario step is prefixed with
    'User:' or 'System:' — the same convention that frontmatter_v1_sa.py
    lines 1098-1104 parse correctly from activity-diagram nodes.

    The inline-table adapter DOES NOT currently strip these prefixes or
    populate ActivityStep.actor; this fixture exposes that gap.
    """
    return (
        f"# {uc_id}: {name}\n"
        "\n"
        "## 1. Метаданные\n"
        "\n"
        "| Поле | Значение |\n"
        "|------|----------|\n"
        f"| ID | {uc_id} |\n"
        f"| Название | {name} |\n"
        "| Актор | User |\n"
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
        "| 1 | User: Открыть форму |\n"
        "| 2 | System: Загрузить данные |\n"
        "| 3 | User: Заполнить поля |\n"
        "| 4 | System: Сохранить запись |\n"
    )


def _make_uc_md_with_uc_level_actor(uc_id: str, name: str) -> str:
    """Inline-table UC fixture where steps have NO inline prefix but the
    Метаданные table declares 'Актор: User'.  The adapter should propagate
    the UC-level actor to all ActivityStep.actor fields.  It currently does
    not — ActivityStep.actor remains None regardless.
    """
    return (
        f"# {uc_id}: {name}\n"
        "\n"
        "## 1. Метаданные\n"
        "\n"
        "| Поле | Значение |\n"
        "|------|----------|\n"
        f"| ID | {uc_id} |\n"
        f"| Название | {name} |\n"
        "| Актор | User |\n"
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


class ActivityStepActorTests(unittest.TestCase):
    """BUG REGRESSION — inline-table adapter never populates ActivityStep.actor.

    Test 1: per-step 'User:' / 'System:' prefixes must be stripped from
            description and mapped to actor.
    Test 2: when steps have no inline prefix, the UC-level actor ('Актор')
            from the metadata table must be propagated to all steps.

    Both tests MUST FAIL (RED) before the fix is applied.
    Reference: inline_table_v1_sa.py lines 645-652 — no actor extraction.
    Compare:   frontmatter_v1_sa.py lines 1098-1104 — correct extraction.
    """

    def _parse_uc(self, uc_id: str, filename: str, content: str):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "fix"
            uc_dir = project / "docs" / "14-usecases"
            uc_dir.mkdir(parents=True)
            (uc_dir / filename).write_text(content, encoding="utf-8")
            ir, _ = InlineTableV1SaAdapter().parse(project)
        self.assertEqual(len(ir.use_cases), 1, "fixture must produce exactly 1 UC")
        return ir.use_cases[0]

    def test_actor_extracted_from_inline_step_prefix(self):
        """Test 1 (RED): 'User:' / 'System:' step prefixes must set ActivityStep.actor."""
        uc = self._parse_uc(
            "UC-A01",
            "UC-A01-actor-prefix.md",
            _make_uc_md_with_actor_prefixes("UC-A01", "Actor prefix test"),
        )
        steps = uc.activity_steps
        self.assertEqual(len(steps), 4, "fixture has 4 steps")

        expected_actors = ["User", "System", "User", "System"]
        for i, (step, expected) in enumerate(zip(steps, expected_actors), start=1):
            with self.subTest(step_number=i):
                self.assertEqual(
                    step.actor,
                    expected,
                    f"Step {i}: expected actor={expected!r}, got {step.actor!r}. "
                    f"Inline-table adapter does not extract 'User:'/'System:' prefixes "
                    f"from step descriptions (see inline_table_v1_sa.py:645-652).",
                )
        # Also assert descriptions have prefixes stripped
        for step in steps:
            self.assertFalse(
                step.description.lower().startswith("user:") or
                step.description.lower().startswith("system:"),
                f"Step description should have prefix stripped, got: {step.description!r}",
            )

    def test_actor_inherited_from_uc_level_actor(self):
        """Test 2 (RED): steps without inline prefix inherit the UC-level actor."""
        uc = self._parse_uc(
            "UC-A02",
            "UC-A02-uc-actor.md",
            _make_uc_md_with_uc_level_actor("UC-A02", "UC-level actor test"),
        )
        # The UC metadata table declares Актор = "User"
        self.assertEqual(uc.actor, "User", "UC.actor must be parsed from metadata table")

        steps = uc.activity_steps
        self.assertEqual(len(steps), 3, "fixture has 3 steps")
        for i, step in enumerate(steps, start=1):
            with self.subTest(step_number=i):
                self.assertIsNotNone(
                    step.actor,
                    f"Step {i}: actor is None — UC-level actor 'User' was not propagated "
                    f"to ActivityStep.actor (see inline_table_v1_sa.py:645-652).",
                )
                self.assertEqual(
                    step.actor,
                    "User",
                    f"Step {i}: expected actor='User' (inherited from UC), got {step.actor!r}.",
                )


    # ------------------------------------------------------------------
    # Round-2 RED tests: real Family Cinema dialect — Компонент/Исполнитель
    # column in main-flow table + Russian UC-level actor canonicalization.
    # ------------------------------------------------------------------

    def test_actor_from_component_column(self):
        """Test 5 (RED): Компонент column values map to ActivityStep.actor.

        Real FC dialect: main-flow table has columns
        '# | Компонент | Действие | Сущности | BRQ'.
        'Клиент' → 'User', 'Сервер (Fastify)' → 'System'.
        Currently FAILS because _parse_scenario_table discards the
        Компонент column entirely, returning only the Действие text.
        """
        content = (
            "# UC-C01: Component column test\n"
            "\n"
            "## 1. Карточка UC\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            "| ID | UC-C01 |\n"
            "| Название | Component column test |\n"
            "| Актор | Пользователь |\n"
            "| Модуль | core |\n"
            "| Приоритет | medium |\n"
            "\n"
            "## 5. Основной поток (Main Flow)\n"
            "\n"
            "| # | Компонент | Действие | Сущности | BRQ |\n"
            "|---|-----------|----------|----------|-----|\n"
            "| 1 | Клиент | Открыть форму | -- | -- |\n"
            "| 2 | Сервер (Fastify) | Валидировать данные | -- | -- |\n"
            "| 3 | Клиент | Отправить результат | -- | -- |\n"
        )
        uc = self._parse_uc("UC-C01", "UC-C01-component-col.md", content)
        steps = uc.activity_steps
        self.assertEqual(len(steps), 3, "fixture has 3 steps")

        expected = [
            ("User", "Открыть форму"),
            ("System", "Валидировать данные"),
            ("User", "Отправить результат"),
        ]
        for i, (step, (exp_actor, exp_desc_fragment)) in enumerate(
            zip(steps, expected), start=1
        ):
            with self.subTest(step_number=i):
                self.assertEqual(
                    step.actor,
                    exp_actor,
                    f"Step {i}: expected actor={exp_actor!r}, got {step.actor!r}. "
                    f"_parse_scenario_table discards the Компонент column "
                    f"(inline_table_v1_sa.py _parse_scenario_table).",
                )
                self.assertIn(
                    exp_desc_fragment,
                    step.description,
                    f"Step {i}: description should contain {exp_desc_fragment!r}, "
                    f"got {step.description!r}.",
                )

    def test_actor_from_ispolnitel_column(self):
        """Test 6 (RED): Исполнитель column variant maps to ActivityStep.actor.

        UC-001 Family Cinema uses 'Исполнитель' instead of 'Компонент'.
        'Пользователь' → 'User', 'Система' → 'System'.
        Currently FAILS for the same reason as Test 5.
        """
        content = (
            "# UC-C02: Ispolnitel column test\n"
            "\n"
            "## 1. Метаданные\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            "| ID | UC-C02 |\n"
            "| Название | Ispolnitel column test |\n"
            "| Актор | Пользователь |\n"
            "| Модуль | core |\n"
            "| Приоритет | medium |\n"
            "\n"
            "## 5. Основной сценарий (Main Flow)\n"
            "\n"
            "| # | Исполнитель | Действие | Результат |\n"
            "|---|-------------|----------|-----------|\n"
            "| 1 | **Пользователь** | Открыть страницу | Страница загружена |\n"
            "| 2 | **Система** | Загрузить данные | Данные получены |\n"
            "| 3 | **Пользователь** | Нажать кнопку | Форма отправлена |\n"
        )
        uc = self._parse_uc("UC-C02", "UC-C02-ispolnitel-col.md", content)
        steps = uc.activity_steps
        self.assertEqual(len(steps), 3, "fixture has 3 steps")

        expected_actors = ["User", "System", "User"]
        for i, (step, exp_actor) in enumerate(
            zip(steps, expected_actors), start=1
        ):
            with self.subTest(step_number=i):
                self.assertEqual(
                    step.actor,
                    exp_actor,
                    f"Step {i}: expected actor={exp_actor!r}, got {step.actor!r}. "
                    f"Parser does not recognise 'Исполнитель' as an actor column "
                    f"(inline_table_v1_sa.py _parse_scenario_table).",
                )

    def test_russian_uc_actor_canonicalization(self):
        """Test 7 (RED): Russian UC-level actor strings are canonicalized via
        substring match and propagated to all steps.

        Real FC values:
          'Система (триггер: завершение UC-003)' → 'System'
          'ACT-01 Пользователь (Посетитель)'    → 'User'

        Currently FAILS because the canonicalization lookup is an exact
        dict match on lowercased raw value, which never matches these
        longer Russian strings with parenthetical suffixes.
        """
        # Fixture A — Система with parenthetical → all steps System
        content_system = (
            "# UC-C03: Russian actor System test\n"
            "\n"
            "## 1. Карточка UC\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            "| ID | UC-C03 |\n"
            "| Название | Russian actor System test |\n"
            "| Актор | Система (триггер: завершение UC-003) |\n"
            "| Модуль | core |\n"
            "| Приоритет | medium |\n"
            "\n"
            "## 5. Основной поток\n"
            "\n"
            "| # | Действие |\n"
            "|---|----------|\n"
            "| 1 | Загрузить данные |\n"
            "| 2 | Сохранить результат |\n"
        )
        uc_sys = self._parse_uc("UC-C03", "UC-C03-russian-actor-sys.md", content_system)
        steps_sys = uc_sys.activity_steps
        self.assertEqual(len(steps_sys), 2, "fixture A has 2 steps")
        for i, step in enumerate(steps_sys, start=1):
            with self.subTest(fixture="Система", step_number=i):
                self.assertEqual(
                    step.actor,
                    "System",
                    f"Step {i}: expected actor='System' from UC actor "
                    f"'Система (триггер: ...)'; got {step.actor!r}. "
                    f"Canonicalization must use substring match, not exact lookup.",
                )

        # Fixture B — ACT-01 Пользователь (Посетитель) → all steps User
        content_user = (
            "# UC-C04: Russian actor User test\n"
            "\n"
            "## 1. Карточка UC\n"
            "\n"
            "| Поле | Значение |\n"
            "|------|----------|\n"
            "| ID | UC-C04 |\n"
            "| Название | Russian actor User test |\n"
            "| Актор | ACT-01 Пользователь (Посетитель) |\n"
            "| Модуль | core |\n"
            "| Приоритет | medium |\n"
            "\n"
            "## 5. Основной поток\n"
            "\n"
            "| # | Действие |\n"
            "|---|----------|\n"
            "| 1 | Перейти на страницу |\n"
            "| 2 | Нажать кнопку |\n"
        )
        uc_usr = self._parse_uc("UC-C04", "UC-C04-russian-actor-usr.md", content_user)
        steps_usr = uc_usr.activity_steps
        self.assertEqual(len(steps_usr), 2, "fixture B has 2 steps")
        for i, step in enumerate(steps_usr, start=1):
            with self.subTest(fixture="Пользователь", step_number=i):
                self.assertEqual(
                    step.actor,
                    "User",
                    f"Step {i}: expected actor='User' from UC actor "
                    f"'ACT-01 Пользователь (Посетитель)'; got {step.actor!r}. "
                    f"Canonicalization must use substring match, not exact lookup.",
                )


if __name__ == "__main__":
    unittest.main()
