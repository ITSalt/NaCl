# NaCl 0.8.0 — FeatureRequest as a graph-canonical artifact

This release closes a methodology gap that quietly degraded every downstream skill in the FR pipeline. `nacl-sa-feature` used to write a markdown artifact and stop there, even though `nacl-tl-conductor`, `nacl-tl-plan --feature`, and `nacl-tl-full --feature` all expected to query a `:FeatureRequest` node in the graph. The mismatch caused a silent fallback to markdown parsing on every feature run — losing graph-based scope resolution, traceability across modules and entities, and Cypher-driven impact analysis.

Alongside the graph-write fix, the FR-id allocator has been hardened against namespace collisions, a new validation level (L7) catches the same class of drift before it propagates, and a long-standing terminology bug in `nacl-sa-feature` (references to `Screen` / `NavigationRoute` labels that never existed in the SA schema) has been removed.

## Highlights

- **`:FeatureRequest` is now graph-canonical.** `nacl-sa-feature` Phase 6 gains Step 6.2bis: a `mcp__neo4j__write-cypher` block that MERGEs the FR node and its `INCLUDES_UC` / `AFFECTS_MODULE` / `AFFECTS_ENTITY` edges. Markdown remains the source of truth for prose; the graph becomes the source of truth for scope.
- **Collision-safe FR-id allocation.** Phase 6.1 was previously a one-line "scan disk and increment." It is now a documented algorithm that scans **disk + graph + all node labels** simultaneously, handles sub-namespaces (`FR-<DOMAIN>-N`), respects the tombstone reservation (`FR-LEG-*`, `FR-LEG-INTAKE-*`), and falls back to an explicit user prompt only if 5 retries fail.
- **New validation level L7 (FeatureRequest Consistency)** in `nacl-sa-validate`, with six checks covering markdown↔graph, edge integrity, edge-kind drift, dangling references, duplicate markdown files, and cross-label id reuse.
- **Tombstone convention.** When historical FR-ids must be retired (because they were reused for different features over time, or because they belong to an obsolete intake-Task pipeline), they are renamed into `FR-LEG-NNN` / `FR-LEG-INTAKE-NNN` and tagged with `legacy_origin`. All edges are preserved (`SET n.id = ...` is non-destructive in Neo4j). Validators automatically exempt tombstones from active-namespace checks.
- **Terminology cleanup in `nacl-sa-feature`.** References to `Screen` and `NavigationRoute` — labels that the SA schema never defined — are replaced with the canonical `Form` / `Component(component_type='navigation')` model. This eliminates a long-standing false-positive warning that misled users into thinking their UI graph was incomplete when it was simply being checked against nonexistent labels.

---

## Added

### Schema — `:FeatureRequest` (`graph-infra/schema/sa-schema.cypher`)

```cypher
CREATE CONSTRAINT constraint_featurerequest_id
  FOR (n:FeatureRequest) REQUIRE n.id IS UNIQUE;

CREATE INDEX index_featurerequest_status     FOR (n:FeatureRequest) ON (n.status);
CREATE INDEX index_featurerequest_created_at FOR (n:FeatureRequest) ON (n.created_at);
```

New relationship types (documented in the schema header):

```
(:FeatureRequest)-[:INCLUDES_UC {kind: 'new'|'modified'}]->(:UseCase)
(:FeatureRequest)-[:AFFECTS_MODULE]->(:Module)
(:FeatureRequest)-[:AFFECTS_ENTITY]->(:DomainEntity)
(:FeatureRequest)-[:RAISES_REQUIREMENT]->(:Requirement)        // optional
```

Documented `:FeatureRequest` properties: `id`, `slug`, `title`, `description`, `status`, `created_at`, `source_skill`, `markdown_path`. Tombstones additionally carry `legacy_origin` and snapshot arrays of their pre-rename outgoing edges.

### `nacl-sa-feature` Phase 6.2bis — persist FR into Neo4j

Markdown still gets created in Step 6.2 (it remains the human-readable source for prose, design decisions, acceptance criteria, code references, and out-of-scope lists). Step 6.2bis additionally executes a parameterized `MERGE` block writing the canonical `:FeatureRequest` node with all four edge classes. A read-back via `mcp__neo4j__read-cypher` verifies the write before the skill reports completion. The Phase 6 checklist now requires both markdown creation and graph confirmation.

### `nacl-sa-feature` Phase 6.1 — collision-safe id allocation

The old single-line "scan disk and increment" rule is replaced with a 6-step algorithm:

1. Determine the target sub-namespace (default unprefixed `FR-NNN`; explicit `--namespace=DOM` for domain sub-namespaces).
2. Collect existing ids from disk via `ls .tl/feature-requests/FR-*.md`.
3. Collect existing ids from the graph **across all labels** via Cypher regex match on `id`.
4. Union the two sets, exclude tombstones (`FR-LEG-*`, `FR-LEG-INTAKE-*`).
5. Compute next id as `max(numeric_suffix(matching_prefix)) + 1`.
6. Cross-label collision check; up to 5 retries if the proposed id is somehow taken; explicit user prompt on failure.

The "all labels" requirement is the load-bearing addition: prior allocators only inspected `:FeatureRequest`, missing legacy `:Task` ids that were generated by older intake pipelines.

### `nacl-sa-validate` Level 7 — FeatureRequest Consistency

Six new checks:

| Check | Severity | What it catches |
|---|---|---|
| **L7.1** | CRITICAL | Markdown FR exists on disk but no `:FeatureRequest` node in graph |
| **L7.2** | CRITICAL | `:FeatureRequest` node has no `INCLUDES_UC` edge (tombstones exempt via `legacy_origin IS NOT NULL`) |
| **L7.3** | WARNING | `INCLUDES_UC` edge has unexpected `kind` value (must be `new` or `modified`) |
| **L7.4** | CRITICAL | `:FeatureRequest` exists in graph but its `INCLUDES_UC` edges resolve to no `:UseCase` (typically a write-time race where UC ids were not yet committed) |
| **L7.5** | CRITICAL | Duplicate `FR-NNN-*.md` markdown files on disk (filesystem check; bash one-liner provided) |
| **L7.6** | CRITICAL | A single `FR-NNN` id used by multiple node labels in the active namespace |

L7.2/L7.4/L7.6 use `legacy_origin IS NOT NULL` and the `FR-LEG-*` prefix as exemption filters; the mandatory-filter table in the validator's pre-amble has been updated accordingly.

The validator's level summary, workflow ASCII diagram, and frontmatter now report L1–L7 instead of L1–L6.

---

## Changed

### `nacl-sa-feature` — UI terminology aligned with the SA schema

Three places in `nacl-sa-feature/SKILL.md` referenced `Screen` and `NavigationRoute` labels:

- The impact-classification table (Step 2.4) had rows `Screens: new` / `Screens: modify`.
- The impact-matrix display (Step 2.6) printed `Screens: [+N new, ~M modified]`.
- The handoff narrative (Step 3f) instructed "Create/update Screen nodes" / "Create/update NavigationRoute nodes".

None of those labels exist in `graph-infra/schema/sa-schema.cypher`. The SA schema models UI as `Form` + `FormField` + `Component`, with navigation handled as `Component {component_type:'navigation', route, roles, menu_order, parent_menu}`. The references have been rewritten to use the canonical model. A short explanatory note now sits inline with the impact table to prevent the same drift from recurring.

The `.tl/feature-requests/FR-NNN-[slug].md` template's impact summary table also had a `Screens` row; replaced with `UI: Forms` and `UI: Components` rows.

---

## Motivation

Two distinct production projects independently surfaced the same root cause:

1. `tl-conductor --feature FR-NNN` was reporting "no `:FeatureRequest` node in Neo4j; falling back to `.tl/feature-requests/FR-NNN.md`" on every feature run. Operators initially treated this as a Neo4j connectivity issue, then realized the node had simply never been written. `nacl-sa-feature` Phase 6 wrote the markdown and stopped.

2. The same operators noticed that `nacl-sa-feature` was printing a confusing warning during Phase 2: "Графовая UI-модель (`Screen`/`NavigationRoute`) в проекте не используется — навигация описана в требованиях UC." The warning was correct in the literal sense (no such labels existed in the graph), but the diagnostic was nonsensical because those labels were never part of the methodology. The skill had been carrying obsolete vocabulary for many releases.

Investigation also surfaced a third class of failure that had been silently accumulating: re-use of `FR-NNN` ids across time. Older intake pipelines wrote `:Task {id: 'FR-NNN'}` into the graph; later, refined `:FeatureRequest` nodes were allocated with the same id by an allocator that only scanned markdown files on disk. Result: two (or three) different shipped features sharing a single id under different labels, and downstream tooling routing to whichever node the query matched first.

This release fixes the writeable side end-to-end and adds validators that detect each failure mode.

---

## Upgrading

For projects already using NaCl on Neo4j 5.x:

### 1. Apply the schema delta (idempotent, one-off)

```cypher
CREATE CONSTRAINT constraint_featurerequest_id
  FOR (n:FeatureRequest) REQUIRE n.id IS UNIQUE;

CREATE INDEX index_featurerequest_status     FOR (n:FeatureRequest) ON (n.status);
CREATE INDEX index_featurerequest_created_at FOR (n:FeatureRequest) ON (n.created_at);
```

If the constraint or indexes already exist (e.g. you applied `graph-infra/schema/sa-schema.cypher` after pulling this release), the `CREATE` statements raise; ignore those errors.

### 2. Run `nacl-sa-validate` and triage L7

```text
/nacl-sa-validate full
```

Common findings on first run after upgrade:

- **L7.1 hits** — markdown FRs without graph nodes. Backfill each by re-running `nacl-sa-feature` Phase 6.2bis manually with parsed metadata (frId, slug, title, description, newUcIds, modifiedUcIds, affectedModuleIds, affectedEntityIds), then verify with the read-back query in the same step.
- **L7.5 hits** — duplicate markdown filenames sharing a `FR-NNN` prefix. Pick a canonical filename for the FR-NNN slot and rename the other(s) into a free id allocated via the new Phase 6.1 algorithm.
- **L7.6 hits** — `FR-NNN` ids used by multiple node labels (typical pattern: legacy `:Task` left over from a pre-`:FeatureRequest` intake pipeline). Resolve by renaming the non-`:FeatureRequest` node into a tombstone namespace (`SET n.id = 'FR-LEG-INTAKE-NNN'`, `SET n.legacy_origin = old_id`). Edges are preserved.

### 3. Optional: retire historical `:FeatureRequest` nodes whose ids have been reused

If pre-0.8.0 your project allocated `FR-NNN` for two different shipped features (one in graph, one in markdown), rename the older graph node into the tombstone namespace:

```cypher
MATCH (fr:FeatureRequest {id: 'FR-NNN'})
SET fr.id            = 'FR-LEG-NNN',
    fr.status        = 'shipped',
    fr.legacy_origin = 'FR-NNN',
    fr.shipped_at    = coalesce(fr.shipped_at, datetime()),
    fr.note          = 'Renamed to free id space; original feature shipped under a different artifact.'
RETURN fr.id;
```

The freed `FR-NNN` slot can then host the canonical node for the markdown-described feature.

### 4. No changes are required to skill invocation patterns

`/nacl-sa-feature`, `/nacl-tl-conductor`, `/nacl-tl-plan --feature`, `/nacl-tl-full --feature` all keep their existing CLIs. The improvements are internal: the first now writes both artifacts, the latter three now find the node in the graph instead of falling back to markdown.

---

## Known limitations

- **L7.5 is a filesystem check**, not Cypher. To wire it into CI alongside the `nacl-sa-validate` Cypher checks, run the bash one-liner from the validator's L7.5 section as a separate step before invoking the skill.
- **The collision-safe allocator** falls back to a documented manual prompt if 5 retries cannot find a free id. This is defensive — in practice it never triggers, since the union of disk and graph ids is sparse in normal operation.
- **Backfilling existing markdowns** into the graph is a manual step. There is no `--backfill` flag on `nacl-sa-feature` yet; operators run the Phase 6.2bis Cypher block themselves with extracted metadata. A dedicated backfill mode is a candidate for the next release.
- **Tombstone semantics are local convention.** Validators recognize `FR-LEG-*` and `FR-LEG-INTAKE-*` because those prefixes are documented in the schema and skill. If a project invents its own tombstone prefix, it must extend the validator filter table.
