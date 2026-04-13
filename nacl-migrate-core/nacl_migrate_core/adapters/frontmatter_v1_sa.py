"""frontmatter-v1 adapter — SA layer.

Target format (kartov-orders):
  - docs/10-architecture/module-tree.md        : frontmatter + module table
  - docs/12-domain/entities/<slug>.md          : frontmatter with ``title``,
                                                 ``type: entity``, ``module``,
                                                 ``ba_source``. DomainEntity
                                                 id is derived from the
                                                 filename slug.
  - docs/12-domain/enumerations/<slug>.md      : frontmatter with ``type:
                                                 enumeration`` + a ``##
                                                 Значения`` table.
                                                 ``system-role.md`` doubles
                                                 as a SystemRole source.
  - docs/13-roles/role-matrix.md               : optional SystemRole fallback
                                                 when no ``system-role``
                                                 enumeration is present.
  - docs/14-usecases/UC###-*.md                : ``title: "UC101. Name"`` →
                                                 canonical ``UC-101``.
                                                 ``original_id`` preserves
                                                 the raw ``UC101`` token.
  - docs/15-interfaces/screens/<slug>.md       : ``screen`` frontmatter key
                                                 drives the Form id.
                                                 ``uc`` may be scalar or list.
  - docs/16-requirements/UC###-requirements.md : ``uc: UCNNN`` →
                                                 ``[UC-NNN]`` in ``uc_ids``.
                                                 Requirements live in tables
                                                 with an ``ID`` column like
                                                 ``RQ101-01``.
  - docs/99-meta/traceability-matrix.md        : Sections 1-3 produce
                                                 AUTOMATES_AS, REALIZED_AS,
                                                 MAPPED_TO edges. If section
                                                 4 is present and uses the
                                                 ``RQxxx-NN`` convention, the
                                                 IDs are normalised to
                                                 ``REQ-RQxxx-NN`` for
                                                 IMPLEMENTED_BY.

Returns a ``(SaIR, HandoffIR)`` tuple — same shape as inline-table-v1's SA
adapter.
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
    EnumValue,
    Enumeration,
    Form,
    Module,
    Requirement,
    SaIR,
    SaWarning,
    SystemRole,
    UseCase,
)
from ..slugify import canonical_role_id, slugify


_MODULE_TYPES = {"entity", "enumeration", "screen", "requirements", "usecase"}

# Keys that an entity/enumeration/UC/requirement/screen file is expected to
# carry in its YAML frontmatter. Used by detect().
_SA_FM_KEYS = {"title", "type", "module", "uc", "ba_source", "screen", "tags"}

# Either UC-NNN (3-digit family) or UC-X<NN> (letter-prefix family).
_UC_ID_CANON_RE = re.compile(
    r"UC-?\s?(?:0*(\d{1,3})|([A-Z])(\d{2}))",
)

# Canonical BA-prefix tokens accepted in ``ba_source`` frontmatter on SA
# artifacts (DomainEntity / Enumeration). Anything outside this whitelist is
# dropped; non-matching tokens are warn-logged to /tmp/ko-sa-parse.log so
# sentinel characters (``—``) or typo-prefixes (``KAR-44``) don't silently
# disappear.
_BA_TRACE_TOKEN_RE = re.compile(r"\b(?:OBJ-\d{3}|BRQ-\d{3}|ROL-\d{2})\b")
_SA_PARSE_LOG = "/tmp/ko-sa-parse.log"


def _log_dropped_ba_token(source_file: str, raw_value: str) -> None:
    """Append a WARN-level line for a dropped ba_source token.

    Uses plain file append (pure stdlib, no new imports). Failures are
    silenced so logging never breaks a parse.
    """
    try:
        with open(_SA_PARSE_LOG, "a", encoding="utf-8") as fh:
            fh.write(
                f"WARN ba_source dropped token: file={source_file} raw={raw_value!r}\n"
            )
    except Exception:
        pass


# ---------------------------------------------------------------------------

class FrontmatterV1SaAdapter:
    name = "frontmatter-v1"
    version = "1.0.0"

    # ---- detection ------------------------------------------------------

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
            fm_data, _ = fm.extract(text)
            if not fm_data:
                continue
            overlap = len(set(fm_data.keys()) & _SA_FM_KEYS)
            if overlap >= 2:
                hits += 1
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

        # Pathological co-presence guard: if both ``10-16`` and ``00-06`` SA
        # folders exist on disk, _detect_numbering picks ``10-16`` but we
        # surface a warning so the user can disambiguate.
        score_10_16 = sum(1 for sub in (
            "10-architecture", "11-overview", "12-domain", "13-roles",
            "14-usecases", "15-interfaces", "16-requirements",
        ) if (project_path / "docs" / sub).is_dir())
        score_00_06 = sum(1 for sub in (
            "00-architecture", "01-overview", "02-domain", "03-roles",
            "04-usecases", "05-interfaces", "06-requirements",
        ) if (project_path / "docs" / sub).is_dir())
        if score_10_16 > 0 and score_00_06 > 0:
            self._warn(ir, "NUMBERING_AMBIGUOUS",
                       "Both 10-16 and 00-06 SA folder layouts present; "
                       "preferring 10-16. Remove one set to disambiguate.",
                       source_file=None)

        self._parse_modules(ir, project_path, dirs["architecture"])
        self._parse_domain_entities(ir, project_path, dirs["domain"])
        self._parse_enumerations_and_system_roles(ir, project_path, dirs["domain"])
        # Fallback: role-matrix.md when no system-role enumeration was seen.
        if not ir.system_roles:
            self._parse_system_roles_fallback(ir, project_path, dirs["roles"])
        self._parse_forms(ir, project_path, dirs["interfaces"])
        self._parse_use_cases(ir, project_path, dirs["usecases"])
        self._parse_requirements(ir, project_path, dirs["requirements"])
        self._parse_traceability(handoff, ir, project_path)

        return ir, handoff

    # ---- helpers --------------------------------------------------------

    @staticmethod
    def _detect_numbering(project: Path) -> Tuple[str, Dict[str, Optional[Path]]]:
        """Return the numbering scheme (``10-16`` or ``00-06``) and the
        resolved directory map.

        Both layouts coexist in the wild: kartov-orders / family-cinema use
        ``10-16``, infographic / ElectroCharge use ``00-06``. Pick the layout
        whose directories actually exist on disk. If both exist (pathological)
        we emit no warning here — the IR carries one — and prefer ``10-16``
        for backwards compatibility with the original adapter behaviour.
        """
        candidates_10_16 = {
            "architecture": project / "docs" / "10-architecture",
            "overview":     project / "docs" / "11-overview",
            "domain":       project / "docs" / "12-domain",
            "roles":        project / "docs" / "13-roles",
            "usecases":     project / "docs" / "14-usecases",
            "interfaces":   project / "docs" / "15-interfaces",
            "requirements": project / "docs" / "16-requirements",
        }
        candidates_00_06 = {
            "architecture": project / "docs" / "00-architecture",
            "overview":     project / "docs" / "01-overview",
            "domain":       project / "docs" / "02-domain",
            "roles":        project / "docs" / "03-roles",
            "usecases":     project / "docs" / "04-usecases",
            "interfaces":   project / "docs" / "05-interfaces",
            "requirements": project / "docs" / "06-requirements",
        }
        score_10_16 = sum(1 for p in candidates_10_16.values() if p.is_dir())
        score_00_06 = sum(1 for p in candidates_00_06.values() if p.is_dir())
        if score_10_16 >= score_00_06 and score_10_16 > 0:
            return "10-16", {k: (v if v.is_dir() else None)
                             for k, v in candidates_10_16.items()}
        if score_00_06 > 0:
            return "00-06", {k: (v if v.is_dir() else None)
                             for k, v in candidates_00_06.items()}
        # No SA folders detected — return empty map so callers no-op.
        return "unknown", {k: None for k in candidates_10_16}

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
    def _heading_name(text: str) -> str:
        for line in text.splitlines():
            if line.startswith("# "):
                return line[2:].strip()
        return ""

    @staticmethod
    def _normalise_uc_id(raw: str) -> Optional[str]:
        """``UC101`` / ``UC-101`` / ``UC 101`` → ``UC-101``.
        ``UC-F01`` / ``UCF01`` / ``UC F01`` → ``UC-F01``.
        Otherwise ``None``.
        """
        if not raw:
            return None
        m = _UC_ID_CANON_RE.search(str(raw))
        if not m:
            return None
        digits, letter, two = m.group(1), m.group(2), m.group(3)
        if digits is not None:
            n = int(digits)
            if 1 <= n <= 999:
                return f"UC-{n:03d}"
            return None
        if letter and two:
            return f"UC-{letter}{two}"
        return None

    @classmethod
    def _normalise_uc_list(cls, value: Any) -> List[str]:
        """Accept scalar / CSV / list frontmatter value and return UC-IDs."""
        if not value:
            return []
        if isinstance(value, list):
            tokens = [str(v) for v in value]
        else:
            tokens = re.split(r"[,\s]+", str(value))
        out: List[str] = []
        for tok in tokens:
            canon = cls._normalise_uc_id(tok)
            if canon and canon not in out:
                out.append(canon)
        return out

    @staticmethod
    def _warn(container: Any, code: str, message: str,
              source_file: Optional[str] = None) -> None:
        container.warnings.append(SaWarning(
            code=code, message=message, source_file=source_file,
        ))

    # ---- modules --------------------------------------------------------

    def _parse_modules(self, ir: SaIR, project: Path,
                        arch_dir: Optional[Path]) -> None:
        if arch_dir is None:
            return
        tree = arch_dir / "module-tree.md"
        if not tree.is_file():
            return
        text = self._read(tree) or ""
        rel = self._rel(project, tree)

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
                if not name or name in seen:
                    continue
                # Skip "Итого" rows and module codes that contain backticks
                if name.lower() in ("итого", "total"):
                    continue
                seen.add(name)
                description = list(row.values())[1].strip() if len(row) > 1 else ""
                # Prefer explicit "Код" / "Code" column for the canonical slug.
                code = ""
                for k, v in row.items():
                    kl = k.lower()
                    if kl in ("код", "code"):
                        code = v.strip().strip("`")
                        break
                slug = slugify(code) if code else slugify(name)
                ir.modules.append(Module(
                    id=f"MOD-{slug}",
                    name=code or name,
                    source_file=rel,
                    description=md.strip_markdown_inline(description),
                    iteration="",
                    related_process_ids=[],
                ))
            break

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
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}
            if fm_data.get("type") and fm_data.get("type") != "entity":
                continue

            slug = slugify(path.stem)
            de_id = f"DE-{slug}"

            title = str(fm_data.get("title") or "").strip()
            name = title.split("(")[0].strip() if title else self._heading_name(text) or slug
            # Drop a trailing " — Русский текст" qualifier if present.
            name = re.split(r"\s+[—\u2014\-]\s+", name)[0].strip() or slug

            module = str(fm_data.get("module") or "").strip()

            ba_source_raw = fm_data.get("ba_source") or ""
            if isinstance(ba_source_raw, list):
                ba_trace_values = [str(v) for v in ba_source_raw]
            else:
                ba_trace_values = [str(ba_source_raw)]
            ba_trace = []
            rel_src = self._rel(project, path)
            for tok in ba_trace_values:
                matched = False
                for m in _BA_TRACE_TOKEN_RE.finditer(tok):
                    matched = True
                    if m.group(0) not in ba_trace:
                        ba_trace.append(m.group(0))
                # If the token string contained content but nothing matched
                # the canonical whitelist (e.g. sentinel ``—`` or a typo
                # prefix like ``KAR-44``), record a warning. Pure whitespace
                # / empty is ignored.
                stripped = tok.strip()
                if stripped and not matched:
                    _log_dropped_ba_token(rel_src, stripped)

            description = ""
            # Take the first non-heading paragraph after the H1 as description.
            # Prefer an explicit "Описание:" prose line if present.
            # Pre-strip markdown inline so that a `**Описание:**` line (where
            # the colon is *inside* the bold markers) collapses to
            # `Описание:` and the regex captures the value cleanly — without
            # this, a trailing `** ` orphan leaks into the IR.
            for raw_line in text.splitlines():
                line = md.strip_markdown_inline(raw_line)
                m = re.match(r"^\s*\*{0,2}Описание\*{0,2}\s*:\s*(.+)$", line)
                if m:
                    description = md.strip_markdown_inline(m.group(1).strip())
                    break
            if not description:
                # Fallback: "## Описание" section body
                description = md.strip_markdown_inline(
                    (md.find_section(text, r"Описание|Description") or "").strip()
                )

            attributes = _parse_domain_attribute_table(
                de_id, text, self._rel(project, path)
            )

            enum_refs: List[str] = []
            for attr in attributes:
                if not attr.type:
                    continue
                m = re.match(r"^Enum\s*\(([A-Za-z][A-Za-z0-9]*)\)$", attr.type)
                if m:
                    enum_refs.append(f"EN-{slugify(m.group(1))}")
                    continue
                if re.match(r"^[A-Z][A-Za-z0-9]+$", attr.type):
                    enum_refs.append(f"EN-{slugify(attr.type)}")

            ir.domain_entities.append(DomainEntity(
                id=de_id,
                name=name,
                source_file=self._rel(project, path),
                module=module,
                description=description,
                attributes=attributes,
                enumeration_refs=list(dict.fromkeys(enum_refs)),
                ba_trace=ba_trace,
            ))

    # ---- enumerations (+ SystemRole side-effect) -------------------------

    def _parse_enumerations_and_system_roles(self, ir: SaIR, project: Path,
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
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}

            title = str(fm_data.get("title") or "").strip()
            # title is e.g. "SystemRole — Системная роль пользователя". Keep
            # only the PascalCase identifier before the dash.
            name = re.split(r"\s+[—\u2014\-]\s+", title)[0].strip() if title \
                else (self._heading_name(text) or path.stem)
            slug = slugify(path.stem)
            en_id = f"EN-{slug}"

            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description|Назначение") or "").strip()
            )

            values: List[EnumValue] = []
            body = md.find_section(text, r"Значения|Values")
            value_rows: List[Dict[str, str]] = []
            if body:
                tables = md.parse_tables(body)
                if tables:
                    value_rows = tables[0]
                    for idx, row in enumerate(tables[0], start=1):
                        keys = list(row.keys())
                        if not keys:
                            continue
                        val = row[keys[0]].strip()
                        val = re.sub(r"^`|`$", "", val).strip()
                        if not val:
                            continue
                        desc_raw = ""
                        for k, v in row.items():
                            kl = k.lower()
                            if "описание" in kl or "description" in kl:
                                desc_raw = v.strip()
                                break
                        if not desc_raw and len(row) >= 2:
                            desc_raw = list(row.values())[-1].strip()
                        values.append(EnumValue(
                            id=f"{en_id}-V{idx:02d}",
                            value=val,
                            description=md.strip_markdown_inline(desc_raw),
                            source_file=self._rel(project, path),
                        ))

            ba_source_raw = fm_data.get("ba_source", "")
            if isinstance(ba_source_raw, list):
                raw_tokens = [str(s).strip() for s in ba_source_raw
                              if s is not None and str(s).strip()]
            else:
                # Source format: "ROL-01, ROL-02, ROL-03, ROL-04"
                raw_tokens = [t.strip()
                              for t in re.split(r"[,\s]+", str(ba_source_raw))
                              if t.strip()]
            # Prefix-whitelist filter. Non-canonical tokens (sentinel ``—``,
            # typo prefixes like ``KAR-44``) are dropped and warn-logged.
            ba_trace: List[str] = []
            rel_src = self._rel(project, path)
            for tok in raw_tokens:
                m = _BA_TRACE_TOKEN_RE.fullmatch(tok)
                if m:
                    if tok not in ba_trace:
                        ba_trace.append(tok)
                else:
                    _log_dropped_ba_token(rel_src, tok)

            ir.enumerations.append(Enumeration(
                id=en_id,
                name=name,
                source_file=self._rel(project, path),
                description=description,
                values=values,
                ba_trace=ba_trace,
            ))

            # Side-effect: if this enum encodes system roles, emit SystemRole
            # nodes too. Detected heuristically by the value-table columns:
            # we expect "Код", "Название", "BA-роль", "Описание" (or the
            # English equivalents).
            if path.stem in ("system-role", "system-roles") and value_rows:
                self._emit_system_roles_from_enum_rows(
                    ir, value_rows, self._rel(project, path)
                )

    @staticmethod
    def _emit_system_roles_from_enum_rows(ir: SaIR,
                                           rows: List[Dict[str, str]],
                                           rel: str) -> None:
        for row in rows:
            keys = list(row.keys())
            if not keys:
                continue
            code = row[keys[0]].strip().strip("`")
            if not code:
                continue
            # SystemRole id pattern allows A-Z, 0-9, underscore, hyphen.
            role_id = f"SYSROL-{code.upper()}"
            name = ""
            ba_cell = ""
            description = ""
            # Order matters: the "BA-роль" column header lower-cases to
            # "ba-роль" which would also match the "роль" substring used for
            # the name column. Check BA first.
            for k, v in row.items():
                kl = k.lower()
                if "ba" in kl:
                    ba_cell = v.strip()
                elif "название" in kl or "name" in kl or "роль" in kl:
                    if not name:
                        name = v.strip()
                elif "описание" in kl or "description" in kl:
                    description = v.strip()
            ba_trace = [canonical_role_id(m.group(0))
                        for m in re.finditer(r"\b(?:ROL|ACT)-\d{2}\b", ba_cell)]
            ba_trace = [b for b in ba_trace if b]
            ir.system_roles.append(SystemRole(
                id=role_id,
                name=name or code,
                source_file=rel,
                description=md.strip_markdown_inline(description),
                auth="",
                iteration="",
                ba_trace=ba_trace,
            ))

    def _parse_system_roles_fallback(self, ir: SaIR, project: Path,
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
        rel = self._rel(project, matrix)
        for table in tables:
            if not table:
                continue
            first_key = list(table[0].keys())[0].lower()
            if not re.search(r"роль|role", first_key):
                continue
            for row in table:
                vals = list(row.values())
                if not vals:
                    continue
                code = re.sub(r"^[`*]+|[`*]+$", "", vals[0].strip()).strip("`")
                if not code:
                    continue
                # SystemRole id pattern is ASCII-only ([A-Z0-9_-]). When the
                # source role-matrix uses a non-ASCII display label (e.g.
                # Cyrillic ``Пользователь``), slugify it into ASCII first;
                # this also drops spaces / punctuation that would otherwise
                # break the id pattern.
                slug = slugify(code).upper().replace("-", "_")
                if not slug or slug == "UNNAMED":
                    # Fallback: try to keep ASCII letters/digits, else skip.
                    slug = re.sub(r"[^A-Za-z0-9_]+", "_",
                                   code.upper()).strip("_")
                if not re.fullmatch(r"[A-Z0-9_\-]+", slug or ""):
                    self._warn(
                        ir, "ROLE_NAME_NOT_ASCII",
                        f"Role-matrix row code {code!r} produces no ASCII "
                        f"slug; skipped. Add an ASCII Code column or rename.",
                        rel,
                    )
                    continue
                role_id = f"SYSROL-{slug}"
                name = ""
                ba_cell = ""
                description = ""
                for k, v in row.items():
                    kl = k.lower()
                    if "ba" in kl:
                        ba_cell = v.strip()
                    elif "название" in kl or "name" in kl:
                        name = v.strip()
                    elif "описание" in kl or "description" in kl:
                        description = v.strip()
                ba_trace = [canonical_role_id(m.group(0))
                            for m in re.finditer(r"\b(?:ROL|ACT)-\d{2}\b", ba_cell)]
                ba_trace = [b for b in ba_trace if b]
                ir.system_roles.append(SystemRole(
                    id=role_id,
                    name=name or code,
                    source_file=rel,
                    description=md.strip_markdown_inline(description),
                    auth="",
                    iteration="",
                    ba_trace=ba_trace,
                ))
            break

    # ---- forms (screens) ------------------------------------------------

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
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}

            # ``screen:`` frontmatter overrides; otherwise derive from the
            # filename stem. For the canonical ``SCR-X##-...`` family extract
            # just the ``SCR-X##`` prefix so ``original_id`` is the canonical
            # ID and not the slug-with-name.
            screen_slug = str(fm_data.get("screen") or "").strip()
            if not screen_slug:
                m = re.match(r"^(SCR-(?:\d{3}|[A-Z]\d{2}))(?:-|$)", path.stem)
                screen_slug = m.group(1) if m else path.stem
            slug = slugify(path.stem)  # full-stem slug stays the canonical FORM-id basis
            form_id = f"FORM-{slug}"

            title = str(fm_data.get("title") or "").strip()
            name = title.split("(")[0].strip() if title else self._heading_name(text)

            module = str(fm_data.get("module") or "").strip()
            used_by_uc = self._normalise_uc_list(fm_data.get("uc"))

            ir.forms.append(Form(
                id=form_id,
                name=name or slug,
                original_id=screen_slug,
                module=module,
                used_by_uc=used_by_uc,
                fields=[],
                source_file=self._rel(project, path),
            ))

    # ---- use cases ------------------------------------------------------

    def _parse_use_cases(self, ir: SaIR, project: Path,
                          uc_dir: Optional[Path]) -> None:
        if uc_dir is None:
            return
        for path in sorted(uc_dir.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}

            title = str(fm_data.get("title") or "").strip()
            # "UC101. Name", "UC-101: Name", or "UC-F01: Name"
            m = re.match(
                r"^(UC-?(?:\d{1,3}|[A-Z]\d{2}))\s*[.:\u2014\-]\s*(.*)$",
                title,
            )
            raw_id = ""
            name = ""
            if m:
                raw_id = m.group(1).replace(" ", "")
                name = m.group(2).strip()
            else:
                # fallback to filename "UC101-..." or "UC-F01-..."
                fm_match = re.match(
                    r"^(UC-?(?:\d{1,3}|[A-Z]\d{2}))[-_.]", path.name,
                )
                raw_id = fm_match.group(1) if fm_match else ""
                name = self._heading_name(text) or ""

            canonical = self._normalise_uc_id(raw_id)
            if not canonical:
                self._warn(ir, "UC_ID_MISSING",
                           f"No UC id found in {path.name}",
                           self._rel(project, path))
                continue
            # Always populate original_id (R2 retrospective watch-item #4):
            # downstream consumers expect both fields populated even when the
            # canonical and source values are identical.
            original_id = raw_id or canonical

            # Extract name from heading if frontmatter didn't give us one
            if not name:
                heading = self._heading_name(text)
                name = re.sub(
                    r"^UC-?(?:\d{1,3}|[A-Z]\d{2})\s*[.:\u2014\-]\s*",
                    "", heading,
                ).strip()

            actor = md.strip_markdown_inline(
                (md.find_section(text, r"Актор|Actor") or "").strip()
            )

            description = md.strip_markdown_inline(
                (md.find_section(text, r"Цель|Goal|Описание|Description") or "").strip()
            )

            preconditions = _bullets(md.find_section(text, r"Предусловия|Preconditions") or "")
            postconditions = _bullets(md.find_section(text, r"Постусловия|Postconditions") or "")

            # Activity steps: extract from the embedded mermaid flowchart.
            activity_steps = _parse_uc_activity_steps(
                canonical, text, self._rel(project, path)
            )
            main_scenario = [s.description for s in activity_steps]

            module = str(fm_data.get("module") or "").strip()
            priority = str(fm_data.get("priority") or "").strip()

            # BA trace: "## Трассировка" section lists BP ids.
            ba_trace_body = md.find_section(text, r"Трассировка|Traceability") or ""
            ba_trace = list(dict.fromkeys(re.findall(r"\bBP-\d{3}(?:-S\d{2})?\b", ba_trace_body)))

            ir.use_cases.append(UseCase(
                id=canonical,
                name=name,
                source_file=self._rel(project, path),
                original_id=original_id,
                actor=actor,
                module=module,
                priority=priority,
                iteration="",
                complexity="",
                description=description,
                ba_trace=ba_trace,
                preconditions=preconditions,
                postconditions=postconditions,
                main_scenario=main_scenario,
                activity_steps=activity_steps,
            ))

    # ---- requirements ---------------------------------------------------

    def _parse_requirements(self, ir: SaIR, project: Path,
                             req_dir: Optional[Path]) -> None:
        if req_dir is None:
            return
        for path in sorted(req_dir.glob("UC*-requirements.md")):
            text = self._read(path) or ""
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}
            uc_ids = self._normalise_uc_list(fm_data.get("uc"))
            if not uc_ids:
                m = re.match(
                    r"^UC-?(\d{1,3}|[A-Z]\d{2})-requirements\.md$", path.name,
                )
                if m:
                    token = m.group(1)
                    if token.isdigit():
                        uc_ids = [f"UC-{int(token):03d}"]
                    else:
                        uc_ids = [f"UC-{token}"]
            rel = self._rel(project, path)

            # Every pipe table inside a "## Требования ..." section whose
            # first column is "ID" contributes rows.
            for heading_text, body in md.find_sections(text, r"Требования.*"):
                for table in md.parse_tables(body):
                    if not table:
                        continue
                    keys = list(table[0].keys())
                    if not keys:
                        continue
                    if not re.fullmatch(r"id", keys[0].strip().lower()):
                        continue
                    # Find the "Требование" / "Описание" column and priority
                    desc_key = ""
                    prio_key = ""
                    kind_key = ""
                    for k in keys:
                        kl = k.lower()
                        if not desc_key and ("требование" in kl or "описание" in kl
                                              or "requirement" in kl
                                              or "description" in kl):
                            desc_key = k
                        if not prio_key and ("приоритет" in kl or "priority" in kl):
                            prio_key = k
                        if not kind_key and ("тип" in kl or "type" in kl or "kind" in kl):
                            kind_key = k
                    for row in table:
                        raw_id = row.get(keys[0], "").strip()
                        # Accept the kartov-orders shape ``RQ101-01`` and the
                        # infographic shape ``RQ-F01-01`` (letter-prefix UC).
                        if not re.fullmatch(
                            r"[A-Za-z]+(?:-?[A-Z0-9]+)+", raw_id,
                        ):
                            continue
                        req_id = f"REQ-{raw_id.upper()}"
                        description = row.get(desc_key, "").strip() if desc_key else ""
                        priority = row.get(prio_key, "").strip() if prio_key else ""
                        kind_raw = row.get(kind_key, "").strip() if kind_key else ""
                        kind = _normalise_req_kind(kind_raw)
                        ir.requirements.append(Requirement(
                            id=req_id,
                            description=md.strip_markdown_inline(description),
                            source_file=rel,
                            kind=kind,
                            priority=priority,
                            uc_ids=list(uc_ids),
                            ba_trace=[],
                        ))

    # ---- traceability matrix --------------------------------------------

    def _parse_traceability(self, handoff: HandoffIR, ir: SaIR,
                              project: Path) -> None:
        path = project / "docs" / "99-meta" / "traceability-matrix.md"
        if not path.is_file():
            return
        handoff.source_file = self._rel(project, path)
        text = self._read(path) or ""

        # Build lookup maps once.
        de_by_name = {e.name.lower(): e.id for e in ir.domain_entities}
        de_by_slug = {slugify(e.name): e.id for e in ir.domain_entities}
        req_ids = {r.id for r in ir.requirements}

        sections = md.find_sections(text, r"\d+\.\s+.*")
        for heading, body in sections:
            lower = heading.lower()
            tables = md.parse_tables(body)
            if not tables:
                continue

            if "процесс" in lower and "use case" in lower:
                self._emit_automates_as(handoff, tables[0])
            elif "сущност" in lower or ("obj" in lower and "de" in lower):
                self._emit_realized_as(handoff, ir, tables[0], de_by_name, de_by_slug)
            elif "роли" in lower or "system roles" in lower:
                self._emit_mapped_to(handoff, ir, tables[0])
            elif "бизнес-правил" in lower or "правил" in lower or "brq" in lower:
                self._emit_implemented_by(handoff, ir, tables[0], req_ids)

    @staticmethod
    def _emit_automates_as(handoff: HandoffIR,
                            rows: List[Dict[str, str]]) -> None:
        for row in rows:
            cells = list(row.values())
            joined = " | ".join(cells)
            bp_match = re.search(r"\bBP-\d{3}(?:-S\d{2})?\b", joined)
            uc_ids = []
            for m in re.finditer(
                r"\bUC-?(?:\d{2,3}|[A-Z]\d{2})\b", joined,
            ):
                canon = FrontmatterV1SaAdapter._normalise_uc_id(m.group(0))
                if canon and canon not in uc_ids:
                    uc_ids.append(canon)
            if not (bp_match and uc_ids):
                continue
            # Prefer the BP-only form for AUTOMATES_AS so the downstream
            # generator can attach the edge to the BP or its step.
            bp_id = bp_match.group(0)
            for uc_id in uc_ids:
                edge = HandoffEdge(
                    from_id=bp_id, to_id=uc_id,
                    source_file=handoff.source_file,
                )
                # The matrix may list several workflow steps that map to the
                # same UC; dedupe on (from_id, to_id).
                if not any(e.from_id == edge.from_id and e.to_id == edge.to_id
                           for e in handoff.automates_as):
                    handoff.automates_as.append(edge)

    @staticmethod
    def _emit_realized_as(handoff: HandoffIR, ir: SaIR,
                           rows: List[Dict[str, str]],
                           de_by_name: Dict[str, str],
                           de_by_slug: Dict[str, str]) -> None:
        for row in rows:
            cells = list(row.values())
            if len(cells) < 2:
                continue
            joined = " | ".join(cells)
            obj_match = re.search(r"\bOBJ-\d{3}\b", joined)
            if not obj_match:
                continue
            # Find an SA name cell. Skip the first (OBJ id) and prefer the
            # last non-empty cell that starts with a PascalCase identifier.
            sa_candidates: List[str] = []
            for cell in cells:
                cleaned = re.sub(r"^[`*]+|[`*]+$", "", cell.strip())
                for m in re.finditer(r"\b([A-Z][A-Za-z0-9]+)\b", cleaned):
                    sa_candidates.append(m.group(1))
            target = None
            for cand in sa_candidates:
                target = de_by_name.get(cand.lower()) or de_by_slug.get(slugify(cand))
                if target:
                    break
            if not target:
                continue
            edge = HandoffEdge(
                from_id=obj_match.group(0), to_id=target,
                source_file=handoff.source_file,
            )
            # Dedupe — the matrix often mentions an OBJ under several SA names.
            if not any(e.from_id == edge.from_id and e.to_id == edge.to_id
                       for e in handoff.realized_as):
                handoff.realized_as.append(edge)

    @staticmethod
    def _emit_mapped_to(handoff: HandoffIR, ir: SaIR,
                         rows: List[Dict[str, str]]) -> None:
        sr_by_slug = {slugify(r.name): r.id for r in ir.system_roles}
        sr_ids = {r.id for r in ir.system_roles}
        for row in rows:
            cells = list(row.values())
            if len(cells) < 2:
                continue
            joined = " | ".join(cells)
            rol_match = re.search(r"\b(?:ROL|ACT)-\d{2}\b", joined)
            if not rol_match:
                continue
            from_id = canonical_role_id(rol_match.group(0))
            if not from_id:
                continue
            # Find an SA role identifier — ``snake_case`` or kebab-case token
            # inside backticks or plain. Match against the SystemRole name.
            target = None
            for m in re.finditer(r"`([a-z][a-z0-9_\-]+)`", joined):
                sa_name = m.group(1)
                canon_id = f"SYSROL-{sa_name.upper().replace('-', '_')}"
                if canon_id in sr_ids:
                    target = canon_id
                    break
                slug = slugify(sa_name)
                if slug in sr_by_slug:
                    target = sr_by_slug[slug]
                    break
            if not target:
                continue
            handoff.mapped_to.append(HandoffEdge(
                from_id=from_id, to_id=target,
                source_file=handoff.source_file,
            ))

    @staticmethod
    def _emit_implemented_by(handoff: HandoffIR, ir: SaIR,
                              rows: List[Dict[str, str]],
                              req_ids: set[str]) -> None:
        for row in rows:
            cells = list(row.values())
            if len(cells) < 2:
                continue
            joined = " | ".join(cells)
            brq_match = re.search(r"\bBRQ-\d{3}\b", joined)
            if not brq_match:
                continue
            # Accept both REQ-... (already qualified) and RQxxx-NN shorthand.
            req_candidates: List[str] = []
            for m in re.finditer(r"\bREQ-[A-Z0-9\-]+\b", joined):
                if m.group(0) in req_ids:
                    req_candidates.append(m.group(0))
            for m in re.finditer(
                r"\b([A-Za-z]+(?:-?[A-Z0-9]+)+)\b", joined,
            ):
                token = m.group(1)
                up = token.upper()
                if up.startswith("BRQ") or up.startswith("UC") or up.startswith("BP"):
                    continue
                canon = f"REQ-{up}"
                if canon in req_ids and canon not in req_candidates:
                    req_candidates.append(canon)
            for req_id in req_candidates:
                handoff.implemented_by.append(HandoffEdge(
                    from_id=brq_match.group(0),
                    to_id=req_id,
                    source_file=handoff.source_file,
                ))


# ---------------------------------------------------------------------------
# Helpers

def _bullets(body: str) -> List[str]:
    items: List[str] = []
    for line in body.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            items.append(md.strip_markdown_inline(stripped[2:].strip()))
    return items


def _parse_domain_attribute_table(de_id: str, text: str, rel: str
                                   ) -> List[DomainAttribute]:
    body = md.find_section(text, r"Атрибуты|Attributes")
    if not body:
        return []
    tables = md.parse_tables(body)
    if not tables:
        return []
    attrs: List[DomainAttribute] = []
    for idx, row in enumerate(tables[0], start=1):
        keys = list(row.keys())
        if not keys:
            continue
        name = row[keys[0]].strip()
        if not name or name.startswith("---"):
            continue
        type_value = ""
        required = False
        description = ""
        constraints = ""
        for k, v in row.items():
            kl = k.lower()
            if ("тип" in kl or "type" in kl) and not type_value:
                type_value = v.strip()
            elif "обязательн" in kl or "required" in kl:
                required = v.strip().lower() in ("да", "yes", "true", "+", "required")
            elif "описание" in kl or "description" in kl:
                description = v.strip()
            elif "ограничен" in kl or "constraint" in kl:
                constraints = v.strip()
        attrs.append(DomainAttribute(
            id=f"{de_id}-A{idx:02d}",
            name=name,
            type=type_value,
            required=required,
            description=md.strip_markdown_inline(description),
            constraints=md.strip_markdown_inline(constraints),
            source_file=rel,
        ))
    return attrs


def _parse_uc_activity_steps(uc_id: str, text: str, rel: str
                              ) -> List[ActivityStep]:
    """Derive activity steps from the first ``flowchart`` mermaid block.

    We walk the graph in topological / document order and assign step
    numbers incrementally. Decision diamonds are included as regular steps
    so downstream consumers can see the full flow.
    """
    for lang, body in md.iter_code_blocks(text):
        if lang != "mermaid":
            continue
        if mermaid.classify(body) != "flowchart":
            continue
        fc = mermaid.parse_flowchart(body)
        if not fc:
            continue
        steps: List[ActivityStep] = []
        step_number = 0
        seen: set[str] = set()
        for node in fc.nodes:
            if not node.label:
                continue
            # Skip start/end stadium nodes — their labels are narrative.
            if node.shape == "stadium":
                continue
            if node.id in seen:
                continue
            seen.add(node.id)
            step_number += 1
            desc = md.strip_markdown_inline(node.label.replace("\n", " "))
            actor = None
            if desc.lower().startswith("user:"):
                actor = "User"
                desc = desc[5:].strip()
            elif desc.lower().startswith("system:"):
                actor = "System"
                desc = desc[7:].strip()
            steps.append(ActivityStep(
                id=f"{uc_id}-A{step_number:02d}",
                step_number=step_number,
                description=desc,
                actor=actor,
                source_file=rel,
            ))
        return steps
    return []


def _normalise_req_kind(raw: str) -> str:
    rl = raw.strip().lower()
    if not rl:
        return ""
    nfr_hints = ("nfr", "нефункц", "безопас", "производ", "нагрузк", "надёжн",
                 "надежн", "доступн", "совмест")
    for hint in nfr_hints:
        if hint in rl:
            return "NFR"
    return "FR"
