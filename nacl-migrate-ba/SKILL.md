---
name: nacl-migrate-ba
model: sonnet
effort: medium
description: |
  Migrate an OLD-methodology BA layer from Markdown to Neo4j. Parses
  docs/00-context, docs/01-business-processes, docs/02-business-entities,
  docs/03-business-roles, docs/04-business-rules, docs/99-meta/glossary via
  deterministic Python scripts (no LLM parsing), then writes BA nodes and
  relationships to the graph via mcp__neo4j__write-cypher.
  Use when: migrate BA from markdown, import old BA into graph, nacl-migrate-ba.
  Fails loudly on unknown formats — add a new adapter rather than guessing.
---

# /nacl-migrate-ba — BA Markdown → Neo4j

## Role

You delegate parsing, validation, and Cypher generation to stdlib Python
scripts under `$NACL_HOME/nacl-migrate-ba/scripts/`. **You never parse
Markdown yourself**; the scripts own that entirely. Your own job is:

1. Run the scripts in order.
2. Read their JSON outputs.
3. Execute the Cypher plan against Neo4j via `mcp__neo4j__write-cypher`.
4. Gather live counts via `mcp__neo4j__read-cypher` and hand them to `audit_ba.py`.
5. Present results and errors to the user in plain language.

The scripts produce structured JSON with `status`, `error_code`, `message`,
and `remediation`. When a script fails, print the message and remediation
verbatim.

---

## Invocation

```
/nacl-migrate-ba [project_path] [--dry-run] [--adapter=<name>]
```

| Parameter | Required | Description |
|---|---|---|
| `project_path` | No | Project root (default: cwd). Must contain `docs/`. |
| `--dry-run` | No | Run parse + validate + Cypher generation; skip all Neo4j writes and audit. |
| `--adapter` | No | Force an adapter (`inline-table-v1` \| `frontmatter-v1`). Default: auto-detect. |

---

## Prelude — locate NaCl home and verify Python

Run this first. Emit the messages verbatim on failure.

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

# Verify Python 3.11+
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null \
  || { echo "Python 3.11+ required. On macOS: brew install python@3.11"; exit 1; }
```

All subsequent commands use `$NACL_HOME/nacl-migrate-ba/scripts/...`.

---

## Soft preflight (direct invocation)

When invoked directly (i.e. *not* via the `/nacl-migrate` orchestrator),
run a quick ID-pattern scan and warn — but do not block — if any token in
the project's filenames or YAML frontmatter does not match a known adapter
pattern. The orchestrator path runs the same scan at Phase A.5 with a
hard gate; this version is non-blocking so a single-layer rerun stays
ergonomic.

```bash
mkdir -p .nacl-migrate
python3 "$NACL_HOME/nacl-migrate-ba/scripts/preflight_ids.py" \
  --project "$PWD" \
  --output .nacl-migrate/preflight.json || true
```

Exit code `1` from the script means unknown patterns were found. Surface
the report's `patterns_unknown` list to the user with this message:

> Preflight surfaced N unknown ID-shaped tokens. These will likely be
> dropped at parse. Review `.nacl-migrate/preflight.json` and either
> widen an adapter (recommended) or pass `--force` to proceed anyway.

If the user passes `--force`, continue. Otherwise stop.

---

## Preconditions

1. `config.yaml` and `.mcp.json` exist at project root (produced by `nacl-init`).
2. Neo4j is reachable via `mcp__neo4j__get-schema` — run it once before Phase 1 and stop if it errors.
3. At least one BA folder exists under `docs/`. If none, skip this skill with:
   *"No BA layer detected under `docs/`. This project may be SA-only. Skipping `nacl-migrate-ba`."*

---

## Phase 0 — Detect adapter

```bash
python3 "$NACL_HOME/nacl-migrate-ba/scripts/detect_ba.py" \
  --project "$PWD" \
  --output .nacl-migrate/detect-ba.json
```

Read the JSON.

- `status: "ok"` + `chosen: "<name>"` + `ambiguous: false` → proceed with that adapter.
- `ambiguous: true` → show the candidate list to the user; ask them to pass `--adapter=<name>`.
- `chosen: null` + `ambiguous: false` → no adapter matches; stop and ask the user to add a new adapter per `nacl-migrate-core/README.md`.
- `reason: "no_ba_files_found"` → skip the skill (see preconditions above).
- `status: "error"` → print `message` + `remediation` and stop.

If `--adapter` was passed, skip this phase and use the user-provided value.

---

## Phase 1 — Parse Markdown → IR

```bash
python3 "$NACL_HOME/nacl-migrate-ba/scripts/parse_ba.py" \
  --project "$PWD" \
  --adapter "<chosen_adapter>" \
  --output .nacl-migrate/ba-ir.json
```

Expected stdout: a counts table and (optionally) a warnings tally. Confirm
`warnings: 0` or surface each warning code to the user.

On error exit (code ≠ 0), surface `message` + `remediation` and stop.

---

## Phase 2 — Validate IR

```bash
python3 "$NACL_HOME/nacl-migrate-ba/scripts/validate_ba_ir.py" \
  --input .nacl-migrate/ba-ir.json \
  --output .nacl-migrate/ba-validation.json
```

Validator runs 10 checks (V1–V10) covering ID uniqueness, reference
integrity, orphan states, source-file presence.

- Exit 0 → all pass, continue.
- Exit 1 → at least one check failed. Print the failure list from stdout
  and stop. If the user wants to proceed anyway, they must fix the IR or
  rerun with adapter adjustments.

---

## Phase 3 — Generate Cypher plan

```bash
python3 "$NACL_HOME/nacl-migrate-ba/scripts/generate_ba_cypher.py" \
  --input .nacl-migrate/ba-ir.json \
  --output .nacl-migrate/ba-cypher.json
```

Plan is an array of batches, each with `cypher`, `params`, `kind` (`node` or
`edge`) and `label` (human-readable). Batches are sized so one MCP call per
batch is sub-second.

If `--dry-run`: stop here. Report the plan's summary to the user and exit.

---

## Phase 4 — Execute Cypher against Neo4j

Preflight:
```
mcp__neo4j__get-schema()   # must succeed
```
If it errors, stop and tell the user to start the Neo4j stack.

Execute:

Read `.nacl-migrate/ba-cypher.json`. For each batch in `batches`, call:

```
mcp__neo4j__write-cypher(
  query  = batch.cypher,
  params = batch.params
)
```

Report progress per batch: `[i/N] {label} rows={len(params.rows)} ok` (or `fail: <msg>`).

On any batch failure:
1. Log the batch index, label, and the Cypher error.
2. Stop execution. The partial graph is idempotent — rerunning after a fix
   will MERGE over the already-written nodes without duplicating.

---

## Phase 5 — Gather live counts

Query Neo4j via `mcp__neo4j__read-cypher` for every node label and
relationship type listed in `audit_ba.py` (keep this in sync — the script
declares canonical lists).

For each node label:
```cypher
MATCH (n:{Label}) RETURN count(n) AS n
```

For each relationship type:
```cypher
MATCH ()-[r:{TYPE}]->() RETURN count(r) AS n
```

Write the results to `.nacl-migrate/ba-live-counts.json`:

```json
{
  "nodes":         {"BusinessProcess": 10, "WorkflowStep": 74, ...},
  "relationships": {"CONTAINS": 10, "HAS_STEP": 74, ...}
}
```

Batch the reads if convenient (single `UNION` query) — the shape of the
output file is the only hard requirement.

---

## Phase 6 — Audit

```bash
python3 "$NACL_HOME/nacl-migrate-ba/scripts/audit_ba.py" \
  --ir .nacl-migrate/ba-ir.json \
  --counts .nacl-migrate/ba-live-counts.json \
  --output .nacl-migrate/ba-audit.json
```

Exit 0 → "All counts match." — migration is clean.
Exit 1 → at least one mismatch. Surface the mismatch list verbatim and ask
the user to investigate before declaring migration complete.

---

## Phase 7 — Report

Write `MIGRATION-REPORT-BA.md` at project root. Template:

```markdown
# BA Migration Report

**Project:** {project_path}
**Adapter:** {adapter}
**Ran at:** {ISO timestamp}

## IR counts vs live Neo4j

| Node label | IR | Live | Status |
| ... | ... | ... | ... |

(Copy the table from ba-audit.json.)

## Relationships

| Type | IR | Live | Status |
| ... | ... | ... | ... |

## Warnings during parse

{list from ba-ir.json warnings[], or "none"}

## Validation

{summary from ba-validation.json: passed/failed, any failures}

## Next steps

- If audit is clean: proceed to `/nacl-migrate-sa` (if SA layer exists)
  or continue to `/nacl-migrate` aggregation.
- If audit has mismatches: investigate each mismatched label via Cypher.
  Rerun after fixes — writes are idempotent.
```

---

## Idempotency

- All Neo4j writes are `MERGE` keyed on canonical IDs; safe to re-run.
- Re-detection and re-parse produce the same IR (modulo timestamps).
- If the adapter or the source Markdown changes and yields a different
  canonical ID for a given source file, the old node becomes orphaned.
  `audit_ba.py` detects this as a count mismatch — investigate rather
  than auto-delete.

---

## Error handling summary

| Situation | Response |
|---|---|
| Prelude can't find `$NACL_HOME` | Stop. Ask user to export `NACL_HOME`. |
| Python < 3.11 | Stop. Ask user to upgrade. |
| Adapter unknown / ambiguous | Stop. Present candidates. |
| Parse warnings | Continue. Surface tally to user. |
| Validation failure | Stop. Print failed checks. |
| Neo4j unreachable | Stop before any write. |
| Individual batch failure | Stop after that batch; partial writes are safe to resume. |
| Audit mismatch | Report. Do not claim success. |

---

## Reads / Writes

### Reads

- `{project}/docs/**/*.md`
- `mcp__neo4j__get-schema` (preflight)
- `mcp__neo4j__read-cypher` (live counts in Phase 5)

### Writes

- `{project}/.nacl-migrate/detect-ba.json`
- `{project}/.nacl-migrate/ba-ir.json`
- `{project}/.nacl-migrate/ba-validation.json`
- `{project}/.nacl-migrate/ba-cypher.json`
- `{project}/.nacl-migrate/ba-live-counts.json`
- `{project}/.nacl-migrate/ba-audit.json`
- `{project}/MIGRATION-REPORT-BA.md`
- `mcp__neo4j__write-cypher` (Phase 4)

---

## Checklist

- [ ] Prelude: `$NACL_HOME` resolved, Python 3.11+ present
- [ ] Phase 0: adapter detected or user supplied
- [ ] Phase 1: IR emitted, zero warnings (or tally surfaced)
- [ ] Phase 2: V1–V10 all pass
- [ ] Phase 3: Cypher plan generated
- [ ] Phase 4: every batch executed via `mcp__neo4j__write-cypher`
- [ ] Phase 5: live counts gathered
- [ ] Phase 6: audit clean
- [ ] Phase 7: `MIGRATION-REPORT-BA.md` written
