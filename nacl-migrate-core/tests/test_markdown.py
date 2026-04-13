"""Stdlib unittest suite for nacl_migrate_core.markdown."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core import markdown as md


class FindSectionTests(unittest.TestCase):
    TEXT = (
        "# BP-001 Workflow: Лендинг\n"
        "\n"
        "## Метаданные\n"
        "\n"
        "| Поле | Значение |\n"
        "|------|----------|\n"
        "| **Код** | BP-001 |\n"
        "\n"
        "## Каноническая таблица\n"
        "\n"
        "| # | Шаг | Стереотип |\n"
        "|---|-----|-----------|\n"
        "| 1 | Login | Ручной |\n"
    )

    def test_fullmatch_does_not_hit_h1_substring(self):
        """`Workflow` must NOT match the H1 title `BP-001 Workflow: ...`."""
        body = md.find_section(self.TEXT, r"Workflow( steps?)?")
        self.assertIsNone(body)

    def test_fullmatch_on_level2_heading(self):
        body = md.find_section(self.TEXT, r"Каноническая таблица")
        self.assertIsNotNone(body)
        tables = md.parse_tables(body or "")
        self.assertEqual(len(tables), 1)
        self.assertEqual(len(tables[0]), 1)
        row = tables[0][0]
        self.assertEqual(row["Шаг"], "Login")
        self.assertEqual(row["Стереотип"], "Ручной")

    def test_bold_stripped_in_heading(self):
        text = "## **Метаданные**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n"
        body = md.find_section(text, r"Метаданные")
        self.assertIsNotNone(body)


class TableTests(unittest.TestCase):
    def test_metadata_table(self):
        text = (
            "| Поле | Значение |\n"
            "|------|----------|\n"
            "| **Код** | BP-001 |\n"
            "| **Группа** | GPR-01: Название |\n"
        )
        tables = md.parse_tables(text)
        self.assertEqual(len(tables), 1)
        rows = tables[0]
        self.assertEqual(rows[0]["Поле"], "Код")
        self.assertEqual(rows[0]["Значение"], "BP-001")
        self.assertEqual(rows[1]["Значение"], "GPR-01: Название")


class CodeBlockTests(unittest.TestCase):
    def test_find_mermaid(self):
        text = (
            "Prose.\n"
            "```mermaid\n"
            "flowchart TD\n"
            "A --> B\n"
            "```\n"
            "More prose.\n"
        )
        blocks = md.find_code_blocks(text, "mermaid")
        self.assertEqual(len(blocks), 1)
        self.assertIn("flowchart TD", blocks[0])


class StripMarkdownInlineTests(unittest.TestCase):
    def test_removes_bold(self):
        self.assertEqual(md.strip_markdown_inline("foo **bar** baz"), "foo bar baz")

    def test_removes_italic_star(self):
        self.assertEqual(md.strip_markdown_inline("foo *bar* baz"), "foo bar baz")

    def test_removes_italic_underscore(self):
        self.assertEqual(md.strip_markdown_inline("foo _bar_ baz"), "foo bar baz")

    def test_removes_underline_double_underscore(self):
        self.assertEqual(md.strip_markdown_inline("foo __bar__ baz"), "foo bar baz")

    def test_removes_backtick_code(self):
        self.assertEqual(md.strip_markdown_inline("use `id` field"), "use id field")

    def test_preserves_cyrillic_untouched(self):
        # Inner Cyrillic text must survive byte-for-byte.
        src = "**Модуль-владелец:** shared/core (auth)"
        self.assertEqual(
            md.strip_markdown_inline(src),
            "Модуль-владелец: shared/core (auth)",
        )

    def test_mixed_inline_formatting(self):
        src = "**Стереотип:** `Бизнес-объект`, *опционально*"
        self.assertEqual(
            md.strip_markdown_inline(src),
            "Стереотип: Бизнес-объект, опционально",
        )

    def test_empty_and_none_passthrough(self):
        self.assertEqual(md.strip_markdown_inline(""), "")
        self.assertIsNone(md.strip_markdown_inline(None))  # type: ignore[arg-type]

    def test_does_not_strip_bare_asterisks(self):
        # A * without a matching closer must be left alone (bullet markers etc.)
        self.assertEqual(md.strip_markdown_inline("* item"), "* item")


class MermaidHtmlStripTests(unittest.TestCase):
    """`<br/>` and other HTML must be stripped from states + transitions."""

    def test_state_description_strips_html(self):
        from nacl_migrate_core import mermaid
        body = (
            "stateDiagram-v2\n"
            "    created : Создана<br/>UUID сессии создан\n"
            "    created --> interview : Пользователь нажимает<br/>\"Начать\"\n"
        )
        diagram = mermaid.parse_state_diagram(body)
        assert diagram is not None
        created = next(s for s in diagram.states if s.name == "created")
        self.assertEqual(created.descriptions, ["Создана UUID сессии создан"])
        self.assertEqual(len(diagram.transitions), 1)
        self.assertEqual(
            diagram.transitions[0].condition,
            "Пользователь нажимает \"Начать\"",
        )

    def test_flowchart_label_strips_html(self):
        from nacl_migrate_core import mermaid
        body = (
            "flowchart TD\n"
            "    S1[\"1. Пользователь<br/>переходит по URL\"] --> S2\n"
        )
        fc = mermaid.parse_flowchart(body)
        assert fc is not None
        node = next(n for n in fc.nodes if n.id == "S1")
        self.assertEqual(node.label, "1. Пользователь переходит по URL")


if __name__ == "__main__":
    unittest.main()
