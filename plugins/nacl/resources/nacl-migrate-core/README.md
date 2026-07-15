# nacl-migrate-core

Shared Python stdlib package used by `nacl-migrate-ba` and `nacl-migrate-sa` skills to migrate old-methodology Markdown documentation into the nacl graph.

**Pure Python 3.11+ stdlib. No pip. No venv. No external dependencies.**

## Layout

```
nacl-migrate-core/
├── README.md
├── nacl_migrate_core/
│   ├── __init__.py
│   ├── ir_ba.py           # BA IR dataclasses
│   ├── ir_sa.py           # SA IR dataclasses (later)
│   ├── ir_handoff.py      # Cross-layer handoff IR (later)
│   ├── frontmatter.py     # YAML-frontmatter extractor (subset)
│   ├── markdown.py        # section / table / code-block finders
│   ├── mermaid.py         # stateDiagram + flowchart parsers
│   ├── slugify.py         # canonical ID / slug helpers
│   ├── cypher.py          # Cypher templates + batcher
│   └── adapters/
│       ├── __init__.py    # adapter registry
│       ├── base.py        # BaseBaAdapter / BaseSaAdapter ABCs
│       ├── detect.py      # format auto-detector
│       ├── inline_table_v1.py
│       ├── frontmatter_v1.py   # (later)
│       └── llm_freeform_v1.py  # (much later — skill-driven)
└── tests/
    ├── fixtures/
    │   └── inline-table/       # structural samples for the inline-table dialect
    ├── test_frontmatter.py
    ├── test_markdown.py
    ├── test_mermaid.py
    └── test_adapter_inline_table_v1.py
```

## Path resolution

Skills locate this package via `$NACL_HOME`. Resolution order:

1. `$NACL_HOME` env var, if set.
2. Fallback paths: `~/projects/NaCl`, `~/NaCl`, `~/code/NaCl`, `~/src/NaCl`.
3. Fail with clear remediation.

Inside the package, modules use `Path(__file__).resolve().parents[N]` — never hardcoded paths.

## Run tests

```bash
cd "$NACL_HOME/nacl-migrate-core"
python3 -m unittest discover -s tests -v
```

## Boundary

- **Scripts (this package + sibling `scripts/` dirs)**: parse Markdown, build IR, validate, generate Cypher plans. **Never open a Neo4j connection.**
- **Skills (`nacl-migrate-*/SKILL.md`)**: execute Cypher plans via `mcp__neo4j__write-cypher`, query live Neo4j for audits, orchestrate user confirmation gates.
