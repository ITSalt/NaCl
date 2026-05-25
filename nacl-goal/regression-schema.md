# /nacl-goal regression-baseline / regression-postfix schema

The `intake` alias performs a mechanical pre-execution + post-deliver
regression check: capture the set of test IDs that passed before any code
change; capture again after deliver; refuse with
`GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED` if any test that was passing went
to failing or skipped.

This file specifies the shared schema for both snapshots and how the
wrapper extracts stable test IDs from common runners.

For the broader artifact contract see `nacl-goal/plan-lock-schema.md`.

---

## Shared schema

```json
{
  "schema_version": 1,
  "captured_at": "<utc-iso>",
  "command": "<resolved baseline_command>",
  "runner": "vitest|jest|pytest|go|unknown",
  "exit_code": 0,
  "collected_count": 42,
  "tests": {
    "passed":  ["<test-id>", "..."],
    "failed":  ["<test-id>", "..."],
    "skipped": ["<test-id>", "..."]
  }
}
```

- `command`: the exact shell command the wrapper resolved per the baseline
  command source chain (config.yaml → package.json → pyproject → known
  defaults).
- `runner`: the family detected from the command (see Extractors below).
  `unknown` if the command does not match any known family.
- `exit_code`: the runner's process exit code. May be non-zero on red
  baseline runs (which are still recorded; see `BASELINE_RED` semantics).
- `collected_count`: total tests collected by the runner.
- `tests`: three disjoint sets of test IDs.

The two files (baseline and postfix) share this schema exactly. They
differ only in `captured_at`.

---

## `PLAN_BLOCKED_BASELINE_RED` semantics

The baseline gate fires **if and only if**:

```
(exit_code != 0 AND collected_count == 0)
  OR
(collected_count > 0 AND passed_count == 0)
```

That is: a runner that errored out before collecting any tests, OR a
collected suite where literally every test fails.

Pre-existing failures alongside passing tests are STORED but do NOT
refuse. Many real codebases carry historical failures in unrelated areas;
refusing on them would block legitimate fixes in adjacent code.

---

## Mechanical regression diff (post-deliver)

```
let baseline = regression-baseline.json.tests
let now      = regression-postfix.json.tests

new_failures           = now.failed   - baseline.failed
baseline_pass_now_fail = baseline.passed ∩ now.failed
baseline_pass_now_skip = baseline.passed ∩ now.skipped

regressions = new_failures ∪ baseline_pass_now_fail ∪ baseline_pass_now_skip

no_new_regressions = (regressions == ∅)
```

When `regressions` is non-empty, the wrapper:

1. Writes the regression diff to `.tl/goal-runs/<run_id>/regression-diff.json`
   (same schema as a single `tests` block, with `regressions` listed
   under `failed`).
2. Updates `index.json` entry to `state: goal_blocked, resumable: false,
   reason: "GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED"`.
3. Emits the block code to the user with the artifact path.

Note: `(now.passed - baseline.passed)` (newly-passing tests) are NOT
regressions — those are often the regression tests the fix itself added.
The diff intentionally ignores them.

---

## Per-runner test-ID extractors

### pytest

Detection: `command` contains `pytest`, `poetry run pytest`, or `python -m pytest`.

Test ID: pytest `nodeid`.

```
tests/test_foo.py::TestBar::test_baz
tests/test_foo.py::test_top_level
tests/test_param.py::test_with_params[case-1]
```

Extraction: run with `--json-report --json-report-file=<path>` (requires
`pytest-json-report` plugin) and parse `tests[].nodeid` + `tests[].outcome`.
Fallback: parse `pytest -v` text output — match lines like
`tests/test_foo.py::test_bar PASSED`. The plugin path is preferred when
available; the text path is the always-works backup.

### jest

Detection: `command` contains `jest` or `npx jest`.

Test ID: `<test file relative path> > <full test name joined by " > ">`.

```
src/__tests__/foo.test.ts > FooComponent > renders correctly
src/__tests__/foo.test.ts > FooComponent > handles props change
```

Extraction: run with `--json --outputFile=<path>` and parse `testResults[]`
+ each `testResults[].testResults[]` (which has `fullName` and `status`).

### vitest

Detection: `command` contains `vitest`, `npx vitest`, or matches
`scripts.test` in a package.json whose dependencies include `vitest`.

Test ID: same shape as jest (`<file> > <full name>`).

Extraction: run with `--reporter=json --outputFile=<path>`. Same JSON
shape as jest.

### go test

Detection: `command` contains `go test`.

Test ID: `<package path>/<TestName>` or `<package path>/<TestName>/<sub-test name>`.

```
github.com/org/repo/pkg/foo.TestBar
github.com/org/repo/pkg/foo.TestBar/sub_case
```

Extraction: run with `-json` and parse the streaming JSON output (events
with `Action == "pass" | "fail" | "skip"` and `Test != ""`).

### unknown

Detection: `command` does not match any of the above.

Test IDs are NOT extracted. The wrapper sets:

- `runner: "unknown"`
- `tests.passed`, `tests.failed`, `tests.skipped`: empty arrays
- `collected_count`: best-effort from runner stdout (0 if not determinable)
- `exit_code`: as observed

Regression detection falls back to a **best-effort summary-line diff**:

```
no_new_regressions (best-effort) =
  (postfix.collected_count >= baseline.collected_count)
  AND (postfix.tests.passed.length >= baseline.tests.passed.length)   # both empty arrays OK
  AND (postfix.exit_code == 0 if baseline.exit_code == 0 else true)
```

When `runner == "unknown"`, the GOAL_PROOF evidence block MUST include:

```
regression_check_mode: best_effort
```

so the evaluator (and the user) know the regression guarantee is reduced
relative to the stable-ID case.

For runners that DO have stable IDs the field is:

```
regression_check_mode: stable_ids
```

This honest disclosure is required by the success contract — a `GOAL_OK`
result is still possible with `best_effort` mode, but the meaning of
"no new regressions" is weaker and the user should know.

---

## Why test IDs and not test counts

Counts-only comparison would mark a swap (one test newly passing, one
newly failing) as "no regression" because totals match. ID-set comparison
catches:

- A test that flipped from passed → failed (red regression)
- A test that flipped from passed → skipped (silent disable)
- A test that disappeared entirely (was passing, no longer present)

The third case is detected because `(baseline.passed - now.passed)` is
non-empty when a test that used to pass is no longer in the postfix set
at all. Such a test is treated the same as `baseline_pass_now_skip` — a
silent loss of coverage. (Equivalently: it appears in the set difference
`baseline.passed - (now.passed ∪ now.failed ∪ now.skipped)`; the
mechanical diff above subsumes this under `baseline_pass_now_skip`
because the test ID is no longer in any of the three current sets.)

---

## Implementation notes

The wrapper invokes the baseline command twice: once during PRECHECKS
(step 3), once during POST-DELIVER REGRESSION CHECK (step 12). Both
invocations use the same resolved command string (recorded in `command`
field) so the comparison is apples-to-apples.

The wrapper does NOT attempt to re-resolve the command between baseline
and postfix. If the user modifies `scripts.test` mid-run (rare but
possible), the postfix capture honors the new command but the diff
relative to baseline becomes apples-to-oranges. This is treated as user
error; the GOAL_PROOF block discloses `command_drifted: true` and the
diff is best-effort.

Extractor failures (e.g. `pytest-json-report` not installed) fall through
to the next available extraction strategy. If ALL strategies for a
detected runner fail, the wrapper degrades that run to `runner: "unknown"`
and uses summary-line diff (with the `best_effort` disclosure).
