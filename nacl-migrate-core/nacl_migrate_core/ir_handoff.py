"""Cross-layer handoff IR.

Produced by SA adapters when parsing docs/99-meta/traceability-matrix.md.
Consumed by generate_sa_cypher.py to emit BA↔SA edges.

Edge types:
- AUTOMATES_AS     (BusinessProcess | WorkflowStep) -> UseCase
- REALIZED_AS      BusinessEntity -> DomainEntity
- TYPED_AS         EntityAttribute -> DomainAttribute
- MAPPED_TO        BusinessRole -> SystemRole
- IMPLEMENTED_BY   BusinessRule -> Requirement
- SUGGESTS         ProcessGroup -> Module
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, List


@dataclass
class HandoffEdge:
    """Generic cross-layer edge. `source_file` is the traceability matrix."""
    from_id: str
    to_id: str
    source_file: str = ""


@dataclass
class HandoffIR:
    project_path: str
    adapter: str
    adapter_version: str
    generated_at: str
    source_file: str = ""   # traceability-matrix.md path (relative)
    automates_as:   List[HandoffEdge] = field(default_factory=list)
    realized_as:    List[HandoffEdge] = field(default_factory=list)
    typed_as:       List[HandoffEdge] = field(default_factory=list)
    mapped_to:      List[HandoffEdge] = field(default_factory=list)
    implemented_by: List[HandoffEdge] = field(default_factory=list)
    suggests:       List[HandoffEdge] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def counts(self) -> dict[str, int]:
        return {
            "AUTOMATES_AS":   len(self.automates_as),
            "REALIZED_AS":    len(self.realized_as),
            "TYPED_AS":       len(self.typed_as),
            "MAPPED_TO":      len(self.mapped_to),
            "IMPLEMENTED_BY": len(self.implemented_by),
            "SUGGESTS":       len(self.suggests),
        }
