# NaCl 0.17.0 — Fix Skill: Graph Impact Traversal & Feature Routing Exit

0.15.0 made every dev / verification path consume the same six-status contract
with explicit baseline evidence. What 0.17.0 closes is upstream of that — the
fix skill itself. Two structural gaps remained:

1. **Step 1 (TRIAGE) used keyword UC-name matching as its primary graph probe.**
   A bug touching a shared catalog / table / domain entity whose owner UC has a
   name that did not contain the user's error keywords would silently fall back
   to grep, and the fix would ship without ever looking at the table's read and
   write neighbours in the graph. The graph already had the answer; the skill
   wasn't asking.
2. **Step 5 (FIX DOCS) treated "no docs exist" as license to create a minimal
   inline specification.** In practice this turned the fix skill into a feature
   factory: requests for whole missing features ("button is missing", "endpoint
   doesn't exist") would be diagnosed as L3, the user would say "yes, implement
   fully", and the skill would inject a brand-new UC node into the graph, write
   8 source files, and ship `UNVERIFIED` — bypassing `/nacl-sa-feature`'s impact
   analysis, FeatureRequest artifact, planning waves, and TDD discipline.

After 0.17.0 the fix skill traverses the graph from the touched DomainEntity to
enumerate every neighbour UC (read paths, write paths, refresh / sync neighbours)
before classifying, surveys every data path explicitly in the impact check, and
refuses to implement features inline. Requests whose resolution would require
creating any new code path — new HTTP route, new DB column, new graph entity,
new FE component, new enum transition — exit at Step 3 with a routing report
that names the exact `/nacl-sa-feature` command to run in a fresh session.

The release threads two cross-cutting principles:

1. **The graph is a structural impact map, not a name index.** Step 1 traverses
   `DomainEntity ← CONSUMES | PRODUCES | MUTATES | REFERENCES | AFFECTS_ENTITY ←
   UseCase` and the 2-hop `DEPENDENCY` neighbour set, then unions with the legacy
   keyword UC search as a secondary probe. Every UC returned by the traversal
   appears in TRIAGE; missing the entity is a hard `IMPACT_UNVERIFIED` flag in
   the Step 8 report, not a silent grep fallback.
2. **The fix skill is not a feature factory.** L3 is split into `L3-spec-gap`
   (existing code path, one missing minor spec element — inline OK) and
   `L3-feature` (new code path required — STOP and route). The previous "create
   a minimal specification inline" path is removed; the historical "Bug in area
   with no docs at all" edge case now explicitly routes to `/nacl-sa-feature`.

---

## Why This Release Exists

After 0.15.0 every leaf skill spoke six-status, and every orchestration path
respected it. But the leaf skill that absorbs the most user requests —
`/nacl-tl-fix` — still had two upstream failure modes that no amount of
downstream contract hardening could catch:

- **Graph blind spot.** Step 1's "Graph-enhanced UC search" was a single
  keyword query against `UseCase.name`. A bug that broke a catalog row used by
  three UCs (read, write, refresh) would surface only the one UC whose name
  keyword-matched the error message. The other two were invisible. Impact
  analysis at Step 7.5 ("Other UCs using the same endpoints?") was a two-line
  vibes check, not a structural survey. Migrations that touched the same data
  the catalog re-derives were not flagged; the fix could ship a one-time
  backfill migration without anyone reasoning about the re-derivation path that
  would silently re-introduce the bug on next refresh.
- **Migration silent-skip.** When a fix added a new SQL migration file, the
  skill ran `npm run migrate`, observed exit code 0, and reported
  `Migration applied cleanly`. Drizzle's `meta/_journal.json` (and the
  equivalent in knex / prisma) is the actual source of truth for which
  migration files the migrator picks up — a stray `.sql` file with no journal
  entry was silently skipped while migrate exited 0. The fix would ship,
  the DB rows would be unchanged, and the user would only discover this by
  asking the assistant a follow-up question.
- **L3 feature factory.** The "L3 (Spec-create)" classification was a backdoor.
  A user asking for a missing button (no FE component, no BE endpoint, no UC
  node, no enum transition) would get classified L3, gated by a confirmation
  prompt that offered "implement fully (BE + FE)", and shipped as a "fix" —
  with type assertions, dynamic imports, no FeatureRequest artifact, no
  planning waves, no TDD, and `UNVERIFIED` status because nothing imported
  the brand-new files. The proper skill (`/nacl-sa-feature`) was bypassed
  entirely; the proper planning chain (`/nacl-tl-plan` → `/nacl-tl-dev-be`
  + `/nacl-tl-dev-fe`) was bypassed entirely.
- **Path A / Path B inversion.** A side effect of the feature factory: when the
  fix introduced brand-new files, the Step 6c import grep returned no matches.
  The skill's text was unambiguous ("Otherwise → Path A: a new regression test
  is required"), but agents were misreading "no import found" as "Path B (no
  test needed)" and shipping without TDD coverage.

This release closes all of it.

---

## Per-Skill Changes

### `nacl-tl-fix` (the entire release)

The release is scoped to a single skill. Every change below is to
`nacl-tl-fix/SKILL.md`.

#### Routing preamble (new section at the top of the skill)

**Before:** No guidance at the skill's entry point distinguishing
`/nacl-tl-fix` from `/nacl-tl-intake` for ambiguous requests.

**After:** New `## Routing — When /nacl-tl-fix vs /nacl-tl-intake` section
above `## Your Role`. Explains that Step 1's new graph traversal surfaces all
DomainEntity neighbours of the touched code, and that ambiguous requests
(unclear entity, unclear bug-vs-feature) should run `/nacl-tl-intake` first
for graph-backed disambiguation.

#### Fix Levels table — L3 split

**Before:**

```
| L3 (Spec-create) | No docs exist for this area | Yes, create | SSE protocol, new auth provider, payments |
```

**After:** L3 is split into two distinct classifications with different
handling paths:

```
| L3-spec-gap (inline minor spec)               | Code path exists and works; only a UC node / enum value / minor doc is missing. Fix is < 1 file. | Yes, minor inline addition |
| L3-feature (NOT a fix — route to /nacl-sa-feature) | Code path does NOT exist. The "fix" would require creating new behavior.                       | n/a — exits at Step 3      |
```

A new "Classification criterion for L3" paragraph lists the unambiguous
escalators. If any of the following would be required to resolve the request,
the classification is `L3-feature`, full stop:

- a new HTTP route, GraphQL field, or RPC method
- a new DB column, table, or migration introducing a new schema concept
- a new graph entity (`DomainEntity`, `UseCase`, `Module`, `Enumeration`)
- a new FE page or top-level component
- a new enum transition that the existing state machine doesn't allow

The paragraph closes with: *"L3-feature is not a bug. It is a feature request
that arrived via the wrong skill. The fix skill does NOT implement it."*

#### Step 1 — entity-driven impact traversal

**Before:** A single optional Cypher probe:

```cypher
MATCH (uc:UseCase)
WHERE toLower(uc.name) CONTAINS toLower($keywords)
   OR toLower(coalesce(uc.description, '')) CONTAINS toLower($keywords)
RETURN uc.id, uc.name, uc.detail_status
```

If Neo4j was unavailable or the keyword didn't match a UC name, the skill
silently fell back to grep. Multi-UC blast radius — UCs that read, write, or
sync the same `DomainEntity` — was invisible to this query.

**After:** Three Cypher stages, run via `mcp__neo4j__read-cypher`. Stages 1 and 2
are required when a graph is configured; Stage 3 is a secondary probe.

- **Stage 1 — identify the touched DomainEntity** from the affected file path /
  SQL table / changed column. Substring match against `e.name` and
  `e.physical_name`.
- **Stage 2 — enumerate every UC that reads or writes the entity (1 + 2 hops):**

  ```cypher
  MATCH (e:DomainEntity {id: $entity_id})
  OPTIONAL MATCH (uc:UseCase)-[r:CONSUMES|PRODUCES|MUTATES|REFERENCES|AFFECTS_ENTITY]->(e)
  OPTIONAL MATCH (uc2:UseCase)-[:DEPENDENCY|DEPENDS_ON]->(uc)
  RETURN uc.id, uc.name, type(r) AS role,
         collect(distinct uc2.id) AS depends_on
  ORDER BY uc.id
  ```

- **Stage 3 — keyword UC search** (the original query, kept as a secondary probe
  in case the error message names a UC whose entity isn't yet linked).

Step 1's output table is required to enumerate **every UC returned by Stage 2**,
not just the one whose name keyword-matched. If Neo4j is unavailable or Stage 1
returns no entity match, the Step 8 report includes a hard `IMPACT_UNVERIFIED`
flag so the user sees that traversal was skipped — silent grep fallback is no
longer allowed.

#### Step 3 — L3-feature routing exit

**Before:** Step 3's classification fed straight into Step 4 regardless of the
level. L3 requests entered Step 5 ("FIX DOCS — For L3: Create minimal
specification…") and proceeded through the full workflow.

**After:** Step 3's classification rule applies the L3 escalation criterion
literally, and L3-feature classifications stop the workflow before Step 4. The
skill prints a routing report and exits. The report contains:

- the specific reason (which of the L3-feature escalators applies)
- the affected entities from Step 1 Stage 2 (so the feature skill starts with
  the impact map)
- the verbatim `/nacl-sa-feature "<description>"` command to run in a fresh
  session
- an explanation of why a fresh session is required (the triage state
  contaminates the feature skill's impact analysis)
- the disambiguation path back into `/nacl-tl-intake` if the user believes
  the classification was wrong

No files are written. No graph nodes are created. No code is touched.

An `--force-l3-spec-gap` escape hatch is available for the rare case where
the user genuinely wants to handle a small spec gap inline and Step 3
mis-classified — without the flag, L3-feature always exits.

#### Step 5 — L3-spec-gap subsection (restricted scope)

**Before:** The "For L3 (create new docs)" subsection invited the skill to
create "New protocol doc, New API contract, Mini UC-spec". This was the
inline-spec-creation path that turned the skill into a feature factory.

**After:** Renamed to "For L3-spec-gap (add a missing minor element)". Scope
is restricted to:

- one enum value or one transition added to a single docs file
- one UC node added to the graph via direct Cypher write **only when** the
  route, handler, and component already exist
- one minor doc addition (a paragraph, a row in a table)

A "Forbidden under L3-spec-gap" list explicitly escalates the following back
to L3-feature: creating a new UC alongside new code, inventing a new API
endpoint, adding a new entity/attribute/relationship. If during Step 5 the
agent notices any forbidden item is required, it aborts Step 5, returns to
Step 3, reclassifies as L3-feature, and exits via the routing report.

L3-feature requests never reach Step 5 — they already exited at Step 3.

#### Step 6 — new sub-flow 6M: migration verification

**Before:** When a fix added a SQL migration, the skill ran `npm run migrate`
and treated exit code 0 as proof. Drizzle / knex / prisma manifest awareness
was absent. Silent skips (new `.sql` file with no `meta/_journal.json` entry)
appeared as PASS while leaving the DB rows unchanged.

**After:** New `#### 6M — Migration verification sub-flow` runs whenever the
fix adds or modifies a SQL migration. Three required checks:

- **6M.1 Pre-check: migrator manifest.** A table maps drizzle (`_journal.json`),
  knex (`knex_migrations` DB table), prisma (timestamped directory), and
  custom migrators to their manifests. Drizzle's `meta/_journal.json` is
  inspected before `migrate` is run; missing entries are added by the fix
  before the command executes.
- **6M.2 Run migrate.** Exit code 0 is necessary but not sufficient.
- **6M.3 Post-check: DB state.** An explicit `SELECT` must prove the
  pre-migration condition is now zero rows. Template:

  ```sql
  SELECT COUNT(*) FROM <table> WHERE <condition the migration was supposed to eliminate>;
  ```

  Returning > 0 is `RUNNER_BROKEN`, not `PASS`. The skill returns to 6M.1 to
  investigate the manifest.
- **6M.4 Record in report.** Step 8's "Changes applied" section must include
  a `Migration verification:` block with the manifest registration, the
  exact migrate command, and the post-migration `SELECT` result.

Drives the principle: trust the DB, not the exit code.

#### Step 6c — Path A anchor for brand-new files

**Before:** Path A / Path B was selected purely from the test-file import grep.
Brand-new files added by the fix could not be imported by any existing test, so
the grep returned no matches; the skill's text said "no import → Path A", but
agents misread "no match" as "Path B (no test needed)" and shipped without
a regression test.

**After:** A first anchor is added to Step 6c. If any file the fix is about to
add did not exist in the git tree before the fix (verified via `git ls-files` /
`git status`), the path is `Path A` by definition. A file that did not exist
could not have been imported by any test, so the import grep is meaningless for
it. The closing line of 6c is explicit: *"no import found ⇒ Path A. Never
Path B. Path B requires a positive grep hit on an existing test file."*

#### Step 7.5 — data-flow survey (replaces the two-bullet impact check)

**Before:**

> - Other UCs using the same endpoints/components?
> - Adjacent UCs broken? Check imports, shared types, shared state.

A vibes check, not a survey.

**After:** Five mandatory items the agent must answer in the Step 8 report.
"Not applicable" is a valid answer, but it must be stated, not omitted.

1. **Read paths.** For every UC returned by Step 1 Stage 2 with role
   `CONSUMES` / `REFERENCES`: identify the code file that realizes that read.
   Report: "UC-XXX reads via `<file:line>` — verified no regression."
2. **Write paths.** For every UC with role `PRODUCES` / `MUTATES` /
   `AFFECTS_ENTITY`: identify the writing code and confirm it now produces
   the corrected form. Critical when the fix included a one-time data
   migration — the write path is what would re-populate the table after the
   migration runs.
3. **Refresh / sync / cache / re-derivation.** Explicit prompt: is there any
   code — periodic job, manual button, startup seed, cache rebuild, provider
   list-models call — that re-derives this data from an upstream source? If
   yes, name the file and confirm the upstream source is now correct (not
   just the DB row).
4. **Snapshot vs source-of-truth.** If the change included a SQL migration,
   identify whether the source-of-truth lives in code (hardcoded catalog,
   seed file, config) or in user data. If in code: the migration is a
   one-time backfill and the code change is the durable fix.
5. **Adjacent UCs / shared types.** Standard impact check (imports, shared
   types, shared state) across the UCs identified in Step 1.

If any item 1–4 cannot be answered with a concrete file path and a stated
verification, the fix status downgrades to `UNVERIFIED` in the Step 8 report.
The agent does not silently call `PASS` while neighbours are unexamined.

#### Edge case section — "Bug in area with no docs at all"

**Before:** Three-step recipe — "create Kiro-style bugfix spec → create
MINIMAL specification → recommend `/nacl-sa-uc` for full spec afterward".
The recipe was the same regardless of whether the code path existed or not.

**After:** Rewritten to apply the L3 classification criterion literally.
If the request would require creating any new code path → L3-feature, exit
at Step 3 with the routing report, recommend `/nacl-sa-feature`. If the
code path exists and only a small spec element is missing → L3-spec-gap.
The historical inline-spec-creation pattern is now explicitly forbidden:
*"The fix skill is not a feature factory; `/nacl-sa-feature` is."*

---

## Migration Impact

**Step 1 graph queries change.** Projects with a `graph` section in
`config.yaml` will see Step 1 issue three Cypher queries instead of one:
two new traversal stages from the touched DomainEntity, then the legacy
keyword query as a secondary probe. The TRIAGE table will list every UC that
reads or writes the entity, not just the one whose name keyword-matched the
error message. Projects without a graph see the legacy grep fallback,
flagged as `IMPACT_UNVERIFIED` in the Step 8 report.

**L3 classification semantics change.** Requests that previously classified
as `L3 (Spec-create)` and proceeded to inline spec creation will now
classify as either `L3-spec-gap` (proceeds, restricted scope) or
`L3-feature` (exits at Step 3). The single largest change in operator-facing
behavior: a fix invocation for a missing feature will refuse to implement it
and recommend `/nacl-sa-feature` instead. Workflows that previously relied
on `/nacl-tl-fix` to ship small new features will see the routing-report
exit; either re-invoke through `/nacl-sa-feature` or pass
`--force-l3-spec-gap` if the request is genuinely a minor spec gap.

**Migration fixes now require manifest + DB post-checks.** Any fix that
adds a `.sql` migration file must pass 6M.1 (manifest registration), 6M.2
(migrate runs), and 6M.3 (`SELECT COUNT(*) WHERE <pre-condition>` returns 0).
Silent skips that previously produced `PASS` will produce `RUNNER_BROKEN`
until the manifest is corrected and the DB rows actually change. Operators
using drizzle should expect a `meta/_journal.json` edit alongside the
new `.sql` file.

**Step 6c Path A / Path B selection changes.** Brand-new files force Path A
unconditionally. Workflows that previously relied on the "no import found"
result to skip the regression-test step will now see Path A invoked and a
`/nacl-tl-regression-test` call before any code lands. The fix author still
does not write the test (test-author isolation seam is preserved).

**Step 7.5 produces longer reports.** Fixes that touch shared catalogs,
DB tables, or DomainEntities with multi-UC fan-out will produce Step 8
reports with five explicit data-flow items answered. Reports that omit any
of items 1–4 downgrade to `UNVERIFIED`. Workflows that grep for `PASS`
in the report should keep working — the downgrade is to `UNVERIFIED`, not
to a different headline.

No invocation syntax changed. The only new flag is `--force-l3-spec-gap`,
which is the escape hatch for genuine mis-classifications.

---

## Verification (Manual Scenarios)

These skills are prompt files, not code. Verification is manual; each
scenario describes the expected halt path or downgrade.

### Scenario 1 — bug touching a shared catalog (Step 1 graph traversal)

**Setup:** A graph-enabled project with three UCs that touch the same
DomainEntity: UC-A consumes it (read path), UC-B produces it (refresh
write path), UC-C references it (dispatch path). The user reports an
error from UC-C's surface ("dispatch returns 422 with wrong model
identifier").

**Expected behavior:**
1. Step 1 Stage 1 resolves the DomainEntity from the affected file
   (the dispatcher's catalog adapter).
2. Stage 2 returns three UCs: UC-A, UC-B, UC-C with their roles
   (`CONSUMES`, `PRODUCES`, `REFERENCES`).
3. Stage 3 (keyword) returns at most UC-C (the error message names the
   dispatcher surface).
4. TRIAGE output lists all three UCs, not just UC-C.
5. Step 7.5 enumerates read path, write path, and refresh / sync /
   re-derivation explicitly. Each item gets a concrete file path and a
   stated verification.

**Failure condition:** TRIAGE shows only UC-C; Step 7.5 reports
"Other UCs not affected" without naming UC-A's read path or UC-B's
refresh path; the fix changes the catalog adapter but doesn't open
the refresh service.

### Scenario 2 — request for a missing button (L3-feature routing exit)

**Setup:** User invokes `/nacl-tl-fix "the restart button for failed tasks
is missing"` against a project where: no UC node exists for "restart task",
no POST endpoint exists at `/tasks/:id/restart`, no FE component renders a
restart button, and the task-status state machine has no `failed → queued`
transition.

**Expected behavior:**
1. Step 1 Stage 1 / Stage 2 / Stage 3 finds the `Task` DomainEntity and
   the existing UCs (e.g. task detail view, task cancel) but no UC for
   "restart".
2. Step 2 / Step 3 GAP-CHECK applies the L3 classification criterion.
   Resolution would require creating a new HTTP route, a new FE component,
   and a new enum transition — three of the L3-feature escalators.
3. The skill classifies as `L3-feature` and exits BEFORE Step 4.
4. The routing report is printed:
   - reason: new HTTP route + new FE component + new enum transition
   - affected entities: from Stage 2
   - recommended command: `/nacl-sa-feature "restart failed/timeout task —
     new endpoint, new FE component, enum transition failed|timeout → queued"`
   - explanation of fresh-session requirement
5. No files are written. No UC node is created in the graph. No code is
   touched.

**Failure condition:** the skill announces Step 4 / Step 5 / Step 6 and
proceeds; a new UC node appears in the graph; the user is presented with
a USER GATE asking "implement fully (BE + FE)?"; any new file is written.

### Scenario 3 — migration silent-skip detection (Step 6M)

**Setup:** A drizzle-based project. The fix adds a new file
`migrations/0099_fix_X.sql` (a one-time backfill) but does not register
it in `migrations/meta/_journal.json`. Running `npm run migrate` exits 0
without applying the new file.

**Expected behavior:**
1. Step 6M.1 reads `migrations/meta/_journal.json`, finds no entry for
   `0099_fix_X.sql`, and either registers it (drizzle journal append with
   the next `idx` and matching `tag`) or halts the fix with a precondition
   error if the registration cannot be inferred.
2. Step 6M.2 runs the declared migrate command; exit 0 is captured but
   not treated as sufficient.
3. Step 6M.3 runs the post-check `SELECT`. If the pre-migration condition
   still returns > 0 rows (because the migration was skipped silently
   despite the journal registration), status is `RUNNER_BROKEN` and the
   skill returns to 6M.1.
4. Step 8 report includes the `Migration verification` block with
   manifest registration, exact migrate command, and post-check result.

**Failure condition:** Step 8 reports `PASS` while DB rows still match
the pre-migration condition; the `Migration verification` block is
absent.

### Scenario 4 — brand-new file forces Path A (Step 6c anchor)

**Setup:** The fix is genuinely a small spec gap (L3-spec-gap) that adds
one new utility file `src/utils/normalize-X.ts` plus a tiny touch in an
existing file. No existing test imports `normalize-X.ts` (it didn't exist
before the fix).

**Expected behavior:**
1. Step 6c's first anchor identifies `normalize-X.ts` as a brand-new file
   (not in `git ls-files` before the fix / shows as untracked or newly
   staged).
2. The path is `Path A` regardless of the import-grep outcome.
3. `/nacl-tl-regression-test` is invoked to write a regression test
   covering the new utility against `Path A` semantics (RED before fix,
   GREEN after).
4. The Step 8 report's `Tests > Regression test:` line names the new
   test file path.

**Failure condition:** the skill reports `Path B (no test imports the
file; no regression test written)`, ships without a regression test, and
the Step 8 report reads `RED→GREEN: ✗ no transition observed
(UNVERIFIED)`.

### Scenario 5 — Step 7.5 data-flow survey downgrades to UNVERIFIED

**Setup:** The fix changes a single column in a shared DomainEntity that
Step 1 Stage 2 reported is read by UC-A and produced by UC-B. The agent
opens UC-A's read code and verifies it; the agent does not open UC-B's
producer code.

**Expected behavior:**
1. Step 7.5 item 1 (Read paths) is answered with a concrete file path
   for UC-A.
2. Step 7.5 item 2 (Write paths) is unanswered — UC-B's producer code
   was not opened.
3. The fix status downgrades from `PASS` to `UNVERIFIED` in the Step 8
   report; the headline reads `FIX APPLIED — UNVERIFIED (write path for
   UC-B not surveyed)`.

**Failure condition:** Step 8 reports `PASS` with item 2 absent or
answered as "Other UCs not affected" without naming UC-B's producer.

---

## Known Limitations

- **Graph traversal requires a populated graph.** Projects whose Neo4j
  graph lacks `CONSUMES` / `PRODUCES` / `MUTATES` / `REFERENCES` /
  `AFFECTS_ENTITY` edges will see Stage 2 return empty results. Stage 3
  (legacy keyword search) is still attempted; the Step 8 report carries
  `IMPACT_UNVERIFIED` so the gap is visible. Populating the edges is
  out of scope for this release — the corresponding edges are emitted
  by `/nacl-sa-domain`, `/nacl-sa-uc`, and `/nacl-sa-feature` for new
  work; projects with legacy SA layers can use `/nacl-migrate-sa` or
  manual Cypher to backfill.
- **`L3-feature` exit relies on the agent applying the criterion
  honestly.** The criterion list is unambiguous (new HTTP route, new
  DB column, new graph entity, new FE component, new enum transition),
  but an agent that ignores it can still try to proceed. The
  `--force-l3-spec-gap` flag is an explicit override; without the flag,
  operator-facing guardrails are documentation, not runtime enforcement.
- **6M migrator coverage is drizzle-first.** The manifest pre-check
  table includes knex (DB-table-based), prisma (directory-naming-based),
  and a "custom" fallback that defers to `package.json` `scripts.migrate`,
  but the most tested path is drizzle's `meta/_journal.json`. Projects
  using non-drizzle migrators should expect to confirm the manifest
  check semantics on the first fix that adds a migration.
- **Step 6c new-file detection assumes git.** `git ls-files` and
  `git status` are the source of truth for whether a file existed before
  the fix. Non-git projects (rare) will need to read the anchor as
  "files added in this fix" without the git probe.
- **Routing report is text, not a sub-agent call.** Step 3's exit prints
  the recommended `/nacl-sa-feature` command for the user to run in a
  fresh session — it does NOT spawn an `Agent` sub-call. This is by
  design: the triage state from the fix session would contaminate
  `/nacl-sa-feature`'s impact analysis. Operators wanting automatic
  delegation should chain manually after reading the routing report.
