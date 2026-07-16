#!/usr/bin/env python3
"""Validate every Codex skill with a pinned official OpenAI validator."""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import re
import sys
from pathlib import Path
from types import ModuleType

EXPECTED_SKILL_COUNT = 60
EXPECTED_PYYAML_VERSION = "6.0.3"
UPSTREAM_COMMIT = "4aa950d456c6c90174d3269d7eaab4a2823e5889"
REPO_ROOT = Path(__file__).resolve().parent.parent
VENDOR_ROOT = (
    REPO_ROOT
    / "tests"
    / "codex-plugin"
    / "vendor"
    / "openai-codex"
    / UPSTREAM_COMMIT
)
EXPECTED_VENDOR_HASHES = {
    "quick_validate.py": "6cc9dc3199c935916cf6f73fcbbbb0e3bb1b58c8f5109fefa499978908164f51",
    "LICENSE": "d17f227e4df5da1600391338865ce0f3055211760a36688f816941d58232d8dc",
    "NOTICE": "9d71575ecfd9a843fc1677b0efb08053c6ba9fd686a0de1a6f5382fd3c220915",
}


class BlockedError(RuntimeError):
    """The validator could not establish a trustworthy execution environment."""


def parse_arguments(argv: list[str]) -> tuple[Path, int]:
    skills_root = REPO_ROOT / "skills-for-codex"
    expected_count = EXPECTED_SKILL_COUNT
    index = 0
    while index < len(argv):
        argument = argv[index]
        if argument == "--root":
            index += 1
            if index >= len(argv):
                raise BlockedError("--root requires a directory argument")
            skills_root = Path(argv[index]).resolve()
        elif argument == "--expected-count":
            index += 1
            if index >= len(argv):
                raise BlockedError("--expected-count requires a positive integer")
            try:
                expected_count = int(argv[index])
            except ValueError as error:
                raise BlockedError("--expected-count requires a positive integer") from error
            if expected_count < 1:
                raise BlockedError("--expected-count requires a positive integer")
        else:
            raise BlockedError(f"unknown argument: {argument}")
        index += 1
    return skills_root, expected_count


def verify_vendor_files() -> Path:
    """Verify every preserved upstream byte before importing the validator."""
    for filename, expected_hash in EXPECTED_VENDOR_HASHES.items():
        artifact = VENDOR_ROOT / filename
        try:
            artifact_bytes = artifact.read_bytes()
        except OSError as error:
            raise BlockedError(f"cannot read vendored {filename}: {error}") from error
        actual_hash = hashlib.sha256(artifact_bytes).hexdigest()
        if actual_hash != expected_hash:
            raise BlockedError(
                f"vendored {filename} checksum mismatch: "
                f"expected {expected_hash}, got {actual_hash}"
            )
    return VENDOR_ROOT / "quick_validate.py"


def load_official_validator(validator_path: Path) -> ModuleType:
    """Require the pinned dependency, then import the checksum-verified snapshot."""
    try:
        installed_version = importlib.metadata.version("PyYAML")
    except importlib.metadata.PackageNotFoundError as error:
        raise BlockedError(
            f"PyYAML {EXPECTED_PYYAML_VERSION} is required but is not installed"
        ) from error
    if installed_version != EXPECTED_PYYAML_VERSION:
        raise BlockedError(
            f"PyYAML {EXPECTED_PYYAML_VERSION} is required, found {installed_version}"
        )

    spec = importlib.util.spec_from_file_location(
        "nacl_vendored_openai_quick_validate", validator_path
    )
    if spec is None or spec.loader is None:
        raise BlockedError("cannot create an import spec for the vendored validator")
    module = importlib.util.module_from_spec(spec)
    previous_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    except Exception as error:
        raise BlockedError(f"cannot import the vendored validator: {error}") from error
    finally:
        sys.dont_write_bytecode = previous_dont_write_bytecode

    if not callable(getattr(module, "validate_skill", None)):
        raise BlockedError("vendored validator does not expose validate_skill()")
    loaded_yaml_version = getattr(getattr(module, "yaml", None), "__version__", None)
    if loaded_yaml_version != EXPECTED_PYYAML_VERSION:
        raise BlockedError(
            "vendored validator loaded an unexpected PyYAML version: "
            f"{loaded_yaml_version!r}"
        )
    return module


def inventory_skills(skills_root: Path) -> list[Path]:
    if not skills_root.is_dir():
        raise BlockedError(f"skills root is not a directory: {skills_root}")
    try:
        entries = sorted(skills_root.iterdir(), key=lambda entry: entry.name)
        return [
            entry
            for entry in entries
            if entry.is_dir() and (entry / "SKILL.md").is_file()
        ]
    except OSError as error:
        raise BlockedError(f"cannot inventory skills under {skills_root}: {error}") from error


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def read_frontmatter_name(skill_path: Path, validator: ModuleType) -> str:
    """Read name with the exact yaml.safe_load imported by the official snapshot."""
    try:
        content = (skill_path / "SKILL.md").read_text()
    except OSError as error:
        raise BlockedError(f"cannot read {skill_path / 'SKILL.md'}: {error}") from error
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if match is None:
        raise BlockedError(
            f"official validator accepted unreadable frontmatter in {skill_path / 'SKILL.md'}"
        )
    try:
        frontmatter = validator.yaml.safe_load(match.group(1))
    except Exception as error:
        raise BlockedError(
            f"cannot re-read validated frontmatter in {skill_path / 'SKILL.md'}: {error}"
        ) from error
    if not isinstance(frontmatter, dict) or not isinstance(frontmatter.get("name"), str):
        raise BlockedError(
            f"official validator accepted an unusable name in {skill_path / 'SKILL.md'}"
        )
    return frontmatter["name"].strip()


def run(skills_root: Path, expected_count: int, validator: ModuleType) -> int:
    skill_paths = inventory_skills(skills_root)
    failures: list[str] = []
    if len(skill_paths) != expected_count:
        failures.append(
            f"Expected exactly {expected_count} Codex skills, "
            f"found {len(skill_paths)} under {skills_root}"
        )

    for skill_path in skill_paths:
        rendered_path = display_path(skill_path / "SKILL.md")
        print(f"CHECKED {rendered_path}")
        try:
            valid, message = validator.validate_skill(skill_path)
        except Exception as error:
            raise BlockedError(
                f"official validator execution failed for {rendered_path}: {error}"
            ) from error
        if not valid:
            failures.append(f"{rendered_path}: {message}")
            continue

        declared_name = read_frontmatter_name(skill_path, validator)
        if declared_name != skill_path.name:
            failures.append(
                f"{rendered_path}: Name '{declared_name}' does not match "
                f"skill directory '{skill_path.name}'"
            )

    if failures:
        for failure in failures:
            print(f"FAILED {failure}", file=sys.stderr)
        print(f"Validated count: {len(skill_paths)}", file=sys.stderr)
        print("Status: FAILED", file=sys.stderr)
        return 1

    print(f"Validated count: {len(skill_paths)}")
    print("Status: VERIFIED")
    return 0


def main(argv: list[str]) -> int:
    try:
        skills_root, expected_count = parse_arguments(argv)
        validator_path = verify_vendor_files()
        validator = load_official_validator(validator_path)
        return run(skills_root, expected_count, validator)
    except BlockedError as error:
        print("Status: BLOCKED", file=sys.stderr)
        print(f"Reason: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
