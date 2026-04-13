"""Unit tests for the preflight ID-pattern scanner."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from nacl_migrate_core.preflight import (
    SUPPORTED_PATTERNS,
    scan_id_patterns,
)


class WhitelistContractTests(unittest.TestCase):
    """The whitelist must include both UC families and both SCR families."""

    def test_whitelist_includes_letter_prefix_uc(self):
        cats = {row[0] for row in SUPPORTED_PATTERNS}
        self.assertIn("UseCaseLetter", cats)
        self.assertIn("ActivityStepLetter", cats)
        self.assertIn("ScreenLetter", cats)

    def test_whitelist_includes_three_digit_uc(self):
        cats = {row[0] for row in SUPPORTED_PATTERNS}
        self.assertIn("UseCase", cats)
        self.assertIn("Screen", cats)


class LayerDetectionTests(unittest.TestCase):
    def test_sa_only_00_06_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "ig"
            for sub in ("01-overview", "02-domain", "04-usecases",
                        "05-interfaces", "06-requirements"):
                (project / "docs" / sub).mkdir(parents=True)
            report = scan_id_patterns(project)
        self.assertFalse(report["layers_detected"]["ba"])
        self.assertTrue(report["layers_detected"]["sa"])
        self.assertEqual(report["layers_detected"]["sa_numbering"], "00-06")

    def test_ba_plus_sa_10_16(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "ko"
            for sub in ("01-business-processes", "02-business-entities",
                        "10-architecture", "14-usecases", "15-interfaces"):
                (project / "docs" / sub).mkdir(parents=True)
            report = scan_id_patterns(project)
        self.assertTrue(report["layers_detected"]["ba"])
        self.assertTrue(report["layers_detected"]["sa"])
        self.assertEqual(report["layers_detected"]["sa_numbering"], "10-16")


class PatternClassificationTests(unittest.TestCase):
    def _project_with_uc(self, *, filename: str, fm_uc: str) -> Path:
        tmp = tempfile.mkdtemp()
        project = Path(tmp) / "scan-fix"
        uc_dir = project / "docs" / "14-usecases"
        uc_dir.mkdir(parents=True)
        (uc_dir / filename).write_text(
            "---\n"
            f"title: \"{fm_uc}: Test\"\n"
            "type: usecase\n"
            "---\n\n# Test\n",
            encoding="utf-8",
        )
        return project

    def test_letter_prefix_uc_classified(self):
        project = self._project_with_uc(
            filename="UC-F01-leave-feedback.md",
            fm_uc="UC-F01",
        )
        report = scan_id_patterns(project)
        cats = {p["category"]: p for p in report["patterns_found"]}
        self.assertIn("UseCaseLetter", cats)
        self.assertEqual(cats["UseCaseLetter"]["example"], "UC-F01")
        self.assertEqual(report["adapter_recommendations"], ["frontmatter-v1"])
        self.assertEqual(report["patterns_unknown"], [])

    def test_three_digit_uc_classified(self):
        project = self._project_with_uc(
            filename="UC-001-import.md",
            fm_uc="UC-001",
        )
        report = scan_id_patterns(project)
        cats = {p["category"] for p in report["patterns_found"]}
        self.assertIn("UseCase", cats)
        self.assertNotIn("UseCaseLetter", cats)
        self.assertEqual(report["patterns_unknown"], [])

    def test_unknown_token_in_frontmatter_surfaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp) / "ko"
            uc_dir = project / "docs" / "14-usecases"
            uc_dir.mkdir(parents=True)
            (uc_dir / "UC-001-x.md").write_text(
                "---\n"
                "title: \"UC-001: Test\"\n"
                "type: usecase\n"
                "ba_rules: [BR-OZS-02]\n"
                "---\n\n# Test\n",
                encoding="utf-8",
            )
            report = scan_id_patterns(project)
        unknown_tokens = {u["token"] for u in report["patterns_unknown"]}
        self.assertIn("BR-OZS-02", unknown_tokens)


if __name__ == "__main__":
    unittest.main()
