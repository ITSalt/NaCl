# NaCl 2.27.0 — stamp-polarity-and-review-verdict

**A fix no longer tells already-shipped tasks to re-plan, and shipped drift finally has a
way to be closed.** `tl-fix` stamps staleness by task status, `L8` grades the two kinds of
drift separately against a budget, and the release gate's `graph.status` becomes a closed
vocabulary. Reproduced RED on a disposable Neo4j before the fix and closed GREEN after.

## The defect — a stamp with inverted polarity

`nacl-tl-fix` Step 5 stamped every dependent task of an affected UC:

```cypher
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)
SET t.review_status = 'stale', ...
```

No status filter. That query is inherited from `nacl-sa-feature` step 3g, and for
`sa-feature` it is exactly right — a feature changes the spec while the code does not yet
exist, so every dependent task genuinely is a re-planning unit.

**A fix is not a feature.** `tl-fix` changes spec *and* code in one operation and proves it
GREEN before it returns. The affected UC's already-shipped tasks are, by construction,
current. Marking them `'stale'` asks `nacl-tl-plan` for something it cannot do:

- `'stale'` means *this task must be regenerated from the new spec*.
- Re-planning is not applicable to shipped code. `tl-plan`'s shipped-stale path preserves
  dev state and then HALTs asking for a **delta carrier** — a new task to carry the
  difference.
- Fix-origin staleness never has one. The fix **was** the delta, and it already shipped.

So the flags had no reachable exit, and they accrued.

### What that costs, measured

On a live project, a single-file backend fix stamped **17 task-edges** (14 distinct tasks;
the extra 3 came from tasks attached to more than one UC, which spread the flag into
neighbouring UCs). Cumulatively:

| | |
|---|---|
| Flagged tasks | 87 |
| …of them `status=done` | **67 (77%)** |
| Distinct origins | 6, over 11 days |
| Release condition #7 | red continuously throughout |

One UC in that project had 12 tasks; the fix stamped **12 of 12**, six of them `done`.

Every release in that window therefore shipped past the gate — one recording
`"graph": {"status": "skipped", "note": "graph stamping not run in this operator pass"}`
with `exceptions: []` and no baseline. **A gate that blocks everything blocks nothing.**

### The polarity was wrong in both directions

| | before | correct |
|---|---|---|
| Shipped tasks of the fixed UC | stamped `'stale'` → **false positive** (the 67) | current, or a review question |
| Tasks of `DEPENDS_ON` dependent UCs | not stamped — `tl-fix` has no `DEPENDS_ON` arm | genuinely drifted → **false negative** |

This release closes the first half. The second is a tracked follow-up, deliberately
sequenced after it (see below).

## The fix

### 1. Stamp by status

```cypher
OPTIONAL MATCH (uc)-[:GENERATES]->(t:Task)
WITH uc, t, coalesce(t.status, '') IN ['done', 'verified-pending'] AS shipped
SET t.review_status = CASE WHEN shipped THEN 'spec_drift' ELSE 'stale' END,
    t.stale_reason = $reason,
    t.stale_since = datetime(), t.stale_origin = $origin
```

| flag | means | closed by |
|---|---|---|
| `stale` (active tasks) | *this task must be regenerated from the new spec* | `nacl-tl-plan` — unchanged |
| `spec_drift` (shipped tasks) | *shipped code, spec moved under it — does the code still satisfy it?* | a review verdict |

Active-task semantics are untouched. The `spec_version` bump still precedes the stamp, so
Signal 1 stays armed.

### 2. The review verdict — Step 7.5b Arm B

Release condition #7 has always offered "or re-reviewing the flagged nodes" as a way out.
Nothing in the framework could perform it: there was no way to record that a node was
reviewed and found correct, so regeneration was the only exit even when the right answer
was "nothing to do".

Phase A already traverses the UC's impact. It now carries one verdict per shipped task —
the list is bounded (a UC's shipped tasks, typically 6–12) and the judgement is exactly the
one the gate is asking for:

| verdict | meaning | action |
|---|---|---|
| `resynced` | this fix's own code brought it current | folds into Arm A (`$syncedTaskIds`) |
| `still-correct` | the spec moved, but the shipped code already satisfies it | Arm B write |
| `needs-rework` | the shipped code no longer satisfies the new spec | re-stamped `'stale'`, a genuine planning unit |

```cypher
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.id IN $reviewedTaskIds
  AND coalesce(t.review_status, 'current') = 'spec_drift'
SET t.planned_from_version = coalesce(uc.spec_version, 0),
    t.reviewed_by = $decisionId,
    t.reviewed_at = datetime()
REMOVE t.review_status, t.stale_reason, t.stale_since, t.stale_origin
```

Bound by the same pfv-advance invariant as every other sanctioned clear — provenance
advances in the same write, because clearing the flag alone silences Signal 2 while
Signal 1 (`spec_version > planned_from_version`) fires forever. `reviewed_by` /
`reviewed_at` make the close auditable against its `:Decision` instead of being an
untraceable flag removal. The write is guarded on `spec_drift` so a mis-supplied id cannot
silently close un-built work, and it never touches `status`, `commit`, or
`verification_evidence` — **a verdict is not a re-opening.**

Gated on GREEN exactly like Arm A: on any non-green Step 7.3 status, nothing is written. A
`spec_drift` task that receives no verdict is reported as a fix-plan gap, not defaulted.

### 3. L8 becomes proportional

- **`L8.1`** — CRITICAL, now scoped to `'stale'` only.
- **`L8.1b`** (new) — grades the `'spec_drift'` backlog against `config.yaml`
  `validation.spec_drift_budget` (`max_count`, `max_age_days`): **WARNING** within budget,
  **CRITICAL** past either bound.

Treating shipped drift as CRITICAL made the gate red with no reachable green, which is
what trains operators to skip it. Bounding it on both axes means the backlog drains or it
escalates — it can never silently accrue, and it can never block a release on noise.

### 4. `graph.status` is a closed vocabulary

The strict-only rule — no `--skip-*` flag, no inline override, exceptions only — was worth
nothing while an unrecognised status value walked straight through. Only
`pending` | `done` | `blocked` are readable or writable now:

| state | refusal |
|---|---|
| any other value (`skipped`, `warn`, …) | `graph-status-invalid` |
| `blocked` with no signed exception covering `graph-stale`/`stale-downstream` | `graph-skipped-without-exception` |
| `done` with no `baseline` block | `graph-baseline-missing` (unchanged) |

A free-text operator note is not an exception.

Release condition #7 now has two arms: **7a** `stale-downstream` (remedy: `tl-plan`) and
**7b** `spec-drift-backlog` (remedy: the review verdict, which `tl-plan` cannot supply).
Naming the wrong arm sends the operator to a skill that cannot close the finding.
`spec-drift-backlog` is registered in the recognised `affected_gates` set, so it can be
covered by a signed exception like every other gate.

## Evidence

`tests/graph/regression-staleness-stamp-polarity.sh` — 7 cases against a disposable
Docker Neo4j, extracting the Cypher under test from the shipped skill text at run time, so
the matrix cannot drift from the artifact it guards.

Pre-fix RED is specific, not merely "absent":

```
stamp-shipped-drift  FAIL  shipped-stamped-for-replan:done=stale verified-pending=stale
stamp-mixed-uc       FAIL  mixed-uc-wrong:false
verdict-still-correct FAIL verdict-block-missing:no-exit-for-spec_drift
l8-critical-excludes-drift FAIL l8.1-wrong-scope:lists_shipped_drift=true
l8-budget-within     FAIL  l8.1b-fence-missing:no-proportional-gate
```

`stamp-active-stale` passes on both trees — the unchanged-semantics guard. All 7 GREEN
after the fix; the sibling allocator/task-merge harness stays 8/8.

`scripts/tl-fix-stamp-polarity.test.mjs` is the CI-runnable structural half, guarding what
a Cypher harness cannot see: the verdict fence exists exactly once, lives in Phase B after
GREEN, is guarded on `spec_drift`, and mutates no shipped state.

## Compatibility

Behavioural correction; no wire-format change. `review_status` gains a third value and
Tasks gain two optional properties — all read with `coalesce(...)`, so an un-stamped graph
still passes cleanly and no migration or backfill is required.

**Existing `'stale'` flags on shipped tasks are not rewritten by this release.** A project
carrying such a backlog keeps it as-is until a verdict closes each item; `nacl-init` check
H seeds `validation.spec_drift_budget` (25 / 14 days) on projects that lack it, and skills
fall back to those same defaults when the key is absent — a missing budget is never read
as "unlimited".

## Known follow-up

`tl-fix` still lacks the `DEPENDS_ON*1..5` arm that `sa-feature` has, so tasks of dependent
UCs go unstamped when a fix moves their upstream spec — the false-negative half of the same
polarity defect. Deliberately sequenced after this release: closing it *raises* stale
counts, and is only safe once shipped tasks have stopped generating noise.

## Upgrading

| Channel | How |
|---|---|
| Claude Code CLI (symlinks) | `git pull` in the NaCl checkout |
| Claude Code Desktop (plugin) | Settings → Plugins → `nacl` marketplace → Sync → Update; or `claude plugin marketplace update nacl && claude plugin update nacl@nacl` + restart. Verify version 2.27.0 |
