"""SA-layer Intermediate Representation (IR).

Produced by SA adapters (inline_table_v1 SA variant, frontmatter_v1 SA later,
llm_freeform_v1 later). Consumed by validate/generate_cypher/audit scripts.

IDs:
- Module:         MOD-<slug>          (slug from module name)
- UseCase:        UC-NNN              (normalised; original_id preserved if different)
- ActivityStep:   UC-NNN-A<NN>
- DomainEntity:   DE-<slug>           (slug from filename)
- DomainAttribute:DE-<slug>-A<NN>
- Enumeration:    EN-<slug>
- EnumValue:      EN-<slug>-V<NN>
- Form:           FORM-<slug>         (slug from SCR-NNN or filename)
- FormField:      FORM-<slug>-F<NN>
- Requirement:    REQ-<slug>
- SystemRole:     SYSROL-<CODE>     (e.g. SYSROL-DATA_MANAGER, SYSROL-ADMIN)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Any, List, Optional


# ---------------------------------------------------------------------------
# ID format validators

# UC ids accept either the 3-digit family (``UC-001``) or the letter-prefix
# family (``UC-F01``). ActivityStep mirrors UC + ``-A<NN>``. Other id types
# already permit the slug shapes the adapters emit.
_ID_PATTERNS = {
    "Module":           re.compile(r"^MOD-[a-z0-9\-/]+$"),
    "UseCase":          re.compile(r"^UC-(?:\d{3}|[A-Z]\d{2})$"),
    "ActivityStep":     re.compile(r"^UC-(?:\d{3}|[A-Z]\d{2})-A\d{2}$"),
    "DomainEntity":     re.compile(r"^DE-[a-z0-9\-]+$"),
    "DomainAttribute":  re.compile(r"^DE-[a-z0-9\-]+-A\d{2}$"),
    "Enumeration":      re.compile(r"^EN-[a-z0-9\-]+$"),
    "EnumValue":        re.compile(r"^EN-[a-z0-9\-]+-V\d{2}$"),
    "Form":             re.compile(r"^FORM-[a-z0-9\-]+$"),
    "FormField":        re.compile(r"^FORM-[a-z0-9\-]+-F\d{2}$"),
    "Requirement":      re.compile(r"^REQ-[A-Z0-9\-]+$"),
    "SystemRole":       re.compile(r"^SYSROL-[A-Z0-9_\-]+$"),
}


def _check_id(label: str, value: str) -> None:
    pattern = _ID_PATTERNS.get(label)
    if pattern is None:
        return
    if not pattern.match(value):
        raise ValueError(f"{label}: id {value!r} does not match {pattern.pattern}")


# ---------------------------------------------------------------------------
# Warnings

@dataclass
class SaWarning:
    code: str
    message: str
    source_file: Optional[str] = None
    source_line: Optional[int] = None


# ---------------------------------------------------------------------------
# Module + UseCase

@dataclass
class Module:
    id: str
    name: str
    source_file: str
    description: str = ""
    iteration: str = ""
    related_process_ids: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("Module", self.id)


@dataclass
class ActivityStep:
    id: str
    step_number: int
    description: str
    source_file: str
    actor: Optional[str] = None
    next_step_ids: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("ActivityStep", self.id)
        if self.step_number < 1:
            raise ValueError(f"ActivityStep {self.id}: step_number must be >= 1")


@dataclass
class UseCase:
    id: str
    name: str
    source_file: str
    original_id: Optional[str] = None
    actor: str = ""
    module: str = ""
    priority: str = ""
    iteration: str = ""
    complexity: str = ""
    description: str = ""
    ba_trace: List[str] = field(default_factory=list)
    preconditions: List[str] = field(default_factory=list)
    postconditions: List[str] = field(default_factory=list)
    main_scenario: List[str] = field(default_factory=list)
    activity_steps: List[ActivityStep] = field(default_factory=list)
    form_refs: List[str] = field(default_factory=list)
    requirement_refs: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("UseCase", self.id)


# ---------------------------------------------------------------------------
# Domain

@dataclass
class DomainAttribute:
    id: str
    name: str
    source_file: str
    type: str = ""
    required: bool = False
    description: str = ""
    constraints: str = ""

    def __post_init__(self) -> None:
        _check_id("DomainAttribute", self.id)


@dataclass
class DomainEntityRelation:
    target_id: str          # DE-<slug>
    rel_type: str = ""      # "contains" / "belongs_to" / ...
    cardinality: str = ""   # "1:1" / "1:N" / ...


@dataclass
class DomainEntity:
    id: str
    name: str
    source_file: str
    module: str = ""
    stereotypes: List[str] = field(default_factory=list)
    description: str = ""
    attributes: List[DomainAttribute] = field(default_factory=list)
    relates_to: List[DomainEntityRelation] = field(default_factory=list)
    enumeration_refs: List[str] = field(default_factory=list)
    ba_trace: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("DomainEntity", self.id)


@dataclass
class EnumValue:
    id: str
    value: str
    source_file: str
    description: str = ""

    def __post_init__(self) -> None:
        _check_id("EnumValue", self.id)


@dataclass
class Enumeration:
    id: str
    name: str
    source_file: str
    description: str = ""
    values: List[EnumValue] = field(default_factory=list)
    ba_trace: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("Enumeration", self.id)


# ---------------------------------------------------------------------------
# Forms

@dataclass
class FormField:
    id: str
    name: str
    source_file: str
    type: str = ""
    required: bool = False
    maps_to_attribute_id: Optional[str] = None

    def __post_init__(self) -> None:
        _check_id("FormField", self.id)


@dataclass
class Form:
    id: str
    name: str
    source_file: str
    original_id: Optional[str] = None
    module: str = ""
    used_by_uc: List[str] = field(default_factory=list)
    fields: List[FormField] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("Form", self.id)


# ---------------------------------------------------------------------------
# Requirement + SystemRole

@dataclass
class Requirement:
    id: str
    description: str
    source_file: str
    kind: str = ""          # "FR" | "NFR" | ""
    priority: str = ""
    uc_ids: List[str] = field(default_factory=list)
    ba_trace: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("Requirement", self.id)


@dataclass
class RolePermission:
    entity_id: str          # DE-<slug>
    crud: str = ""          # "CRUD" / "CR" / ...


@dataclass
class SystemRole:
    id: str
    name: str
    source_file: str
    description: str = ""
    auth: str = ""
    iteration: str = ""
    ba_trace: List[str] = field(default_factory=list)
    permissions: List[RolePermission] = field(default_factory=list)

    def __post_init__(self) -> None:
        _check_id("SystemRole", self.id)


# ---------------------------------------------------------------------------
# Top-level IR

@dataclass
class SaIR:
    project_path: str
    adapter: str
    adapter_version: str
    generated_at: str
    numbering: str = "10-16"
    modules: List[Module] = field(default_factory=list)
    use_cases: List[UseCase] = field(default_factory=list)
    domain_entities: List[DomainEntity] = field(default_factory=list)
    enumerations: List[Enumeration] = field(default_factory=list)
    forms: List[Form] = field(default_factory=list)
    requirements: List[Requirement] = field(default_factory=list)
    system_roles: List[SystemRole] = field(default_factory=list)
    warnings: List[SaWarning] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def counts(self) -> dict[str, int]:
        """Node-type counts for self-audit."""
        activity_steps = sum(len(uc.activity_steps) for uc in self.use_cases)
        domain_attrs = sum(len(e.attributes) for e in self.domain_entities)
        enum_values = sum(len(en.values) for en in self.enumerations)
        form_fields = sum(len(f.fields) for f in self.forms)
        return {
            "Module":           len(self.modules),
            "UseCase":          len(self.use_cases),
            "ActivityStep":     activity_steps,
            "DomainEntity":     len(self.domain_entities),
            "DomainAttribute":  domain_attrs,
            "Enumeration":      len(self.enumerations),
            "EnumValue":        enum_values,
            "Form":             len(self.forms),
            "FormField":        form_fields,
            "Requirement":      len(self.requirements),
            "SystemRole":       len(self.system_roles),
        }
