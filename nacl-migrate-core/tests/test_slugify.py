"""Unit tests for Cyrillic transliteration in slugify()."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.slugify import slugify


class CyrillicTransliterationTests(unittest.TestCase):
    def test_dispetcher(self):
        self.assertEqual(slugify("Диспетчер"), "dispetcher")

    def test_klient(self):
        self.assertEqual(slugify("Клиент"), "klient")

    def test_administrator_sistemy(self):
        self.assertEqual(slugify("Администратор системы"), "administrator-sistemy")

    def test_ascii_unchanged(self):
        self.assertEqual(slugify("ExclusionList"), "exclusionlist")

    def test_empty_input(self):
        self.assertEqual(slugify(""), "unnamed")

    def test_multi_char_mappings(self):
        self.assertEqual(slugify("Ш Щ Ц Ч Ж"), "sh-shch-ts-ch-zh")


if __name__ == "__main__":
    unittest.main()
