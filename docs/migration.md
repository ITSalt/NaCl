# Migration from Markdown BA/SA Docs to the NaCl Graph

Use this guide when you have an existing project with Markdown-based BA and/or
SA documentation written in the old methodology and want to move it into the
graph-based `nacl-*` workflow.

---

## When to use migration

- Your project already has structured Markdown docs in the old BA/SA layout
  (numbered `docs/` folders).
- You want to use the graph-based `/nacl-*` skills going forward.
- You are **not** starting a new project from scratch — for that, use
  `/nacl-init` directly.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | `brew install python@3.11` on macOS |
| Docker | Required to run the Neo4j container via `graph-infra/` |
| Claude Code + NaCl skills | Skills must be installed and `$NACL_HOME` resolvable |
| Clean git state | Strongly recommended; commit or stash before migrating |

The orchestrator auto-resolves `$NACL_HOME` by searching `~/projects/NaCl`,
`~/NaCl`, `~/code/NaCl`, and `~/src/NaCl`. Set the env var explicitly if your
NaCl clone lives elsewhere.

---

## Expected project structure

The migration detects layers based on the presence of these directories:

```
docs/
  00-context/
  01-business-processes/
  02-business-entities/
  03-business-roles/
  04-business-rules/
  99-meta/glossary.md          # BA layer
  10-architecture/             # SA layer (also accepted as 00-architecture/)
  12-domain/                   # also accepted as 02-domain/
  13-roles/                    # also accepted as 03-roles/
  14-usecases/                 # also accepted as 04-usecases/
  15-interfaces/               # also accepted as 05-interfaces/
  16-requirements/             # also accepted as 06-requirements/
  99-meta/traceability-matrix.md
```

Folders are optional — the skill migrates whichever layers are present and
skips the rest. A project with only SA folders and no BA folders is valid.

---

## How it works

Parsing is **deterministic Python with no LLM involvement**. The pipeline is:

1. **Detect format** — auto-detects which adapter matches the project's
   Markdown conventions (`inline-table-v1` currently; `frontmatter-v1` planned).
2. **Parse to IR** — Python scripts under `nacl-migrate-ba/scripts/` and
   `nacl-migrate-sa/scripts/` read your Markdown files and produce structured
   intermediate representation (IR) as JSON.
3. **Validate IR** — schema and referential-integrity checks run before any
   write; blockers stop the pipeline with a clear message and remediation hint.
4. **Generate Cypher** — `nacl-migrate-core` templates render `MERGE`-based
   Cypher from the validated IR.
5. **Execute in Neo4j** — the skill sends Cypher via `mcp__neo4j__write-cypher`.
   All writes are idempotent; re-running is safe.

The adapter pattern is the key extensibility point: each adapter maps one
specific Markdown format to the shared IR schema. Adapters live in
`nacl-migrate-core/nacl_migrate_core/adapters/`.

---

## Running the migration

```
/nacl-migrate [project_path] [flags]
```

| Flag | Effect |
|---|---|
| _(no flags)_ | Full migration: BA + SA + validation + drift check + render diff |
| `--dry-run` | Parse, validate, and generate Cypher — but skip all Neo4j writes |
| `--skip-ba` | Migrate SA layer only (e.g. SA-only project) |
| `--skip-sa` | Migrate BA layer only |
| `--resume-from=<phase>` | Jump to a named phase, reusing cached IR from `.nacl-migrate/` |

The orchestrator prints a migration plan and asks for confirmation before each
phase. No phase executes without explicit approval.

---

## Migration phases

| Phase | What happens |
|---|---|
| **A** | Preflight: verify git repo, detect BA/SA layers, detect adapter |
| **A.5** | ID-pattern preflight: scan all ID tokens against adapter whitelist; blocks on unknown patterns |
| **B** | Initialise graph infra via `/nacl-init` (creates `config.yaml`, `.mcp.json`, Docker Neo4j) |
| **C** | Migrate BA Markdown → Neo4j via `/nacl-migrate-ba` |
| **D** | Validate BA graph via `/nacl-ba-validate` (expects L1–L8 = 0 errors) |
| **E** | Migrate SA Markdown → Neo4j + cross-layer handoff edges via `/nacl-migrate-sa` |
| **F** | Validate SA graph via `/nacl-sa-validate` (expects L1–L6 = 0 errors) |
| **G** | Drift diagnostic via `/nacl-tl-diagnose` — surfaces code drift; does not block |
| **H** | Render diff: regenerates Markdown from the graph and diffs against original docs |
| **I** | Write `MIGRATION-REPORT.md` at project root — counts, validation results, warnings |

---

## Supported formats

| Adapter | Status | Description |
|---|---|---|
| `inline-table-v1` | Current | Markdown tables with inline properties |
| `frontmatter-v1` | Planned | YAML frontmatter per file |
| `llm-freeform-v1` | Planned | Skill-driven parsing for loosely structured prose |

The auto-detector runs `detect_ba.py` against your `docs/` tree. Use
`--adapter=<name>` to force a specific adapter if auto-detection guesses wrong.

---

## After migration

Once `MIGRATION-REPORT.md` shows no blockers:

1. Run `/nacl-ba-validate` and `/nacl-sa-validate` independently to confirm
   graph health.
2. Commit the generated `config.yaml`, `.mcp.json`, and `graph-infra/` to
   version control.
3. Archive or remove the old Markdown docs tree once you have verified parity
   via the render diff in `.nacl-migrate/render-diff.txt`.
4. Use the normal NaCl workflow from this point: `/nacl-ba-*`, `/nacl-sa-*`,
   `/nacl-tl-*` skills all operate on the graph directly.

---

## Writing a custom adapter

If your project uses a Markdown convention not covered by the built-in adapters:

1. Subclass `BaseBaAdapter` or `BaseSaAdapter` from
   `nacl-migrate-core/nacl_migrate_core/adapters/base.py`.
2. Implement the required abstract methods to produce the shared IR dataclasses
   defined in `ir_ba.py` / `ir_sa.py`.
3. Register the adapter in `nacl_migrate_core/adapters/__init__.py`.
4. Add a fixture and tests under `nacl-migrate-core/tests/`.
5. Run `python3 -m unittest discover -s tests -v` from `nacl-migrate-core/` to
   verify.

The adapter must never open a Neo4j connection — all Neo4j interaction stays
with the skill layer.
