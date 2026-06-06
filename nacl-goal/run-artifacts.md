# /nacl-goal run artifacts and idempotence

How `.tl/goal-runs/` is organized, how the wrapper computes goal fingerprints
for deduplication, how the index lock works, and how the resume contract
behaves across re-invocation.

For per-file schemas see `nacl-goal/plan-lock-schema.md`.

---

## Directory contract

```
.tl/
├── goal-runs/                               # gitignored — wrapper run state
│   ├── index.json                           # fingerprint → run_id
│   ├── index.lock                           # flock target
│   └── <run_id>/                            # one directory per run
│       ├── request.json
│       ├── intake.json
│       ├── plan.lock.json
│       ├── authorization.json
│       ├── budget.json
│       ├── goal-final-sha.txt
│       ├── pr.json
│       ├── pr-body.md
│       ├── progress.jsonl
│       ├── regression-baseline.json
│       ├── regression-postfix.json
│       ├── exceptions.log
│       ├── atoms/
│       │   └── <atom_id>.state.json
│       └── planning/                        # populated only for FEATURE_HEAVY
│           ├── feature-plan.md
│           └── open-decisions.md
└── exceptions/
    ├── EXC-*.yaml                           # human-authored (tracked)
    └── goal-runs/                           # gitignored — wrapper-authored
        └── <run_id>/
            └── EXC-goal-<gate>.yaml
```

Naming conventions:

- `run_id` format: `goal-intake-<utc-iso>-<short-hash>` where `short-hash` is
  the first 8 hex chars of `goal_fingerprint`. Example:
  `goal-intake-2026-05-25T13-40-00Z-a1b2c3d4`.
- `branch` is `feature/goal-<short-hash>` — same short-hash as in `run_id`.
- `atom_id` is `atom-<12-hex>` (see `plan-lock-schema.md` §Atom ID invariant).

All naming is **deterministic from `goal_fingerprint`**. Future `/nacl-goal
status|resume|abort <run_id>` commands (2.10.2+) can therefore be added
without re-spec — they reuse this layout as-is.

---

## Privacy

`request.json` contains user email, the full free-text goal, image refs, and
the project's local path. This is PII and potentially client-confidential.

The wrapper MUST verify both wrapper paths are gitignored **before** writing
any artifact. The privacy precheck (SKILL.md Flow step 0) runs `git
check-ignore` on:

- `.tl/goal-runs/`
- `.tl/exceptions/goal-runs/`

If either is not ignored, the wrapper refuses with
`PLAN_BLOCKED_GOAL_ARTIFACTS_NOT_GITIGNORED` and writes nothing.

The 2.10.1 wrapper does NOT auto-patch `.gitignore`. The user must add the
required lines manually. The refusal message includes the exact lines to
append:

```
# /nacl-goal wrapper run state and PII
.tl/goal-runs/
.tl/exceptions/goal-runs/
```

The `nacl-init/` skill template will carry this snippet in PR2 of the 2.10.1
milestone so projects initialized after 2.10.1 ships inherit it
automatically. Existing projects must opt in.

---

## Goal fingerprint

```
goal_fingerprint = sha256(
    NFC(lowercase(whitespace_collapse(trim(goal_text))))
    || "␟"  // unit separator
    || concat_for_each(image, sha256_of_byte_content(image))
    || "␟"
    || realpath(project_root)
    || "␟"
    || canonical_git_remote_url_origin
    || "␟"
    || effective_target                   // "staging" | "dev-only"
    || branch_segment                     // see below
)

branch_segment =
    ""                                    // branch_mode = new  (pre-2.14
                                          // fingerprints stay byte-identical)
    || "␟" + current_branch_name          // branch_mode = current
```

The `branch_segment` is appended ONLY in `branch_mode=current`: the same
goal text run on two different feature branches is two different runs
(different code under the atoms), so they must not dedup into one
`run_id`. Conversely, two `branch_mode=current` invocations of the same
goal on the SAME branch share a fingerprint and serialize through the
index flock + re-invocation rules, never interleaving commits. In
`branch_mode=new` nothing is appended, so every fingerprint computed by a
pre-2.14 wrapper remains valid.

### Normalization details

- `trim`: strip leading and trailing whitespace per Unicode whitespace class
- `whitespace_collapse`: replace any run of `\s+` (Unicode `\p{White_Space}`)
  with a single ASCII space
- `lowercase`: Unicode-aware lowercase (Python's `str.lower()` semantics)
- `NFC`: Unicode normalization form NFC
- `canonical_git_remote_url_origin`: strip trailing `.git`; normalize
  `git@github.com:org/repo` and `https://github.com/org/repo` to the same
  canonical string `github.com/org/repo`; lowercase host

### Exact-normalized, NOT semantic

The fingerprint is byte-for-byte after normalization. The following all
produce **different** fingerprints:

- `"Fix the key column"` vs `"Fix the keys column"` (one letter)
- `"Fix the key column"` vs `"fix-the-key-column"` (different punctuation;
  hyphens are not whitespace)
- Same goal text with a different image attached
- Same goal text run from a different project directory

This is intentional. Semantic deduplication would mis-identify runs and
hide genuine intent variations. If the user wants a fresh run for a
semantically-equivalent goal, they pass `--new-run`.

---

## Index lock

```
.tl/goal-runs/index.lock      # zero-byte file; flock target only
```

All reads and writes to `index.json` MUST acquire an exclusive flock with
timeout 30s:

```bash
exec 9>.tl/goal-runs/index.lock
flock --exclusive --timeout 30 9 || exit_with PLAN_BLOCKED_INDEX_LOCK_BUSY
# ... read, mutate, atomic-rename ...
flock --unlock 9
```

The 30-second timeout accommodates two parallel `/nacl-goal intake`
invocations under realistic disk and process scheduling without spuriously
refusing. If the second invocation truly hangs, 30 seconds is long enough
to be a real problem that the user should know about.

The `PLAN_BLOCKED_INDEX_LOCK_BUSY` refusal is transient — the user just
retries after the conflicting run exits.

---

## Re-invocation rules

When a user re-invokes `/nacl-goal intake "<same goal>"`, the wrapper
computes `goal_fingerprint` and consults `index.json` under flock:

| Existing entry state | Re-invocation behavior |
|---|---|
| no match | fresh run (normal flow) |
| `init` | RESUME — the previous run never completed step 1 |
| `planned` | RESUME — re-execute from step 6 onward |
| `running` | RESUME — re-execute from the first non-`verified` atom |
| `goal_ok` without `--new-run` | `PLAN_BLOCKED_DUPLICATE_GOAL_USE_NEW_RUN` — print prior PR URL + suggest `--new-run` |
| `goal_ok` with `--new-run` | fresh run with new `run_id`; prior PR is NOT closed by the wrapper |
| `plan_blocked` (any) | never auto-resume; print prior reason + artifact path; require `--new-run` or interactive remediation |
| `goal_blocked` with `resumable: true` | RESUME (e.g. transient CI/staging issue caught the previous run mid-flight) |
| `goal_blocked` with `resumable: false` | print prior reason + path; require `--new-run`. NEVER silently retry — see resumable state table below |
| `failed` with `resumable: true` | RESUME |
| `failed` with `resumable: false` | print prior reason + path; require `--new-run` |

### Resumable state table

| Block code | `resumable` |
|---|---|
| `GOAL_BLOCKED_WIP_COLLISION` | true |
| `GOAL_BLOCKED_BRANCH_DRIFTED_DURING_DELIVER` | false |
| `GOAL_BLOCKED_NEW_REGRESSIONS_DETECTED` | false |
| `GOAL_BLOCKED_ATOM_FAILED` | false |
| `GOAL_BLOCKED_FEATURE_REQUIRES_HUMAN_PRODUCT_DECISION` | false |
| `GOAL_BLOCKED_DEPLOYED_SHA_MISMATCH` | false |
| `GOAL_BLOCKED_CI_FAILED` | false |
| `GOAL_BLOCKED_STAGING_UNHEALTHY` | false |
| `GOAL_BLOCKED_BUDGET_EXHAUSTED` | false |
| All `PLAN_BLOCKED_*` | false |
| Transient interruption (no terminal state) | true |

The principle: resume blindly only when the cause was external (process
crash, transient network) and not a deterministic refusal that already had
human implications. Drift, regressions, and atom failures all require human
eyes before a re-attempt — `--new-run` is the explicit acknowledgment.

`GOAL_BLOCKED_WIP_COLLISION` is the one resumable block code: the user
resolves the file overlap out-of-band (commits or reverts the colliding
uncommitted files — they belong to another agent, so the wrapper never
auto-resolves), then `/nacl-goal resume`. On this resume path the wrapper
re-snapshots `preexisting_dirty_files` from `git status --porcelain`,
rewrites the field in plan.lock.json (atomic rename), appends a
`{"kind":"wip_resnapshotted"}` event to progress.jsonl, and re-runs the
failed atom. This is the ONLY field of plan.lock.json that may change
after LOCK.

---

## `--new-run` caveats

In 2.10.1:

- `--new-run` creates a fresh `run_id`, fresh `<run_id>/` directory, fresh
  branch `feature/goal-<new-short-hash>`, fresh PR.
- It does **NOT** close, label, or comment on the prior PR.
- It does **NOT** delete the prior `.tl/goal-runs/<old_run_id>/` directory.
- It does **NOT** delete the prior `.tl/exceptions/goal-runs/<old_run_id>/`
  YAMLs.
- The user is responsible for closing or abandoning the old PR if applicable.

Auto-close of superseded PRs is a 2.10.2+ improvement.

Important: `--new-run` changes `effective_target` only when the user also
passes `--target=...`. Otherwise the new run's fingerprint differs from the
prior one only by issued-at timestamp baked into `run_id` (the fingerprint
itself is unchanged), so the index entry list grows by one — repeated
`--new-run` invocations over the same goal accumulate entries.

---

## Resume execution path

When step 1 (`INIT_RUN`) detects an existing resumable entry, the wrapper
takes the resume path:

1. Read `plan.lock.json` and `authorization.json` (immutable since the
   original run). Do NOT re-run classification.
2. Read all `atoms/<atom_id>.state.json`. Identify the first atom whose
   `state != "verified"`.
3. Re-export the goal env vars (the resume process is new — env from
   original `/goal` invocation is gone):
   ```
   NACL_GOAL_RUN_ID=<run_id>
   NACL_GOAL_BRANCH=<branch>
   NACL_SHIP_MODE=append
   NACL_GOAL_BUDGET_FILE=<abs path to budget.json>
   ```
4. Append `{"kind":"resume","from_state":"...","first_non_verified":"atom-..."}` to `progress.jsonl`.
5. Skip steps 2-7 (target already resolved, plan already locked, envelope
   already materialized — re-materialization would double-write YAMLs).
6. Resume execution at step 8 (or step 9 if `/goal` is still alive) from
   the first non-verified atom.
7. If `goal-final-sha.txt` exists, the run was interrupted between freeze
   and deliver — skip atom execution and jump to step 10 PRE-DELIVER DRIFT
   CHECK.

A resume that finds all atoms `verified` and `goal-final-sha.txt` present
jumps straight to deliver / observation.

---

## Cleanup

The wrapper does NOT auto-clean any `.tl/goal-runs/<run_id>/` directories.
- Successful runs (`goal_ok`) retain artifacts as audit / reproducibility material.
- Blocked runs retain artifacts as forensics material.
- Index entries are append-only within `index.json` — they are never
  removed by the wrapper.

Users may manually rm-rf old run directories. The index entries become
dangling (they reference a missing path) — `intake.sh` treats a missing run
directory as `GOAL_NOT_OK` with `evidence: "run_artifacts_missing"`.

A future garbage-collection command (`/nacl-goal gc --older-than=30d`) is
out of scope for 2.10.1.

---

## Foreseeable extensions (out of scope for 2.10.1)

The directory layout is designed so the following can be added without
breaking changes:

- `/nacl-goal status <run_id>` — read all artifacts, print a summary
- `/nacl-goal resume <run_id>` — explicit resume by run_id (today: implicit
  via re-invocation with matching fingerprint)
- `/nacl-goal abort <run_id>` — set the index entry to
  `state: failed, resumable: false, reason: "ABORTED_BY_USER"` and clean
  up the wrapper-authored exception YAMLs (audit retained)
- `/nacl-goal gc` — garbage-collect old run directories per policy
- Auto-close superseded PRs on `--new-run`
- Per-project exception-policy file (`.tl/project-exception-policy.yaml`)
  expanding the auto-enabled gate whitelist beyond the global default

None of these require schema changes to existing artifacts.
