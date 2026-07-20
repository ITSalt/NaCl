# Provenance GAP Closure — Runbook

**Version:** Фаза-0 (change-propagation + graph-native decision provenance).
**Primary consumer:** any agent closing the L8/L9 provenance gap on a project
that predates the provenance feature.

---

## Purpose

`nacl-sa-validate` L9 (Decision Provenance) refuses to pass a project whose
`:FeatureRequest` nodes have no linked `:Decision`. Any project created before
the provenance feature has this gap on **every** historical FR. This runbook is
the reproducible procedure that closes it **honestly** — by promoting each FR's
own recorded rationale into a graph-native `:Decision`, never by inventing
rationale and never by blanket-bypassing the gate.

The same procedure applies to every project. It is deterministic and
idempotent: re-running it never duplicates a Decision (MERGE by `DEC-NNN`,
guard on `NOT (fr)-[:IMPLEMENTS]->(:Decision)`).

L8 (Staleness Closure) needs **no** backfill: `review_status` is read with
`coalesce(n.review_status,'current')`, so an un-stamped graph passes cleanly.
Staleness only accrues going forward, as write-skills stamp it.

One **one-time baseline** is required for `nacl-tl-plan` idempotency, though: on a
project upgraded to Фаза 0, no Task carries `planned_from_version`. Without a
baseline the first incremental `tl-plan` run would either over-regenerate every
task (if the detector defaulted absent to "drifted") or silence real drift. Set
the baseline once (idempotent; touches only null tasks, resets nothing):

```cypher
// mcp__neo4j__write-cypher
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NULL
SET t.planned_from_version = coalesce(uc.spec_version, 0)
```

After this, only a real `spec_version` bump or a `review_status='stale'` stamp
marks a task for regeneration.

---

## The pfv-advance contract (who may clear `stale`)

`planned_from_version` (pfv) is the Task-side half of Signal 1: `nacl-tl-plan`
Step 1.5b flags a task as drifted when `uc.spec_version > t.planned_from_version`.
The invariant that keeps Signal 1 honest:

> **Any skill that rewrites a task's `.tl/tasks/` files to match
> `spec_version = N` AND clears that task's `review_status='stale'` flag MUST,
> in the same write, `SET t.planned_from_version = N` on the affected Task
> nodes. A skill that defers file regeneration to the planning skill MUST
> leave both the stale flag and `planned_from_version` alone.**

Clearing the flag without advancing pfv silences Signal 2 while Signal 1 keeps
firing on every future plan run — a permanent false-positive drift that either
churns regeneration or trains operators to ignore the drift report. Advancing
pfv without current files does the opposite: it hides real drift.

Sanctioned clear paths (all bound by the invariant):

| Path | Skill | When |
|---|---|---|
| Plan regen (canonical) | `nacl-tl-plan` Step 2.4 | Every regeneration |
| Fix self-sync (rare) | `nacl-tl-fix` Step 7 | The fix's own change fully re-synced the task's files |
| Emergency reconcile | `nacl-tl-reconcile` Step 3.4b | Reconcile brought the task's files fully current |

Acceptance check (read-only; run after any reconcile or fix self-sync — expect
zero rows):

```cypher
// Tasks whose files claim currency (not stale) but whose provenance lags the spec.
MATCH (uc:UseCase)-[:GENERATES]->(t:Task)
WHERE t.planned_from_version IS NOT NULL
  AND coalesce(uc.spec_version, 0) > t.planned_from_version
  AND coalesce(t.review_status, 'current') <> 'stale'
RETURN uc.id AS uc_id, uc.spec_version AS spec_version,
       t.id AS task_id, t.planned_from_version AS pfv
```

The rest of this runbook is about L9.

---

## The honesty rule (non-negotiable)

L9.3 exists to catch empty/fake rationale. So the backfill MUST draw `rationale`
from the project's own records, in this priority order — and stop at the first
that yields real text:

1. **FR node `description`** — if non-empty. (Modern FRs written by
   `nacl-sa-feature` carry this.)
2. **FR markdown** at `FeatureRequest.markdown_path` — the rationale section plus
   the `Source:` metadata line (the verbatim original `/sa-feature "..."` intent).
   This is recorded rationale, not fabrication. **Match localized headers:** NaCl
   SA/BA artifacts are often written in the project's language, so the section may
   be `## Обоснование` (best — literally "justification"), `## Описание фичи`, or
   `## Feature Description`. Prefer `Обоснование`/justification when present; fall
   back to the description in either language. An extractor that only matches the
   English header will false-flag a localized FR as a grandfather candidate —
   verify the actual headers before grandfathering.
3. **git history** — `git log --follow` of the FR markdown, or of the UCs the FR
   `INCLUDES_UC`, for the commit message that introduced the change.
4. **None recoverable** → do NOT invent. Grandfather the FR (see below). A
   grandfather is honest debt; a fabricated rationale is a lie the gate is built
   to prevent.

---

## Procedure

### Step 1 — Inventory the gap (read-only)

```cypher
// FRs that L9.1 will flag, with the raw material available for rationale
MATCH (fr:FeatureRequest)
WHERE fr.legacy_origin IS NULL
  AND coalesce(fr.status,'') <> 'tombstone'
  AND coalesce(fr.decision_exempt, false) = false
  AND NOT (fr)-[:IMPLEMENTS]->(:Decision)
RETURN fr.id AS id, fr.status AS status,
       (fr.description IS NOT NULL AND trim(coalesce(fr.description,'')) <> '') AS has_desc,
       fr.markdown_path AS md,
       size([(fr)-[:INCLUDES_UC]->(uc) | uc.id]) AS uc_count
ORDER BY fr.id;
```

Bucket the result: how many have `has_desc=true` (track 1), how many have a
readable `md` file (track 2), how many have neither (candidates for git/track 4).

### Step 2 — Backfill recoverable FRs (one first, then bulk)

Verify-before-bulk (mandatory): backfill **one** FR, read the Decision back,
confirm `sa-validate --scope` L9 clears for it and the rationale reads honestly.
Show the sample to the user. Only then batch the rest.

Allocate `DEC-NNN` globally: `MATCH (d:Decision) RETURN max(toInteger(replace(d.id,'DEC-',''))) AS m`.

Per FR (see `nacl-sa-finalize` § "Backfill: FeatureRequests without a Decision"
for the canonical write query): create `:Decision` with `rationale` from Step-1
priority order, `source = "<FR-id> (backfilled from <description|markdown|git>)"`,
`created_by = "nacl-sa-finalize"`, `level = "feature"`; wire
`(:FeatureRequest)-[:IMPLEMENTS]->(:Decision)` and a `JUSTIFIES {role}` edge to
each `INCLUDES_UC` target (`creates` for `kind='new'`, `shapes` for `'modified'`).

### Step 3 — Grandfather the unrecoverable (last resort, visible)

Only for FRs where Steps 1–3 of the honesty rule yielded nothing. Set a
node-level flag (the `nacl-sa-flags` family — pure validator metadata, no domain
semantics):

```cypher
// mcp__neo4j__write-cypher
MATCH (fr:FeatureRequest {id: $frId})
SET fr.decision_exempt = true,
    fr.decision_exempt_reason = $reason,        // e.g. "shipped 2026-03; no description, md, or git rationale"
    fr.decision_exempt_since = datetime()
```

L9.1 skips these; **L9.5 lists them as INFO** so the debt stays visible and can
be retired later when rationale surfaces. Never use a project-wide signed
exception against `sa-validate-critical` to mask L9 — that would also mask real
L1–L7 criticals. The node flag is the calibrated tool.

### Step 4 — Verify

```cypher
// L9.1 must return zero rows
MATCH (fr:FeatureRequest)
WHERE fr.legacy_origin IS NULL AND coalesce(fr.status,'') <> 'tombstone'
  AND coalesce(fr.decision_exempt, false) = false
  AND NOT (fr)-[:IMPLEMENTS]->(:Decision)
RETURN count(fr) AS l91_remaining;   // expect 0
```

Then run `nacl-sa-validate full` and confirm L9 is clean (or only L9.5 INFO for
grandfathered FRs). Spot-check `sa_timeline_of_why` for a UC: the Decisions now
appear in the chronology — the "why, a year later" answer works end-to-end.

---

## Reproducibility across projects

This is a one-time pass per project (idempotent on re-run). Run it:

- after upgrading a pre-provenance project to the Фаза-0 chain (expect L9.1 to
  fire on first `nacl-sa-validate full`, exactly like the strict-mode 2.8
  `project-gap-closure.md` pattern);
- as the `nacl-sa-finalize` backfill sub-step on any project being finalized.

After closure, all *new* changes record their Decision at change time
(`nacl-sa-feature` 6.2ter, `nacl-tl-fix` L2/L3) — the gap does not re-open.
