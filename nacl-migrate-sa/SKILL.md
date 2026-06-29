---
name: nacl-migrate-sa
model: sonnet
effort: medium
description: |
  Migrate an OLD-methodology SA layer from Markdown to Neo4j. Parses
  docs/10-architecture (or 00-architecture), docs/12-domain (or 02-domain),
  docs/13-roles (or 03-roles), docs/14-usecases (or 04-usecases),
  docs/15-interfaces (or 05-interfaces), docs/16-requirements (or 06-requirements),
  plus docs/99-meta/traceability-matrix.md. Writes SA nodes, SA-internal
  relationships, and cross-layer handoff edges via deterministic Python
  scripts, executed through mcp__neo4j__write-cypher.
  Use when: migrate SA from markdown, import old SA into graph, nacl-migrate-sa.
  Fails loudly on unknown formats.
---

# /nacl-migrate-sa — SA Markdown → Neo4j

## Role

You delegate SA parsing, validation, and Cypher generation to stdlib Python
scripts under `$NACL_HOME/nacl-migrate-sa/scripts/`. **You never parse
Markdown yourself**; the scripts own that. Your job is:

1. Run the scripts in order.
2. Read their JSON outputs.
3. Execute the Cypher plan against Neo4j via `mcp__neo4j__write-cypher`.
4. Gather live counts via `mcp__neo4j__read-cypher` and hand them to `audit_sa.py`.
5. Present results and errors to the user in plain language.

If the project has a BA layer, `nacl-migrate-ba` must have already run —
this skill emits cross-layer handoff edges that point at BA nodes.

---

## Invocation

```
/nacl-migrate-sa [project_path] [--dry-run] [--adapter=<name>] [--no-ba]
```

| Parameter | Required | Description |
|---|---|---|
| `project_path` | No | Project root (default: cwd). |
| `--dry-run` | No | Parse + validate + Cypher gen; no Neo4j writes, no audit. |
| `--adapter` | No | Force adapter (`inline-table-v1`). Default: auto-detect. |
| `--no-ba` | No | Skip cross-layer handoff edges. Use for SA-only projects. |

---

## Prelude — locate NaCl home and verify Python

```bash
# Resolve $NACL_HOME
if [ -z "$NACL_HOME" ]; then
  for candidate in "$HOME/projects/NaCl" "$HOME/NaCl" "$HOME/code/NaCl" "$HOME/src/NaCl"; do
    if [ -f "$candidate/nacl-migrate-core/nacl_migrate_core/__init__.py" ]; then
      export NACL_HOME="$candidate"
      break
    fi
  done
fi
if [ -z "$NACL_HOME" ] || [ ! -f "$NACL_HOME/nacl-migrate-core/nacl_migrate_core/__init__.py" ]; then
  echo "Unable to locate NaCl repo. Set NACL_HOME=/path/to/NaCl and retry." >&2
  exit 1
fi

python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null \
  || { echo "Python 3.11+ required. On macOS: brew install python@3.11"; exit 1; }
```

---

## Soft preflight (direct invocation)

When invoked directly (i.e. *not* via the `/nacl-migrate` orchestrator),
run an ID-pattern scan and warn — but do not block — if any token in the
project's filenames or YAML frontmatter does not match a known adapter
pattern. The orchestrator path runs the same scan at Phase A.5 with a
hard gate; the direct-invocation path stays non-blocking so a single-layer
rerun is ergonomic.

```bash
mkdir -p .nacl-migrate
python3 "$NACL_HOME/nacl-migrate-ba/scripts/preflight_ids.py" \
  --project "$PWD" \
  --output .nacl-migrate/preflight.json || true
```

Exit code `1` from the script means unknown patterns were found. Surface
the report's `patterns_unknown` list to the user:

> Preflight surfaced N unknown ID-shaped tokens. These will likely be
> dropped at parse. Review `.nacl-migrate/preflight.json` and either
> widen an adapter (recommended) or pass `--force` to proceed anyway.

If the user passes `--force`, continue. Otherwise stop.

---

## Preconditions

1. `config.yaml` / `.mcp.json` present; Neo4j reachable via `mcp__neo4j__get-schema`.
2. At least one SA folder exists under `docs/` (10-16 or 00-06 variant). If none:
   *"No SA layer detected. Skipping `nacl-migrate-sa`."* Exit cleanly.
3. Unless `--no-ba`: BA nodes present in Neo4j (query `MATCH (bp:BusinessProcess) RETURN count(bp)` > 0). If zero AND the project has a BA docs tree, stop — user must run `/nacl-migrate-ba` first.

---

## Phase 0 — Detect adapter + numbering

The SA parser infers both at once. For now there is a single SA adapter
(`inline-table-v1`), which auto-detects `10-16` vs `00-06` numbering and
handles an optional frontmatter fallback for UC files.

Skip this phase when `--adapter` was passed explicitly.

---

## Phase 1 — Parse SA markdown → SaIR + HandoffIR

```bash
python3 "$NACL_HOME/nacl-migrate-sa/scripts/parse_sa.py" \
  --project "$PWD" \
  --adapter inline-table-v1 \
  --output .nacl-migrate/sa-ir.json \
  --handoff-output .nacl-migrate/handoff-ir.json
```

Expected stdout: counts table for SaIR and HandoffIR. Surface every warning code to the user.

On error exit, print `message` + `remediation` verbatim.

---

## Phase 2 — Validate IR

```bash
python3 "$NACL_HOME/nacl-migrate-sa/scripts/validate_sa_ir.py" \
  --input .nacl-migrate/sa-ir.json \
  --handoff .nacl-migrate/handoff-ir.json \
  --output .nacl-migrate/sa-validation.json
```

13 referential checks (SV1–SV8 + HV1–HV5). Exit 0 → all pass. Exit 1 → stop and print the failure list.

The script also prints a **Coverage** section (SC1–SC7) and writes a
`coverage` block to `sa-validation.json`. This is the *completeness*
dimension — it measures how much of each node type the adapter actually
populated (UC activity steps, UC module, UC↔form links, entity attributes,
enum values, form fields). It exists because the referential checks and the
Phase 7 audit are both blind to *under-extraction*: an IR with 1 ActivityStep
total is internally consistent and writes cleanly, yet leaves nearly every
UseCase an empty shell.

**Coverage is advisory by default** (it does not change the exit code — some
emptiness is legitimate, e.g. a pure list-view UC has no steps). Surface the
Coverage lines to the user verbatim; do not bury them. A severely
under-extracted migration now shows e.g. `SC1 UC activity steps: 1/50 (2.0%)`
instead of a silent "clean".

To gate in CI, add `--strict` (fail any metric below 100%) or
`--min-coverage PCT` (fail below PCT). These flip the exit code to non-zero;
leave them off for the normal interactive migration.

---

## Phase 3 — Generate Cypher plan

```bash
python3 "$NACL_HOME/nacl-migrate-sa/scripts/generate_sa_cypher.py" \
  --input .nacl-migrate/sa-ir.json \
  --handoff .nacl-migrate/handoff-ir.json \
  --output .nacl-migrate/sa-cypher.json
```

Three batch kinds: `node`, `edge` (SA-internal), `handoff` (BA↔SA). If
`--no-ba` was set, skip all `handoff` batches when executing.

If `--dry-run`: stop here and report the plan summary.

---

## Phase 4 — Execute Cypher against Neo4j

Preflight: `mcp__neo4j__get-schema()` must succeed.

Read `.nacl-migrate/sa-cypher.json`. For each batch:

```
mcp__neo4j__write-cypher(query = batch.cypher, params = batch.params)
```

Report progress per batch: `[i/N] {label} rows=... ok`.

If `--no-ba`, skip batches where `kind == "handoff"` and log a single line:
`Skipping N handoff batches (--no-ba).`

On any batch failure: log the batch index + error; stop. The partial graph
is MERGE-idempotent — rerunning after a fix is safe.

---

## Phase 5 — SUGGESTS edges (optional, best-effort)

Emit `ProcessGroup -[:SUGGESTS]-> Module` edges from in-graph data. This
is the only SA edge type that can't be computed by the scripts because it
requires joining SA's `Module.related_process_ids` with BA's
`ProcessGroup -[:CONTAINS]-> BusinessProcess`. Run via MCP:

```cypher
MATCH (gpr:ProcessGroup)-[:CONTAINS]->(bp:BusinessProcess)
MATCH (m:Module)
WHERE bp.id IN m.related_process_ids
MERGE (gpr)-[:SUGGESTS]->(m)
RETURN count(*) AS n
```

Skip entirely if `--no-ba`.

---

## Phase 6 — Gather live counts

Query Neo4j via `mcp__neo4j__read-cypher` for every node label and edge
type listed in `audit_sa.py`. **Important:** scope `HAS_STEP`,
`HAS_ATTRIBUTE`, and `NEXT_STEP` counts to the SA layer, because those
relationship types also exist on the BA layer. Use label-scoped Cypher:

```cypher
MATCH (:UseCase)-[r:HAS_STEP]->(:ActivityStep) RETURN count(r) AS n
MATCH (:DomainEntity)-[r:HAS_ATTRIBUTE]->(:DomainAttribute) RETURN count(r) AS n
MATCH (:ActivityStep)-[r:NEXT_STEP]->(:ActivityStep) RETURN count(r) AS n
```

All other edge types have SA-exclusive labels and can use the unscoped form.

Write the counts to `.nacl-migrate/sa-live-counts.json`.

---

## Phase 7 — Audit

```bash
python3 "$NACL_HOME/nacl-migrate-sa/scripts/audit_sa.py" \
  --ir .nacl-migrate/sa-ir.json \
  --handoff .nacl-migrate/handoff-ir.json \
  --counts .nacl-migrate/sa-live-counts.json \
  --output .nacl-migrate/sa-audit.json
```

Exit 0 → "All SA counts match." Exit 1 → surface mismatches to the user.

The audit prints a pointer line — `count parity ✓ — see validation coverage
(SC1–SC7 …)` — because count parity only proves IR→graph fidelity, never
extraction completeness. When you report the audit result to the user, quote
the Phase-2 Coverage numbers next to it; never present "All SA counts match"
as if it meant the migration is complete.

---

## Phase 7b — Backfill validation exemption flags

Migrated graphs are populated from markdown documents that predate the L4–L7 validators. Their nodes lack the `has_ui` / `system_only` / `shared` / `internal` / `field_category` exemption properties, which causes `nacl-sa-validate` to emit dozens of false-positive findings on the very first run.

To prevent this, the migration ends with an automatic backfill via `nacl-sa-flags`:

```
/nacl-sa-flags backfill-all --detect-internal
```

**Behavior:**
- `:UseCase.has_ui` is derived deterministically: `true` if `(uc)-[:USES_FORM]->(:Form)`, else `false`.
- `:DomainAttribute.internal` is auto-flagged for system patterns (`id`, `*_id`, `*_at`, `*_token`, `*_hash`).
- `:SystemRole.system_only`, `:DomainEntity.shared`, `:FormField.field_category` get safe defaults (`false`, `false`, `'input'`).

The user is prompted at the end of Phase 7 to confirm before the backfill runs. If declined, the migration completes without flags and `nacl-sa-validate full` will surface ~50–150 NULL-property findings as recommendations rather than CRITICAL/WARN; the user can then run `nacl-sa-flags backfill-all` manually at any later time.

**Why `--detect-internal` by default:** post-migration graphs have many surrogate keys and timestamps. The heuristic flags them automatically and is safe (it only sets `internal=true`, never `internal=false`, so manually-flagged user-facing attributes are preserved). Real telemetry / provider-internal columns may need additional manual marking after the first validate run.

---

## Phase 8 — Report

Write `MIGRATION-REPORT-SA.md` at project root:

```markdown
# SA Migration Report

**Project:** {project_path}
**Adapter:** {adapter}
**Numbering:** {numbering}  (10-16 or 00-06)
**Ran at:** {ISO timestamp}

## SA IR vs live Neo4j
(Copy from sa-audit.json — node + edge tables.)

**Audit result: N/N CLEAN** — but count parity only proves IR→graph fidelity.
See Completeness / Coverage below for whether the IR itself is complete.

## Completeness / Coverage
(Copy the `coverage` block from sa-validation.json. One line per metric, kept
adjacent to the audit headline so "CLEAN" is never read as "complete".)

| Metric | Covered | % | Sample missing |
|--------|---------|---|----------------|
| SC1 UC activity steps | {covered}/{total} | {pct}% | {sample_missing} |
| SC2 UC module | {covered}/{total} | {pct}% | … |
| SC3 UC→form link | {covered}/{total} | {pct}% | … |
| SC3f Form→UC link | {covered}/{total} | {pct}% | … |
| SC4 DomainEntity module | {covered}/{total} | {pct}% | … |
| SC5 DomainEntity attributes | {covered}/{total} | {pct}% | … |
| SC6 Enumeration values | {covered}/{total} | {pct}% | … |
| SC7 Form fields | {covered}/{total} | {pct}% | … |

Coverage is advisory: low percentages flag adapter under-extraction (or
legitimately empty nodes), not a write failure. Investigate any metric well
below 100% before declaring the migration done.

## Cross-layer handoff
(Counts of AUTOMATES_AS, REALIZED_AS, TYPED_AS, MAPPED_TO, IMPLEMENTED_BY, SUGGESTS.)

## Warnings
{list from sa-ir.json warnings[] and handoff-ir.json, or "none"}

## Non-extracted relationships
The following are currently 0 because the adapter does not extract them:
  - FormField / HAS_FIELD / MAPS_TO (needs _form-domain-mapping.md parser)
  - ActivityStep.NEXT_STEP (needs UC flowchart Mermaid parser)
  - UseCase -[:ACTOR]-> SystemRole
  - SystemRole -[:HAS_PERMISSION]-> DomainEntity
  - BusinessRule -[:IMPLEMENTED_BY]-> Requirement (matrix uses category names, not REQ ids)

Adding any of these is a per-adapter enhancement. Non-blocker for migration.

## Next steps
- Run `/nacl-sa-validate` (L1-L13 + XL6-XL9 cross-validation; L10-L13 pass vacuously until the project adopts the 2.15+ extension layers — see `docs/runbooks/upgrade-graph-extensions.md`)
- Run `/nacl-tl-diagnose` for code-docs drift analysis
```

---

## Idempotency

All Neo4j writes are `MERGE`-keyed on canonical IDs. Safe to rerun. If an
adapter change produces different canonical IDs, old nodes become orphans —
`audit_sa.py` flags this as a count mismatch.

---

## Known non-blockers

The current adapter does not extract:

- **FormField / HAS_FIELD / MAPS_TO** — requires parsing `_form-domain-mapping.md`.
- **ActivityStep.NEXT_STEP** — UC activity flows are text tables without explicit step-number links.
- **UseCase -[:ACTOR]-> SystemRole** — UC.actor is text (`"ACT-01 Пользователь"`); resolving it to a SYSROL requires the SystemRole table to be loaded first.
- **SystemRole -[:HAS_PERMISSION]-> DomainEntity** — requires parsing the permissions matrix.
- **BusinessRule -[:IMPLEMENTED_BY]-> Requirement** — traceability matrix maps BRQ to category strings, not REQ IDs. Warning: `HANDOFF_REQ_CATEGORY` is logged per row.

These can be added as adapter enhancements later. None is blocking for
migration correctness.

---

## Error handling

| Situation | Response |
|---|---|
| Prelude can't find `$NACL_HOME` | Stop. Ask to export `NACL_HOME`. |
| Python < 3.11 | Stop. Ask user to upgrade. |
| BA docs present but BA nodes missing | Stop. Ask user to run `/nacl-migrate-ba` first. |
| Ambiguous numbering (both 10-16 and 00-06 dirs present) | Stop. Ask user to remove one. |
| Adapter unknown | Stop. Present supported adapters. |
| Validation failure | Stop. Print failed checks. |
| Batch failure | Stop after the failing batch. Rerun after fix. |
| Audit mismatch | Report, do not claim success. |

---

## Reads / Writes

### Reads
- `{project}/docs/{10-16|00-06}-*/**/*.md`
- `{project}/docs/99-meta/traceability-matrix.md`
- `mcp__neo4j__read-cypher` (live counts in Phase 6)
- `mcp__neo4j__get-schema` (preflight)

### Writes
- `.nacl-migrate/sa-ir.json`
- `.nacl-migrate/handoff-ir.json`
- `.nacl-migrate/sa-validation.json`
- `.nacl-migrate/sa-cypher.json`
- `.nacl-migrate/sa-live-counts.json`
- `.nacl-migrate/sa-audit.json`
- `MIGRATION-REPORT-SA.md`
- `mcp__neo4j__write-cypher` (Phases 4, 5)

---

## Checklist

- [ ] Prelude: `$NACL_HOME` resolved, Python 3.11+ present
- [ ] Phase 0: adapter + numbering detected (or user supplied)
- [ ] Phase 1: SA IR + Handoff IR emitted
- [ ] Phase 2: validation 13/13 pass (or blocker list surfaced) + Coverage (SC1–SC7) reported
- [ ] Phase 3: Cypher plan generated
- [ ] Phase 4: every batch executed via `mcp__neo4j__write-cypher`
- [ ] Phase 5: SUGGESTS edges emitted (or skipped with `--no-ba`)
- [ ] Phase 6: live counts gathered (layer-scoped for shared rel types)
- [ ] Phase 7: audit clean
- [ ] Phase 8: MIGRATION-REPORT-SA.md written
