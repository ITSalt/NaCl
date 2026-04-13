# Writing a Custom Adapter for nacl-migrate-core

This guide targets developers who need to support a Markdown dialect not covered
by the two built-in formats (`inline-table-v1`, `frontmatter-v1`).

---

## 1. When You Need a Custom Adapter

Run the auto-detector first:

```bash
cd "$NACL_HOME/nacl-migrate-ba"
python3 scripts/detect_ba.py /path/to/project
```

If the result is `"chosen": null` or `"ambiguous": true`, your project's Markdown
structure is not recognized. Common mismatches:

- No YAML frontmatter and no inline `| Field | Value |` metadata tables.
- Heading conventions differ (e.g., numeric prefixes, emoji, language other than
  Russian/English).
- Entities and processes live in a flat file instead of per-document structure.

If both built-in adapters score below 0.4, write a new one.

---

## 2. Architecture Overview

```
project/docs/
    └─ *.md files
          │
          ▼
    BaseBaAdapter.parse()          ← your adapter lives here
          │
          ▼
    BaIR  (ir_ba.py dataclasses)
          │
          ▼
    Validator  (deep ID + ref checks)
          │
          ▼
    Cypher plan  (cypher.py)
          │
          ▼
    nacl-migrate-ba SKILL.md       ← executes Cypher via MCP Neo4j tool
```

Adapters are **pure Markdown-to-IR converters**. They never open a Neo4j
connection and never emit Cypher. Everything below the `BaIR` boundary is
handled by the shared pipeline.

Relevant source files:

- `nacl-migrate-core/nacl_migrate_core/adapters/base.py` — ABCs
- `nacl-migrate-core/nacl_migrate_core/adapters/__init__.py` — registry
- `nacl-migrate-core/nacl_migrate_core/adapters/detect.py` — auto-detection logic
- `nacl-migrate-core/nacl_migrate_core/ir_ba.py` — all IR dataclasses
- `nacl-migrate-core/nacl_migrate_core/adapters/inline_table_v1.py` — reference adapter

---

## 3. Step-by-Step Guide

### 3.1 Subclass `BaseBaAdapter`

Create a new file in `nacl-migrate-core/nacl_migrate_core/adapters/`:

```python
# nacl_migrate_core/adapters/my_format_v1.py
from __future__ import annotations

from pathlib import Path
from typing import List

from ..ir_ba import BaIR, BusinessEntity, BusinessProcess, BusinessRole, BusinessRule, GlossaryTerm, Warning
from .base import BaseBaAdapter


class MyFormatV1BaAdapter(BaseBaAdapter):
    name = "my-format-v1"
    version = "1.0.0"
```

`BaseBaAdapter` requires two public methods: `detect()` and `parse()`. Everything
else is implementation detail.

### 3.2 Implement `detect()`

`detect()` is a `@classmethod` that receives a short list of sample `.md` files
(up to 3, chosen by `detect.sample_files_for_ba()`) and returns a confidence
float.

```python
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
        # Replace with signals specific to your format.
        if "MY_FORMAT_MARKER" in text:
            hits += 1
    return hits / len(sample_files)
```

Confidence thresholds (from `base.py`):

| Score   | Meaning                                  |
|---------|------------------------------------------|
| 0.0     | Definitely not this adapter              |
| 0.1-0.7 | Ambiguous; user must pick manually       |
| 0.8-1.0 | Strong fit; auto-selectable              |

Auto-selection also requires a margin of >= 0.2 over the second-best candidate
(see `detect.py` line 65). Make your signals specific enough to stay clear of
the built-in adapters.

The sample files come from these directories (priority order, defined in
`detect.py:_SAMPLE_HINTS_BA`):

```
docs/02-business-entities/entities
docs/01-business-processes/processes
docs/04-business-rules/rules
docs/03-business-roles/roles
docs/02-business-entities
docs/01-business-processes
```

### 3.3 Implement `parse()`

`parse()` walks the project tree and returns a fully-assembled `BaIR`. Non-fatal
issues (missing optional fields, unrecognised IDs) go into `BaIR.warnings` as
`Warning` objects. Only raise exceptions for I/O failures or structural
impossibilities.

```python
def parse(self, project_path: Path) -> BaIR:
    warnings: list[Warning] = []

    entities  = self.parse_entities(project_path, warnings)
    processes = self.parse_processes(project_path, warnings)
    roles     = self.parse_roles(project_path, warnings)
    rules     = self.parse_rules(project_path, warnings)
    glossary  = self.parse_glossary(project_path, warnings)

    return BaIR(
        project_path=str(project_path),
        entities=entities,
        processes=processes,
        roles=roles,
        rules=rules,
        glossary=glossary,
        warnings=warnings,
    )
```

Split the parsing work across private helpers. The reference implementation in
`inline_table_v1.py` uses one `_parse_*` method per document type.

### 3.4 Return IR Dataclasses

All IR classes are in `nacl_migrate_core/ir_ba.py`. ID formats are validated in
`__post_init__` — a wrong ID pattern raises `ValueError` immediately.

| IR class          | ID pattern      | Example      |
|-------------------|-----------------|--------------|
| `BusinessEntity`  | `OBJ-NNN`       | `OBJ-001`    |
| `BusinessProcess` | `BP-NNN`        | `BP-042`     |
| `WorkflowStep`    | `BP-NNN-SNN`    | `BP-042-S01` |
| `BusinessRole`    | `ROL-NN`        | `ROL-03`     |
| `BusinessRule`    | `BRQ-NNN`       | `BRQ-007`    |
| `GlossaryTerm`    | `GLO-NNN`       | `GLO-012`    |

Cross-references between IR objects use string IDs, not Python object references.
This keeps serialisation trivial and allows partial IRs during assembly.

---

## 4. Registration

Add your adapter to both registries in
`nacl-migrate-core/nacl_migrate_core/adapters/__init__.py`:

```python
from .my_format_v1 import MyFormatV1BaAdapter

BA_ADAPTERS: dict[str, type[BaseBaAdapter]] = {
    "inline-table-v1": InlineTableV1BaAdapter,
    "frontmatter-v1":  FrontmatterV1BaAdapter,
    "my-format-v1":    MyFormatV1BaAdapter,   # add here
}
```

If you also have an SA-layer adapter, add it to `SA_ADAPTERS` the same way.

After registration, `detect_ba.py` picks it up automatically — no other changes
needed.

---

## 5. Testing

### Fixtures

Copy a representative set of real project files into:

```
nacl-migrate-core/tests/fixtures/my-format/
    entities/OBJ-001-example.md
    processes/BP-001-example.md
    roles/ROL-01-example.md
```

Keep fixtures minimal but real — the goal is to cover the parsing paths your
adapter exercises, not to reproduce an entire project.

### Unit Tests

```python
# nacl-migrate-core/tests/test_adapter_my_format_v1.py
import unittest
from pathlib import Path
from nacl_migrate_core.adapters.my_format_v1 import MyFormatV1BaAdapter

FIXTURES = Path(__file__).parent / "fixtures" / "my-format"


class TestDetect(unittest.TestCase):
    def test_high_confidence_on_own_fixtures(self):
        samples = list(FIXTURES.rglob("*.md"))[:3]
        score = MyFormatV1BaAdapter.detect(samples)
        self.assertGreaterEqual(score, 0.8)

    def test_zero_on_inline_table_fixtures(self):
        other = Path(__file__).parent / "fixtures" / "inline-table"
        samples = list(other.rglob("*.md"))[:3]
        score = MyFormatV1BaAdapter.detect(samples)
        self.assertLess(score, 0.4)


class TestParse(unittest.TestCase):
    def test_entities_parsed(self):
        ir = MyFormatV1BaAdapter().parse(FIXTURES.parent / "my-format")
        self.assertTrue(len(ir.entities) > 0)
        self.assertEqual(ir.entities[0].id[:4], "OBJ-")

    def test_no_hard_errors(self):
        ir = MyFormatV1BaAdapter().parse(FIXTURES.parent / "my-format")
        # Warnings are allowed; exceptions are not.
        for w in ir.warnings:
            self.assertIsInstance(w.code, str)
```

Run the suite:

```bash
cd "$NACL_HOME/nacl-migrate-core"
python3 -m unittest discover -s tests -v
```

---

## 6. Minimal Adapter Skeleton

```python
# nacl_migrate_core/adapters/my_format_v1.py

from __future__ import annotations
from pathlib import Path
from typing import List

from ..ir_ba import BaIR, BusinessEntity, BusinessProcess, BusinessRole, BusinessRule, GlossaryTerm, Warning
from .base import BaseBaAdapter


class MyFormatV1BaAdapter(BaseBaAdapter):
    name = "my-format-v1"
    version = "1.0.0"

    # --- Detection -----------------------------------------------------------

    @classmethod
    def detect(cls, sample_files: List[Path]) -> float:
        hits = sum(
            1 for p in sample_files
            if cls._is_my_format(p)
        )
        return hits / len(sample_files) if sample_files else 0.0

    @classmethod
    def _is_my_format(cls, path: Path) -> bool:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return False
        # Replace with real structural signals.
        return "MY_MARKER" in text

    # --- Parse ---------------------------------------------------------------

    def parse(self, project_path: Path) -> BaIR:
        warnings: list[Warning] = []
        return BaIR(
            project_path=str(project_path),
            entities=self._parse_entities(project_path, warnings),
            processes=self._parse_processes(project_path, warnings),
            roles=self._parse_roles(project_path, warnings),
            rules=self._parse_rules(project_path, warnings),
            glossary=self._parse_glossary(project_path, warnings),
            warnings=warnings,
        )

    def _parse_entities(self, root: Path, warnings: list) -> list[BusinessEntity]:
        results = []
        folder = root / "docs" / "02-business-entities" / "entities"
        for md_file in sorted(folder.glob("*.md")):
            # ... extract ID, name, attributes from md_file
            pass  # implement per your format's conventions
        return results

    def _parse_processes(self, root: Path, warnings: list) -> list[BusinessProcess]:
        return []  # implement similarly

    def _parse_roles(self, root: Path, warnings: list) -> list[BusinessRole]:
        return []

    def _parse_rules(self, root: Path, warnings: list) -> list[BusinessRule]:
        return []

    def _parse_glossary(self, root: Path, warnings: list) -> list[GlossaryTerm]:
        return []
```

Parsing utilities available in the package:

- `nacl_migrate_core.markdown` — section extractor, table parser, code-block finder
- `nacl_migrate_core.frontmatter` — YAML frontmatter extractor
- `nacl_migrate_core.mermaid` — stateDiagram and flowchart parsers
- `nacl_migrate_core.slugify` — `canonical_role_id()`, `canonical_step_id()`

Study `inline_table_v1.py` for idiomatic usage of all four.
