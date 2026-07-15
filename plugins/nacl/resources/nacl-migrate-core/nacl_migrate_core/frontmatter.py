"""Frontmatter helpers — stdlib only.

Parses the YAML *subset* that the old-methodology skills actually produce:
  - top-level scalar fields: `title: string` / `status: draft`
  - lists: `tags: [tag1, tag2]` inline OR multi-line with `- item`
  - dates: strings like `2026-03-20` (kept as strings)
  - nested mappings: NOT supported; the old skills never emit them

The goal is not YAML compliance — it is to faithfully recover the keys the
skills use in practice. Anything surprising yields a warning rather than a
crash.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def extract(text: str) -> Tuple[Optional[Dict[str, Any]], str]:
    """Split text into (frontmatter_dict_or_None, body_text).

    Only recognises frontmatter if the file begins (after an optional BOM)
    with `---\\n`. Otherwise returns (None, text) unchanged.
    """
    # Strip UTF-8 BOM if present
    if text.startswith("\ufeff"):
        text = text[1:]
    if not text.startswith("---"):
        return None, text
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return None, text
    yaml_text = match.group(1)
    body = text[match.end():]
    return _parse(yaml_text), body


def _parse(yaml_text: str) -> Dict[str, Any]:
    """Parse the supported YAML subset into a plain dict."""
    result: Dict[str, Any] = {}
    lines = yaml_text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue

        # top-level "key: value" or "key:" (list follows on subsequent indented lines)
        m = re.match(r"^([A-Za-z0-9_\-]+)\s*:\s*(.*)$", line)
        if not m:
            i += 1
            continue
        key = m.group(1).strip()
        rest = m.group(2).strip()

        if rest == "":
            # Block list or block scalar — look ahead for `- item` or indented lines
            items: List[Any] = []
            j = i + 1
            while j < len(lines):
                la = lines[j]
                if not la.strip():
                    j += 1
                    continue
                if la.startswith("  - ") or la.startswith("- "):
                    items.append(_scalar(la.lstrip()[2:].strip()))
                    j += 1
                    continue
                # Anything not a list item ends the block
                break
            result[key] = items
            i = j
            continue

        if rest.startswith("[") and rest.endswith("]"):
            # inline list: [a, b, c]
            inner = rest[1:-1].strip()
            parts = [p.strip() for p in _split_inline(inner)] if inner else []
            result[key] = [_scalar(p) for p in parts]
            i += 1
            continue

        result[key] = _scalar(rest)
        i += 1
    return result


def _scalar(raw: str) -> Any:
    s = raw.strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1]
    if s.lower() in ("true", "yes"):
        return True
    if s.lower() in ("false", "no"):
        return False
    if s.lower() in ("null", "~", ""):
        return None
    # Leave numbers as strings — the consumers expect strings for IDs like "0023"
    return s


def _split_inline(s: str) -> List[str]:
    """Split a comma-separated inline list, respecting quoted strings."""
    out: List[str] = []
    buf: List[str] = []
    quote: Optional[str] = None
    for ch in s:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in ("'", '"'):
            quote = ch
            buf.append(ch)
            continue
        if ch == ",":
            out.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if buf:
        out.append("".join(buf))
    return [x.strip() for x in out if x.strip() != ""]
