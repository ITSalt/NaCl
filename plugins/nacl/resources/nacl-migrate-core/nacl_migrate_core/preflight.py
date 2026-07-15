"""Preflight ID-pattern scanner.

Walks a project's BA + SA docs folders, extracts every ID-like token from
filenames and YAML frontmatter values, classifies each token against the
adapter-supported whitelist, and returns a structured summary.

This is the orchestrator's safety net: if the source repo uses an ID
convention no current adapter understands (e.g. a ``UC-F01`` letter-prefix
family before a widened adapter ships), the orchestrator must surface the gap and
ask the user to widen an adapter (with a fixture + test) before any parse
runs.

Pure stdlib. Imported by the CLI wrapper at
``nacl-migrate-ba/scripts/preflight_ids.py`` and by the adapters via the
shared :data:`SUPPORTED_PATTERNS` table — keeping the whitelist in one
place so adapter widening and preflight detection cannot drift apart.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Single source of truth for adapter-supported ID patterns.
#
# Each entry: ``(category, regex_str, example)``. The regex is matched as a
# *full* token (anchored implicitly at word boundaries by the scanner); the
# category names match IR dataclass labels where they exist.
# ---------------------------------------------------------------------------

SUPPORTED_PATTERNS: List[Tuple[str, str, str]] = [
    # ---------------- BA layer ---------------------------------------------
    ("ProcessGroup",        r"GPR-\d{2}",                     "GPR-01"),
    ("BusinessProcess",     r"BP-\d{3}",                      "BP-001"),
    ("WorkflowStep",        r"BP-\d{3}-S\d{2}",               "BP-001-S01"),
    ("BusinessEntity",      r"OBJ-\d{3}",                     "OBJ-001"),
    ("EntityAttribute",     r"OBJ-\d{3}-A\d{2}",              "OBJ-001-A01"),
    ("EntityState",         r"OBJ-\d{3}-ST\d{2}",             "OBJ-001-ST01"),
    ("BusinessRoleROL",     r"ROL-\d{2}",                     "ROL-01"),
    ("BusinessRoleACT",     r"ACT-\d{2}",                     "ACT-01"),
    ("BusinessRequirement", r"BRQ-\d{3}",                     "BRQ-001"),
    ("GlossaryTerm",        r"GLO-\d{3}",                     "GLO-001"),
    ("ExternalSystem",      r"SYS-\d{3}",                     "SYS-001"),
    ("Stakeholder",         r"STK-\d{2}",                     "STK-01"),
    ("ExternalEntity",      r"EXT-\d{2}",                     "EXT-01"),
    ("DataFlow",            r"DFL-\d{3}",                     "DFL-001"),

    # ---------------- SA layer ---------------------------------------------
    ("UseCase",             r"UC-\d{3}",                      "UC-001"),
    ("UseCaseLetter",       r"UC-[A-Z]\d{2}",                 "UC-F01"),
    ("ActivityStep",        r"UC-\d{3}-A\d{2}",               "UC-001-A01"),
    ("ActivityStepLetter",  r"UC-[A-Z]\d{2}-A\d{2}",          "UC-F01-A01"),
    ("Screen",              r"SCR-\d{3}",                     "SCR-001"),
    ("ScreenLetter",        r"SCR-[A-Z]\d{2}",                "SCR-F01"),
    ("DomainEntity",        r"DE-[a-z0-9\-]+",                "DE-user"),
    ("Enumeration",         r"EN-[a-z0-9\-]+",                "EN-status"),
    ("Form",                r"FORM-[a-z0-9\-]+",              "FORM-login"),
    ("Requirement",         r"REQ-[A-Z0-9\-]+",               "REQ-RQ101-01"),
    ("SystemRole",          r"SYSROL-[A-Z0-9_\-]+",           "SYSROL-ADMIN"),
]


# A loose ID-token recogniser used to scan source files for *anything that
# looks like* an ID prefix-style token. Matches ``ALPHA-...`` tokens of a
# few canonical shapes. We intentionally over-match here; classification
# against SUPPORTED_PATTERNS does the filtering.
_ID_TOKEN_RE = re.compile(r"\b([A-Z]{2,8}(?:-[A-Za-z0-9]+){1,3})\b")


# ---------------------------------------------------------------------------
# Layer detection
# ---------------------------------------------------------------------------

_BA_DIRS = (
    "00-context",
    "01-business-processes",
    "02-business-entities",
    "03-business-roles",
    "04-business-rules",
)

_SA_DIRS_10_16 = (
    "10-architecture", "11-overview", "12-domain",
    "13-roles", "14-usecases", "15-interfaces", "16-requirements",
)

_SA_DIRS_00_06 = (
    "00-architecture", "01-overview", "02-domain",
    "03-roles", "04-usecases", "05-interfaces", "06-requirements",
)


def _detect_layers(project: Path) -> Dict[str, object]:
    docs = project / "docs"
    ba_present = any((docs / d).is_dir() for d in _BA_DIRS)
    sa_10 = sum(1 for d in _SA_DIRS_10_16 if (docs / d).is_dir())
    sa_00 = sum(1 for d in _SA_DIRS_00_06 if (docs / d).is_dir())
    # Critical: 00-06 SA folders look almost identical to BA's 00-04. We
    # only count 00-06 as "SA" if the SA-only suffixes (04-usecases,
    # 05-interfaces, 06-requirements) are present. Otherwise the 00-04
    # range belongs to BA.
    sa_only_dirs_present = any(
        (docs / d).is_dir()
        for d in ("04-usecases", "05-interfaces", "06-requirements")
    )
    sa_present = sa_10 > 0 or (sa_00 > 0 and sa_only_dirs_present and not ba_present)
    if sa_10 > 0:
        numbering = "10-16"
    elif sa_00 > 0 and sa_only_dirs_present and not ba_present:
        numbering = "00-06"
    else:
        numbering = "unknown"
    return {"ba": ba_present, "sa": sa_present, "sa_numbering": numbering}


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------

def _iter_doc_files(project: Path) -> List[Path]:
    """Yield all canonical-layer Markdown files under ``docs/``.

    Only files inside one of the recognised BA / SA layer subdirectories
    are returned. Top-level ``docs/*.md`` and other ad-hoc folders (like
    ``docs/DEPLOY.md`` or scratch notes) are skipped — they don't drive
    parse and would only create false-positive unknowns.
    """
    docs = project / "docs"
    if not docs.is_dir():
        return []
    accepted_dirs = set(_BA_DIRS) | set(_SA_DIRS_10_16) | set(_SA_DIRS_00_06) | {"99-meta"}
    out: List[Path] = []
    for sub in sorted(accepted_dirs):
        d = docs / sub
        if not d.is_dir():
            continue
        out.extend(p for p in d.rglob("*.md") if p.is_file())
    return sorted(out)


def _extract_tokens(path: Path) -> List[Tuple[str, str]]:
    """Return list of ``(token, source_hint)``.

    ``source_hint`` is ``"filename"`` or ``"frontmatter"``. We deliberately
    skip body text — body content is too noisy (table cells routinely
    reference IDs that already came from filenames / frontmatter), and the
    preflight only needs *what kinds of IDs the project produces*, not full
    citation tracking.
    """
    out: List[Tuple[str, str]] = []
    # 1. Filename — strip the conventional ``-lowercase-slug`` suffix so
    # ``UC-F01-leave-feedback.md`` yields ``UC-F01``, not the whole basename.
    stem = path.stem
    for raw in _ID_TOKEN_RE.finditer(stem):
        out.extend(_split_filename_token(raw.group(1)))

    # 2. YAML frontmatter (between two leading ``---`` fences)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    fm_block = _extract_frontmatter_block(text)
    if fm_block:
        for m in _ID_TOKEN_RE.finditer(fm_block):
            out.append((m.group(1), "frontmatter"))
    return out


def _split_filename_token(token: str) -> List[Tuple[str, str]]:
    """A filename like ``UC-F01-leave-feedback`` should yield the leading
    canonical-shape segment ``UC-F01`` (or ``UC-001-A02``), not the whole
    string. Walk segments left-to-right and stop as soon as we hit a
    segment containing lowercase characters.
    """
    parts = token.split("-")
    keep: List[str] = []
    for part in parts:
        # Pure-uppercase / digit / mixed alphanumeric segment — keep going.
        if re.fullmatch(r"[A-Z0-9]+", part):
            keep.append(part)
            continue
        break
    if not keep:
        return []
    canonical = "-".join(keep)
    return [(canonical, "filename")]


def _extract_frontmatter_block(text: str) -> str:
    if not text.startswith("---"):
        return ""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    end = -1
    for i, ln in enumerate(lines[1:], start=1):
        if ln.strip() == "---":
            end = i
            break
    if end < 0:
        return ""
    return "\n".join(lines[1:end])


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

@dataclass
class _PatternHit:
    category: str
    pattern: str
    example: str


def _classify_token(token: str) -> Optional[_PatternHit]:
    for category, pattern, example in SUPPORTED_PATTERNS:
        if re.fullmatch(pattern, token):
            return _PatternHit(category=category, pattern=pattern, example=example)
    return None


def _looks_like_id(token: str) -> bool:
    """Filter out obvious false positives (header words, file-format tags).

    Returns True if the token is plausibly meant to be an ID — i.e. it has
    the ``PREFIX-...`` shape and the prefix is uppercase.
    """
    if "-" not in token:
        return False
    prefix = token.split("-", 1)[0]
    if not (2 <= len(prefix) <= 8):
        return False
    if not prefix.isupper():
        return False
    return True


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def scan_id_patterns(project_path: Path) -> dict:
    """Walk the project's docs folder and return a summary of ID-pattern
    coverage. See module docstring for the output schema.
    """
    project_path = project_path.resolve()
    layers = _detect_layers(project_path)

    # Aggregators keyed by (category, pattern).
    counts: Dict[Tuple[str, str], int] = {}
    examples: Dict[Tuple[str, str], str] = {}
    unknowns: List[dict] = []
    seen_unknown_tokens: set[str] = set()

    for path in _iter_doc_files(project_path):
        tokens = _extract_tokens(path)
        for token, _hint in tokens:
            if not _looks_like_id(token):
                continue
            hit = _classify_token(token)
            if hit is not None:
                key = (hit.category, hit.pattern)
                counts[key] = counts.get(key, 0) + 1
                examples.setdefault(key, token)
            else:
                if token in seen_unknown_tokens:
                    continue
                seen_unknown_tokens.add(token)
                rel = _safe_rel(project_path, path)
                unknowns.append({
                    "token": token,
                    "source_file": rel,
                    "reason": "unrecognised prefix or shape",
                })

    patterns_found = []
    for (category, pattern), count in sorted(counts.items()):
        patterns_found.append({
            "category": category,
            "pattern": pattern,
            "example": examples.get((category, pattern), ""),
            "count": count,
        })

    # Adapter recommendation — coarse heuristic. If we saw any letter-prefix
    # SA tokens, frontmatter-v1 is the only adapter that handles them; if
    # only 3-digit SA tokens, both adapters are eligible.
    adapter_recs: List[str] = []
    cats_seen = {p["category"] for p in patterns_found}
    if cats_seen & {"UseCaseLetter", "ScreenLetter", "ActivityStepLetter"}:
        adapter_recs.append("frontmatter-v1")
    else:
        if cats_seen & {"UseCase", "Screen", "ActivityStep", "DomainEntity"}:
            adapter_recs.extend(["inline-table-v1", "frontmatter-v1"])

    return {
        "project_path": str(project_path),
        "layers_detected": layers,
        "patterns_found": patterns_found,
        "patterns_unknown": unknowns,
        "adapter_recommendations": adapter_recs,
    }


def _safe_rel(project: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(project))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# Convenience: write the result as JSON

def write_report(report: dict, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
