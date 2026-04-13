"""frontmatter-v1 adapter — BA layer.

Target format (kartov-orders):
  - Hybrid: some files start with a YAML frontmatter block, others are bare
    H1 + inline metadata tables.

Files WITH frontmatter:
  - docs/02-business-entities/entities/OBJ-NNN-*.md
      keys: id, name, stereotype, parent, has_states, processes[], status, ...
  - docs/03-business-roles/roles/ROL-NN-*.md
      keys: id, code, name, department, status, ...

Files WITHOUT frontmatter (bare):
  - docs/01-business-processes/groups/GPR-NN-*.md
      H1 "# GPR-NN: Name" + "## Описание" + "## Процессы группы" table
  - docs/01-business-processes/processes/BP-NNN-*.md
      H1 + inline 2-col metadata table right after the heading
  - docs/01-business-processes/workflows/BP-NNN-workflow.md
      H1 + optional metadata table + "## Шаги процесса" table with
      columns "# | Исполнитель | Стереотип | Действие | Артефакт"

Single-file artefacts:
  - docs/04-business-rules/_rules-catalog.md — single catalog with
    26 rules in a table under "## Каталог"
  - docs/99-meta/glossary.md — Cyrillic letter sections (## А, ## Б, ...)
    with "**Term (SAtermCode)**\\nprose definition\\n*Алиасы: ...*" entries.

Business-role IDs are already canonical (ROL-NN); no ACT-NN normalisation.

All free-form text is passed through ``markdown.strip_markdown_inline`` before
being written to IR.
"""

from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .. import frontmatter as fm
from .. import markdown as md
from .. import mermaid
from ..ir_ba import (
    BaIR,
    BusinessEntity,
    BusinessProcess,
    BusinessRole,
    BusinessRule,
    EntityAttribute,
    GlossaryTerm,
    ProcessGroup,
    Warning,
    WorkflowStep,
)
from ..slugify import canonical_role_id, canonical_step_id
from .base import BaseBaAdapter


# ---------------------------------------------------------------------------
# Constants

# Frontmatter key-set used to score entity files.
_ENTITY_FM_KEYS = {"id", "name", "stereotype", "parent", "processes", "ba_source",
                   "has_states"}

# Stereotype normaliser for workflow-step table rows.
# The BA IR only allows three stereotypes: "Бизнес-функция",
# "Автоматизируется", "Решение". kartov-orders introduces two extra labels
# "Событие" (pre-trigger) and "Результат" (post-outcome). Both are narrative
# anchors rather than actions — they represent manual/external transitions
# with no system automation, so we map them to "Бизнес-функция" (the BA IR's
# canonical "manual business function" stereotype) and preserve the raw label
# in ``function_name`` so no information is lost.
_STEREOTYPE_MAP = {
    "автоматизируется":       "Автоматизируется",
    "auto":                   "Автоматизируется",
    "ручная":                 "Бизнес-функция",
    "ручной":                 "Бизнес-функция",
    "manual":                 "Бизнес-функция",
    "бизнес-функция":         "Бизнес-функция",
    "решение":                "Решение",
    "decision":               "Решение",
    "событие":                "Бизнес-функция",
    "event":                  "Бизнес-функция",
    "результат":              "Бизнес-функция",
    "result":                 "Бизнес-функция",
}

_BP_ID_RE  = re.compile(r"\bBP-\d{3}\b")
_GPR_ID_RE = re.compile(r"\bGPR-\d{2}\b")
_OBJ_ID_RE = re.compile(r"\bOBJ-\d{3}\b")
_ROL_ID_RE = re.compile(r"\bROL-\d{2}\b")
_BP_STEP_RE = re.compile(r"\bBP-\d{3}-S\d{2}\b")
_STEP_NUM_RE = re.compile(r"S(\d{1,3})")


# ---------------------------------------------------------------------------
# Adapter

class FrontmatterV1BaAdapter(BaseBaAdapter):
    """BA adapter for the kartov-orders hybrid YAML-frontmatter dialect."""

    name = "frontmatter-v1"
    version = "1.0.0"

    # ---- detection ------------------------------------------------------

    @classmethod
    def detect(cls, sample_files: List[Path]) -> float:
        """Score ``sample_files`` for frontmatter-v1 fit.

        The heuristic samples BA entity files (the detector normally feeds us
        files from ``docs/02-business-entities/entities/``). A file counts as
        a hit if it begins with a YAML frontmatter block AND the block names
        at least 2 of the entity keys (id, name, stereotype, parent,
        processes, has_states, ba_source). Files that look like inline-table
        format (no frontmatter, start with "# ...") score 0.
        """
        if not sample_files:
            return 0.0
        hits = 0
        for path in sample_files:
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            fm_data, _ = fm.extract(text)
            if fm_data is None:
                continue
            overlap = len(set(fm_data.keys()) & _ENTITY_FM_KEYS)
            if overlap >= 2:
                hits += 1
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

        self._parse_process_groups(ir, project_path)
        self._parse_business_processes(ir, project_path)
        self._parse_workflows(ir, project_path)
        self._parse_business_entities(ir, project_path)
        self._parse_business_roles(ir, project_path)
        self._parse_business_rules(ir, project_path)
        self._parse_glossary(ir, project_path)

        return ir

    # ---- helpers --------------------------------------------------------

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
    def _h1(text: str) -> str:
        for line in text.splitlines():
            if line.startswith("# "):
                return line[2:].strip()
        return ""

    @staticmethod
    def _h1_split(text: str) -> Tuple[Optional[str], str]:
        """Split a heading like "GPR-01: Name" or "BP-001. Name" into (id, name)."""
        h = FrontmatterV1BaAdapter._h1(text)
        if not h:
            return None, ""
        m = re.match(
            r"^([A-Z]{2,4}-\d{2,3})(?:\s+Workflow)?\s*[:.\u2014\u2013\-]\s*(.*)$", h
        )
        if m:
            return m.group(1), m.group(2).strip()
        return None, h

    @staticmethod
    def _inline_metadata_table(text: str) -> Dict[str, str]:
        """Return the first pipe table in the document as a {key: value} dict.

        Used for the 2-column "| Атрибут | Значение |" metadata block that BP
        and workflow files place right after the H1.
        """
        tables = md.parse_tables(text)
        if not tables:
            return {}
        result: Dict[str, str] = {}
        for row in tables[0]:
            cells = list(row.values())
            if len(cells) < 2:
                continue
            key = cells[0].strip()
            val = cells[1].strip()
            if key:
                result[key.lower()] = val
        return result

    @staticmethod
    def _warn(ir: BaIR, code: str, message: str,
              source_file: Optional[str] = None,
              source_line: Optional[int] = None) -> None:
        ir.warnings.append(Warning(
            code=code, message=message,
            source_file=source_file, source_line=source_line,
        ))

    # ---- process groups -------------------------------------------------

    def _parse_process_groups(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "01-business-processes" / "groups"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            gpr_id, name = self._h1_split(text)
            if not (gpr_id and _GPR_ID_RE.fullmatch(gpr_id)):
                m = re.match(r"^(GPR-\d{2})-", path.name)
                gpr_id = m.group(1) if m else None
                if not gpr_id:
                    self._warn(ir, "GPR_ID_MISSING",
                               f"Cannot derive GPR ID from {path.name}",
                               self._rel(project, path))
                    continue
            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )
            ir.process_groups.append(ProcessGroup(
                id=gpr_id, name=name,
                source_file=self._rel(project, path),
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
            metadata = self._inline_metadata_table(text)
            heading_id, heading_name = self._h1_split(text)

            bp_id = metadata.get("код") or metadata.get("code") or ""
            m = _BP_ID_RE.search(bp_id)
            bp_id = m.group(0) if m else ""
            if not bp_id and heading_id and _BP_ID_RE.fullmatch(heading_id):
                bp_id = heading_id
            if not bp_id:
                m = re.match(r"^(BP-\d{3})-", path.name)
                bp_id = m.group(1) if m else ""
            if not bp_id:
                self._warn(ir, "BP_ID_MISSING",
                           f"Cannot derive BP ID from {path.name}",
                           self._rel(project, path))
                continue

            # Group reference: "GPR-01: Подготовка данных"
            group_raw = metadata.get("группа") or metadata.get("group") or ""
            g = _GPR_ID_RE.search(group_raw)
            group_id = g.group(0) if g else None
            if group_id is None:
                self._warn(ir, "BP_GROUP_MISSING",
                           f"{bp_id}: no group reference in inline metadata",
                           self._rel(project, path))
                group_id = "GPR-99"

            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )
            trigger = md.strip_markdown_inline(
                (md.find_section(text, r"Триггер|Trigger") or "").strip()
            )
            result = md.strip_markdown_inline(
                (md.find_section(text, r"Результат|Result") or "").strip()
            )

            ir.business_processes.append(BusinessProcess(
                id=bp_id, name=heading_name,
                group_id=group_id,
                source_file=self._rel(project, path),
                description=description,
                trigger=trigger,
                result=result,
                automation_level=(metadata.get("частота")
                                  or metadata.get("automation")
                                  or None),
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

            # Derive BP id from filename first (most reliable)
            m = re.match(r"^(BP-\d{3})-workflow\.md$", path.name)
            bp_id: Optional[str] = m.group(1) if m else None
            if not bp_id:
                heading_id, _ = self._h1_split(text)
                bp_id = heading_id
            if not bp_id:
                continue
            if bp_id not in bp_by_id:
                self._warn(ir, "WORKFLOW_BP_UNKNOWN",
                           f"Workflow file {path.name} refers to unknown BP {bp_id!r}",
                           self._rel(project, path))
                continue

            bp = bp_by_id[bp_id]
            bp.workflow = _parse_workflow_steps(
                bp_id, text, self._rel(project, path)
            )
            # Merge NEXT_STEP edges from the embedded flowchart, if any.
            next_map = _parse_workflow_mermaid(bp_id, text, bp.workflow)
            for step in bp.workflow:
                if step.id in next_map:
                    step.next_step_ids = next_map[step.id]

    # ---- entities -------------------------------------------------------

    def _parse_business_entities(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "02-business-entities" / "entities"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}

            obj_id = str(fm_data.get("id") or "").strip()
            if not (obj_id and _OBJ_ID_RE.fullmatch(obj_id)):
                m = re.match(r"^(OBJ-\d{3})-", path.name)
                obj_id = m.group(1) if m else ""
            if not obj_id:
                self._warn(ir, "OBJ_ID_MISSING",
                           f"Cannot derive OBJ ID from {path.name}",
                           self._rel(project, path))
                continue

            name = str(fm_data.get("name") or "").strip()
            if not name:
                _, name = self._h1_split(text)
            stereotype = str(fm_data.get("stereotype") or "Бизнес-объект").strip()
            has_states = bool(fm_data.get("has_states"))

            processes_raw = fm_data.get("processes") or []
            if isinstance(processes_raw, list):
                related_bp = [str(p).strip() for p in processes_raw
                              if _BP_ID_RE.fullmatch(str(p).strip())]
            else:
                related_bp = _BP_ID_RE.findall(str(processes_raw))

            description = md.strip_markdown_inline(
                (md.find_section(text, r"Описание|Description") or "").strip()
            )

            attributes = _parse_attribute_table(
                obj_id, text, self._rel(project, path)
            )

            ir.business_entities.append(BusinessEntity(
                id=obj_id,
                name=name,
                type=stereotype,
                stereotype=stereotype,
                has_states=has_states,
                description=description,
                attributes=attributes,
                states=[],
                related_process_ids=list(dict.fromkeys(related_bp)),
                source_file=self._rel(project, path),
            ))

    # ---- roles ----------------------------------------------------------

    def _parse_business_roles(self, ir: BaIR, project: Path) -> None:
        folder = project / "docs" / "03-business-roles" / "roles"
        if not folder.is_dir():
            return
        for path in sorted(folder.glob("*.md")):
            if path.name.startswith("_"):
                continue
            text = self._read(path) or ""
            fm_data, _ = fm.extract(text)
            fm_data = fm_data or {}

            raw_id = str(fm_data.get("id") or "").strip()
            if not _ROL_ID_RE.fullmatch(raw_id):
                m = re.match(r"^(ROL-\d{2}|ACT-\d{2})-", path.name)
                raw_id = m.group(1) if m else ""
            canonical = canonical_role_id(raw_id) if raw_id else None
            if not canonical:
                self._warn(ir, "ROLE_ID_MISSING",
                           f"Cannot derive role ID from {path.name}",
                           self._rel(project, path))
                continue

            name = str(fm_data.get("name") or "").strip()
            if not name:
                _, name = self._h1_split(text)
                # Heading is "ROL-01. TOV — Товарник" — strip a leading code
                name = re.sub(r"^[A-Z]{2,4}\s*[—\u2014\-]\s*", "", name).strip()
            department = str(fm_data.get("department") or "").strip()
            responsibilities = _bullets(
                md.find_section(text, r"Ответственности|Responsibilities|Полномочия")
                or ""
            )

            participates: List[str] = []
            part_body = md.find_section(text, r"Участие в процессах|Processes")
            if part_body:
                for table in md.parse_tables(part_body):
                    for row in table:
                        for cell in row.values():
                            for bp in _BP_ID_RE.findall(cell):
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

    # ---- rules (single catalog) -----------------------------------------

    def _parse_business_rules(self, ir: BaIR, project: Path) -> None:
        path = project / "docs" / "04-business-rules" / "_rules-catalog.md"
        if not path.is_file():
            # Also tolerate a non-hidden filename if a project ever renames it
            alt = project / "docs" / "04-business-rules" / "rules-catalog.md"
            if alt.is_file():
                path = alt
            else:
                return
        text = self._read(path) or ""
        catalog_body = md.find_section(text, r"Каталог|Catalog")
        if catalog_body is None:
            return
        tables = md.parse_tables(catalog_body)
        if not tables:
            return
        rel = self._rel(project, path)
        for row in tables[0]:
            vals = list(row.values())
            keys = list(row.keys())
            if not vals:
                continue
            brq_raw = vals[0].strip()
            m = re.match(r"^BRQ-(\d{3})$", brq_raw)
            if not m:
                continue
            brq_id = f"BRQ-{int(m.group(1)):03d}"

            def _col(*candidates: str) -> str:
                for cand in candidates:
                    for k in keys:
                        if cand.lower() in k.lower():
                            return row[k].strip()
                return ""

            rule_type = _col("тип", "type")
            formulation = md.strip_markdown_inline(
                _col("формулировка", "formulation")
            )
            entities_csv = _col("сущност", "entit")
            processes_csv = _col("процесс", "process")
            steps_csv = _col("шаг", "step")

            constrains = _split_ids(entities_csv, _OBJ_ID_RE)
            applies_in = _split_ids(processes_csv, _BP_ID_RE)
            applies_at = _resolve_step_ids(steps_csv, applies_in)

            ir.business_rules.append(BusinessRule(
                id=brq_id,
                name=brq_id,
                rule_type=rule_type,
                formulation=formulation,
                severity="",
                constrains_entity_ids=constrains,
                applies_in_process_ids=applies_in,
                applies_at_step_ids=applies_at,
                affects_attribute_ids=[],
                source_file=rel,
            ))

    # ---- glossary -------------------------------------------------------

    def _parse_glossary(self, ir: BaIR, project: Path) -> None:
        path = project / "docs" / "99-meta" / "glossary.md"
        if not path.is_file():
            return
        text = self._read(path) or ""
        _, body = fm.extract(text)
        rel = self._rel(project, path)

        # Walk letter-level sections (## А, ## Б, ...). For each, treat any
        # line starting with "**" as a new term; the next non-bold, non-italic
        # line(s) form the definition, and a trailing "*Алиасы: ...*" line
        # contributes synonyms.
        seen = 0
        for level, _, heading, section_body in md.iter_sections(body):
            if level != 2:
                continue
            # Skip headings like "Сводка", "Легенда" that accidentally start
            # with Cyrillic — require the heading to be a single Cyrillic or
            # Latin letter (plus optional combining marks).
            if not re.fullmatch(r"[A-Za-zА-ЯЁа-яё0-9]{1,3}", heading.strip()):
                continue
            lines = section_body.splitlines()
            i = 0
            while i < len(lines):
                line = lines[i].rstrip()
                if line.startswith("**"):
                    term, synonyms_from_head = _parse_glossary_header(line)
                    definition_lines: List[str] = []
                    aliases: List[str] = []
                    i += 1
                    while i < len(lines):
                        nxt = lines[i].rstrip()
                        if nxt.startswith("**") or nxt.startswith("## ") \
                                or nxt.startswith("# "):
                            break
                        stripped = nxt.strip()
                        if stripped.startswith("*Алиасы") \
                                or stripped.startswith("*Aliases"):
                            aliases = _parse_glossary_aliases(stripped)
                        elif stripped and not stripped.startswith("---"):
                            definition_lines.append(stripped)
                        i += 1
                    if not term:
                        continue
                    seen += 1
                    definition = md.strip_markdown_inline(
                        " ".join(definition_lines).strip()
                    )
                    synonyms = synonyms_from_head + [
                        a for a in aliases if a not in synonyms_from_head
                    ]
                    ir.glossary_terms.append(GlossaryTerm(
                        id=f"GLO-{seen:03d}",
                        term=term,
                        synonyms=synonyms,
                        definition=definition,
                        source_file=rel,
                    ))
                else:
                    i += 1


# ---------------------------------------------------------------------------
# Module-level helpers (shared between methods)

def _bullets(body: str) -> List[str]:
    items: List[str] = []
    for line in body.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            items.append(md.strip_markdown_inline(stripped[2:].strip()))
    return items


def _parse_attribute_table(obj_id: str, text: str, rel_source: str
                           ) -> List[EntityAttribute]:
    # Accept both "Атрибуты" (canonical) and "Структура" (kartov-orders uses
    # this for "Результат"-stereotype entities — OBJ-009, OBJ-010, ...).
    body = md.find_section(text, r"Атрибуты|Attributes|Структура|Structure")
    if not body:
        return []
    tables = md.parse_tables(body)
    if not tables:
        return []
    attrs: List[EntityAttribute] = []
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
        for k, v in row.items():
            kl = k.lower()
            if "тип" in kl or "type" in kl:
                type_value = v.strip()
            elif "обязательн" in kl or "required" in kl:
                required = v.strip().lower() in ("да", "yes", "true", "+")
            elif ("коммент" in kl or "описание" in kl or "description" in kl
                  or "comment" in kl):
                description = v.strip()
        attrs.append(EntityAttribute(
            id=f"{obj_id}-A{idx:02d}",
            name=name,
            type=type_value,
            required=required,
            description=md.strip_markdown_inline(description),
            source_file=rel_source,
        ))
    return attrs


def _parse_workflow_steps(bp_id: str, text: str, rel_source: str
                          ) -> List[WorkflowStep]:
    """Parse the ``## Шаги процесса`` table into WorkflowStep entries.

    Column layout (kartov-orders):
        # | Исполнитель | Стереотип | Действие | Артефакт
    The first column contains ``S01`` / ``S02`` / ... The step_number is
    extracted from that token. The "Действие" text is kept verbatim in
    function_name (with inline markdown stripped).
    """
    body = md.find_section(
        text, r"Шаги процесса|Workflow( steps?)?|Канонич.*|Canonical table"
    )
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
        first = row[keys[0]].strip()
        m = _STEP_NUM_RE.fullmatch(first)
        if not m:
            # tolerate plain numbers "1", "2", ...
            if not first.isdigit():
                continue
            step_number = int(first)
        else:
            step_number = int(m.group(1))

        performer_raw = ""
        stereotype_raw = ""
        action = ""
        for k, v in row.items():
            kl = k.lower()
            if "исполнитель" in kl or "performer" in kl or "actor" in kl:
                performer_raw = v.strip()
            elif "стереотип" in kl or "stereotype" in kl:
                stereotype_raw = v.strip()
            elif "действие" in kl or "action" in kl or kl == "шаг":
                action = v.strip()

        stereotype = _STEREOTYPE_MAP.get(stereotype_raw.lower(), "Бизнес-функция")
        function_name = md.strip_markdown_inline(action) if action else ""

        performer_id: Optional[str] = None
        if performer_raw:
            m = _ROL_ID_RE.search(performer_raw)
            if m:
                performer_id = m.group(0)
            else:
                m = re.search(r"\bACT-\d{2}\b", performer_raw)
                if m:
                    performer_id = canonical_role_id(m.group(0))

        steps.append(WorkflowStep(
            id=canonical_step_id(bp_id, step_number),
            step_number=step_number,
            function_name=function_name,
            stereotype=stereotype,
            performer_role_id=performer_id,
            source_file=rel_source,
        ))
    return steps


def _parse_workflow_mermaid(bp_id: str, text: str,
                             steps: List[WorkflowStep]) -> Dict[str, List[str]]:
    """Translate a flowchart's S01/S02/... nodes into canonical step edges."""
    result: Dict[str, List[str]] = {}
    step_ids = {s.id for s in steps}
    for lang, body in md.iter_code_blocks(text):
        if lang != "mermaid":
            continue
        if mermaid.classify(body) != "flowchart":
            continue
        fc = mermaid.parse_flowchart(body)
        if not fc:
            continue
        id_map: Dict[str, str] = {}
        for node in fc.nodes:
            m = re.fullmatch(r"S(\d+)", node.id)
            if m:
                candidate = canonical_step_id(bp_id, int(m.group(1)))
                if candidate in step_ids:
                    id_map[node.id] = candidate
        for edge in fc.edges:
            src = id_map.get(edge.from_id)
            dst = id_map.get(edge.to_id)
            if src and dst:
                result.setdefault(src, []).append(dst)
    return result


def _split_ids(cell: str, pattern: "re.Pattern[str]") -> List[str]:
    """Extract every ID of the given pattern from a CSV-ish table cell."""
    if not cell or cell.strip() in ("—", "-", ""):
        return []
    return list(dict.fromkeys(pattern.findall(cell)))


def _resolve_step_ids(cell: str, applies_in: List[str]) -> List[str]:
    """Resolve a ``Шаги`` cell to canonical WorkflowStep IDs.

    The catalog encodes steps as ``S03``, ``S05-S09``, ``S03, S05``, or ``—``
    relative to the referenced processes in the same row. We resolve each
    bare step number against every BP in ``applies_in``. If multiple BPs are
    given, we prefix with each.
    """
    if not cell or cell.strip() in ("—", "-", ""):
        return []
    out: List[str] = []

    # Already-fully-qualified step IDs win first.
    for full in _BP_STEP_RE.findall(cell):
        if full not in out:
            out.append(full)
    # Then bare ``SNN`` / ``SNN–SMM`` tokens.
    for token in re.finditer(r"S(\d{1,3})(?:\s*[–\-−]\s*S?(\d{1,3}))?", cell):
        a = int(token.group(1))
        b = int(token.group(2)) if token.group(2) else a
        lo, hi = min(a, b), max(a, b)
        for bp_id in (applies_in or []):
            for n in range(lo, hi + 1):
                cid = canonical_step_id(bp_id, n)
                if cid not in out:
                    out.append(cid)
    return out


_GLOSSARY_HEAD_RE = re.compile(
    r"^\*\*(?P<term>.+?)\*\*"
    r"(?:\s*\(`?(?P<code>[A-Za-z][A-Za-z0-9_]+)`?\))?"
)


def _parse_glossary_header(line: str) -> Tuple[str, List[str]]:
    """Split a ``**Term (SAcode)**`` header line into (term, [SAcode])."""
    m = _GLOSSARY_HEAD_RE.match(line)
    if not m:
        return "", []
    term = m.group("term").strip()
    # The term itself can contain an alternative form in parens like
    # "Артикул маркетплейса (Артикул МП)" — preserve it in the term.
    # The SAcode — a bare ASCII token in backticks — becomes the first synonym.
    synonyms: List[str] = []
    code = m.group("code")
    if code:
        synonyms.append(code)
    return term, synonyms


def _parse_glossary_aliases(line: str) -> List[str]:
    """Parse "*Алиасы: a, b, c*" into ["a", "b", "c"]."""
    stripped = line.strip().lstrip("*").rstrip("*").strip()
    # Drop the leading "Алиасы:" / "Aliases:" prefix.
    stripped = re.sub(r"^(?:Алиасы|Aliases)\s*:\s*", "", stripped, flags=re.IGNORECASE)
    parts = [p.strip() for p in stripped.split(",")]
    return [md.strip_markdown_inline(p) for p in parts if p]
