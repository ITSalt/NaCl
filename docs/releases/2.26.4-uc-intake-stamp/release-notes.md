# NaCl 2.26.4 — uc-intake-stamp

**The conductor's Phase-4.5 P-S6 reconciliation gate is now non-vacuous: `tl-plan` stamps
`UseCase.intake_id`, so the staleness check over "this intake's UC closure" actually
anchors on something.** The UseCase-side sibling of 2.26.3's `Task.intake_id` fix (DEF-B),
reproduced RED on a disposable Neo4j before the fix and closed GREEN after (PR #34).

## The defect — a dead gate

`nacl-tl-conductor` Phase 4.5 runs six pairwise cross-artifact checks before declaring
`CONDUCTOR COMPLETE`. **P-S6** is the staleness pair: "no node in the intake's UC closure
carries `review_status='stale'`" — i.e. nothing changed upstream (UC / entity / endpoint)
whose dependents were never re-synced. Its assertion anchors on the intake's UCs:

```cypher
MATCH (uc:UseCase {intake_id:$intake})-[:GENERATES|HAS_REQUIREMENT|USES_FORM*0..3]-(n)
WHERE coalesce(n.review_status,'current')='stale'
RETURN count(n)=0
```

But no skill ever wrote `intake_id` to a `UseCase` node — 2.26.3's DEF-B deliberately
scoped its fix to `Task.intake_id`. The anchor `MATCH` therefore matched **zero** UCs,
`count(n)=0` was vacuously true, and P-S6 passed on every batch — including one holding a
genuinely stale, never-re-synced downstream node. A gate that cannot fire is a dead gate.

## The fix — stamp where the Task stamp already lands

The `nacl-tl-plan` Step 2.4 Task MERGE already `MATCH`es the source UC in the same
statement (to link `GENERATES` and clear staleness), with `$intakeId` already resolved by
DEF-B's Configuration Resolution (`--intake` arg → `.tl/conductor-state.json` → null).
One added clause:

```cypher
SET uc.intake_id = coalesce($intakeId, uc.intake_id)
```

- **Optional and null-safe** — a standalone `nacl-tl-plan` run passes `null`; `coalesce`
  keeps any prior value untouched (mirror of the Task-side semantics).
- **Transitively verified** — `$intakeId` is bound once and referenced by both the Task
  and the UC write in the one statement, so the existing Step 2.4b post-write Task check
  proves the UC stamp landed too; no separate UC re-read is needed.
- **Exactly P-S6's closure** — every UC that generates a batch task gets stamped; that set
  *is* "the intake's UC closure" the gate reasons over.
- **P-S6 and `nacl-tl-conductor` are unchanged** — the gate was written correctly; it
  lacked only the stamp it consumes.

### Why `tl-plan`, not `sa-feature`

The obvious candidate — stamp UCs where they are created (`sa-feature`) — has a timing
defect: `sa-feature` runs **before** the conductor exists. The flow is `tl-intake` →
`sa-feature` creates the FeatureRequest + UCs → *then* `nacl-tl-conductor` starts and
mints the `intake_id` in Phase 0. At UC-creation time there is no intake id and no
`.tl/conductor-state.json` to resolve it from. `tl-plan` is the first (and only) skill
that both runs under the conductor with `--intake` and touches every UC in the batch.

## Verification

- `tests/graph/regression-nav-actions-intake.sh` (disposable Docker Neo4j; the Cypher
  under test is extracted from the shipped Step 2.4 fence at run time) gains two cases:
  - `uc-intake-stamp` — **RED** on the pre-fix tree (`uc.intake_id` stays `null` after
    the Step 2.4 run), **GREEN** after the fix;
  - `uc-intake-preserve` — a `null` `$intakeId` must not clobber a UC's prior value
    (green-only coalesce guard).
  All five pre-existing cases (nav-actions matrix + DEF-B's Task stamp pair) stay green
  on both trees.
- **End-to-end, with the verbatim P-S6 assertion:** a stamped UC with a stale downstream
  Task → `count(n)=0` = FALSE (**the gate fires**); an unstamped UC with the same stale
  downstream → TRUE (the old vacuous pass — the defect, demonstrated); a stamped UC with
  a re-synced downstream → TRUE (clean batch passes).

## Scope & compatibility

- Behavioral correction only; no schema or wire-format change. `$intakeId` stays
  optional — standalone planning is untouched, and prior `intake_id` values are never
  clobbered.
- Scope matches DEF-B exactly: the feature/`tl-plan` path. Bug-fix tasks created by
  `tl-fix` still carry no `intake_id`; extending batch provenance to the bug path remains
  a tracked separate follow-up.
- Codex `tl-plan` variant covered by the existing
  `skills-for-codex/sync-exemptions/nacl-tl-plan.md` (principle-level divergence — no
  Step 2.4 procedural detail). `plugin/` and `plugins/nacl/` regenerated; the
  `plugin-manifest` R10 slash-invocation pin is kept frozen (net-new references use the
  no-slash skill-name form).
