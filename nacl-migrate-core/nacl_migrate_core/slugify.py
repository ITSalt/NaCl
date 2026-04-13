"""ID / slug helpers — stdlib only."""

from __future__ import annotations

import re
import unicodedata

# Cyrillic-to-Latin transliteration table (simplified BGN/PCGN).
# Applied BEFORE NFKD so Cyrillic chars become ASCII before the
# generic decomposition pass handles any remaining non-ASCII scripts.
_CYRILLIC_MAP = {
    ord('А'): 'A',  ord('Б'): 'B',  ord('В'): 'V',  ord('Г'): 'G',
    ord('Д'): 'D',  ord('Е'): 'E',  ord('Ё'): 'Yo', ord('Ж'): 'Zh',
    ord('З'): 'Z',  ord('И'): 'I',  ord('Й'): 'Y',  ord('К'): 'K',
    ord('Л'): 'L',  ord('М'): 'M',  ord('Н'): 'N',  ord('О'): 'O',
    ord('П'): 'P',  ord('Р'): 'R',  ord('С'): 'S',  ord('Т'): 'T',
    ord('У'): 'U',  ord('Ф'): 'F',  ord('Х'): 'Kh', ord('Ц'): 'Ts',
    ord('Ч'): 'Ch', ord('Ш'): 'Sh', ord('Щ'): 'Shch',
    ord('Ъ'): '',   ord('Ы'): 'Y',  ord('Ь'): '',   ord('Э'): 'E',
    ord('Ю'): 'Yu', ord('Я'): 'Ya',
    # lowercase
    ord('а'): 'a',  ord('б'): 'b',  ord('в'): 'v',  ord('г'): 'g',
    ord('д'): 'd',  ord('е'): 'e',  ord('ё'): 'yo', ord('ж'): 'zh',
    ord('з'): 'z',  ord('и'): 'i',  ord('й'): 'y',  ord('к'): 'k',
    ord('л'): 'l',  ord('м'): 'm',  ord('н'): 'n',  ord('о'): 'o',
    ord('п'): 'p',  ord('р'): 'r',  ord('с'): 's',  ord('т'): 't',
    ord('у'): 'u',  ord('ф'): 'f',  ord('х'): 'kh', ord('ц'): 'ts',
    ord('ч'): 'ch', ord('ш'): 'sh', ord('щ'): 'shch',
    ord('ъ'): '',   ord('ы'): 'y',  ord('ь'): '',   ord('э'): 'e',
    ord('ю'): 'yu', ord('я'): 'ya',
}


def slugify(text: str, max_len: int = 50) -> str:
    """Normalise a string for use in a canonical ID slug.

    - Cyrillic → Latin transliteration (stdlib-only)
    - Remaining Unicode → ASCII via NFKD decomposition
    - lowercase
    - non-alphanumeric → hyphen
    - collapse repeats, trim hyphens
    - truncate at max_len
    """
    # Step 1: transliterate Cyrillic before NFKD
    transliterated = text.translate(_CYRILLIC_MAP)
    # Step 2: existing NFKD path for any remaining non-ASCII
    normalised = unicodedata.normalize("NFKD", transliterated)
    ascii_only = normalised.encode("ascii", "ignore").decode("ascii")
    lowered = ascii_only.lower()
    replaced = re.sub(r"[^a-z0-9]+", "-", lowered)
    trimmed = replaced.strip("-")
    if len(trimmed) > max_len:
        trimmed = trimmed[:max_len].rstrip("-")
    return trimmed or "unnamed"


def pad_id(prefix: str, number: int, width: int) -> str:
    """`pad_id("BP", 3, 3)` -> "BP-003"."""
    return f"{prefix}-{number:0{width}d}"


def parse_numeric_id(value: str, prefix: str) -> int | None:
    """`parse_numeric_id("BP-007", "BP")` -> 7; returns None on mismatch."""
    m = re.match(rf"^{re.escape(prefix)}-(\d+)$", value)
    return int(m.group(1)) if m else None


def canonical_role_id(raw: str) -> str | None:
    """Normalise a role ID: ACT-NN -> ROL-NN, ROL-NN -> ROL-NN.

    Returns None if the input is not recognisable.
    """
    raw = raw.strip()
    m = re.match(r"^(?:ACT|ROL|РОЛЬ)-(\d+)$", raw)
    if not m:
        return None
    number = int(m.group(1))
    return f"ROL-{number:02d}"


def canonical_step_id(bp_id: str, step_number: int) -> str:
    """`canonical_step_id("BP-001", 3)` -> "BP-001-S03"."""
    return f"{bp_id}-S{step_number:02d}"


def canonical_attribute_id(obj_id: str, attr_number: int) -> str:
    return f"{obj_id}-A{attr_number:02d}"


def canonical_state_id(obj_id: str, state_number: int) -> str:
    return f"{obj_id}-ST{state_number:02d}"
