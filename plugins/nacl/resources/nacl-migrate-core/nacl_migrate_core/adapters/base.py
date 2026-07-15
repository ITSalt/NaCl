"""Adapter ABC for BA/SA migration adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import List

from ..ir_ba import BaIR


class BaseBaAdapter(ABC):
    """Every BA adapter converts a specific markdown dialect into a BaIR.

    Adapters MUST be idempotent: parsing the same project twice produces
    equal IRs (modulo the `generated_at` timestamp and `project_path`).
    """

    name: str
    version: str

    @classmethod
    @abstractmethod
    def detect(cls, sample_files: List[Path]) -> float:
        """Return confidence [0.0, 1.0] that this adapter fits the samples.

        Contract:
          0.0       -> definitely not this adapter
          0.1-0.7   -> ambiguous; tiebreaker needed
          0.8-1.0   -> strong fit; auto-selectable
        """

    @abstractmethod
    def parse(self, project_path: Path) -> BaIR:
        """Walk the project tree and produce a complete BaIR.

        Non-fatal issues go into `BaIR.warnings`. Raise only for I/O failures
        or structural impossibilities the adapter cannot handle at all.
        """
