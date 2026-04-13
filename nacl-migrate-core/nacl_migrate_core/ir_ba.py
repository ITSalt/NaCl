"""BA-layer Intermediate Representation (IR).

Every adapter (inline_table_v1, frontmatter_v1, llm_freeform_v1) emits the same
BaIR dataclass. Every downstream consumer (validator, cypher generator, audit)
reads it. JSON is the on-disk format via dataclasses.asdict + json.

Design:
- Stdlib @dataclass only; no pydantic.
- __post_init__ performs structural validation (cheap invariants).
- Deep validation (ID uniqueness, ref integrity) lives in a separate validator
  module and runs over the fully-assembled IR.
- Fields that reference other IR entries use string IDs (not Python refs), so
  serialisation is trivial and partial-graph IRs are legal during assembly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, List, Optional


# ---------------------------------------------------------------------------
# ID format validators

_ID_PATTERNS = {
    "ProcessGroup":    re.compile(r"^GPR-\d{2}$"),
    "BusinessProcess": re.compile(r"^BP-\d{3}$"),
    "WorkflowStep":    re.compile(r"^BP-\d{3}-S\d{2}$"),
    "BusinessEntity":  re.compile(r"^OBJ-\d{3}$"),
    "EntityAttribute": re.compile(r"^OBJ-\d{3}-A\d{2}$"),
    "EntityState":     re.compile(r"^OBJ-\d{3}-ST\d{2}$"),
    "BusinessRole":    re.compile(r"^ROL-\d{2}$"),
    "BusinessRule":    re.compile(r"^BRQ-\d{3}$"),
    "GlossaryTerm":    re.compile(r"^GLO-\d{3}$"),
    "SystemContext":   re.compile(r"^SYS-\d{3}$"),
    "Stakeholder":     re.compile(r"^STK-\d{2}$"),
    "ExternalEntity":  re.compile(r"^EXT-\d{2}$"),
    "DataFlow":        re.compile(r"^DFL-\d{3}$"),
}


def _check_id(label: str, value: str) -> None:
    pattern = _ID_PATTERNS.get(label)
    if pattern is None:
        return
    if not pattern.match(value):
        raise ValueError(f"{label}: id {value!r} does not match {pattern.pattern}")


VALID_STEREOTYPES = {
    "Бизнес-функция",
    "Автоматизируется",
    "Решение",
}


# ---------------------------------------------------------------------------
# Auxiliary

@dataclass
class Warning:
    """Non-blocking issue raised during adapter parse or validator run."""
    code: str
    message: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None


# ---------------------------------------------------------------------------
# SystemContext family

@dataclass
class Stakeholder:
    id: str
    name: str
    source_file: str
    role: str = ""
    interest: str = ""

    def __post_init__(self) -> None:
        _check_id("Stakeholder", self.id)


@dataclass
class ExternalEntity:
    id: str
    name: str
    source_file: str
    type: str = "ExternalSystem"  # "User" | "ExternalSystem" | "Organization"

    def __post_init__(self) -> None:
        _check_id("ExternalEntity", self.id)


@dataclass
class DataFlow:
    id: str
    name: str
    source_file: str
    direction: str = "BOTH"  # "IN" | "OUT" | "BOTH"
    data_description: str = ""

    def __post_init__(self) -> None:
        _check_id("DataFlow", self.id)
        if self.direction not in ("IN", "OUT", "BOTH"):
            raise ValueError(f"DataFlow {self.id}: invalid direction {self.direction!r}")


@dataclass
class SystemContext:
    id: str
    name: str
    source_file: str
    goals: List[str] = field(default_factory=list)
    in_scope: List[str] = field(default_factory=list)
    out_of_scope: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    assumptions: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("SystemContext", self.id)


# ---------------------------------------------------------------------------
# Process family

@dataclass
class ProcessGroup:
    id: str
    name: str
    source_file: str
    description: str = ""

    def __post_init__(self) -> None:
        _check_id("ProcessGroup", self.id)


@dataclass
class WorkflowStep:
    id: str
    step_number: int
    function_name: str
    stereotype: str
    source_file: str
    performer_role_id: Optional[str] = None
    reads_entity_ids: List[str] = field(default_factory=list)
    produces_entity_ids: List[str] = field(default_factory=list)
    modifies_entity_ids: List[str] = field(default_factory=list)
    next_step_ids: List[str] = field(default_factory=list)
    source_line: Optional[int] = None

    def __post_init__(self) -> None:
        _check_id("WorkflowStep", self.id)
        if self.stereotype not in VALID_STEREOTYPES:
            raise ValueError(
                f"WorkflowStep {self.id}: stereotype {self.stereotype!r} "
                f"not in {sorted(VALID_STEREOTYPES)}"
            )
        if self.step_number < 1:
            raise ValueError(f"WorkflowStep {self.id}: step_number must be >= 1")


@dataclass
class BusinessProcess:
    id: str
    name: str
    group_id: str
    source_file: str
    description: str = ""
    trigger: str = ""
    result: str = ""
    automation_level: Optional[str] = None
    workflow: List[WorkflowStep] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("BusinessProcess", self.id)
        _check_id("ProcessGroup", self.group_id)


# ---------------------------------------------------------------------------
# Entity family

@dataclass
class EntityAttribute:
    id: str
    name: str
    source_file: str
    type: str = ""
    required: bool = False
    description: str = ""

    def __post_init__(self) -> None:
        _check_id("EntityAttribute", self.id)


@dataclass
class EntityStateTransition:
    to_id: str
    condition: str = ""


@dataclass
class EntityState:
    id: str
    name: str
    source_file: str
    description: str = ""
    transitions_to: List[EntityStateTransition] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("EntityState", self.id)


@dataclass
class BusinessEntity:
    id: str
    name: str
    source_file: str
    type: str = "Бизнес-объект"
    stereotype: str = "Бизнес-объект"
    has_states: bool = False
    description: str = ""
    attributes: List[EntityAttribute] = field(default_factory=list)
    states: List[EntityState] = field(default_factory=list)
    related_process_ids: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("BusinessEntity", self.id)


# ---------------------------------------------------------------------------
# Role / Rule / Glossary

@dataclass
class BusinessRole:
    id: str                           # canonical (ROL-NN)
    full_name: str
    source_file: str
    original_id: Optional[str] = None  # e.g. ACT-01 in projects that use that prefix
    department: str = ""
    responsibilities: List[str] = field(default_factory=list)
    participates_in_process_ids: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("BusinessRole", self.id)


@dataclass
class BusinessRule:
    id: str
    name: str
    source_file: str
    rule_type: str = ""           # "Ограничение" | "Вычисление" | "Инвариант" | "Авторизация"
    formulation: str = ""
    severity: str = ""
    constrains_entity_ids: List[str] = field(default_factory=list)
    applies_in_process_ids: List[str] = field(default_factory=list)
    applies_at_step_ids: List[str] = field(default_factory=list)
    affects_attribute_ids: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("BusinessRule", self.id)


@dataclass
class GlossaryTerm:
    id: str
    term: str
    source_file: str
    definition: str = ""
    synonyms: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("GlossaryTerm", self.id)


# ---------------------------------------------------------------------------
# Top-level IR

@dataclass
class BaIR:
    project_path: str
    adapter: str
    adapter_version: str
    generated_at: str                 # ISO-8601
    system_context: Optional[SystemContext] = None
    stakeholders: List[Stakeholder] = field(default_factory=list)
    external_entities: List[ExternalEntity] = field(default_factory=list)
    data_flows: List[DataFlow] = field(default_factory=list)
    process_groups: List[ProcessGroup] = field(default_factory=list)
    business_processes: List[BusinessProcess] = field(default_factory=list)
    business_entities: List[BusinessEntity] = field(default_factory=list)
    business_roles: List[BusinessRole] = field(default_factory=list)
    business_rules: List[BusinessRule] = field(default_factory=list)
    glossary_terms: List[GlossaryTerm] = field(default_factory=list)
    warnings: List[Warning] = field(default_factory=list)

    # ---- serialisation ----

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def counts(self) -> dict[str, int]:
        """Node-type counts. Used by the self-audit in nacl-migrate-ba SKILL."""
        workflow_steps = sum(len(bp.workflow) for bp in self.business_processes)
        entity_attributes = sum(len(e.attributes) for e in self.business_entities)
        entity_states = sum(len(e.states) for e in self.business_entities)
        return {
            "SystemContext":    1 if self.system_context else 0,
            "Stakeholder":      len(self.stakeholders),
            "ExternalEntity":   len(self.external_entities),
            "DataFlow":         len(self.data_flows),
            "ProcessGroup":     len(self.process_groups),
            "BusinessProcess":  len(self.business_processes),
            "WorkflowStep":     workflow_steps,
            "BusinessEntity":   len(self.business_entities),
            "EntityAttribute":  entity_attributes,
            "EntityState":      entity_states,
            "BusinessRole":     len(self.business_roles),
            "BusinessRule":     len(self.business_rules),
            "GlossaryTerm":     len(self.glossary_terms),
        }
