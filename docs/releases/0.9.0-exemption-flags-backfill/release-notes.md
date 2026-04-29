# NaCl 0.9.0 — Validation Exemption Flags Backfill

This release closes a methodology gap that became visible immediately after 0.8.0 shipped: validators L4–L7 expect each SA-layer node to carry a small set of exemption properties (`has_ui`, `system_only`, `shared`, `internal`, `field_category`), but the existing skills had no documented way to set them in bulk on already-populated graphs. Projects that grew their graph through `nacl-migrate-sa` (i.e. imported from pre-existing markdown specs) were left with 50–150 false-positive findings on the very first `nacl-sa-validate` run, with no canonical skill path to clean them up.

The fix is a new orchestrator-tier skill, `nacl-sa-flags`, that does exactly one thing: writes validator-only metadata. It is invoked automatically at the tail of `nacl-migrate-sa`, surfaced explicitly in the validator's pre-flight report, and cross-linked from every SA skill that creates the relevant node label.

## Highlights

- **New skill `nacl-sa-flags`** — single, focused entry point for backfilling exemption properties on `:UseCase` (`has_ui`), `:SystemRole` (`system_only`), `:DomainEntity` (`shared`), `:DomainAttribute` (`internal`), `:FormField` (`field_category`). Read commands (`audit`, `--dry-run`), batch writes (`backfill-all`), per-node setters (`set-has-ui`, etc.), and YAML-driven `set-batch` for hand-curated overrides.
- **Auto-backfill after migration.** `nacl-migrate-sa` Phase 7b now invokes `nacl-sa-flags backfill-all --detect-internal` automatically (with a user confirmation prompt). Migrated projects pass `nacl-sa-validate` on first run instead of producing ~50–150 NULL-property findings.
- **Heuristic detection for internal attributes.** Surrogate keys (`id`, `*_id`), timestamps (`*_at`, `created_at`, `updated_at`, `deleted_at`), and secrets (`*_token`, `*_hash`) are auto-flagged as `internal=true`. The heuristic only adds `true` flags — it never overrides `false`, so user-classified attributes are preserved.
- **Cross-references in 4 SA skills.** `nacl-sa-uc`, `nacl-sa-roles`, `nacl-sa-domain`, and `nacl-sa-validate` now document the exemption flags inline at the point where their respective nodes are created or audited, with explicit pointers to `nacl-sa-flags` for backfill.

---

## Added

### `nacl-sa-flags/SKILL.md` (new skill, ~280 lines)

Tier: orchestrator (executes `mcp__neo4j__write-cypher` directly; not delegated to a sub-agent). Model: `sonnet`. Effort: `low`.

**Properties managed** (and the validator that consumes each):

| Property | Node label | Used by |
|---|---|---|
| `has_ui` | `:UseCase` | L5.1 |
| `system_only` | `:SystemRole` | XL8.2 |
| `shared` | `:DomainEntity` | L6.1 |
| `internal` | `:DomainAttribute` | L4.2 |
| `field_category` | `:FormField` | L4.1, L5.4 |

**Commands:**

| Command | Behavior |
|---|---|
| `audit` | Read-only report of how many nodes per label have NULL exemption properties. |
| `backfill-all` | Set NULL properties to safe heuristic defaults. Idempotent — already-set values are not overwritten. |
| `backfill-all --dry-run` | Preview without writing. |
| `backfill-all --detect-internal` | Use opt-in name-pattern detection for `:DomainAttribute.internal`. Recommended after migration. |
| `set-has-ui --uc <id> <true\|false>` | Single-node setter. |
| `set-system-only --role <id> <true\|false>` | Single-node setter. |
| `set-shared --entity <id> <true\|false>` | Single-node setter. |
| `set-internal --attr <id> <true\|false>` | Single-node setter. |
| `set-field-category --field <id> <input\|display\|action>` | Single-node setter. |
| `set-batch <yaml>` | Apply hand-curated overrides from a YAML file. |

**Heuristic defaults for `backfill-all`:**

| Property | Default | Rule |
|---|---|---|
| `:UseCase.has_ui` | derived | `true` if `(uc)-[:USES_FORM]->(:Form)`, else `false`. Deterministic. |
| `:SystemRole.system_only` | `false` | User must opt-in for infrastructure roles. |
| `:DomainEntity.shared` | `false` | User must opt-in for cross-module entities. |
| `:DomainAttribute.internal` | `false` (or pattern-derived with `--detect-internal`) | Auto-detect uses regex `^id$\|_id$\|_at$\|_token$\|_hash$\|^created_at$\|^updated_at$\|^deleted_at$`. |
| `:FormField.field_category` | `'input'` | Default surfaces L4.1 findings for user review. |

**Boundaries** (documented and enforced by skill design):
- No node creation, no edge creation, no domain-property writes.
- No validators are invoked from inside the skill.
- All heuristics are conservative — user's manual overrides are always authoritative.

### `nacl-migrate-sa` Phase 7b — auto-backfill

Inserted between Phase 7 (Audit) and Phase 8 (Report). Default behavior: confirm with user, then run `/nacl-sa-flags backfill-all --detect-internal`. If declined, the migration completes without flags and the user can run the backfill manually later.

---

## Changed

### `nacl-sa-uc/SKILL.md` — `has_ui` parameter on UseCase creation

Phase 4.1 (Create UseCase node) gains a new parameter `$hasUi` (boolean, set during creation):

```cypher
MERGE (uc:UseCase {id: $ucId})
SET uc.has_ui = $hasUi,
    ...
```

Setting it explicitly during creation carries design intent. If forgotten, `nacl-sa-flags backfill-all` derives it from `USES_FORM` after the fact.

### `nacl-sa-roles/SKILL.md` — `system_only` parameter on SystemRole creation

`SET sr.system_only = $systemOnly` added to the SystemRole MERGE. Forgotten flags get backfilled to `false` by `nacl-sa-flags`.

### `nacl-sa-domain/SKILL.md` — `shared` and `internal` parameters

`SET de.shared = $shared` on DomainEntity creation; `SET da.internal = $internal` on DomainAttribute creation. Same backfill story for forgotten flags.

### `nacl-sa-validate/SKILL.md` — pre-flight references to `nacl-sa-flags`

The "Step 0c: Verify exemption properties are populated" section now points the user explicitly to `nacl-sa-flags audit` / `backfill-all --detect-internal` / `validate full` as the canonical fix path.

---

## Motivation

The 0.8.0 release added Level 7 (FeatureRequest Consistency) to `nacl-sa-validate` and clarified that the validator depends on exemption properties to skip false-positive findings. Within hours of 0.8.0 shipping, two operator scenarios surfaced the missing piece:

1. **Post-migration first run.** A project's graph was imported via `nacl-migrate-sa` from existing markdown specs. The first `nacl-sa-validate full` returned 0 CRITICAL but 168 INFO findings on `:DomainAttribute` not referenced by any FormField — almost all of them legitimate system attributes (timestamps, FKs, hashes, telemetry IDs). The validator was correct. The data was correct. But there was no documented skill command to mark them `internal=true` short of hand-writing Cypher.

2. **Backfill via direct MCP write.** The orchestrator-side fix turned out to be straightforward — five Cypher MERGEs setting flags by node label — but it bypassed the skill family. A self-aware operator flagged this as "violating the strict reading of CLAUDE.md (never write outside a skill)" and asked for a sanctioned path. They were right: the methodology should have a home for this work.

The diagnosis: exemption flags are validator-only metadata, conceptually different from the domain semantics owned by `nacl-sa-uc` / `nacl-sa-roles` / `nacl-sa-domain`. Mixing the two in the existing skills would have blurred boundaries; carving out a dedicated skill keeps each skill's responsibility narrow.

A secondary observation: every project that runs `nacl-migrate-sa` will produce a "messy first validate" without backfill, by definition. Auto-invoking the new skill at the tail of migration removes that friction permanently.

---

## Upgrading

For projects already on NaCl 0.8.x:

### 1. Run an audit to see scope

```
/nacl-sa-flags audit
```

Output is a per-label table of how many nodes have NULL exemption properties. Use this to gauge whether you need a one-time backfill.

### 2. Backfill missing flags

```
/nacl-sa-flags backfill-all --detect-internal
```

Idempotent. Safe to re-run. After this, run `nacl-sa-validate full` and triage real findings rather than NULL-property noise.

### 3. Refine selectively

`backfill-all` uses conservative defaults. Walk through the post-backfill `nacl-sa-validate` output:

- L6.3 lists cross-module RELATES_TO edges → mark intentionally-shared entities with `set-shared --entity <id> true`.
- XL8 (or its equivalent in your project) flags BA roles missing SA mapping → mark infrastructure-only roles with `set-system-only --role <id> true`.
- L4.2 lists attributes still flagged as not-referenced-by-form → mark provider/telemetry columns with `set-internal --attr <id> true`, or use `set-batch` for many at once.

### 4. No changes to existing skill invocations

`nacl-sa-uc`, `nacl-sa-roles`, `nacl-sa-domain`, `nacl-sa-ui`, `nacl-sa-validate`, `nacl-migrate-sa` keep their CLIs. Phase 4.1 of `nacl-sa-uc` and the SystemRole/DomainEntity/DomainAttribute MERGEs in their respective skills now accept extra optional parameters; missing parameters fall back to the same defaults `nacl-sa-flags backfill-all` uses, so old call sites continue to work.

### 5. Migration users — no manual step

Projects that run `nacl-migrate-sa` after upgrading get the backfill automatically at Phase 7b. Decline the prompt only if you want to perform exemption work by hand for some methodological reason.

---

## Known limitations

- **`set-batch` is YAML-driven** but the skill does not include a schema validator yet. A malformed YAML file will fail with a Cypher parameter error rather than a friendly schema message.
- **`field_category` heuristic is minimal.** The skill does not auto-detect `display` or `action` from field names — those subcategories are too project-specific. The user runs `set-field-category` on the small subset that needs overrides.
- **Auto-detect for `internal` is opt-in.** By default, `backfill-all` sets every NULL `internal` to `false` so the validator surfaces them; `--detect-internal` flips on the regex-based auto-flagging. The conservative default is intentional.
- **No bulk delete of stale flags.** If a project decides to remove exemption properties wholesale (e.g., to re-classify from scratch), it must do so via direct Cypher. The skill does not expose `clear-all`.
