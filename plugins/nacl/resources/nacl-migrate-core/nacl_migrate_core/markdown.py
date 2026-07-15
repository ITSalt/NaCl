"""Markdown helpers — stdlib only.

Not a full AST. Targeted extractors for the exact shapes produced by the
old-methodology skills:
  - section headings (## …)
  - pipe-style tables
  - fenced code blocks (```lang … ```)

All functions operate on a plain text string and return plain Python structures.
No external dependencies, no regex beyond the re module.
"""

from __future__ import annotations

import re
from typing import Iterable, List, Optional, Tuple


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
_TABLE_ROW_RE = re.compile(r"^\s*\|(.+)\|\s*$")
_CODE_FENCE_RE = re.compile(r"^\s*```(\S*)\s*$")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")

# Inline-markdown strippers used by strip_markdown_inline.
# Order matters: bold (`**x**`) / underline (`__x__`) before italic / single-char,
# backticks are handled independently. All patterns use non-greedy capture and
# require the inner text to be non-empty so we don't accidentally eat bare `**`.
_INLINE_BOLD_RE = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_INLINE_UNDERLINE_RE = re.compile(r"__(.+?)__", re.DOTALL)
_INLINE_ITALIC_STAR_RE = re.compile(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", re.DOTALL)
_INLINE_ITALIC_UND_RE = re.compile(r"(?<!_)_(?!\s)(.+?)(?<!\s)_(?!_)", re.DOTALL)
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")


def strip_markdown_inline(s: str) -> str:
    """Strip markdown inline formatting while preserving inner text.

    Handles (in order, single pass each):
      - ``**bold**``  -> ``bold``
      - ``__underline__`` -> ``underline``
      - `` `code` `` -> ``code``
      - ``*italic*`` -> ``italic``
      - ``_italic_`` -> ``italic``

    Cyrillic and other non-ASCII text inside the markers is preserved byte-for-byte
    because the regexes only match the ASCII punctuation markers themselves.

    Not meant for content inside fenced code blocks — callers should skip or
    handle those separately (e.g. mermaid bodies). No-op on ``None``/empty input.
    """
    if not s:
        return s
    out = _INLINE_BOLD_RE.sub(r"\1", s)
    out = _INLINE_UNDERLINE_RE.sub(r"\1", out)
    out = _INLINE_CODE_RE.sub(r"\1", out)
    out = _INLINE_ITALIC_STAR_RE.sub(r"\1", out)
    out = _INLINE_ITALIC_UND_RE.sub(r"\1", out)
    return out


# ---------------------------------------------------------------------------
# Sections

def iter_sections(text: str) -> Iterable[Tuple[int, int, str, str]]:
    """Yield (level, line_number, heading_text, body_text) for each heading.

    `body_text` runs from the line after the heading up to (but not including)
    the next heading at any level, or end-of-file.
    """
    lines = text.splitlines()
    starts: List[Tuple[int, int, str]] = []
    for i, line in enumerate(lines):
        m = _HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            starts.append((i, level, m.group(2).strip()))
    for idx, (line_no, level, heading) in enumerate(starts):
        end = starts[idx + 1][0] if idx + 1 < len(starts) else len(lines)
        body = "\n".join(lines[line_no + 1:end])
        yield level, line_no + 1, heading, body


def find_section(text: str, heading_pattern: str, *, case_insensitive: bool = True
                 ) -> Optional[str]:
    """Return body of the first section whose heading FULL-MATCHES the pattern.

    Full-match (not substring) is intentional: heading patterns like
    `"Workflow"` must not accidentally match H1 titles like `"BP-001 Workflow: …"`.
    Bold markers `**` in headings are stripped before matching.
    """
    flags = re.IGNORECASE if case_insensitive else 0
    pat = re.compile(heading_pattern, flags)
    for _, _, heading, body in iter_sections(text):
        plain = _BOLD_RE.sub(r"\1", heading).strip()
        if pat.fullmatch(plain):
            return body
    return None


def find_sections(text: str, heading_pattern: str, *, case_insensitive: bool = True
                  ) -> List[Tuple[str, str]]:
    """Return [(heading, body), ...] for every section whose heading FULL-MATCHES."""
    flags = re.IGNORECASE if case_insensitive else 0
    pat = re.compile(heading_pattern, flags)
    hits: List[Tuple[str, str]] = []
    for _, _, heading, body in iter_sections(text):
        plain = _BOLD_RE.sub(r"\1", heading).strip()
        if pat.fullmatch(plain):
            hits.append((plain, body))
    return hits


# ---------------------------------------------------------------------------
# Tables

def parse_tables(text: str) -> List[List[dict[str, str]]]:
    """Find every pipe-style table and return rows as dicts keyed by column header.

    Returns a list of tables; each table is a list of row-dicts.
    A row is only produced after a header row + separator row; the separator
    row (|---|---|) is NOT required, but when present is consumed.
    """
    lines = text.splitlines()
    tables: List[List[dict[str, str]]] = []
    i = 0
    while i < len(lines):
        m = _TABLE_ROW_RE.match(lines[i])
        if not m:
            i += 1
            continue

        # Header row
        headers = _split_row(lines[i])
        headers = [_strip_bold(h) for h in headers]
        i += 1

        # Optional separator row
        if i < len(lines) and _is_separator_row(lines[i]):
            i += 1

        rows: List[dict[str, str]] = []
        while i < len(lines) and _TABLE_ROW_RE.match(lines[i]):
            values = _split_row(lines[i])
            if _is_separator_row(lines[i]):
                i += 1
                continue
            # Pad / truncate to match header count
            while len(values) < len(headers):
                values.append("")
            rows.append({
                headers[k]: _strip_bold(values[k])
                for k in range(len(headers))
            })
            i += 1

        if rows:
            tables.append(rows)
    return tables


def first_table_after(text: str, heading_pattern: str, *, case_insensitive: bool = True
                      ) -> Optional[List[dict[str, str]]]:
    """Return the first table inside the section whose heading matches."""
    body = find_section(text, heading_pattern, case_insensitive=case_insensitive)
    if body is None:
        return None
    tables = parse_tables(body)
    return tables[0] if tables else None


def _split_row(line: str) -> List[str]:
    # Strip leading/trailing pipes, split on unescaped |
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_separator_row(line: str) -> bool:
    # | --- | :---: | ... |
    if not _TABLE_ROW_RE.match(line):
        return False
    cells = _split_row(line)
    return all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c)


def _strip_bold(s: str) -> str:
    return _BOLD_RE.sub(r"\1", s).strip()


# ---------------------------------------------------------------------------
# Code blocks

def iter_code_blocks(text: str) -> Iterable[Tuple[str, str]]:
    """Yield (language, body) for each fenced code block in document order."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        m = _CODE_FENCE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        lang = m.group(1).strip().lower()
        body_lines: List[str] = []
        i += 1
        while i < len(lines) and not _CODE_FENCE_RE.match(lines[i]):
            body_lines.append(lines[i])
            i += 1
        i += 1  # consume closing fence
        yield lang, "\n".join(body_lines)


def find_code_blocks(text: str, language: str) -> List[str]:
    """Return all code blocks with the given language tag."""
    return [body for lang, body in iter_code_blocks(text) if lang == language.lower()]
