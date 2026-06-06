# Release 2.13.2 — `utc-budget-clock`

## Theme

The `/nacl-goal intake` budget clock exists so the transcript-only evaluator can
deterministically stop a run that has genuinely run out of wall-clock. A clock that
silently adds the host's timezone offset to every measurement inverts that safety
property: it stops runs that have budget left. On macOS east of UTC, that is exactly
what happened — a live run with **~26 minutes** of real elapsed reported
`elapsed: 205m` against a 180m Tier-M limit and terminated with a false
`GOAL_BUDGET_EXHAUSTED` / `blocking_reason: wall_clock`.

## Background

`nacl-goal/checks/intake.sh` §3 computes elapsed wall-clock since `budget.json`
`started_at` — a UTC ISO-8601 stamp with a `Z` suffix — through a GNU/BSD `date`
fallback chain:

```bash
started_epoch=$(date -d "$STARTED_AT" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED_AT" +%s 2>/dev/null || echo "")
```

On macOS the GNU branch (`date -d`) fails and the BSD branch (`date -j -f`) runs. In
BSD `date`'s format string the trailing `Z` is a **literal character**, not a timezone
designator — so the UTC stamp is parsed as **local time**. With `TZ=Europe/Moscow`
(UTC+3) `started_epoch` lands exactly 10800 s too early, elapsed is inflated by
+180m, and the wall-clock limit (10800 s) is exceeded the moment the run starts:
26m real + 180m offset = 206m ≈ the observed 205m.

The result-decision logic was fully correct — budget exhaustion legitimately has top
priority. The clock fed it a wrong number. The defect was surfaced by a live run and
recorded per the framework-defect protocol — fixed here at the source rather than
worked around in the consuming project.

## What's fixed

`-u` on both branches of the fallback chain:

- **BSD branch** — `date -j -u -f "%Y-%m-%dT%H:%M:%SZ"` parses the stamp as UTC. This
  is the actual bug fix.
- **GNU branch** — `date -u -d` is semantically unchanged for `Z`-suffixed stamps
  (verified in a debian container: identical epochs with and without `-u` under
  `TZ=Europe/Moscow`); it merely stops depending on host locale.

The fallback ordering is preserved: BSD `date` still rejects `-u -d` (exit 1), so the
GNU→BSD chain degrades exactly as before.

## Regression test

`nacl-goal/checks/tests/test-intake-budget-tz.sh` — self-contained and
cross-platform. It builds a minimal run dir whose `budget.json` mirrors the real
artifact shape with `started_at` exactly 26 minutes in the past — computed via epoch
arithmetic plus UTC-correct formatting on both platforms, so the test itself cannot
replicate the bug under test — then runs `intake.sh` under `TZ=Europe/Moscow` and
`TZ=UTC` and asserts `elapsed: 26m` and `result != GOAL_BUDGET_EXHAUSTED`.

| stage | TZ=Europe/Moscow | TZ=UTC |
|---|---|---|
| RED (un-fixed) | `elapsed=206m`, `GOAL_BUDGET_EXHAUSTED` | `elapsed=26m`, `GOAL_NOT_OK` |
| GREEN — macOS BSD date | `elapsed=26m`, `GOAL_NOT_OK` | `elapsed=26m`, `GOAL_NOT_OK` |
| GREEN — Linux GNU date (debian, docker) | `elapsed=26m`, `GOAL_NOT_OK` | `elapsed=26m`, `GOAL_NOT_OK` |

The test was authored by a separate sub-agent (test-author isolation seam) and
verified RED before the fix was applied.

## What did NOT change

- **The GOAL_PROOF wire format.** Fields, block layout, and the `elapsed:` key are
  untouched — only the epoch computation behind the value changed. No major bump.
- **The result-decision rule.** Budget exhaustion keeps top priority; the limits and
  the `budget.json` schema are unchanged.
- **No `SKILL.md` edits** — the root↔Codex sync gate is not triggered.

## Files

- `nacl-goal/checks/intake.sh` — `-u` on both `date` branches, plus an explanatory
  comment at the parse site.
- `nacl-goal/checks/tests/test-intake-budget-tz.sh` — new cross-platform regression
  test.

No breaking changes — a one-line computation fix plus its regression test.
