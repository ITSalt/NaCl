# ADR-001: Configurable IR Schema for Non-BA/SA Ontologies

**Status:** Proposed
**Date:** 2026-04-13
**Author:** NaCl Architecture

---

## Context

The migration system's Intermediate Representation (IR) is currently hardcoded to the
NaCl BA/SA ontology. `ir_ba.py` defines a closed set of node types
(`BusinessProcess`, `WorkflowStep`, `BusinessEntity`, etc.) with fixed ID-format
patterns (e.g. `BP-\d{3}`) validated in `__post_init__`. The `BaseBaAdapter` ABC
in `adapters/base.py` returns `BaIR` directly, coupling every adapter to that schema.

This works well for BA/SA projects but prevents reuse of the migration pipeline for:
- API documentation graphs (endpoints, schemas, operations)
- Academic research notes (papers, authors, citations, concepts)
- Enterprise knowledge bases (products, teams, processes, decisions)

We need an extension point so the IR schema is defined by the caller, not by the
library itself, without breaking existing BA/SA adapters.

---

## Options Considered

### Option 1 — Schema-as-YAML

Define node types, their required/optional properties, and ID-format patterns in a
YAML file. The generic `IR` class loads this file at construction time and performs
the same structural validation `ir_ba.py` does today — but driven by the schema file
instead of hardcoded Python.

Pros:
- No Python subclassing required; schema is declarative and diffable.
- Easy for non-developers to add new domains.
- The existing BA/SA schema can be expressed as `schema/ba_sa.yaml`, keeping
  full backward compatibility with zero code changes in existing adapters.

Cons:
- A YAML DSL must be designed and documented.
- Some validation logic (cross-node referential integrity) is hard to express
  declaratively and may still require Python hooks.

### Option 2 — Plugin IR Classes

Users subclass a generic `Node` / `Edge` dataclass and register their ontology
with a registry. The adapter base class becomes `BaseAdapter[T_IR]`, generic over
the IR type.

Pros:
- Full Python expressiveness; complex validators are easy to write.
- Type-safe: adapters and consumers agree on the IR type at import time.

Cons:
- Higher barrier to entry — requires Python knowledge and familiarity with the
  dataclass/ABC patterns used internally.
- Multiple parallel IR class hierarchies risk divergence in serialisation
  and validator calling conventions.

### Option 3 — Keep BA/SA hardcoded, add parallel IR packages

Duplicate `ir_ba.py` into `ir_api.py`, `ir_research.py`, etc. per domain.

Pros:
- Zero risk to existing adapters.

Cons:
- No shared infrastructure; each domain re-implements validation, serialisation,
  and the validator runner from scratch. Maintenance cost grows linearly with
  domains.

---

## Decision

**Adopt Option 1 (Schema-as-YAML).**

The core migration pipeline becomes schema-driven:

1. A `schema/` directory (alongside `ir_ba.py`) holds YAML schema files.
2. `schema/ba_sa.yaml` encodes the current hardcoded ontology exactly,
   making the BA/SA path a zero-change migration.
3. A new `ir_generic.py` module exposes a `GenericIR` dataclass whose
   `__post_init__` loads and validates against the schema YAML.
4. `BaseBaAdapter` is kept as-is (returns `BaIR`) for backward compatibility.
   A new `BaseAdapter` ABC is introduced that is generic over the schema path,
   returning `GenericIR`.
5. ID-format rules, required fields, and allowed relationship types are
   all declared in the YAML. A small set of Python hooks (registered via
   `validators:` keys in the YAML) covers cross-node integrity checks that
   cannot be expressed declaratively.

---

## Consequences

### What changes

| Component | Change |
|-----------|--------|
| `ir_ba.py` | Unchanged. Kept as the canonical BA/SA IR. |
| `adapters/base.py` | New `BaseAdapter[S]` ABC added alongside `BaseBaAdapter`. |
| `ir_generic.py` | New module: `GenericIR`, `SchemaLoader`, YAML-driven `_check_id`. |
| `schema/ba_sa.yaml` | New file encoding the existing BA/SA ontology for reference and testing. |
| Validator / Cypher generator | Must accept both `BaIR` and `GenericIR` (via a common protocol). |

### What stays the same

- All existing BA/SA adapters (`inline_table_v1`, `frontmatter_v1`,
  `llm_freeform_v1`) continue to subclass `BaseBaAdapter` and return `BaIR`.
- JSON serialisation convention (`dataclasses.asdict + json`) is unchanged.
- The `Warning` dataclass is shared between both IR paths.

### Migration path for existing adapters

Existing adapters require no changes. Authors who want to support a new domain:

1. Write a YAML schema file (documented in `docs/ir-schema-format.md`).
2. Subclass `BaseAdapter`, set `schema_path` to the YAML file.
3. Implement `detect()` and `parse()` returning `GenericIR`.

No existing adapter is broken; new domains opt in explicitly.
