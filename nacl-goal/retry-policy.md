# /nacl-goal retry policy

When the `intake` alias hits a transient failure during the autonomous
loop, the wrapper retries before giving up. When it hits a deterministic
failure, it never retries — re-running won't change the outcome.

This file is the closed contract for which is which.

---

## Retry-on-transient operations

| Operation | Failure class | Retry behavior |
|---|---|---|
| `gh pr view --json ...` | network error, 5xx, rate-limit retry-after | 3 attempts, backoff 5s / 15s / 45s |
| `gh pr list --head <branch>` | network error, 5xx | 3 attempts, backoff 5s / 15s / 45s |
| `gh run watch <run_id>` | disconnect mid-stream, timeout, transient API failure | reconnect 3× with backoff; if all fail, treat the underlying CI run status as authoritative (re-query with `gh run view`) |
| `gh run view <run_id> --json ...` | network error, 5xx | 3 attempts, backoff 5s / 15s / 45s |
| `curl <deploy.staging.url><health_endpoint>` | 502, 503, 504, connection timeout, DNS timeout | 3 attempts, backoff 5s / 15s / 45s; `-m 5` per attempt |
| `curl <deploy.staging.url><version_endpoint>` | same as health | same |
| `flock` on `index.lock` | EWOULDBLOCK / timeout 30s | NOT retried automatically — surface as `PLAN_BLOCKED_INDEX_LOCK_BUSY` for the user to retry |

Each retry attempt MUST be logged to `progress.jsonl`:

```jsonl
{"ts":"...","kind":"retry","op":"gh_pr_view","attempt":2,"backoff_seconds":15,"prior_error":"..."}
```

The terminal failure after exhausting retries promotes to whichever
`GOAL_BLOCKED_*` matches the operation:

| Operation exhausted | Block code |
|---|---|
| `gh pr view` / `gh pr list` / `gh run view` (all 3 failed) | `GOAL_BLOCKED_CI_FAILED` (with sub-reason `"gh_api_unavailable"`) |
| `gh run watch` reconnect failed and `gh run view` also failed | `GOAL_BLOCKED_CI_FAILED` |
| `curl` to health endpoint | `GOAL_BLOCKED_STAGING_UNHEALTHY` |
| `curl` to version endpoint | `deployed_sha_matches: n/a` — falls back to functional verify per success-condition contract |

---

## Never-retry operations

These are deterministic failures. Re-running produces the same outcome.
Retrying wastes time and may mislead the evaluator into thinking the
issue was transient.

| Operation | Reason |
|---|---|
| Test runner exit code (red baseline, red post-fix, regression diff) | Red is red; the code doesn't change between attempts |
| `gh` auth denied / 401 / 403 | Credential problem; needs user intervention |
| `git rev-parse HEAD` | Local read; can't be flaky |
| Branch drift (head_sha != goal_final_sha) | Reflects on-disk state; another retry would see the same divergence |
| Deployed-SHA mismatch (staging serves a different SHA than the PR head) | Reflects external state; retrying would only succeed if a redeploy happened, which the wrapper does not trigger |
| `hard_refuse_triggers` detected in classify step | Plan-time refusal; the goal didn't change |
| Regression diff non-empty after deliver | Real regression; retrying without a fix would not change the test outcome |
| YAML parse errors on internal artifacts | Schema bug or disk corruption; both need investigation, not retry |

For never-retry failures, the wrapper:

1. Records the failure in `progress.jsonl` once (`kind: "deterministic_failure"`)
2. Updates the index entry to the appropriate terminal state with
   `resumable: false`
3. Emits the user-facing block code

---

## Backoff implementation

```python
BACKOFFS = [5, 15, 45]   # seconds; 3 attempts total

for attempt in range(len(BACKOFFS) + 1):
    try:
        return op()
    except TransientError as e:
        if attempt == len(BACKOFFS):
            raise ExhaustedRetries(op, attempts=len(BACKOFFS) + 1, last=e)
        time.sleep(BACKOFFS[attempt])
        log_event("retry", op=op.name, attempt=attempt + 1,
                  backoff_seconds=BACKOFFS[attempt], prior_error=str(e))
```

The total worst case is `5 + 15 + 45 = 65` seconds added to the operation
on full exhaustion. The wrapper accounts for this in its wall-clock budget
calculations (steps 8 and onward verify `budget.json.wall_clock_limit_seconds`
hasn't been exceeded).

---

## What counts as "transient" per operation

The classification is conservative — if in doubt, treat as deterministic
and surface to the user. False positives in the retry path waste time and
can hide real issues (e.g. an auth problem that looks superficially like
a 5xx).

### `gh` CLI operations

`gh` exits non-zero for many distinct conditions. Transient classification:

```
exit code 1 with stderr containing one of:
  "Could not resolve host"
  "HTTP 502"
  "HTTP 503"
  "HTTP 504"
  "secondary rate limit"
  "abuse detection"
  "timeout"
  "EOF"
  "connection reset"
  "operation timed out"
```

Anything else (including `HTTP 401`, `HTTP 403`, `HTTP 404`, `not found`,
unauthenticated, "permission denied") is deterministic.

### `curl` operations

```
exit codes treated as transient:
  6   (couldn't resolve host)
  7   (failed to connect)
  18  (partial file)
  28  (operation timeout — -m flag fired)
  35  (SSL connect error — often transient on flaky networks)
  52  (empty reply from server)
  56  (failure receiving network data)
```

HTTP status codes treated as transient when curl exits 0 but the response
is non-2xx:

```
502, 503, 504
408  (request timeout)
429  (too many requests; if Retry-After is present, honor it as the backoff)
```

Everything else (4xx other than 408/429, 5xx other than 502/503/504, 1xx)
is deterministic.

### `gh run watch` specifically

`gh run watch` streams CI events until the run completes. The "transient"
case is the stream disconnecting before completion. The wrapper handles
this by:

1. Catching the disconnect
2. Re-querying `gh run view <run_id> --json status,conclusion` once to see
   if the run finished while the stream was disconnected
3. If still in progress: `gh run watch <run_id>` again, with backoff
4. After 3 watch attempts, fall back to polling `gh run view` every 30s
   until terminal state or budget exhaustion

---

## Adding a retried operation

Adding a new operation to the transient list requires:

1. A real precedent (at least one observed transient failure in the wild)
2. A documented transient signature (exit code + stderr substring, or HTTP
   status code)
3. Confirmation that the operation is idempotent under retry (does NOT
   create side effects on each attempt — e.g. `gh pr create` is NOT
   retry-safe and lives on the never-retry list)
4. A row in the table above

Operations with side effects (creates, updates, pushes) MUST NOT be added
to the retry list — they are by definition not idempotent. The wrapper's
strategy for those is: do them once; on transient failure, surface to the
user.

---

## Why this lives separately from SKILL.md

The retry policy is consulted by many wrapper code paths (CI watch,
staging health, gh API queries, version endpoint probe). Centralizing the
contract here lets implementations import a single retry helper that
encodes the table mechanically, instead of each call site re-deciding
"should I retry this?"

The implementation in 2.10.1 may be a small shell helper or a Python
utility, depending on how `intake.sh` is structured. Either way, the
table above is the spec.
