"""Adapter registry. Each adapter converts a project-specific markdown dialect into a canonical IR."""

from .base import BaseBaAdapter
from .frontmatter_v1 import FrontmatterV1BaAdapter
from .frontmatter_v1_sa import FrontmatterV1SaAdapter
from .inline_table_v1 import InlineTableV1BaAdapter
from .inline_table_v1_sa import InlineTableV1SaAdapter

BA_ADAPTERS: dict[str, type[BaseBaAdapter]] = {
    "inline-table-v1": InlineTableV1BaAdapter,
    "frontmatter-v1":  FrontmatterV1BaAdapter,
    # "llm-freeform-v1": LlmFreeformV1BaAdapter,     # much later
}

# SA adapters are not BaseBaAdapter subclasses — they return a (SaIR, HandoffIR)
# tuple — so keep a separate registry.
SA_ADAPTERS: dict[str, type] = {
    "inline-table-v1": InlineTableV1SaAdapter,
    "frontmatter-v1":  FrontmatterV1SaAdapter,
}

__all__ = ["BA_ADAPTERS", "SA_ADAPTERS", "BaseBaAdapter"]
