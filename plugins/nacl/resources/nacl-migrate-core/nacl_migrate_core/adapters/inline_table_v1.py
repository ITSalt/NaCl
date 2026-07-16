"""inline-table-v1 adapter.

Target format (short-prefix-uc dialect):
  - No YAML frontmatter.
  - File starts with `# {ID}: {Name}` or `# {Name}`.
  - Metadata in a `## Метаданные` / `## Metadata` section containing a
    `| Поле | Значение |` table.
  - Body sections: `## Описание`, `## Атрибуты`, `## Связи`,
    `## Каноническая таблица` (for workflows), `## Участие в процессах`, etc.
  - Optional fenced ```mermaid``` blocks.
  - Business-role IDs use ACT-NN instead of ROL-NN — normalised here.

The adapter walks the docs/ tree, parses each file into the appropriate IR
entry, attaches workflow steps to their parent BusinessProcess, and emits a
complete BaIR.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .. import markdown as md
from .. import mermaid
from ..ir_ba import (
    BaIR,
    BusinessEntity,
    BusinessProcess,
    BusinessRole,
    BusinessRule,
    DataFlow,
    EntityAttribute,
    EntityState,
    EntityStateTransition,
    ExternalEntity,
    GlossaryTerm,
    ProcessGroup,
    Stakeholder,
    SystemContext,
    Warning,
    WorkflowStep,
)
from ..slugify import canonical_role_id, canonical_step_id
from .base import BaseBaAdapter


# ---------------------------------------------------------------------------
# Constants

_METADATA_HEADING = r"^(Метаданные|Metadata|Параметры)$"

_STEREOTYPE_MAP = {
    "автоматизируется": "Автоматизируется",
    "auto":             "Автоматизируется",
    "ручной":           "Бизнес-функция",
    "manual":           "Бизнес-функция",
    "бизнес-функция":   "Бизнес-функция",
    "решение":          "Решение",
    "decision":         "Решение",
}

_ID_PREFIX_PATTERNS = {
    "GPR": re.compile(r"^GPR-\d{2}$"),
    "BP":  re.compile(r"^BP-\d{3}$"),
    "OBJ": re.compile(r"^OBJ-\d{3}$"),
    "ACT": re.compile(r"^ACT-\d{2}$"),
    "ROL": re.compile(r"^ROL-\d{2}$"),
    "BRQ": re.compile(r"^BRQ-\d{3}$"),
}

_ID_IN_HEADING = re.compile(
    r"^#\s+([A-Z]{2,4}-\d{2,3}(?:-[A-Z0-9]+)*)"
    r"(?:\s+Workflow)?\s*[:.\u2014\-\u2013]\s*(.*)$"
)


# ---------------------------------------------------------------------------
# Adapter

class InlineTableV1BaAdapter(BaseBaAdapter):
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
            # Must NOT start with frontmatter
            if text.lstrip().startswith("---"):
                continue
            # Must start with an ATX heading
            first = next((ln for ln in text.splitlines() if ln.strip()), "")
            if not first.startswith("# "):
                continue
            # Should contain a ## Метаданные / ## Metadata section with a pipe table
            if md.find_section(text, _METADATA_HEADING) is not None:
                hits += 1
            else:
                # Allow GPR files etc. that have no Метаданные but do have pipe tables
                if md.parse_tables(text):
                    hits += 0.5
        return min(hits / len(sample_files), 1.0)

    # ---- top-level parse -------------------------------------------------

    def parse(self, project_path: Path) -> BaIR:
        project_path = project_path.resolve()
        ir = BaIR(
            project_path=str(project_path),
            adapter=self.name,
            adapter_version=self.version,
            generated_at=_dt.datetime.now(_dt.timezone.utc).isoformat(),
        )

        self._parse_system_context(ir, project_path)
        self._parse_process_groups(ir, project_path)
        self._parse_business_processes(ir, project_path)
        self._parse_workflows(ir, project_path)
        self._parse_business_entities(ir, project_path)
        self._parse_entity_states(ir, project_path)
        self._parse_business_roles(ir, project_path)
        self._parse_business_rules(ir, project_path)
        self._parse_glossary(ir, project_path)

        return ir

    # ---- helpers ---------------------------------------------------------

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
        """Extract the `## Метаданные` table as a {key: value} dict."""
        table = md.first_table_after(text, _METADATA_HEADING)
        if not table:
            return {}
        result: Dict[str, str] = {}
        for row in table:
            # Rows have two columns: 'Поле' / 'Значение' (or similar variants)
            cells = list(row.values())
            if len(cells) < 2:
                continue
            key = cells[0].strip()
            value = cells[1].strip()
            if key:
                result[_strip_bold(key).lower()] = value
        return result

    @staticmethod
    def _heading_ids(text: str) -> Tuple[Optional[str], str]:
        """Return (id_from_heading, name_from_heading) from the first # line."""
        for line in text.splitlines():
            if line.startswith("# "):
                m = _ID_IN_HEADING.match(line)
                if m:
                    return m.group(1), m.group(2).strip()
                # No ID in heading — use plain title
                return None, line[2:].strip()
        return None, ""

    @staticmethod
    def _extract_first_id(value: str, prefix: str) -> Optional[str]:
        """Find the first well-formed `{prefix}-NNN` token in the value."""
        pat = re.compile(rf"\b({prefix}-\d{{2,3}})\b")
        m = pat.search(value)
        return m.group(1) if m else None

    @staticmethod
    def _extract_all_ids(value: str, prefix: str) -> List[str]:
        pat = re.compile(rf"\b({prefix}-\d{{2,3}})\b")
        return pat.findall(value)

    @staticmethod
    def _warn(ir: BaIR, code: str, message: str,
              source_file: Optional[str] = None, source_line: Optional[int] = None) -> None:
        ir.warnings.append(Warning(
            code=code, message=message,
            source_file=source_file, source_line=source_line,
        ))

    # ---- context --------------------------------------------------------

    def _parse_system_context(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "00-context"
        if not folder.is_dir():
            return
        scope_file = folder / "system-scope.md"
        if not scope_file.is_file():
            return
        text = self._read(scope_file) or ""
        _, name = self._heading_ids(text)
        ir.system_context = SystemContext(
            id="SYS-001",
            name=name or "System",
            source_file=self._rel(project, scope_file),
            goals=_bullets(md.find_section(text, r"Цели|Goals") or ""),
            in_scope=_bullets(md.find_section(text, r"В (скоупе|scope)|In scope") or ""),
            out_of_scope=_bullets(md.find_section(text, r"Вне скоупа|Out of scope") or ""),
            constraints=_bullets(md.find_section(text, r"Ограничения|Constraints") or ""),
            assumptions=_bullets(md.find_section(text, r"Допущения|Assumptions") or ""),
        )

    # ---- process groups -------------------------------------------------

    def _parse_process_groups(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "01-business-processes" / "groups"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            gpr_id, name = self._heading_ids(text)
            if gpr_id and not _ID_PREFIX_PATTERNS["GPR"].match(gpr_id):
                gpr_id = None
            if gpr_id is None:
                # Derive from filename: GPR-01-slug.md
                m = re.match(r"^(GPR-\d{2})-.*\.md$", path.name)
                gpr_id = m.group(1) if m else None
            if gpr_id is None:
                self._warn(ir, "GPR_ID_MISSING",
                           f"Cannot derive GPR ID from {path.name}", self._rel(project, path))
                continue
            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )
            ir.process_groups.append(ProcessGroup(
                id=gpr_id, name=name, source_file=self._rel(project, path),
                description=description,
            ))

    # ---- business processes ---------------------------------------------

    def _parse_business_processes(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "01-business-processes" / "processes"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            bp_id = metadata.get("код") or metadata.get("code") or metadata.get("bp")
            if not bp_id:
                bp_id_from_heading, _ = self._heading_ids(text)
                bp_id = bp_id_from_heading
            if not bp_id:
                m = re.match(r"^(BP-\d{3})-.*\.md$", path.name)
                bp_id = m.group(1) if m else None
            if not bp_id or not _ID_PREFIX_PATTERNS["BP"].match(bp_id):
                self._warn(ir, "BP_ID_MISSING",
                           f"Cannot derive BP ID from {path.name}", self._rel(project, path))
                continue

            _, heading_name = self._heading_ids(text)
            name = metadata.get("название") or metadata.get("name") or heading_name

            group_raw = metadata.get("группа") or metadata.get("group") or ""
            group_id = self._extract_first_id(group_raw, "GPR")
            if not group_id:
                self._warn(ir, "BP_GROUP_MISSING",
                           f"{bp_id}: no group reference in metadata 'Группа'",
                           self._rel(project, path))
                # Synthesize ungrouped placeholder — caller will fix
                group_id = "GPR-99"

            ir.business_processes.append(BusinessProcess(
                id=bp_id, name=name,
                group_id=group_id,
                source_file=self._rel(project, path),
                description=md.strip_markdown_inline(
                    (md.find_section(text, r"Описание|Description") or "").strip()
                ),
                trigger=metadata.get("триггер") or metadata.get("trigger") or "",
                result=metadata.get("результат") or metadata.get("result") or "",
                automation_level=metadata.get("автоматизация") or metadata.get("automation"),
            ))

    # ---- workflows ------------------------------------------------------

    def _parse_workflows(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "01-business-processes" / "workflows"
        if not folder.is_dir():
            return
        bp_by_id = {bp.id: bp for bp in ir.business_processes}

        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            bp_id = (metadata.get("bp") or metadata.get("код") or "").strip()
            bp_id = self._extract_first_id(bp_id, "BP") or bp_id
            if not bp_id:
                heading_id, _ = self._heading_ids(text)
                bp_id = heading_id
            if not bp_id:
                m = re.match(r"^(BP-\d{3})-workflow.md$", path.name)
                bp_id = m.group(1) if m else None
            if not bp_id or bp_id not in bp_by_id:
                self._warn(ir, "WORKFLOW_BP_UNKNOWN",
                           f"Workflow file {path.name} refers to unknown BP {bp_id!r}",
                           self._rel(project, path))
                continue

            bp = bp_by_id[bp_id]
            steps = _parse_workflow_table(bp_id, text, self._rel(project, path))
            # Merge next_step_ids from flowchart if present
            next_map = _parse_workflow_mermaid(bp_id, text)
            for step in steps:
                if step.id in next_map:
                    step.next_step_ids = next_map[step.id]
            bp.workflow = steps

    # ---- entities -------------------------------------------------------

    def _parse_business_entities(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "02-business-entities" / "entities"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            obj_id = metadata.get("код") or metadata.get("code") or ""
            obj_id = self._extract_first_id(obj_id, "OBJ") or obj_id
            if not obj_id:
                heading_id, _ = self._heading_ids(text)
                obj_id = heading_id
            if not obj_id:
                m = re.match(r"^(OBJ-\d{3})(?:-.*)?\.md$", path.name)
                obj_id = m.group(1) if m else None
            if not obj_id or not _ID_PREFIX_PATTERNS["OBJ"].match(obj_id):
                self._warn(ir, "OBJ_ID_MISSING",
                           f"Cannot derive OBJ ID from {path.name}", self._rel(project, path))
                continue

            _, heading_name = self._heading_ids(text)
            name = metadata.get("название") or metadata.get("name") or heading_name
            stereotype = metadata.get("стереотип") or metadata.get("stereotype") or "Бизнес-объект"
            has_states = _yes_no(metadata.get("жизненный цикл") or metadata.get("lifecycle"))

            attributes = _parse_attribute_table(obj_id, text, self._rel(project, path))
            related_bp = self._parse_related_processes(text)

            ir.business_entities.append(BusinessEntity(
                id=obj_id,
                name=name,
                type=stereotype,
                stereotype=stereotype,
                has_states=has_states,
                description=md.strip_markdown_inline(
                    (md.find_section(text, r"Описание|Description") or "").strip()
                ),
                attributes=attributes,
                states=[],  # populated by _parse_entity_states
                related_process_ids=related_bp,
                source_file=self._rel(project, path),
            ))

    def _parse_entity_states(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "02-business-entities" / "states"
        if not folder.is_dir():
            return
        by_id = {e.id: e for e in ir.business_entities}
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            m = re.match(r"^(OBJ-\d{3})-states\.md$", path.name)
            if not m:
                continue
            obj_id = m.group(1)
            if obj_id not in by_id:
                self._warn(ir, "STATE_OBJ_UNKNOWN",
                           f"State file {path.name} refers to unknown entity {obj_id}",
                           self._rel(project, path))
                continue
            text = self._read(path) or ""
            states = _parse_states_mermaid(obj_id, text, self._rel(project, path))
            by_id[obj_id].states = states
            if states:
                by_id[obj_id].has_states = True

    def _parse_related_processes(self, text: str) -> List[str]:
        body = md.find_section(text, r"Участие в процессах|Processes")
        if body is None:
            return []
        tables = md.parse_tables(body)
        if not tables:
            return []
        ids: List[str] = []
        for row in tables[0]:
            for cell in row.values():
                for bp in re.findall(r"\bBP-\d{3}\b", cell):
                    if bp not in ids:
                        ids.append(bp)
        return ids

    # ---- roles ----------------------------------------------------------

    def _parse_business_roles(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "03-business-roles" / "roles"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            raw_id = metadata.get("код") or metadata.get("code") or ""
            raw_id = raw_id.strip() or ""
            if not raw_id:
                heading_id, _ = self._heading_ids(text)
                raw_id = heading_id or ""
            if not raw_id:
                m = re.match(r"^(ACT-\d{2}|ROL-\d{2})-.*\.md$", path.name)
                raw_id = m.group(1) if m else ""

            canonical = canonical_role_id(raw_id) if raw_id else None
            if not canonical:
                self._warn(ir, "ROLE_ID_MISSING",
                           f"Cannot derive role ID from {path.name}", self._rel(project, path))
                continue

            _, heading_name = self._heading_ids(text)
            name = metadata.get("название") or metadata.get("name") or heading_name
            department = metadata.get("тип") or metadata.get("department") or ""
            responsibilities = _bullets(md.find_section(text, r"Полномочия|Responsibilities") or "")

            # participates_in processes
            participates: List[str] = []
            part_body = md.find_section(text, r"Участие в процессах|Processes")
            if part_body:
                tables = md.parse_tables(part_body)
                if tables:
                    for row in tables[0]:
                        for cell in row.values():
                            for bp in re.findall(r"\bBP-\d{3}\b", cell):
                                if bp not in participates:
                                    participates.append(bp)

            ir.business_roles.append(BusinessRole(
                id=canonical,
                full_name=name,
                original_id=raw_id if raw_id != canonical else None,
                department=department,
                responsibilities=responsibilities,
                participates_in_process_ids=participates,
                source_file=self._rel(project, path),
            ))

    # ---- rules ----------------------------------------------------------

    def _parse_business_rules(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "04-business-rules" / "rules"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            metadata = self._metadata_table(text)

            rule_id = metadata.get("код") or metadata.get("code") or ""
            rule_id = self._extract_first_id(rule_id, "BRQ") or rule_id
            if not rule_id:
                heading_id, _ = self._heading_ids(text)
                rule_id = heading_id
            if not rule_id:
                m = re.match(r"^(BRQ-\d{3})(?:-.*)?\.md$", path.name)
                rule_id = m.group(1) if m else None
            if not rule_id or not _ID_PREFIX_PATTERNS["BRQ"].match(rule_id):
                self._warn(ir, "RULE_ID_MISSING",
                           f"Cannot derive BRQ ID from {path.name}", self._rel(project, path))
                continue

            _, heading_name = self._heading_ids(text)
            name = heading_name

            formulation = md.strip_markdown_inline(
                (md.find_section(text, r"Формулировка|Formulation") or "").strip()
            )

            constrains_entities: List[str] = []
            applies_in: List[str] = []
            applies_at: List[str] = []
            affects_attrs: List[str] = []
            links_body = md.find_section(text, r"Связи|Links")
            if links_body:
                tables = md.parse_tables(links_body)
                if tables:
                    for row in tables[0]:
                        kind = _strip_bold(list(row.values())[0]).lower()
                        code_cell = " ".join(row.values())
                        if "процесс" in kind or "process" in kind:
                            applies_in.extend(self._extract_all_ids(code_cell, "BP"))
                        if "сущност" in kind or "entity" in kind:
                            constrains_entities.extend(self._extract_all_ids(code_cell, "OBJ"))
                        if "атрибут" in kind or "attribute" in kind:
                            affects_attrs.extend(re.findall(r"\bOBJ-\d{3}-A\d{2}\b", code_cell))
                        if "шаг" in kind or "step" in kind:
                            applies_at.extend(re.findall(r"\bBP-\d{3}-S\d{2}\b", code_cell))

            ir.business_rules.append(BusinessRule(
                id=rule_id,
                name=name,
                rule_type=metadata.get("тип") or metadata.get("type") or "",
                formulation=formulation,
                severity=metadata.get("критичность") or metadata.get("severity") or "",
                constrains_entity_ids=list(dict.fromkeys(constrains_entities)),
                applies_in_process_ids=list(dict.fromkeys(applies_in)),
                applies_at_step_ids=list(dict.fromkeys(applies_at)),
                affects_attribute_ids=list(dict.fromkeys(affects_attrs)),
                source_file=self._rel(project, path),
            ))

    # ---- glossary -------------------------------------------------------

    def _parse_glossary(self, ir: BaIR, project: Path) -> None:
        path = project / "docs" / "99-meta" / "glossary.md"
        if not path.is_file():
            return
        text = self._read(path) or ""
        tables = md.parse_tables(text)
        seen = 0
        seen_terms: set[str] = set()
        for table in tables:
            if not table:
                continue
            # Include every table whose first column header looks like terms
            first_col = list(table[0].keys())[0]
            if not re.search(r"термин|term", first_col, re.IGNORECASE):
                continue
            for row in table:
                values = list(row.values())
                if not values or not values[0].strip():
                    continue
                term = values[0].strip()
                # Dedupe repeats that can occur when the same term appears in
                # multiple glossary sections
                key = term.lower()
                if key in seen_terms:
                    continue
                seen_terms.add(key)
                # Last column is the definition; if the middle column is an
                # English translation, it becomes a synonym entry
                if len(values) >= 3:
                    synonyms = [values[1].strip()] if values[1].strip() else []
                    definition = values[-1].strip()
                elif len(values) == 2:
                    synonyms = []
                    definition = values[-1].strip()
                else:
                    synonyms = []
                    definition = ""
                seen += 1
                ir.glossary_terms.append(GlossaryTerm(
                    id=f"GLO-{seen:03d}",
                    term=term,
                    synonyms=synonyms,
                    definition=definition,
                    source_file=self._rel(project, path),
                ))


# ---------------------------------------------------------------------------
# Module-level parsing helpers

def _strip_bold(s: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", s).strip()


def _yes_no(value: Optional[str]) -> bool:
    if not value:
        return False
    return value.strip().lower() in ("да", "yes", "true", "+")


def _bullets(body: str) -> List[str]:
    items: List[str] = []
    for line in body.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            items.append(md.strip_markdown_inline(stripped[2:].strip()))
    return items


def _parse_attribute_table(obj_id: str, text: str, rel_source: str) -> List[EntityAttribute]:
    body = md.find_section(text, r"Атрибуты|Attributes")
    if not body:
        return []
    tables = md.parse_tables(body)
    if not tables:
        return []
    attrs: List[EntityAttribute] = []
    for idx, row in enumerate(tables[0], start=1):
        # First column is attribute name; try common aliases
        keys = list(row.keys())
        if not keys:
            continue
        name_key = keys[0]
        name = row[name_key].strip()
        if not name or name.startswith("---"):
            continue
        # Type / required may appear under various headings
        type_value = ""
        required = False
        for k, v in row.items():
            kl = k.lower()
            if "тип" in kl or "type" in kl:
                type_value = v.strip()
            if "обязательн" in kl or "required" in kl:
                required = _yes_no(v)
        attrs.append(EntityAttribute(
            id=f"{obj_id}-A{idx:02d}",
            name=name,
            type=type_value,
            required=required,
            description=row.get("Описание", row.get("Description", "")).strip(),
            source_file=rel_source,
        ))
    return attrs


def _parse_workflow_table(bp_id: str, text: str, rel_source: str) -> List[WorkflowStep]:
    body = md.find_section(text, r"Каноническая таблица|Canonical table|Workflow( steps?)?")
    if not body:
        return []
    tables = md.parse_tables(body)
    if not tables:
        return []
    steps: List[WorkflowStep] = []
    for row in tables[0]:
        keys = list(row.keys())
        if not keys:
            continue
        num_raw = row.get(keys[0], "").strip()
        try:
            step_number = int(num_raw)
        except ValueError:
            continue
        step_text = ""
        performer_raw = ""
        stereotype_raw = ""
        for k, v in row.items():
            kl = k.lower()
            if kl in ("шаг", "step"):
                step_text = v.strip()
            elif "исполнитель" in kl or "performer" in kl or "actor" in kl:
                performer_raw = v.strip()
            elif "стереотип" in kl or "stereotype" in kl or "type" in kl:
                stereotype_raw = v.strip()
        stereotype_norm = _STEREOTYPE_MAP.get(stereotype_raw.lower(), "Бизнес-функция")

        # performer like "Пользователь (ACT-01)"
        performer_role_id: Optional[str] = None
        m = re.search(r"\bACT-\d{2}\b", performer_raw)
        if m:
            performer_role_id = canonical_role_id(m.group(0))
        else:
            m = re.search(r"\bROL-\d{2}\b", performer_raw)
            if m:
                performer_role_id = m.group(0)

        steps.append(WorkflowStep(
            id=canonical_step_id(bp_id, step_number),
            step_number=step_number,
            function_name=step_text,
            stereotype=stereotype_norm,
            performer_role_id=performer_role_id,
            source_file=rel_source,
        ))
    return steps


def _parse_workflow_mermaid(bp_id: str, text: str) -> Dict[str, List[str]]:
    """Parse the workflow's flowchart to derive NEXT_STEP edges.

    Mermaid node IDs like S1/S2/S3 are mapped to BP-NNN-S01/S02/S03 if the
    numeric suffix matches a step. Decision diamonds (D1, DECIDE) are mapped
    by position in the table (if we had one); here we simply propagate edges
    between numbered step IDs and leave unresolved endpoints alone.
    """
    result: Dict[str, List[str]] = {}
    for lang, body in md.iter_code_blocks(text):
        if lang != "mermaid":
            continue
        if mermaid.classify(body) != "flowchart":
            continue
        fc = mermaid.parse_flowchart(body)
        if not fc:
            continue
        # Map mermaid node id -> canonical step id (if matchable)
        id_map: Dict[str, str] = {}
        for node in fc.nodes:
            m = re.match(r"^S(\d+)$", node.id)
            if m:
                id_map[node.id] = canonical_step_id(bp_id, int(m.group(1)))
        for edge in fc.edges:
            src = id_map.get(edge.from_id)
            dst = id_map.get(edge.to_id)
            if src and dst:
                result.setdefault(src, []).append(dst)
    return result


def _parse_states_mermaid(obj_id: str, text: str, rel_source: str) -> List[EntityState]:
    for lang, body in md.iter_code_blocks(text):
        if lang != "mermaid":
            continue
        if mermaid.classify(body) != "stateDiagram":
            continue
        diagram = mermaid.parse_state_diagram(body)
        if not diagram:
            continue
        # Map Mermaid state name -> canonical state id (deterministic by document order)
        ordered: List[str] = []
        for s in diagram.states:
            if s.name not in ordered and s.name != "[*]":
                ordered.append(s.name)
        id_map = {name: f"{obj_id}-ST{i+1:02d}" for i, name in enumerate(ordered)}
        states: Dict[str, EntityState] = {}
        for s in diagram.states:
            if s.name == "[*]":
                continue
            state_id = id_map[s.name]
            states[s.name] = EntityState(
                id=state_id,
                name=s.name,
                description=" | ".join(s.descriptions),
                source_file=rel_source,
            )
        for t in diagram.transitions:
            if t.from_name == "[*]" or t.to_name == "[*]":
                continue
            if t.from_name not in states or t.to_name not in states:
                continue
            states[t.from_name].transitions_to.append(EntityStateTransition(
                to_id=states[t.to_name].id,
                condition=t.condition,
            ))
        return [states[name] for name in ordered if name in states]
    return []
