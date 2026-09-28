# NaCl 2.28.0 — validator-escape-valves

**Two validator warnings that could never go green now have an audited escape valve, and
a migration defect that blanked step descriptions is fixed and made visible.** `L3.8`
gains `ActivityStep.coverage_exempt` and `L13.9` gains `CachePolicy.overlap_accepted`.
Both require a written reason that the validator checks, and both are reported as debt in
pre-flight. `nacl-migrate-sa` stops reading the step-number column of legacy two-column
Main Flow tables as the step description. All three were found while validating
family-cinema, reproduced RED on a disposable Neo4j, and closed GREEN.

## The problem

**1. `L3.8` had no exit.** `L3.8` (WARNING) is the reverse-coverage half of requirement
anchoring: every `System`-actor ActivityStep should be realized by some requirement
(`REALIZED_BY`). After anchoring 383 requirements on family-cinema, `L3.8` reported
202 steps. By the owner's estimate, about 60 of them are pure UI or plumbing steps —
render the list, redirect to the result page, clear `sessionStorage` — that legitimately
realize no rule. The overall verdict turns WARN at 5 warnings. So the only way to reach
PASS was to author a requirement per render step, which is junk that makes the coverage
number meaningless.

**2. `L13.9` fired on intentional layering.** `L13.9` (WARNING) flags two `CachePolicy`
nodes with the same `storage_kind` caching one endpoint, which is usually two
contradictory invalidation contracts. family-cinema's DEC-042 deliberately layers an
in-app Cache API cache over a Service Worker runtime cache, kept apart by distinct cache
names and versioned immutable URLs. L13 was designed with "no exemption properties",
which is right for its structural checks but wrong for a heuristic overlap check. The
project had started writing an ad-hoc `l13_9_accepted` property that no validator reads.

**3. Migrated step descriptions were step numbers.** Legacy UC documents written as
`| Шаг | Актор | Система | Данные |` came out of `nacl-migrate-sa` with descriptions `1`,
`2`, `7a`. The adapter picked the description column by header token, and `Шаг` ("step")
matched first even though it holds the number. The `Актор` column holds the user's
*action text* in this format, not a role, yet it was canonicalized to `actor=User` on every
row. The `Система` column (the system's reaction) was dropped. A second format,
`| # | Актор | Действие | Система |`, produced the description `--` whenever `Действие` was
empty and the content sat in `Система`. Nothing in the validator surfaced any of this.

## How it works

### The escape-valve contract (both valves)

Modelled on `anchor_exempt` (L3.7, 2.21.0):

| | `coverage_exempt` (L3.8) | `overlap_accepted` (L13.9) |
|---|---|---|
| Node | `ActivityStep` | `CachePolicy` |
| Filter in the check | `AND coalesce(s.coverage_exempt, false) = false` | `AND NOT (coalesce(cp1.overlap_accepted,false) = true AND coalesce(cp2.overlap_accepted,false) = true)` |
| Reason property (REQUIRED, non-blank) | `coverage_exempt_reason` | `overlap_accepted_reason` |
| Flag without reason | `L3.9` WARNING | `L13.10` WARNING |
| Debt visibility | Step 0d escape-valve debt (INFO) | Step 0d escape-valve debt (INFO) |
| Classifier rule | `L3.8`: `coverage_exempt === true` | `L13.9`: `overlap_accepted_1 && overlap_accepted_2` |

The rationale: a valve that can be pulled without saying why turns a check into a switch.
The reason is part of the data. Its absence is a finding, and the exempted count is
reported even when the gate is green, so exemption debt cannot accumulate unseen. The
`L13.9` valve needs **both** policies of the pair to accept, because the owner of the
other policy has not agreed to share the surface otherwise. `L13.0–L13.8` keep "no
exemption properties by design".

What qualifies for `coverage_exempt`: rendering data already fetched and validated
elsewhere, navigation after a completed step, and client plumbing. What never qualifies:
anything with a business rule, validation, persistence, an external call, security, or
money. `nacl-sa-uc` sets the flag while authoring, after user confirmation.
`nacl-sa-flags suggest-coverage-exempt` proposes candidates on graphs that are already
populated. It is report-only and never writes.

### The new checks, verbatim

```cypher
// L3.8 -- Severity: WARNING
MATCH (uc:UseCase)-[:HAS_STEP]->(s:ActivityStep)
WHERE s.actor = 'System'
  AND EXISTS { (:Requirement)-[:REALIZED_BY]->(:ActivityStep) }  // opt-in: only after anchoring started
  AND coalesce(s.coverage_exempt, false) = false  // REQUIRED FILTER: durable escape valve
  AND NOT (:Requirement)-[:REALIZED_BY]->(s)
RETURN uc.id AS uc_id, s.id AS step_id,
       coalesce(s.description, '') AS step,
       'System ActivityStep has no realizing requirement (reverse-coverage gap)' AS problem
```

```cypher
// L3.9 -- Severity: WARNING
MATCH (s:ActivityStep)
WHERE coalesce(s.coverage_exempt, false) = true
  AND trim(coalesce(toString(s.coverage_exempt_reason), '')) = ''
OPTIONAL MATCH (uc:UseCase)-[:HAS_STEP]->(s)
RETURN uc.id AS uc_id, s.id AS step_id,
       coalesce(s.description, '') AS step,
       'coverage_exempt=true without coverage_exempt_reason (the L3.8 valve must be justified)' AS problem
```

```cypher
// L13.9 -- Severity: WARNING
MATCH (cp1:CachePolicy)-[:CACHES]->(api:APIEndpoint)<-[:CACHES]-(cp2:CachePolicy)
WHERE cp1.id < cp2.id
  AND coalesce(cp1.storage_kind, '') = coalesce(cp2.storage_kind, '')
  AND NOT (coalesce(cp1.overlap_accepted, false) = true
           AND coalesce(cp2.overlap_accepted, false) = true)  // REQUIRED FILTER: accepted layering
RETURN api.id AS endpoint, cp1.id AS policy_1, cp2.id AS policy_2,
       coalesce(cp1.storage_kind, '') AS storage_kind,
       coalesce(cp1.overlap_accepted, false) AS overlap_accepted_1,
       coalesce(cp2.overlap_accepted, false) AS overlap_accepted_2,
       'Two cache policies with the same storage cache the same endpoint — contradictory invalidation contracts' AS observation
```

`L13.10` mirrors `L3.9` on `CachePolicy.overlap_accepted_reason`. `L3.6b` (INFO) counts,
per UC, step descriptions matching `''`/`-`/`--`/`---`/`—`/`–` or the step-number
pattern `[0-9]+[A-Za-zА-Яа-я]?(\.[0-9]+)*\.?`.

### `L3.8` did not run as written

The shipped `L3.8` fence carried `-- opt-in: only after anchoring started`. `--` is not a
Cypher comment. Neo4j 5.26 rejects the query with `Invalid input …`. An agent following
the skill's own "copy character-for-character" instruction therefore got a syntax error,
not a result. `L3.8` and `L13.9` now use `//`. The same `-- REQUIRED FILTER` annotation is
still present on other checks (L3.7, L4.1, L5.1, L5.4, L6.1, L7.2, L7.4, L9.1) and is
tracked as a separate follow-up, not changed here.

### The migrator fix

`nacl_migrate_core/adapters/inline_table_v1_sa.py`, `_parse_scenario_table`:

- A numbered column (`Шаг` / `#` / `Step` / `№` whose cell is a step number such as `1`,
  `7a` or `2.1`) is never the description. An action column (`Действие` / `Action`) wins
  over a textual `Шаг` column.
- A system-reaction column (`Система` / `System` / `Ответ системы`) switches the table to
  per-row resolution. The user-action cell is `Действие` when present, else the `Актор`
  cell when it holds action text rather than a role tag. A cell is a role tag when it
  canonicalizes to User/System and nothing but role words, `ACT-NN` ids or parentheticals
  remain.

| user-action cell | system cell | actor | description |
|---|---|---|---|
| empty / `—` / `-` / `--` | filled | `System` | system cell |
| filled | empty | `User` (or `System` when the role tag says so) | user cell |
| filled | filled | `User` | `<user> → <system>` |

Tables without a system column keep their previous behavior. The only difference is the
numbered-column guard.

## Upgrading a project

Run these with the project's graph write tool after pulling the skills. They are
idempotent.

**1. Rename an ad-hoc `l13_9_accepted` to `overlap_accepted`** (one line; adjust the
reason-property name if your project used a different one):

```cypher
MATCH (cp:CachePolicy) WHERE cp.l13_9_accepted IS NOT NULL SET cp.overlap_accepted = cp.l13_9_accepted, cp.overlap_accepted_reason = coalesce(cp.overlap_accepted_reason, cp.l13_9_accepted_reason, cp.l13_9_reason) REMOVE cp.l13_9_accepted, cp.l13_9_accepted_reason, cp.l13_9_reason RETURN cp.id, cp.overlap_accepted, cp.overlap_accepted_reason;
```

Then make sure **both** policies of each accepted pair carry the flag and a reason that
cites the Decision (one side is not enough). `L13.10` lists any left without a reason.

**2. Mark pure-plumbing System steps `coverage_exempt`.** List candidates without
writing anything:

```
nacl-sa-flags suggest-coverage-exempt            # whole graph
nacl-sa-flags suggest-coverage-exempt --uc UC-NNN
```

Review the table. Rows marked `review` contain a rule marker and most likely need a
requirement, not a flag. Then apply accepted rows, one reason per step:

```cypher
MATCH (s:ActivityStep {id: $stepId})
WHERE s.actor = 'System' AND trim($reason) <> ''
SET s.coverage_exempt = true, s.coverage_exempt_reason = $reason
RETURN s.id, s.coverage_exempt_reason;
```

or in bulk through `nacl-sa-flags set-batch` with a `coverage_exempt:` map of
`step id → reason`. Re-run `nacl-sa-validate`. `L3.8` should shrink by the flagged steps,
`L3.9` should be empty, and Step 0d shows the exempted count.

**3. Projects migrated from two-column Main Flow tables.** Run `nacl-sa-validate` and read
`L3.6b`. A non-zero count on a UC means its steps came out of the migrator as numbers or
placeholders. Re-run `nacl-migrate-sa` for those UCs with 2.28.0, or rewrite the steps
through `nacl-sa-uc`.

## Verification

| What | Command | Result |
|---|---|---|
| Validator Cypher on a disposable Neo4j 5.26 (fences extracted from the shipped SKILL.md) | `tests/graph/regression-validator-escape-valves.sh` | 8/8 PASS; against the pre-change `nacl-sa-validate/SKILL.md` the first 6 FAIL (L3.8 syntax error, L3.9/L3.6b/L13.10/Step 0d fences absent, L13.9 fires on the accepted pair) |
| Classifier | `node --test nacl-core/scripts/classify-findings.test.mjs` | 17/17; 3 fail against the pre-change classifier |
| Migrator | `cd nacl-migrate-core && python3 -m unittest discover -s tests` | 126/126 (122 existing + 4 new); the new tests fail on the old adapter with `'1' != …`, `'7a' != …`, `'--' != …` |
| Node tool tests (runbook glob) | `git ls-files '*/scripts/*.test.mjs' 'scripts/*.test.mjs' ':!plugin/**' \| xargs node --test` | 533 pass / 0 fail / 7 skipped (baseline 529 / 0 / 7) |
| Codex CI suite | `bash scripts/codex-plugin-ci.sh test:{contracts,codex-skills,claude-isolation,plugin-*,graph-unit,workflow-integration,cli-legacy}` | all VERIFIED / 0 fail |
| Drift + sync gates | `build-plugin --check`, `build-codex-plugin --check`, `check-root-codex-sync.sh`, `check-claude-runtime-unchanged.sh` | all pass |

Everything above ran against fixtures and a disposable graph. **Not yet done:** a live
replay on the family-cinema graph, meaning the upgrade steps above, followed by
`nacl-sa-validate` to confirm that L3.8 drops from 202 by the flagged count and that L13.9
clears for DEC-042.
