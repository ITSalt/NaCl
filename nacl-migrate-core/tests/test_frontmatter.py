"""Stdlib unittest suite for nacl_migrate_core.frontmatter."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core import frontmatter


class ExtractTests(unittest.TestCase):
    def test_no_frontmatter(self):
        meta, body = frontmatter.extract("# Heading\n\nProse.\n")
        self.assertIsNone(meta)
        self.assertEqual(body, "# Heading\n\nProse.\n")

    def test_simple_scalars(self):
        text = (
            "---\n"
            "title: \"UC001. Вход\"\n"
            "status: draft\n"
            "priority: primary\n"
            "---\n"
            "Body here.\n"
        )
        meta, body = frontmatter.extract(text)
        assert meta is not None
        self.assertEqual(meta["title"], "UC001. Вход")
        self.assertEqual(meta["status"], "draft")
        self.assertEqual(meta["priority"], "primary")
        self.assertIn("Body here", body)

    def test_inline_list(self):
        text = "---\ntags: [usecase, primary, core]\n---\nx\n"
        meta, _ = frontmatter.extract(text)
        assert meta is not None
        self.assertEqual(meta["tags"], ["usecase", "primary", "core"])

    def test_block_list(self):
        text = "---\ntags:\n  - usecase\n  - primary\n---\nx\n"
        meta, _ = frontmatter.extract(text)
        assert meta is not None
        self.assertEqual(meta["tags"], ["usecase", "primary"])

    def test_booleans_and_null(self):
        text = "---\nactive: true\narchived: no\nowner: null\n---\nx\n"
        meta, _ = frontmatter.extract(text)
        assert meta is not None
        self.assertIs(meta["active"], True)
        self.assertIs(meta["archived"], False)
        self.assertIsNone(meta["owner"])


if __name__ == "__main__":
    unittest.main()
