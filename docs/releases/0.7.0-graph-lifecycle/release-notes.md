# NaCl 0.7.0 — IntakeItem Delivery Lifecycle Tracking

This release closes a methodology gap where `IntakeItem` nodes stayed in `status='draft'` indefinitely after their code landed in production, forcing wave operators to reconcile the graph manually. Two skills now maintain delivery lifecycle state automatically: `nacl-tl-deliver` marks items as delivered after staging health checks pass; `nacl-tl-release` stamps them with the release version after the git tag is pushed.

## Highlights

- **Automatic `IntakeItem` delivery marking:** `nacl-tl-deliver` Step 6 runs after deployment health checks and sets `IntakeItem.status='delivered'`, `delivered_at = date()`, and `delivered_pr = <pr_number>` via `mcp__neo4j__write-cypher`. IntakeItems are now updated at the moment the feature is confirmed live, not retroactively by a human.
- **Release version stamping:** `nacl-tl-release` Step 7 batch-stamps all `IntakeItem` nodes that have `status='delivered'` and no `delivered_in_release` value yet. After every release, the graph accurately records which items shipped in which version.
- **Non-blocking failure tolerance:** both graph write steps are WARN+continue — a Neo4j outage never blocks the CI/CD critical path. The operator is warned and can reconcile later with `/nacl-tl-diagnose`.
- **Skills benchmark harness:** a stdlib-only, reproducible benchmark runner was added to measure skills execution performance. Designed to be article-publishable and video-streamable.

---

## Added

### `nacl-tl-deliver` — Step 6: UPDATE INTAKEITEM GRAPH STATE

Runs after staging health check (Step 5) completes successfully.

**ID resolution priority:**
1. `.tl/conductor-state.json → intakeItemIds` (set by `nacl-tl-conductor`)
2. `.tl/feature-requests/FR-NNN.md` files for the UCs being delivered
3. If no IDs found → skip with warning

**Cypher:**
```cypher
MATCH (i:IntakeItem {id: $intakeItemId})
SET i.status = 'delivered',
    i.delivered_at = date(),
    i.delivered_pr = $prNumber
RETURN i;
```

**Parameters:**
- `$intakeItemId` — from conductor-state or FR file
- `$prNumber` — from `delivery-status.json → ship.pr`

**State:** `delivery-status.json` gains a `"graph"` key with `status`, `updated`, and `skipped` counts.

### `nacl-tl-release` — Step 7: MARK DELIVERED INTAKEITEMS WITH RELEASE VERSION

Runs after the git tag is pushed (Step 6 completes).

**Cypher:**
```cypher
MATCH (i:IntakeItem)
WHERE i.status = 'delivered' AND i.delivered_in_release IS NULL
SET i.delivered_in_release = $version
RETURN count(i) AS updated;
```

**Parameter:**
- `$version` — new release version string (e.g. `"v0.7.0"`)

**State:** `release-status.json → graph` updated with status and updated count.

### `bench/` — Skills Benchmark Harness

Stdlib-only benchmark runner for measuring skills performance:
- Reproducible: fixed seed, N iterations, stated hypotheses
- Article-publishable: outputs structured data suitable for charts
- Video-streamable: dual-terminal layout compatible

---

## Changed

### `nacl-tl-release` — Step renumbering

The former `Step 7: CREATE GITHUB RELEASE` and `Step 8: YOUGILE NOTIFICATION` are now `Step 8` and `Step 9` respectively, after the new `Step 7` (graph lifecycle) was inserted. Resumption Logic and Edge Cases updated to match.

---

## Motivation

Wave 8 of a client project running NaCl found five `IntakeItem` nodes stuck in `status='draft'` despite the corresponding code being merged and live in production:

| ID | Graph status | Actual state |
|---|---|---|
| BUG-001 | `draft` | merged PR #28 |
| BUG-002 | `draft` | merged PR #28 |
| TECH-033 | `draft` | merged PR #29 |
| TECH-034 | `draft` | merged PR #30 |
| FR-026 | `draft` | merged PR #31 |

The operator had to update them manually via `mcp__neo4j__write-cypher`. This release automates what was previously a manual reconciliation step.

---

## Upgrading

No breaking changes. The new graph write steps are **opt-in by execution**: they run only when Neo4j is reachable and IntakeItem IDs can be resolved. If neither condition holds, the skill logs a warning and continues normally.

Projects using `nacl-tl-conductor` to orchestrate task batches will get automatic IntakeItem updates with zero configuration, since `conductor-state.json` is already the primary ID source.

---

## Known limitations

- `nacl-tl-deliver` Step 6 resolves IntakeItem IDs from artifacts written by `nacl-tl-conductor`. Projects that invoke `nacl-tl-deliver` directly without a conductor run will fall back to `FR-NNN.md` file scanning. If neither source is present, the step is skipped with a warning — no delivery is blocked.
- `nacl-tl-release` Step 7 stamps all unversioned delivered IntakeItems in the graph, regardless of which project or wave they belong to. In a shared Neo4j instance hosting multiple projects, this will stamp items from all projects. Scoping by project is planned for a future release.
