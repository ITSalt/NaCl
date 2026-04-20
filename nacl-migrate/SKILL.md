---
name: nacl-migrate
model: sonnet
effort: medium
description: |
  Orchestrator: migrate an OLD-methodology project (Markdown BA/SA docs) into
  the graph-based nacl-* methodology. Chains nacl-init, nacl-migrate-ba,
  nacl-ba-validate, nacl-migrate-sa, nacl-sa-validate, nacl-tl-diagnose,
  nacl-render (for diff), with user confirmation gates between steps.
  Produces MIGRATION-REPORT.md aggregating all phase reports.
  Use when: migrate project to graph, import old-methodology project, nacl-migrate.
---

# /nacl-migrate — Old-Methodology → Graph Migration Orchestrator

## Role

You orchestrate the one-time migration of a project from the old Markdown-
based BA/SA methodology to the new graph-based `nacl-*` methodology. You do
**not** parse Markdown or write to Neo4j yourself — you delegate to
specialist skills (and the stdlib Python scripts they drive) and enforce
confirmation gates between phases.

This skill is **destructive-adjacent**: it creates `config.yaml`, `.mcp.json`,
`graph-infra/`, spins up Docker containers, and writes to Neo4j. Every gate
is a hard stop requiring user confirmation.

---

## Invocation

```
/nacl-migrate [project_path] [--dry-run] [--skip-ba] [--skip-sa]
              [--skip-render-diff] [--resume-from=<phase>]
```

| Parameter | Required | Description |
|---|---|---|
| `project_path` | No | Project root (default: cwd). |
| `--dry-run` | No | Run all parsing + validation, skip Neo4j writes. |
| `--skip-ba` | No | SA-only project (BA not yet captured). |
| `--skip-sa` | No | BA-only (rare). |
| `--skip-render-diff` | No | Do not regenerate Markdown for comparison. |
| `--resume-from` | No | Phase name (e.g. `sa-migrate`) to resume after fix. |

---

## Prelude — locate NaCl home and verify Python

Run this first on every invocation. Emit messages verbatim on failure.

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

---

## Phases

Each phase is a hard confirmation gate. Print the plan, wait for approval,
execute, verify, then ask before continuing.

### Phase A — Preflight

1. Verify `project_path` exists and is a git repo. Warn if working tree is dirty.
2. Recommend: `git checkout -b migrate-to-graph`.
3. Detect layers:
   - **BA present** if any of `docs/00-context`, `01-business-processes`, `02-business-entities`, `03-business-roles`, `04-business-rules` exist.
   - **SA present** if any `docs/{10–16}-*` or `docs/{00–06}-*` folders exist.
4. Detect adapter (delegate to `detect_ba.py`).
5. Print the migration plan table with skipped vs planned phases.
6. **Gate:** `Proceed with Phase A.5?`

### Phase A.5 — ID pattern preflight (MANDATORY)

Before any parse step runs, scan the project for ID-shaped tokens and
classify them against the adapter-supported whitelist. This catches the
class of regressions where the source repo introduces a new ID convention
(e.g. a letter-prefix `UC-F01` family) that no adapter knows
how to handle yet — without this gate, 100% of UCs/screens silently drop
at parse with no surface signal until audit-time.

Run:

```bash
mkdir -p .nacl-migrate
python3 "$NACL_HOME/nacl-migrate-ba/scripts/preflight_ids.py" \
  --project "$PWD" \
  --output .nacl-migrate/preflight.json
```

Read `.nacl-migrate/preflight.json`. Surface `patterns_found` to the user
as a compact table (the script already prints one). Exit codes:

| Exit | Meaning |
|---|---|
| 0 | All ID tokens map to a known adapter pattern. Continue. |
| 1 | Unknown patterns present. STOP and ask the user. |
| 2 | I/O error. STOP and surface the error. |

If `patterns_unknown` is non-empty, **STOP** and ask the user to either:

1. **Widen an adapter** to cover the unknown patterns (recommended —
   produce an adapter patch + add a fixture and a test under
   `nacl-migrate-core/tests/` before rerunning the orchestrator), OR
2. **Confirm the unknowns are source-data defects** (non-canonical IDs
   in the source docs themselves — e.g. typo prefixes like `KAR-44` in
   `ba_source` frontmatter) and should be ignored for this run.

Do NOT proceed to Phase B until the user responds. Record the user's
choice in `.nacl-migrate/preflight-decision.txt`.

### Phase B — Initialise graph infrastructure

Delegate: **`/nacl-init --from={project_path}`**.

Verify after:
- `config.yaml` exists
- `.mcp.json` exists with a Neo4j MCP entry
- `graph-infra/docker-compose.yml` exists
- Docker container `{container_prefix}-neo4j` is running
- `mcp__neo4j__get-schema` responds

If any check fails, stop.

### Phase C — Migrate BA (skippable)

Skip if no BA layer or `--skip-ba`.

Delegate: **`/nacl-migrate-ba`**. Inherit `--dry-run` / `--adapter` flags if set.

Verify after:
- `MIGRATION-REPORT-BA.md` exists
- `.nacl-migrate/ba-audit.json` shows `summary.blockers == 0`
- BA node counts > 0 in Neo4j (skip this check if `--dry-run`)

### Phase D — Validate BA

Skip if BA skipped.

Delegate: **`/nacl-ba-validate`**. Expect L1–L8 = 0 errors.

Warnings without errors → continue with user acknowledgement.

### Phase E — Migrate SA (skippable)

Skip if no SA layer or `--skip-sa`.

Delegate: **`/nacl-migrate-sa`**. Pass `--no-ba` if BA was skipped in this run.

Verify after:
- `MIGRATION-REPORT-SA.md` present
- `.nacl-migrate/sa-audit.json` clean
- Cross-layer handoff edges match traceability matrix row counts (blocker if mismatch and BA present).

### Phase F — Validate SA

Delegate: **`/nacl-sa-validate`**. Expect L1–L6 = 0 errors; XL1–XL5 cross-validation clean if BA present.

### Phase G — Drift diagnostic

Delegate: **`/nacl-tl-diagnose`**.

Drift is expected when code evolved after the last BA/SA pass — this phase
surfaces it for the user to decide on `/nacl-tl-reconcile` as a follow-up.
It does not block migration.

### Phase H — Render diff (skippable)

Skip if `--skip-render-diff`.

Delegate: **`/nacl-render --output=.nacl-migrate/rendered-docs`**.

Then:
```bash
diff -r docs/ .nacl-migrate/rendered-docs/ > .nacl-migrate/render-diff.txt
```

Summarise: identical / formatting-only / semantic differences. Semantic
differences are the interesting signal for the retrospective gate.

### Phase I — Aggregate MIGRATION-REPORT.md

Write `MIGRATION-REPORT.md` at project root. Include:

- Timestamps and adapter used
- Per-layer source file counts → IR counts → Neo4j counts (must all match)
- Validation results (BA L1–L8, SA L1–L6, cross-layer XL1–XL5)
- Cross-layer edge counts
- Drift summary
- Render-diff summary
- Skipped files with reasons
- Warnings
- **Go/no-go for retrospective gate**

---

## MANDATORY retrospective gate (on canary projects)

Active on the first-in-order canary project. Do not run `/nacl-migrate`
on any further project until the gate completes and the user approves the
retrospective report. Per the migration retrospective gate design:

1. Launch **3 Explore sub-agents in parallel**:
   - BA parity auditor → `BA-AUDIT.md`
   - SA parity auditor → `SA-AUDIT.md`
   - Semantic fidelity auditor → `RENDER-DIFF-AUDIT.md`
2. Orchestrator synthesises → `RETROSPECTIVE.md`.
3. User reviews and approves.
4. Fix blocker defects in the scripts, re-run on the canary, re-audit.

For subsequent projects, a lighter spot-check audit is sufficient unless a
new defect class surfaces.

---

## Reads / Writes

### Reads

- Project docs tree
- Neo4j via MCP (read-only self-audit)

### Writes

- `config.yaml`, `.mcp.json`, `graph-infra/` (via `nacl-init`)
- Neo4j (via delegated skills)
- `.nacl-migrate/*.json` and `.nacl-migrate/rendered-docs/`
- `MIGRATION-REPORT-BA.md`, `MIGRATION-REPORT-SA.md`, `MIGRATION-REPORT.md`

### Delegates to

| Skill | Phase |
|---|---|
| `nacl-init` | B |
| `nacl-migrate-ba` | C |
| `nacl-ba-validate` | D |
| `nacl-migrate-sa` | E |
| `nacl-sa-validate` | F |
| `nacl-tl-diagnose` | G |
| `nacl-render` | H |

---

## Idempotency

All delegated skills are idempotent on their writes. Re-running this
orchestrator is safe — it skips already-configured infra in Phase B and
MERGE-updates Neo4j properties without duplication.

---

## Error handling

- Any gate failure stops the pipeline; the aggregated report is still written up to that point.
- `--resume-from=<phase>` jumps to a named phase, reusing IR files in `.nacl-migrate/` if present.
- Neo4j unreachability stops before any write.

---

## Checklist

- [ ] Prelude: `$NACL_HOME` resolved, Python 3.11+ present
- [ ] Phase A: layer detection done, plan approved
- [ ] Phase A.5: ID-pattern preflight clean (or unknowns explicitly resolved)
- [ ] Phase B: graph infra up, Neo4j reachable
- [ ] Phase C: BA migrated (or skipped by design)
- [ ] Phase D: BA validation clean
- [ ] Phase E: SA migrated (or skipped by design)
- [ ] Phase F: SA validation clean
- [ ] Phase G: drift diagnostic run
- [ ] Phase H: render-diff produced (or skipped)
- [ ] Phase I: MIGRATION-REPORT.md written
- [ ] Retrospective gate triggered if canary
