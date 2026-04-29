---
name: nacl-sa-flags
model: sonnet
effort: low
description: |
  Backfill validation-exemption properties on SA-layer nodes (has_ui, system_only,
  shared, internal, field_category). Pure validator metadata; no domain logic, no
  new nodes/edges. Designed for projects that were populated before L4–L7 validators
  existed (typical after nacl-migrate-sa) or after manual graph edits left some flags NULL.
  Use when: nacl-sa-validate pre-flight reports many NULL exemption-property nodes,
  after nacl-migrate-sa, or the user says "/nacl-sa-flags".
---

# /nacl-sa-flags --- Validation Exemption Flags Backfill (Graph)

## Purpose

Validators L4–L7 use exemption properties to skip nodes that should not be checked (display-only fields, backend-only UCs, intentionally-shared cross-module entities, infrastructure-only roles, internal/system attributes). Without these flags set, the validator emits false-positive WARN/CRITICAL findings on perfectly correct data.

This skill writes **only** validator-relevant metadata. It does not create new nodes, change relationships, or alter business semantics.

**Shared references:** `nacl-core/SKILL.md`

**Tier:** orchestrator (executes `mcp__neo4j__write-cypher` directly; not delegated to a sub-agent).

---

## Neo4j Tools

| Tool | Usage |
|------|-------|
| `mcp__neo4j__read-cypher` | Audit which nodes have NULL exemption properties |
| `mcp__neo4j__write-cypher` | Set exemption properties |

---

## Properties this skill manages

| Property | Node label | Type | Validator that uses it |
|---|---|---|---|
| `has_ui` | `:UseCase` | boolean | L5.1 (skip backend-only UCs from form requirement) |
| `system_only` | `:SystemRole` | boolean | XL8.2 (skip infrastructure-only roles from BA mapping) |
| `shared` | `:DomainEntity` | boolean | L6.1 (skip intentionally cross-module entities) |
| `internal` | `:DomainAttribute` | boolean | L4.2 (skip system attributes from FormField mapping requirement) |
| `field_category` | `:FormField` | enum: `input`/`display`/`action` | L4.1 (only `input` requires MAPS_TO), L5.4 (only `input` counts toward UC-form coverage) |

---

## Invocation

```
/nacl-sa-flags <command> [args...]
```

### Commands

| Command | Behavior |
|---|---|
| `audit` | Read-only: report how many nodes per label have NULL exemption properties. Run this first to understand scope. |
| `backfill-all` | Set all NULL exemption properties using safe heuristic defaults (see below). Idempotent: properties already set are not overwritten. |
| `backfill-all --dry-run` | Same as `backfill-all` but shows what would be set without writing. |
| `set-has-ui --uc <UC-NNN> <true|false>` | Set on a single UseCase. |
| `set-system-only --role <role-id> <true|false>` | Set on a single SystemRole. |
| `set-shared --entity <ent-id> <true|false>` | Set on a single DomainEntity. |
| `set-internal --attr <attr-id> <true|false>` | Set on a single DomainAttribute. |
| `set-field-category --field <field-id> <input|display|action>` | Set on a single FormField. |
| `set-batch <yaml-or-json-file>` | Apply a hand-curated batch of overrides (see schema below). |

---

## Heuristic defaults for `backfill-all`

These are **safe defaults** — always biased toward "no exemption" so the validator surfaces real issues. The user is expected to refine selectively afterwards via the per-node setters.

### `:UseCase.has_ui`
Derived from edges: `true` if `(uc)-[:USES_FORM]->(:Form)` exists, otherwise `false`. Fully deterministic — backend-only UCs (no form) get `has_ui=false`, UCs with forms get `has_ui=true`.

### `:SystemRole.system_only`
Default `false`. The user must explicitly set `true` for infrastructure-only roles (e.g., `System`, `Worker`, `Cron`). The skill cannot infer this from the graph.

### `:DomainEntity.shared`
Default `false`. The user must explicitly set `true` for entities that are intentionally referenced from multiple modules (e.g., `User`, `Group`). L6.3 already lists cross-module RELATES_TO edges, which is a useful starting point for the user's manual review.

### `:DomainAttribute.internal`
Default `false`, with **opt-in** name-pattern detection. If the user passes `--detect-internal`, the skill marks attributes as `internal=true` whose name matches:

```
^id$ | _id$ | _at$ | _token$ | _hash$ | ^created_at$ | ^updated_at$ | ^deleted_at$
```

Without `--detect-internal`, all NULL `internal` properties are set to `false` (the validator will then surface them, and the user marks selectively). With `--detect-internal`, surrogate keys, FKs, timestamps, secrets, and hashes get auto-flagged. Telemetry and provider-internal columns still need manual marking.

### `:FormField.field_category`
- If `(ff)-[:MAPS_TO]->(:DomainAttribute)` exists → `input`.
- Otherwise → `input` (default; surfaces in L4.1 for user review).

The skill does **not** auto-detect `display` or `action` from name patterns — too project-specific. The user runs `set-field-category` on the small subset that need overrides.

---

## Audit output

`audit` returns a single table:

```text
+-------------------------+--------+-----+---------+---------+
| Property                | Total  | Set | Missing | % Missing |
+-------------------------+--------+-----+---------+---------+
| UseCase.has_ui          | 77     | 19  | 58      | 75%     |
| SystemRole.system_only  | 5      | 0   | 5       | 100%    |
| DomainEntity.shared     | 27     | 1   | 26      | 96%     |
| DomainAttribute.internal| 254    | 0   | 254     | 100%    |
| FormField.field_category| 154    | 154 | 0       | 0%      |
+-------------------------+--------+-----+---------+---------+
```

Run `audit` before `backfill-all` to verify the scope is what you expect.

---

## Cypher queries

### `audit`

```cypher
// mcp__neo4j__read-cypher
RETURN 'UseCase.has_ui' AS property,
       count{ (n:UseCase) } AS total,
       count{ (n:UseCase) WHERE n.has_ui IS NOT NULL } AS set_count,
       count{ (n:UseCase) WHERE n.has_ui IS NULL } AS missing
UNION ALL
RETURN 'SystemRole.system_only' AS property,
       count{ (n:SystemRole) } AS total,
       count{ (n:SystemRole) WHERE n.system_only IS NOT NULL } AS set_count,
       count{ (n:SystemRole) WHERE n.system_only IS NULL } AS missing
UNION ALL
RETURN 'DomainEntity.shared' AS property,
       count{ (n:DomainEntity) } AS total,
       count{ (n:DomainEntity) WHERE n.shared IS NOT NULL } AS set_count,
       count{ (n:DomainEntity) WHERE n.shared IS NULL } AS missing
UNION ALL
RETURN 'DomainAttribute.internal' AS property,
       count{ (n:DomainAttribute) } AS total,
       count{ (n:DomainAttribute) WHERE n.internal IS NOT NULL } AS set_count,
       count{ (n:DomainAttribute) WHERE n.internal IS NULL } AS missing
UNION ALL
RETURN 'FormField.field_category' AS property,
       count{ (n:FormField) } AS total,
       count{ (n:FormField) WHERE n.field_category IS NOT NULL } AS set_count,
       count{ (n:FormField) WHERE n.field_category IS NULL } AS missing;
```

### `backfill-all`

Each block sets only NULL values (idempotent).

```cypher
// mcp__neo4j__write-cypher
// (1) UseCase.has_ui — derive from USES_FORM
MATCH (uc:UseCase)
WHERE uc.has_ui IS NULL
SET uc.has_ui = exists((uc)-[:USES_FORM]->(:Form));
```

```cypher
// mcp__neo4j__write-cypher
// (2) SystemRole.system_only — default false
MATCH (sr:SystemRole)
WHERE sr.system_only IS NULL
SET sr.system_only = false;
```

```cypher
// mcp__neo4j__write-cypher
// (3) DomainEntity.shared — default false
MATCH (de:DomainEntity)
WHERE de.shared IS NULL
SET de.shared = false;
```

```cypher
// mcp__neo4j__write-cypher
// (4a) DomainAttribute.internal — default false (without --detect-internal)
MATCH (a:DomainAttribute)
WHERE a.internal IS NULL
SET a.internal = false;
```

```cypher
// mcp__neo4j__write-cypher
// (4b) DomainAttribute.internal — opt-in heuristic (with --detect-internal)
MATCH (a:DomainAttribute)
WHERE a.internal IS NULL
SET a.internal = (
  a.name = 'id'
  OR a.name ENDS WITH '_id'
  OR a.name ENDS WITH '_at'
  OR a.name ENDS WITH '_token'
  OR a.name ENDS WITH '_hash'
  OR a.name IN ['created_at', 'updated_at', 'deleted_at']
);
```

```cypher
// mcp__neo4j__write-cypher
// (5) FormField.field_category — default 'input'
MATCH (ff:FormField)
WHERE ff.field_category IS NULL
SET ff.field_category = 'input';
```

### Per-node setters

```cypher
// mcp__neo4j__write-cypher
// set-has-ui --uc UC-007 false
MATCH (uc:UseCase {id: $ucId})
SET uc.has_ui = $value
RETURN uc.id, uc.has_ui;
```

(analogous shapes for `set-system-only`, `set-shared`, `set-internal`, `set-field-category`)

---

## `set-batch` — hand-curated overrides

Input format (YAML):

```yaml
has_ui:
  UC-105: false   # cron job — no UI
  UC-602: false   # webhook handler
  UC-704: false   # background worker
system_only:
  role-system: true
shared:
  ent-002: true   # User — referenced from auth, profile, enrollments
  ent-005: true   # Group — referenced from courses, enrollments
internal:
  attr-403: true  # mm_user_id (Mattermost telemetry)
  attr-414: false # name (user-facing)
field_category:
  field-712: display  # attachment chip preview
  field-099: action   # submit button
```

Cypher executor: `UNWIND $overrides AS o MATCH (n {id: o.id}) SET n[o.property] = o.value`.

---

## Workflow

### Typical first-time backfill (after migrate-sa or first L4–L7 run)

```
1. /nacl-sa-flags audit                           # see scope
2. /nacl-sa-flags backfill-all --dry-run          # preview changes
3. /nacl-sa-flags backfill-all --detect-internal  # apply with heuristic
4. /nacl-sa-validate full                         # verify clean
5. /nacl-sa-flags audit                           # confirm 0 missing
```

### Refinement cycle

After `backfill-all`, the next `nacl-sa-validate full` will surface real findings (e.g., L6.3 lists cross-module RELATES_TO edges). Use the per-node setters or `set-batch` to refine:

```
/nacl-sa-flags set-shared --entity ent-002 true
/nacl-sa-flags set-system-only --role role-system true
/nacl-sa-flags set-batch overrides.yaml
```

---

## Boundaries (what this skill does NOT do)

- **Does not create or delete nodes/edges.** If a flag setter would require creating a node, the operation fails with a clear error.
- **Does not touch business properties** (`name`, `description`, `data_type`, `priority`, etc.). Use `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-roles`, `nacl-sa-ui` for those.
- **Does not run validators.** It only sets flags. Run `nacl-sa-validate` separately to see results.
- **Does not infer domain semantics.** All heuristics are conservative defaults; the user's manual override is always authoritative.

---

## Integration points

- **`nacl-migrate-sa`** invokes `backfill-all` automatically after migration completes — see that skill's final phase. This ensures migrated projects pass `nacl-sa-validate` on first run instead of producing 50–100 false-positive findings.
- **`nacl-sa-validate`** pre-flight section reports NULL exemption properties; recommendations point to this skill.
- **`nacl-sa-uc`, `nacl-sa-roles`, `nacl-sa-domain`, `nacl-sa-ui`** create their respective nodes with these flags pre-populated for new work; backfill is only relevant for pre-existing or migrated graphs.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `set-has-ui` reports 0 rows updated | UC id does not exist | Verify with `MATCH (uc:UseCase {id: $ucId}) RETURN uc` |
| `audit` shows `Missing` non-zero after `backfill-all` | New nodes were created between audit and backfill, or schema does not have the property in NULL state | Re-run `backfill-all`; idempotent |
| `nacl-sa-validate` still fails L4.1/L4.2/L5.1/L6.1 after backfill | Default values are too permissive for the project | Use `set-batch` with hand-curated overrides for the specific nodes |
| `backfill-all` fails on ~5.x Neo4j | `count{}` and `exists()` are 5.x-only syntax | The skill targets Neo4j 5.x exclusively; older versions need rewrite |

---

## Output format

After every write, the skill prints a delta summary:

```text
backfill-all results
+-------------------------+----------+
| Property                | Updated  |
+-------------------------+----------+
| UseCase.has_ui          | 58       |
| SystemRole.system_only  | 5        |
| DomainEntity.shared     | 26       |
| DomainAttribute.internal| 254      |
| FormField.field_category| 0 (none missing) |
+-------------------------+----------+

Recommended next: /nacl-sa-validate full
```
