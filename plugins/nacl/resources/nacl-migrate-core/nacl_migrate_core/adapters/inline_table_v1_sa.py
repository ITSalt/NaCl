"""inline-table-v1 adapter — SA layer.

Target format (short-prefix-uc dialect):
  - docs/10-architecture/module-tree.md:      module table
  - docs/12-domain/entities/*.md:             # Name (RU) + ## Атрибуты table + ## Жизненный цикл mermaid
  - docs/12-domain/enumerations/*.md:         # Name + ## Значения table
  - docs/13-roles/role-matrix.md:             registry table
  - docs/14-usecases/UC###-*.md:              ## 1. Метаданные + sections
  - docs/15-interfaces/screens/SCR-###-*.md:  ## 1. Метаданные + layout/fields
  - docs/16-requirements/UC###-requirements.md: per-UC FR/NFR blocks

Numbering variants:
  - `10-16` layout
  - `00-06` layout

Returns a SaIR plus a HandoffIR parsed from docs/99-meta/traceability-matrix.md.
Both are returned as a tuple from parse() to avoid coupling the two stores.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .. import frontmatter as fm
from .. import markdown as md
from .. import mermaid
from ..ir_handoff import HandoffEdge, HandoffIR
from ..ir_sa import (
    ActivityStep,
    DomainAttribute,
    DomainEntity,
    DomainEntityRelation,
    EnumValue,
    Enumeration,
    Form,
    FormField,
    Module,
    Requirement,
    SaIR,
    SaWarning,
    SystemRole,
    UseCase,
)
from ..slugify import canonical_role_id, slugify


_METADATA_HEADING = (
    r"(?:\d+\.\s+)?(?:Метаданные|Metadata|Карточка(?:\s+.+)?|UC\s+card)"
)


def _canonicalize_actor(text: Optional[str]) -> Optional[str]:
    """Return canonical 'User' / 'System' from a raw actor string, or None.

    Uses case-insensitive substring matching so complex Russian strings like
    'ACT-01 Пользователь (Посетитель)' and 'Система (триггер: ...)' resolve
    correctly.  Returns None for empty/None input or unrecognised values.
    """
    if not text:
        return None
    tl = text.lower()
    if any(kw in tl for kw in ("пользовател", "клиент", "user", "client")):
        return "User"
    if any(kw in tl for kw in ("систем", "сервер", "system", "server")):
        return "System"
    return None


# ---------------------------------------------------------------------------

class InlineTableV1SaAdapter:
    name = "inline-table-v1"
    version = "1.0.0"

    @classmethod
    def detect(cls, sample_files: List[Path]) -> float:
        if not sample_files:
            return 0.0
        hits = 0
        for path in sample_files:
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            if text.lstrip().startswith("---"):
                continue
            first = next((ln for ln in text.splitlines() if ln.strip()), "")
            if not first.startswith("# "):
                continue
            if md.find_section(text, _METADATA_HEADING) is not None:
                hits += 1
            else:
                # domain-entity files have no Метаданные section
                if md.parse_tables(text):
                    hits += 0.5
        return min(hits / len(sample_files), 1.0)

    # ---- entry point ----------------------------------------------------

    def parse(self, project_path: Path) -> Tuple[SaIR, HandoffIR]:
        project_path = project_path.resolve()
        numbering, dirs = self._detect_numbering(project_path)

        generated_at = _dt.datetime.now(_dt.timezone.utc).isoformat()
        ir = SaIR(
            project_path=str(project_path),
            adapter=self.name,
            adapter_version=self.version,
            generated_at=generated_at,
            numbering=numbering,
        )
        handoff = HandoffIR(
            project_path=str(project_path),
            adapter=self.name,
            adapter_version=self.version,
            generated_at=generated_at,
        )

        self._parse_modules(ir, project_path, dirs["architecture"])
        self._parse_domain_entities(ir, project_path, dirs["domain"])
        self._parse_enumerations(ir, project_path, dirs["domain"])
        self._parse_forms(ir, project_path, dirs["interfaces"])
        self._parse_use_cases(ir, project_path, dirs["usecases"])
        self._parse_requirements(ir, project_path, dirs["requirements"])
        self._parse_system_roles(ir, project_path, dirs["roles"])
        self._parse_traceability(handoff, ir, project_path)

        return ir, handoff

    # ---- helpers --------------------------------------------------------

    @staticmethod
    def _detect_numbering(project: Path) -> Tuple[str, Dict[str, Optional[Path]]]:
        """Resolve logical folder names to actual directories."""
        candidates_10_16 = {
            "architecture":   project / "docs" / "10-architecture",
            "overview":       project / "docs" / "11-overview",
            "domain":         project / "docs" / "12-domain",
            "roles":          project / "docs" / "13-roles",
            "usecases":       project / "docs" / "14-usecases",
            "interfaces":     project / "docs" / "15-interfaces",
            "requirements":   project / "docs" / "16-requirements",
        }
        candidates_00_06 = {
            "architecture":   project / "docs" / "00-architecture",
            "overview":       project / "docs" / "01-overview",
            "domain":         project / "docs" / "02-domain",
            "roles":          project / "docs" / "03-roles",
            "usecases":       project / "docs" / "04-usecases",
            "interfaces":     project / "docs" / "05-interfaces",
            "requirements":   project / "docs" / "06-requirements",
        }
        score_10_16 = sum(1 for p in candidates_10_16.values() if p.is_dir())
        score_00_06 = sum(1 for p in candidates_00_06.values() if p.is_dir())
        if score_10_16 >= score_00_06:
            return "10-16", {k: (v if v.is_dir() else None) for k, v in candidates_10_16.items()}
        return "00-06", {k: (v if v.is_dir() else None) for k, v in candidates_00_06.items()}

    @staticmethod
    def _read(path: Path) -> Optional[str]:
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return None

    @staticmethod
    def _rel(project: Path, path: Path) -> str:
        try:
            return str(path.resolve().relative_to(project))
        except ValueError:
            return str(path)

    @staticmethod
    def _metadata_table(text: str) -> Dict[str, str]:
        table = md.first_table_after(text, _METADATA_HEADING)
        if not table:
            return {}
        result: Dict[str, str] = {}
        for row in table:
            cells = list(row.values())
            if len(cells) < 2:
                continue
            key = cells[0].strip().lower()
            value = cells[1].strip()
            if key:
                result[key] = value
        return result

    @staticmethod
    def _heading_name(text: str) -> str:
        for line in text.splitlines():
            if line.startswith("# "):
                return line[2:].strip()
        return ""

    @staticmethod
    def _extract_uc_ids(value: str) -> List[str]:
        """Accept 3-digit, 4-digit, and letter-prefix UC ID families.

        ``UC-001`` / ``UC001`` / ``UC 001`` → ``UC-001`` (canonical).
        ``UC-1001`` / ``UC1001`` → ``UC-1001`` (4-digit canonical).
        ``UC-F01`` / ``UCF01`` / ``UC F01`` → ``UC-F01`` (canonical).
        """
        ids = set()
        # UC-NNNN (4-digit, must match before 3-digit to avoid truncation),
        # UC-NNN (3-digit), or UC-X<NN> (letter-prefix).
        pat = re.compile(r"\bUC-?\s?(?:0*(\d{1,4})|([A-Z])(\d{2}))\b")
        for m in pat.finditer(value or ""):
            digits, letter, two = m.group(1), m.group(2), m.group(3)
            if digits is not None:
                n = int(digits)
                if 1 <= n <= 999:
                    ids.add(f"UC-{n:03d}")
                elif 1000 <= n <= 9999:
                    ids.add(f"UC-{n}")
            elif letter and two:
                ids.add(f"UC-{letter}{two}")
        return sorted(ids)

    @staticmethod
    def _extract_scr_ids(value: str) -> List[str]:
        """Same shape as :meth:`_extract_uc_ids` but for screen IDs."""
        ids = set()
        pat = re.compile(r"\bSCR-?\s?(?:0*(\d{1,3})|([A-Z])(\d{2}))\b")
        for m in pat.finditer(value or ""):
            digits, letter, two = m.group(1), m.group(2), m.group(3)
            if digits is not None:
                n = int(digits)
                if 1 <= n <= 999:
                    ids.add(f"SCR-{n:03d}")
            elif letter and two:
                ids.add(f"SCR-{letter}{two}")
        return sorted(ids)

    @staticmethod
    def _warn(container: Any, code: str, message: str,
              source_file: Optional[str] = None) -> None:
        container.warnings.append(SaWarning(
            code=code, message=message, source_file=source_file,
        ))

    # ---- modules --------------------------------------------------------

    def _parse_modules(self, ir: SaIR, project: Path, arch_dir: Optional[Path]) -> None:
        if arch_dir is None:
            return
        tree = arch_dir / "module-tree.md"
        if not tree.is_file():
            return
        text = self._read(tree) or ""

        # Expect a table under "Обзор модулей" / "Modules overview" / etc.
        # with the first column = module name.
        tables = md.parse_tables(text)
        seen: set[str] = set()
        for table in tables:
            if not table:
                continue
            first_key = list(table[0].keys())[0].lower()
            if not re.search(r"модул|module", first_key):
                continue
            for row in table:
                name_raw = list(row.values())[0].strip()
                name = re.sub(r"^[`*]+|[`*]+$", "", name_raw).strip()
                # Skip summary/total rows (e.g. "Итого", "Total", "**Итого**")
                if not name or name in seen or re.match(r"^(итого|total|всего)$", name, re.IGNORECASE):
                    continue
                seen.add(name)
                description_raw = list(row.values())[1].strip() if len(row) > 1 else ""
                # Strip backticks/asterisks from Код column (e.g. "`core`" → "core")
                description = re.sub(r"^[`*]+|[`*]+$", "", description_raw).strip()
                iteration = ""
                related: List[str] = []
                for k, v in row.items():
                    kl = k.lower()
                    if "итерац" in kl or "iter" in kl:
                        iteration = v.strip()
                    if "процесс" in kl or "process" in kl:
                        related.extend(re.findall(r"\bBP-\d{3}\b", v))
                # Use English code (Код column) as Module ID when it's a valid
                # kebab-case identifier (e.g. "core", "data-import").
                # Fallback to slugified Russian name for projects without a code column.
                if re.match(r"^[a-z][a-z0-9-]*$", description):
                    mod_slug = description
                else:
                    mod_slug = slugify(name)
                ir.modules.append(Module(
                    id=f"MOD-{mod_slug}",
                    name=name,
                    source_file=self._rel(project, tree),
                    description=description,
                    iteration=iteration,
                    related_process_ids=list(dict.fromkeys(related)),
                ))
            break

        # Fallback: numbered-H2 module layout (e.g., "## 1. Orders (Заказы)").
        # Supplements table-based modules; deduplication via the `seen` set.
        for m in re.finditer(r"^#{1,3}\s+(?:\d+\.\s+)?(.+?)$", text, re.MULTILINE):
            raw = m.group(1).strip()
            # Skip section headers that are not domain modules
            if re.search(r"cross.cutting|Общи|Дополнит", raw, re.IGNORECASE):
                continue
            pre_paren = re.sub(r"\s*\(.*$", "", raw).strip()
            pre_paren = re.sub(r"^\d+\.\s+", "", pre_paren).strip()
            in_paren_m = re.search(r"\(([A-Z][A-Za-z0-9/\s]+?)\)", raw)
            if re.match(r"^[A-Z][A-Za-z0-9/\s]+$", pre_paren):
                eng_name = pre_paren
            elif in_paren_m:
                eng_name = in_paren_m.group(1).strip()
            else:
                continue
            if not eng_name or eng_name in seen:
                continue
            seen.add(eng_name)
            mod_slug = slugify(eng_name)
            ir.modules.append(Module(
                id=f"MOD-{mod_slug}",
                name=eng_name,
                source_file=self._rel(project, tree),
                description="",
                iteration="",
                related_process_ids=[],
            ))

    # ---- domain entities ------------------------------------------------

    def _parse_domain_entities(self, ir: SaIR, project: Path,
                                domain_dir: Optional[Path]) -> None:
        if domain_dir is None:
            return
        folder = domain_dir / "entities"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            slug = path.stem.lower()
            de_id = f"DE-{slug}"
            # Extract English name from heading like "# Session (Сессия)".
            # Strip a leading structural prefix like "Сущность: " / "Entity: "
            # that some projects add to the H1 title.
            heading = self._heading_name(text)
            heading_clean = re.sub(
                r"^(?:Сущность|Entity)\s*:\s*", "", heading, flags=re.IGNORECASE
            ).strip() if heading else ""
            name = heading_clean.split("(")[0].strip() if heading_clean else slug
            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )
            module_raw = self._extract_owning_module(text)
            if not module_raw:
                # Fallback: YAML frontmatter `module:` key (e.g. "module: data-import")
                fm_data, _ = fm.extract(text)
                if fm_data:
                    module_raw = str(fm_data.get("module", "") or "").strip()
            # Apply the shared cleaning pipeline: strip bold markers, take the
            # first comma-separated chunk, drop any parenthetical suffix so
            # "shared/core (auth)" collapses to the canonical "shared/core".
            module = re.sub(r"\*\*([^*]+)\*\*", r"\1", module_raw or "").strip()
            module = module.split(",")[0]
            module = module.split("(")[0].strip()

            attributes = self._parse_domain_attribute_table(de_id, text, self._rel(project, path))

            # Enumeration refs: look for enum type names in attribute.type
            enum_refs: List[str] = []
            for attr in attributes:
                if attr.type and re.match(r"^[A-Z][A-Za-z0-9]+$", attr.type):
                    # Candidate enum name — will be resolved later against
                    # actual Enumeration IDs in a post-pass.
                    slug_candidate = slugify(attr.type)
                    enum_refs.append(f"EN-{slug_candidate}")
            ir.domain_entities.append(DomainEntity(
                id=de_id,
                name=name,
                source_file=self._rel(project, path),
                module=module,
                description=description,
                attributes=attributes,
                enumeration_refs=list(dict.fromkeys(enum_refs)),
            ))

    @staticmethod
    def _extract_owning_module(text: str) -> str:
        """Resolve the Module owner of a DomainEntity page.

        Tries three sources in order and returns the first non-empty hit as a
        raw string (still needing bold/comma/paren cleanup by the caller):

        1. ``## Модуль-владелец`` / ``## Owning module`` / ``## Module`` section
           — the canonical layout.
        2. A row in any top-level pipe table whose first cell (bold stripped)
           equals ``Модуль-владелец`` or ``Owning module`` — metadata-table
           layout used e.g. for FunnelEvent.
        3. A prose line anywhere in the document of the form
           ``**Модуль-владелец:** shared/core (auth)`` — used e.g. for User.

        Returns an empty string if nothing matched.
        """
        # 1. Dedicated section
        section_body = md.find_section(text, r"Модуль-владелец|Owning module|Module")
        if section_body and section_body.strip():
            # Preserve previous behaviour: if the section leads with a bolded
            # token, return the whole body so the caller can re-extract.
            mod_match = re.search(r"\*\*([^*]+)\*\*", section_body)
            if mod_match:
                return mod_match.group(1).strip()
            first_line = section_body.splitlines()[0] if section_body else ""
            candidate = re.split(r"\s[—–\-]{1,2}\s", first_line)[0].strip()
            if candidate:
                return candidate

        # 2. Metadata-table row (any top-level table on the page)
        for table in md.parse_tables(text):
            for row in table:
                vals = list(row.values())
                if len(vals) < 2:
                    continue
                key = re.sub(r"\*\*([^*]+)\*\*", r"\1", vals[0]).strip().lower()
                if key in ("модуль-владелец", "owning module"):
                    return vals[1].strip()

        # 3. Prose line fallback (e.g. "**Модуль-владелец:** shared/core (auth)")
        for line in text.splitlines():
            m = re.match(
                r"^\s*\*{0,2}(?:Модуль-владелец|Owning module)\*{0,2}\s*:?\s*\*{0,2}\s*(.+?)\s*$",
                line,
                flags=re.IGNORECASE,
            )
            if m:
                value = m.group(1).strip()
                # Trim any trailing bold markers the regex left in place
                value = re.sub(r"^\*{1,2}|\*{1,2}$", "", value).strip()
                if value:
                    return value

        return ""

    @staticmethod
    def _find_section_with_children(text: str, heading_pattern: str) -> Optional[str]:
        """Like md.find_section but includes child headings in the body.

        For a matched heading at level N, the body runs until the next heading
        at level <= N (same or higher level), not until ANY heading.
        """
        flags = re.IGNORECASE
        pat = re.compile(heading_pattern, flags)
        lines = text.splitlines()
        starts: list = []
        for i, line in enumerate(lines):
            m = re.match(r"^(#{1,6})\s+(.+)$", line)
            if m:
                starts.append((i, len(m.group(1)), m.group(2).strip()))
        for idx, (line_no, level, heading) in enumerate(starts):
            plain = re.sub(r"\*\*([^*]+)\*\*", r"\1", heading).strip()
            if not pat.fullmatch(plain):
                continue
            # Find the end: next heading at level <= this one
            end_line = len(lines)
            for j in range(idx + 1, len(starts)):
                if starts[j][1] <= level:
                    end_line = starts[j][0]
                    break
            return "\n".join(lines[line_no + 1:end_line])
        return None

    def _parse_domain_attribute_table(self, de_id: str, text: str, rel_source: str
                                       ) -> List[DomainAttribute]:
        body = self._find_section_with_children(
            text, r"Атрибуты|Attributes|Схема таблицы.*|Table schema.*|Структура"
        )
        if not body:
            return []
        tables = md.parse_tables(body)
        if not tables:
            return []
        attrs: List[DomainAttribute] = []
        idx = 0
        # Iterate ALL tables in the section body (not just tables[0]) to
        # handle multi-subsection layouts where each subsection has its own
        # table (subsections like Идентификация, Местоположение, etc.).
        for table in tables:
            for row in table:
                keys = list(row.keys())
                if not keys:
                    continue
                # Accept "Атрибут" / "Attribute" / "Колонка" / "Column" as
                # the first-column header (the name column).
                first_key_lower = keys[0].lower()
                if not any(t in first_key_lower for t in (
                    "атрибут", "attribute", "колонка", "column",
                    "поле", "field", "name",
                )):
                    # If the first-column header doesn't match, this table is
                    # likely not an attribute table (e.g. FK table). However,
                    # for backwards compat, if this is the only table, still
                    # parse it (original behaviour).
                    if len(tables) > 1:
                        continue
                name = row[keys[0]].strip()
                name = re.sub(r"^`|`$", "", name).strip()
                if not name or name.startswith("---"):
                    continue
                idx += 1
                type_value = ""
                required = False
                description = ""
                constraints = ""
                for k, v in row.items():
                    kl = k.lower()
                    if "тип" in kl or "type" in kl:
                        type_value = v.strip()
                    elif "обязательн" in kl or "required" in kl:
                        required = v.strip().lower() in (
                            "да", "yes", "true", "+",
                            "pk", "not null", "fk not null", "pk not null",
                        )
                    elif "описание" in kl or "description" in kl:
                        description = v.strip()
                    elif "ограничен" in kl or "constraint" in kl:
                        constraints = v.strip()
                # For EC-style tables, "Обязательность" column values like
                # "PK", "NOT NULL", "FK NOT NULL" indicate required.
                for k, v in row.items():
                    kl = k.lower()
                    if "обязательность" in kl:
                        required = bool(re.search(
                            r"(?:NOT\s+NULL|PK)", v.strip(), re.IGNORECASE
                        ))
                attrs.append(DomainAttribute(
                    id=f"{de_id}-A{idx:02d}",
                    name=name,
                    type=type_value,
                    required=required,
                    description=md.strip_markdown_inline(description),
                    constraints=md.strip_markdown_inline(constraints),
                    source_file=rel_source,
                ))
        return attrs

    # ---- enumerations ---------------------------------------------------

    def _parse_enumerations(self, ir: SaIR, project: Path,
                             domain_dir: Optional[Path]) -> None:
        if domain_dir is None:
            return
        folder = domain_dir / "enumerations"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_") or path.name == "all-enumerations.md":
                continue
            text = self._read(path) or ""
            heading = self._heading_name(text)
            name = heading.split("(")[0].strip() if heading else path.stem
            slug = slugify(name)
            en_id = f"EN-{slug}"
            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )

            values: List[EnumValue] = []
            body = md.find_section(text, r"Значения|Values")
            if body:
                tables = md.parse_tables(body)
                if tables:
                    for idx, row in enumerate(tables[0], start=1):
                        keys = list(row.keys())
                        if not keys:
                            continue
                        val = row[keys[0]].strip()
                        val = re.sub(r"^`|`$", "", val).strip()
                        if not val:
                            continue
                        desc = row.get("Описание", row.get("Description", "")).strip()
                        values.append(EnumValue(
                            id=f"{en_id}-V{idx:02d}",
                            value=val,
                            description=desc,
                            source_file=self._rel(project, path),
                        ))
            ir.enumerations.append(Enumeration(
                id=en_id,
                name=name,
                source_file=self._rel(project, path),
                description=description,
                values=values,
            ))

    # ---- forms ----------------------------------------------------------

    def _parse_forms(self, ir: SaIR, project: Path,
                      iface_dir: Optional[Path]) -> None:
        if iface_dir is None:
            return
        folder = iface_dir / "screens"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            # Fallback: try YAML frontmatter when no Метаданные table present
            if not metadata:
                fm_data, _ = fm.extract(text)
                if fm_data:
                    metadata = {k.lower(): str(v) for k, v in fm_data.items() if v}

            scr_id = metadata.get("id", "").strip()
            if not re.match(r"^SCR-(?:\d{3}|[A-Z]\d{2})$", scr_id):
                m = re.match(r"^(SCR-(?:\d{3}|[A-Z]\d{2}))-", path.name)
                scr_id = m.group(1) if m else ""
            # Derive SCR-NNN from "uc: UC101" or "relatedUC: [UC609]" frontmatter
            if not scr_id:
                uc_raw = (
                    metadata.get("uc", "") or metadata.get("use case", "")
                    or metadata.get("relateduc", "")
                )
                uc_nums = re.findall(r"\bUC-?(\d{1,4})\b", uc_raw)
                if uc_nums:
                    n = int(uc_nums[0])
                    scr_id = f"SCR-{n:03d}" if n <= 999 else f"SCR-{n}"
            if not scr_id:
                self._warn(ir, "FORM_ID_MISSING",
                           f"No SCR-NNN/SCR-X## id found in {path.name}",
                           self._rel(project, path))
                continue

            # Canonical Form id from the filename slug (not SCR-NNN itself
            # because FormField IDs want kebab-case parent)
            slug = slugify(path.stem.replace(scr_id.lower() + "-", ""))
            if not slug:
                slug = scr_id.lower()
            form_id = f"FORM-{slug}"
            name = metadata.get("название") or metadata.get("name") or self._heading_name(text)
            module = metadata.get("модуль") or metadata.get("module") or ""
            used_by_uc = self._extract_uc_ids(
                metadata.get("use cases", "") + " " + metadata.get("uc", "")
            )
            ir.forms.append(Form(
                id=form_id,
                name=name,
                original_id=scr_id,
                module=module,
                used_by_uc=used_by_uc,
                fields=[],  # field-level mapping handled by _form-domain-mapping parser later
                source_file=self._rel(project, path),
            ))

    # ---- use cases ------------------------------------------------------

    def _parse_use_cases(self, ir: SaIR, project: Path,
                          uc_dir: Optional[Path]) -> None:
        if uc_dir is None:
            return
        known_modules = {m.name for m in ir.modules}
        for path in sorted(uc_dir.rglob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)
            if not metadata:
                # Fallback: some UC files in this project family use YAML
                # frontmatter instead of a table. Merge the frontmatter into
                # the metadata dict so downstream lookups work unchanged.
                fm_data, _ = fm.extract(text)
                if fm_data:
                    metadata = self._metadata_from_frontmatter(fm_data, known_modules)

            raw_id = metadata.get("id", "").strip()
            # Accept ``UC-001``/``UC001`` and ``UC-F01``/``UCF01``.
            if not re.match(r"^UC-?(?:\d{3,4}|[A-Z]\d{2})$", raw_id):
                m = re.match(r"^(UC-?(?:\d{3,4}|[A-Z]\d{2}))", path.stem)
                raw_id = m.group(1) if m else ""
            ids = self._extract_uc_ids(raw_id)
            if not ids:
                self._warn(ir, "UC_ID_MISSING",
                           f"No UC id found in {path.name}",
                           self._rel(project, path))
                continue
            uc_id = ids[0]
            # Always populate original_id, even when canonical == raw (the R2
            # retrospective watch-item #4: identity-case must not skip).
            original_id = raw_id or uc_id

            heading = self._heading_name(text)
            # heading like "UC-001: Просмотр лендинга" or "UC-F01: Leave feedback"
            name = re.sub(
                r"^UC-?(?:\d{3,4}|[A-Z]\d{2})\s*[:\u2014\-\u2013]\s*",
                "", heading,
            ).strip()
            if not name:
                name = metadata.get("название") or metadata.get("name") or heading

            ba_trace_raw = metadata.get("ba trace", "") or metadata.get("bp trace", "")
            ba_trace = re.findall(r"\bBP-\d{3}(?:-S\d{2})?\b", ba_trace_raw)

            description = md.strip_markdown_inline(
                (md.find_section(text, r"\d+\.\s+Описание|Описание|Description") or "").strip()
            )

            preconditions = self._parse_condition_table(
                md.find_section(text, r"\d+\.\s+Предусловия|Предусловия|Preconditions"))
            postconditions = self._parse_condition_table(
                md.find_section(text, r"\d+\.\s+Постусловия|Постусловия|Postconditions"))
            scenario_heading = (
                r"\d+\.\s+Основной (?:сценарий|поток).*|"
                r"Основной (?:сценарий|поток).*|"
                r"Main (?:Flow|Scenario).*"
            )
            main_scenario = self._parse_scenario_table(
                md.find_section(text, scenario_heading))
            # Fallback: if find_section returned empty body (subsections start
            # immediately after the heading), scan the full text for ### Шаг N.
            if not main_scenario:
                main_scenario = self._parse_step_subsections(text, scenario_heading)

            # Resolve UC-level actor for fallback via substring canonicalization.
            uc_actor_raw = (metadata.get("актор") or metadata.get("actor") or "").strip()
            uc_actor_canonical = _canonicalize_actor(uc_actor_raw)

            activity_steps: List[ActivityStep] = []
            for idx, (col_actor, step_desc) in enumerate(main_scenario, start=1):
                # Precedence:
                # 1. Per-step 'User:' / 'System:' prefix on description (highest).
                # 2. Per-step Компонент / Исполнитель column value.
                # 3. UC-level actor (lowest explicit source).
                actor: Optional[str] = None
                if step_desc.lower().startswith("user:"):
                    actor = "User"
                    step_desc = step_desc[5:].strip()
                elif step_desc.lower().startswith("system:"):
                    actor = "System"
                    step_desc = step_desc[7:].strip()
                elif col_actor is not None:
                    actor = col_actor
                else:
                    # Fall back to UC-level actor when no inline source is present.
                    actor = uc_actor_canonical
                activity_steps.append(ActivityStep(
                    id=f"{uc_id}-A{idx:02d}",
                    step_number=idx,
                    description=step_desc,
                    actor=actor,
                    source_file=self._rel(project, path),
                ))

            # Module cell can contain comma-separated names or a parenthetical
            # annotation. Take the first comma-separated chunk, then strip
            # anything from the first "(" onward.
            module_raw = metadata.get("модуль") or metadata.get("module") or ""
            module = module_raw.split(",")[0].split("(")[0].strip() if module_raw else ""

            ir.use_cases.append(UseCase(
                id=uc_id,
                name=name,
                original_id=original_id,
                actor=metadata.get("актор") or metadata.get("actor") or "",
                module=module,
                priority=metadata.get("приоритет") or metadata.get("priority") or "",
                iteration=metadata.get("итерация") or metadata.get("iteration") or "",
                complexity=metadata.get("сложность") or metadata.get("complexity") or "",
                description=description,
                ba_trace=list(dict.fromkeys(ba_trace)),
                preconditions=preconditions,
                postconditions=postconditions,
                main_scenario=[desc for _, desc in main_scenario],
                activity_steps=activity_steps,
                source_file=self._rel(project, path),
            ))

    @staticmethod
    def _metadata_from_frontmatter(fm_data: Dict[str, Any],
                                    known_modules: set[str]) -> Dict[str, str]:
        """Convert YAML frontmatter keys into the same flat dict a metadata
        table produces. Unknown keys are ignored.
        """
        out: Dict[str, str] = {}
        title = fm_data.get("title") or ""
        if title:
            out["название"] = str(title)
        for key in ("id", "usecase_id"):
            v = fm_data.get(key)
            if v:
                out["id"] = str(v)
                break
        for key, target in (("priority", "приоритет"),
                             ("status", "статус"),
                             ("iteration", "итерация"),
                             ("complexity", "сложность"),
                             ("actor", "актор"),
                             ("module", "модуль"),
                             ("ba_trace", "ba trace")):
            v = fm_data.get(key)
            if v:
                out[target] = ", ".join(v) if isinstance(v, list) else str(v)
        # Derive module from tags if not set: any tag matching a known Module.name wins
        if "модуль" not in out:
            tags = fm_data.get("tags") or []
            if isinstance(tags, list):
                for tag in tags:
                    if tag in known_modules:
                        out["модуль"] = tag
                        break
        return out

    @staticmethod
    def _parse_condition_table(body: Optional[str]) -> List[str]:
        if not body:
            return []
        tables = md.parse_tables(body)
        if not tables:
            return []
        out: List[str] = []
        for row in tables[0]:
            vals = list(row.values())
            if len(vals) >= 2 and vals[1].strip():
                out.append(md.strip_markdown_inline(vals[1].strip()))
        return out

    @staticmethod
    def _parse_scenario_table(body: Optional[str]) -> List[Tuple[Optional[str], str]]:
        """Parse the main-scenario table body.

        Returns a list of ``(actor, description)`` tuples where *actor* is the
        canonicalized value ('User' / 'System' / None) derived from an
        optional 'Компонент' / 'Исполнитель' / 'Actor' / 'Актор' column, and
        *description* is the step text from the 'Действие' / 'Action' column.
        """
        _ACTOR_HEADER_TOKENS = ("компонент", "исполнитель", "actor", "актор")

        if not body:
            return []
        tables = md.parse_tables(body)
        if tables:
            out: List[Tuple[Optional[str], str]] = []
            for row in tables[0]:
                keys = list(row.keys())

                # Detect optional actor column (Компонент / Исполнитель / Actor / Актор).
                actor_col = None
                for k in keys:
                    # Strip markdown bold markers and whitespace before comparing.
                    kl = re.sub(r"\*\*", "", k).strip().lower()
                    if any(t == kl for t in _ACTOR_HEADER_TOKENS):
                        actor_col = k
                        break

                # Detect step-description column.
                step_col = None
                for k in keys:
                    kl = k.lower()
                    if any(t in kl for t in ("действие", "action", "шаг", "step")):
                        step_col = k
                        break

                # Canonicalize per-step actor from the actor column cell.
                col_actor: Optional[str] = None
                if actor_col:
                    raw_cell = re.sub(r"\*\*", "", row.get(actor_col, "")).strip()
                    if raw_cell and raw_cell != "--":
                        col_actor = _canonicalize_actor(raw_cell)

                if step_col and row[step_col].strip():
                    desc = md.strip_markdown_inline(row[step_col].strip())
                    out.append((col_actor, desc))
                else:
                    # Fallback: concatenate all non-numeric, non-actor columns
                    skip = {keys[0]}
                    if actor_col:
                        skip.add(actor_col)
                    pieces = [
                        v.strip() for k, v in row.items()
                        if v.strip() and k not in skip
                    ]
                    if pieces:
                        out.append((col_actor, md.strip_markdown_inline(" — ".join(pieces))))
            return out

        # Fallback: subsection-based parser for "### Шаг N" / "### Step N"
        # headings (prose-step UC dialect where steps are prose subsections,
        # not table rows).
        step_re = re.compile(
            r"^###\s+(?:Шаг|Step)\s+\d+\s*[—\-–:.]?\s*(.*)", re.MULTILINE
        )
        out = []
        for m in step_re.finditer(body):
            title = m.group(1).strip()
            # Grab the first numbered-list item after the heading as extra detail
            rest = body[m.end():]
            next_heading = re.search(r"^###?\s", rest, re.MULTILINE)
            chunk = rest[:next_heading.start()] if next_heading else rest
            first_item = re.search(r"^\d+\.\s+(.+)", chunk, re.MULTILINE)
            if first_item:
                desc = f"{title}: {first_item.group(1).strip()}" if title else first_item.group(1).strip()
            else:
                desc = title or "(no description)"
            out.append((None, md.strip_markdown_inline(desc)))
        if out:
            return out

        # Fallback: top-level numbered-list steps under "Основной сценарий"
        # (``1. …`` / ``2. …``) — the most common UC dialect in inline-table
        # projects (no scenario table, no ``### Шаг`` subsections). Only
        # top-level items are captured; nested ``-`` bullets and more deeply
        # indented continuation lines are ignored.
        num_re = re.compile(r"^\s{0,3}\d+\.\s+(.+)$", re.MULTILINE)
        for m in num_re.finditer(body):
            desc = md.strip_markdown_inline(m.group(1).strip())
            if desc:
                out.append((None, desc))
        return out

    @staticmethod
    def _parse_step_subsections(text: str, scenario_heading: str) -> List[Tuple[Optional[str], str]]:
        """Extract activity steps from ### Шаг N / ### Step N subsections.

        Used when the main-scenario section heading exists but its body is
        empty (because subsections start right after the heading, and
        ``iter_sections`` cuts off at the next heading of any level).

        This scans the full UC text for the scenario heading followed by
        step subsections, collecting them into a list.  Actor is always None
        because prose subsections carry no actor column.
        """
        # First, verify that the scenario heading exists in the text
        flags = re.IGNORECASE
        heading_pat = re.compile(scenario_heading, flags)
        found = False
        for _, _, heading, _ in md.iter_sections(text):
            plain = re.sub(r"\*\*([^*]+)\*\*", r"\1", heading).strip()
            if heading_pat.fullmatch(plain):
                found = True
                break
        if not found:
            return []

        # Collect all ### Шаг N / ### Step N subsections from the full text
        out: List[Tuple[Optional[str], str]] = []
        for level, _, heading, body in md.iter_sections(text):
            if level != 3:
                continue
            m = re.match(
                r"^(?:Шаг|Step)\s+\d+\s*[—\-–:.]?\s*(.*)",
                heading.strip(),
            )
            if not m:
                continue
            title = m.group(1).strip()
            first_item = re.search(r"^\d+\.\s+(.+)", body, re.MULTILINE)
            if first_item:
                desc = f"{title}: {first_item.group(1).strip()}" if title else first_item.group(1).strip()
            else:
                desc = title or "(no description)"
            out.append((None, md.strip_markdown_inline(desc)))
        return out

    # ---- requirements ---------------------------------------------------

    def _parse_requirements(self, ir: SaIR, project: Path,
                             req_dir: Optional[Path]) -> None:
        if req_dir is None:
            return
        for path in sorted(req_dir.glob("UC*-requirements.md")):
            text = self._read(path) or ""
            metadata = self._metadata_table(text)
            uc_raw = metadata.get("uc", "")
            uc_ids = self._extract_uc_ids(uc_raw)
            if not uc_ids:
                # try to derive from filename — accept both 3-digit and letter-prefix
                m = re.match(r"^UC-?(\d{3}|[A-Z]\d{2})-requirements\.md$", path.name)
                if m:
                    token = m.group(1)
                    if token.isdigit():
                        uc_ids = [f"UC-{int(token):03d}"]
                    else:
                        uc_ids = [f"UC-{token}"]
            # Fallback: derive UC ids from YAML frontmatter when no metadata table
            if not uc_ids:
                fm_data, _ = fm.extract(text)
                if fm_data:
                    uc_raw_fm = str(fm_data.get("uc") or "")
                    uc_ids = self._extract_uc_ids(uc_raw_fm)
            if not uc_ids:
                # Final fallback: derive from filename
                m_fn = re.match(r"^UC-?(\d{3}|[A-Z]\d{2})-requirements\.md$", path.name)
                if m_fn:
                    token = m_fn.group(1)
                    uc_ids = [f"UC-{int(token):03d}" if token.isdigit() else f"UC-{token}"]
            ba_trace = re.findall(r"\bBP-\d{3}\b", metadata.get("ba trace", ""))

            # Every ### FR-NNN: / ### NFR-NN: heading is a requirement
            file_req_count = 0
            for level, _, heading, body in md.iter_sections(text):
                if level != 3:
                    continue
                # Heading ID can be FR-NNN or compound FR-NNN-NN (per-UC)
                m = re.match(r"^((?:FR|NFR)-\d+(?:-\d+)?)\s*[:\u2014\-\u2013]?\s*(.*)$",
                             heading.strip(), re.IGNORECASE)
                if not m:
                    continue
                raw_req_id = m.group(1).upper().replace("-", "")
                # FR/NFR numbering is local to each UC-requirements file;
                # disambiguate by prefixing with the owning UC id.
                uc_prefix = uc_ids[0].replace("-", "") if uc_ids else "ORPHAN"
                req_id = f"REQ-{uc_prefix}-{raw_req_id}"
                kind = "FR" if raw_req_id.startswith("FR") else "NFR"
                # Description can be taken from the first ## table or prose
                tables = md.parse_tables(body)
                description = ""
                priority = ""
                if tables:
                    for row in tables[0]:
                        for k, v in row.items():
                            kl = k.lower()
                            if "параметр" in kl or "parameter" in kl:
                                if v.strip().lower() in ("описание", "description"):
                                    # next column is the value, but parse_tables
                                    # already gave us a key-value row
                                    pass
                            if "описание" in kl.lower() or "description" in kl.lower():
                                description = v.strip()
                            if "приоритет" in kl.lower() or "priority" in kl.lower():
                                priority = v.strip()
                    # The table is usually 2-column "Параметр" | "Значение"
                    # So descriptions live under the Значение column when Поле=Описание
                    for row in tables[0]:
                        vals = list(row.values())
                        if len(vals) >= 2:
                            param = vals[0].strip().lower()
                            val = vals[1].strip()
                            if "описание" in param:
                                description = description or val
                            elif "приоритет" in param:
                                priority = priority or val
                if not description:
                    description = m.group(2).strip()

                ir.requirements.append(Requirement(
                    id=req_id,
                    description=md.strip_markdown_inline(description),
                    kind=kind,
                    priority=priority,
                    uc_ids=list(uc_ids),
                    ba_trace=list(dict.fromkeys(ba_trace)),
                    source_file=self._rel(project, path),
                ))
                file_req_count += 1

            # Fallback: parse table-format requirements (RQ-NNN columns)
            # Used when requirements files have | ID | Требование | Тип | Приоритет |
            # rows with identifiers like RQ101-01 instead of ### FR-NNN headings.
            if file_req_count == 0:
                all_tables = md.parse_tables(text)
                uc_prefix = uc_ids[0].replace("-", "") if uc_ids else "ORPHAN"
                for table in all_tables:
                    if not table:
                        continue
                    keys = list(table[0].keys())
                    # Find ID column ("ID", "id", "№") and description column
                    id_col = next((k for k in keys if k.strip().upper() in ("ID", "№", "N")), None)
                    desc_col = next((k for k in keys if any(t in k.lower() for t in
                                    ("требование", "requirement", "описание", "description"))), None)
                    prio_col = next((k for k in keys if any(t in k.lower() for t in
                                    ("приоритет", "priority"))), None)
                    type_col = next((k for k in keys if any(t in k.lower() for t in
                                    ("тип", "type", "category"))), None)
                    if id_col is None or desc_col is None:
                        continue
                    for row in table:
                        raw_id = row.get(id_col, "").strip()
                        # Accept RQ101-01, RQ-101-01, RQ001 etc.
                        rq_m = re.match(r"^RQ-?(\d+)-(\d+)$", raw_id, re.IGNORECASE)
                        if not rq_m:
                            continue
                        req_id = f"REQ-{uc_prefix}-RQ{rq_m.group(1)}-{rq_m.group(2)}"
                        description = row.get(desc_col, "").strip()
                        priority = row.get(prio_col, "").strip() if prio_col else ""
                        kind_raw = row.get(type_col, "").strip().lower() if type_col else ""
                        kind = "NFR" if any(t in kind_raw for t in ("нфр", "nfr", "нефункц")) else "FR"
                        ir.requirements.append(Requirement(
                            id=req_id,
                            description=md.strip_markdown_inline(description),
                            kind=kind,
                            priority=priority,
                            uc_ids=list(uc_ids),
                            ba_trace=list(dict.fromkeys(ba_trace)),
                            source_file=self._rel(project, path),
                        ))
                        file_req_count += 1

        # Fallback: if zero requirements from per-UC files, check for nfr.md
        if not ir.requirements:
            self._parse_nfr_file(ir, project, req_dir)

    def _parse_nfr_file(self, ir: SaIR, project: Path,
                         req_dir: Path) -> None:
        """Parse a standalone nfr.md / nfr-requirements.md file.

        Each ``## NFR-NN.`` heading is a requirement category. If the section
        body contains a table with an ``ID`` column, each row becomes a
        separate Requirement; otherwise the category heading itself becomes one.
        """
        for name in ("nfr.md", "nfr-requirements.md"):
            nfr_path = req_dir / name
            if nfr_path.is_file():
                break
        else:
            return
        text = self._read(nfr_path) or ""
        rel = self._rel(project, nfr_path)
        nfr_idx = 0

        for level, _, heading, body in md.iter_sections(text):
            if level != 2:
                continue
            # Match "NFR-01. Производительность" or "NFR-01: …"
            m = re.match(
                r"^(NFR-?\d+)\s*[.:\u2014\-\u2013]\s*(.*)",
                heading.strip(), re.IGNORECASE,
            )
            if not m:
                continue
            category_id = m.group(1).upper().replace("-", "")  # e.g. "NFR01"
            category_name = m.group(2).strip()

            tables = md.parse_tables(body)
            if tables:
                # Find the table with an "ID" column
                for table in tables:
                    keys = list(table[0].keys()) if table else []
                    id_col = None
                    desc_col = None
                    for k in keys:
                        kl = k.lower()
                        if kl == "id":
                            id_col = k
                        if "требование" in kl or "requirement" in kl:
                            desc_col = k
                    if not id_col:
                        continue
                    for row in table:
                        row_id = row.get(id_col, "").strip()
                        if not row_id or not re.match(r"NFR-?\d+", row_id, re.IGNORECASE):
                            continue
                        nfr_idx += 1
                        description = row.get(desc_col, "") if desc_col else ""
                        if not description:
                            # Take second column as description
                            vals = list(row.values())
                            description = vals[1].strip() if len(vals) >= 2 else ""
                        ir.requirements.append(Requirement(
                            id=f"REQ-{row_id.upper().replace('-', '').replace('.', '')}",
                            description=md.strip_markdown_inline(description.strip()),
                            kind="NFR",
                            priority="",
                            uc_ids=[],
                            ba_trace=[],
                            source_file=rel,
                        ))
                    break
            else:
                # No table — one Requirement per ## heading
                nfr_idx += 1
                ir.requirements.append(Requirement(
                    id=f"REQ-{category_id}",
                    description=md.strip_markdown_inline(category_name),
                    kind="NFR",
                    priority="",
                    uc_ids=[],
                    ba_trace=[],
                    source_file=rel,
                ))

    # ---- system roles ---------------------------------------------------

    def _parse_system_roles(self, ir: SaIR, project: Path,
                             roles_dir: Optional[Path]) -> None:
        if roles_dir is None:
            return
        matrix = roles_dir / "role-matrix.md"
        if not matrix.is_file():
            return
        text = self._read(matrix) or ""
        tables = md.parse_tables(text)
        if not tables:
            return
        # First table with first column named "Роль" / "Role"
        for table in tables:
            first_key = list(table[0].keys())[0].lower()
            if not re.search(r"роль|role", first_key):
                continue
            for row in table:
                name_raw = list(row.values())[0].strip()
                name = re.sub(r"^[`*]+|[`*]+$", "", name_raw).strip()
                if not name:
                    continue
                role_id = f"SYSROL-{slugify(name).upper()}"
                ba_source = ""
                auth = ""
                iteration = ""
                for k, v in row.items():
                    kl = k.lower()
                    if "ba-источник" in kl or "ba source" in kl:
                        ba_source = v.strip()
                    if "аутентификация" in kl or "auth" in kl:
                        auth = v.strip()
                    if "итерац" in kl or "iter" in kl:
                        iteration = v.strip()
                ba_trace = [canonical_role_id(m) for m in re.findall(r"\bACT-\d{2}\b", ba_source)]
                ba_trace = [b for b in ba_trace if b]
                ir.system_roles.append(SystemRole(
                    id=role_id,
                    name=name,
                    auth=auth,
                    iteration=iteration,
                    ba_trace=ba_trace,
                    source_file=self._rel(project, matrix),
                ))
            break

    # ---- traceability matrix -------------------------------------------

    def _parse_traceability(self, handoff: HandoffIR, ir: SaIR, project: Path) -> None:
        path = project / "docs" / "99-meta" / "traceability-matrix.md"
        if not path.is_file():
            return
        handoff.source_file = self._rel(project, path)
        text = self._read(path) or ""

        # Section 1: Processes -> UCs
        sec = md.find_section(text, r"\d+\.\s+Процессы.*Use Cases.*|\d+\.\s+Processes.*|.*Процессы.*UC.*|BP.*UC.*")
        if sec:
            tables = md.parse_tables(sec)
            if tables:
                for row in tables[0]:
                    vals = list(row.values())
                    if len(vals) < 2:
                        continue
                    bp_match = re.search(r"\bBP-\d{3}(?:-S\d{2})?\b", vals[0])
                    # Search ALL columns for UC IDs (handles both 2-column and
                    # multi-column formats where UC is not in the second column).
                    all_cells = " ".join(str(v) for v in vals)
                    uc_ids_row = self._extract_uc_ids(all_cells)
                    if bp_match and uc_ids_row:
                        for uc_id in uc_ids_row:
                            edge = HandoffEdge(
                                from_id=bp_match.group(0),
                                to_id=uc_id,
                                source_file=handoff.source_file,
                            )
                            # Deduplicate: same (from_id, to_id) pair only once
                            key = (edge.from_id, edge.to_id)
                            if key not in {(e.from_id, e.to_id) for e in handoff.automates_as}:
                                handoff.automates_as.append(edge)

        # Section 2: Entities -> Domain Entities (by name lookup)
        # Searches ALL cells for CamelCase SA entity names (handles multi-column
        # tables where the SA entity is not in the second column).
        sec = md.find_section(text, r"\d+\.\s+Сущности.*Domain Entities.*|\d+\.\s+Entities.*|.*OBJ.*DE.*")
        if sec:
            tables = md.parse_tables(sec)
            if tables:
                de_by_name = {e.name.lower(): e.id for e in ir.domain_entities}
                de_by_slug = {slugify(e.name): e.id for e in ir.domain_entities}
                # Also index by English prefix only (before " — ", "(", or space).
                # Handles names like "ArticleImport — Загрузка..." where full-name
                # lookup would miss "ArticleImport" token.
                de_by_short: Dict[str, str] = {}
                for e in ir.domain_entities:
                    m_en = re.match(r"([A-Z][A-Za-z0-9]+)", e.name)
                    if m_en:
                        de_by_short[m_en.group(1).lower()] = e.id
                        de_by_short[slugify(m_en.group(1))] = e.id
                for row in tables[0]:
                    vals = list(row.values())
                    if len(vals) < 2:
                        continue
                    obj_match = re.search(r"\bOBJ-\d{3}\b", vals[0])
                    if not obj_match:
                        continue
                    # Search all non-first columns for an English CamelCase entity name
                    target = None
                    warned = False
                    for cell_val in vals[1:]:
                        cell_clean = re.sub(r"[`*]", "", cell_val.strip())
                        for token in re.findall(r"\b([A-Z][A-Za-z0-9]+)\b", cell_clean):
                            t = (de_by_name.get(token.lower())
                                 or de_by_slug.get(slugify(token))
                                 or de_by_short.get(token.lower())
                                 or de_by_short.get(slugify(token)))
                            if t:
                                target = t
                                break
                        if target:
                            break
                    if target is None:
                        if not warned:
                            # Report the first English token tried as the candidate
                            for cell_val in vals[1:]:
                                cell_clean = re.sub(r"[`*]", "", cell_val.strip())
                                m = re.search(r"\b([A-Z][A-Za-z0-9]+)\b", cell_clean)
                                if m:
                                    self._warn(ir, "HANDOFF_DE_UNKNOWN",
                                               f"traceability-matrix references DE {m.group(1)!r} with no matching file",
                                               handoff.source_file)
                                    warned = True
                                    break
                        continue
                    handoff.realized_as.append(HandoffEdge(
                        from_id=obj_match.group(0),
                        to_id=target,
                        source_file=handoff.source_file,
                    ))

        # Section 3: Roles -> System Roles (by name lookup)
        # Accepts both ACT-NN and ROL-NN as the BA role identifier.
        # Searches all cells for underscored/sluggable role names.
        sec = md.find_section(text, r"\d+\.\s+Роли.*System Roles.*|\d+\.\s+Роли.*Системные.*|\d+\.\s+Roles.*|ACT.*SYSROL.*")
        if sec:
            tables = md.parse_tables(sec)
            if tables:
                sr_by_slug = {slugify(r.name): r.id for r in ir.system_roles}
                for row in tables[0]:
                    vals = list(row.values())
                    if len(vals) < 2:
                        continue
                    # Accept ACT-NN or ROL-NN in first column as the BA role id
                    ba_id_match = re.search(r"\b(?:ACT|ROL)-\d{2}\b", vals[0])
                    if not ba_id_match:
                        continue
                    ba_id_raw = ba_id_match.group(0)
                    from_id = canonical_role_id(ba_id_raw)
                    if not from_id:
                        # ROL-NN isn't recognized by canonical_role_id — use as-is
                        from_id = ba_id_raw
                    # Search all non-first columns for a role name (snake_case or kebab-case)
                    target = None
                    for cell_val in vals[1:]:
                        cell_clean = re.sub(r"`|\*", "", cell_val.strip())
                        # Prefer snake_case or regular word tokens
                        for token in re.findall(r"\b([a-z][a-z0-9_]+)\b", cell_clean):
                            t = sr_by_slug.get(slugify(token))
                            if t:
                                target = t
                                break
                        if target:
                            break
                    if target is None:
                        continue   # e.g. "— (вне системы)"
                    handoff.mapped_to.append(HandoffEdge(
                        from_id=from_id,
                        to_id=target,
                        source_file=handoff.source_file,
                    ))

        # Section 4: BRQ -> Requirements.
        # Handles both REQ-* prefixed IDs and raw RQ-NNN-NN identifiers by
        # resolving RQ-NNN-NN against the IR requirements index.
        sec = md.find_section(text, r"\d+\.\s+Бизнес-правила.*|\d+\.\s+Rules.*|BRQ.*Req.*")
        if sec:
            tables = md.parse_tables(sec)
            if tables:
                # Build lookup: partial RQ key → full REQ id
                # e.g. "RQ101-03" → "REQ-UC101-RQ101-03"
                req_by_rq: Dict[str, str] = {}
                for r in ir.requirements:
                    # Extract the RQ suffix from canonical id (e.g. "RQ101-03")
                    rq_m = re.search(r"(RQ\d+-\d+)$", r.id)
                    if rq_m:
                        req_by_rq[rq_m.group(1).upper()] = r.id
                for row in tables[0]:
                    vals = list(row.values())
                    if len(vals) < 2:
                        continue
                    brq_match = re.search(r"\bBRQ-\d{3}\b", vals[0])
                    if not brq_match:
                        continue
                    all_cells = " ".join(str(v) for v in vals[1:])
                    # Try REQ-* format first
                    req_match = re.search(r"\bREQ-[A-Z0-9\-]+\b", all_cells)
                    if req_match:
                        handoff.implemented_by.append(HandoffEdge(
                            from_id=brq_match.group(0),
                            to_id=req_match.group(0),
                            source_file=handoff.source_file,
                        ))
                        continue
                    # Try raw RQ-NNN-NN references (comma-separated list)
                    rq_ids = re.findall(r"\bRQ\d+-\d+\b", all_cells)
                    matched = False
                    for rq_raw in rq_ids:
                        canonical = req_by_rq.get(rq_raw.upper())
                        if canonical:
                            handoff.implemented_by.append(HandoffEdge(
                                from_id=brq_match.group(0),
                                to_id=canonical,
                                source_file=handoff.source_file,
                            ))
                            matched = True
                            break  # link to first matching requirement
                    if not matched:
                        self._warn(ir, "HANDOFF_REQ_CATEGORY",
                                   f"traceability row BRQ {brq_match.group(0)} -> "
                                   f"'{all_cells.strip()[:60]}' (no REQ/RQ id resolved)",
                                   handoff.source_file)

        # Module suggestions: ProcessGroup -> Module (from module-tree
        # "Процессы" column). This gives us SUGGESTS without needing the
        # traceability matrix at all.
        for mod in ir.modules:
            for bp_id in mod.related_process_ids:
                # a BP belongs to exactly one ProcessGroup — but we don't
                # have BA data here. Leave SUGGESTS to the skill to emit
                # once it has access to BA graph via MCP.
                # For now we skip and let Phase 6 of the skill fill this in.
                pass
