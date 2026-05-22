# Release Gate Strict — Fixtures (W4-blocking-release)

These fixtures exercise the six Strict-Only block conditions
introduced by `nacl-tl-release` in W4-blocking-release, plus the
signed-exception lifecycle (valid vs expired).

## Layout

```
release-gate-strict/
├── README.md                              # this file
├── project-alpha-blocked/               # synthetic project hitting 4 of 6 conditions
│   ├── config.yaml                        # project_kind: standard; direct strategy (deliberately invalid)
│   ├── .tl/
│   │   ├── release-status.json            # snapshot at Step 0 (mid-prelude)
│   │   ├── tl-sync-verdict.json           # upstream verdict: UNVERIFIED
│   │   ├── tl-qa-aggregate.json           # upstream aggregate: UNVERIFIED
│   │   ├── sa-validate-report.json        # FAIL + CRITICAL findings
│   │   └── graph-baseline-stale.json      # baseline that no longer matches live graph
│   └── expected/
│       └── release-refusal.txt            # exact RELEASE HALTED headline + workflow detail
├── exceptions/                            # signed-exception lifecycle
│   ├── EXC-2026-05-22-valid-graph-stale.yaml      # in-window; overrides graph-stale
│   ├── EXC-2025-12-01-expired-graph-stale.yaml    # expired; treated as ABSENT
│   ├── EXC-2026-05-22-blanket-rejected.yaml       # affected_gates=["*"] — rejected at load
│   └── EXC-2026-05-22-prototype-on-standard.yaml  # skipped-pr gate on standard project — rejected
└── expected/
    └── gate-evaluation.md                 # per-condition expected verdict for the fixture project
```

## What the project-alpha-blocked fixture hits

| # | Condition | Hit? | Source |
|---|---|---|---|
| 1 | Upstream `tl-sync` UNVERIFIED | YES | `.tl/tl-sync-verdict.json` → `verdict: "UNVERIFIED"` |
| 2 | Upstream `tl-qa` UNVERIFIED | YES | `.tl/tl-qa-aggregate.json` → `aggregate: "UNVERIFIED"` (LIVE_PROVIDER_SMOKE = NOT_RUN, mandatory for UC-200) |
| 3 | Graph staleness | YES | `.tl/graph-baseline-stale.json` records 970 nodes; live capture (simulated by the test harness) returns 1083 — exact Project-Alpha delta |
| 4 | `/nacl-sa-validate` FAIL with CRITICAL | YES | `.tl/sa-validate-report.json` → `status: "FAIL"`, `critical_count: 1`, `warning_count: 156` (the canonical Project-Alpha shape) |
| 5 | Missing PROD_GOLDEN_PATH evidence | YES | `.tl/tl-qa-aggregate.json` → `qa-stage:prod-golden-path: NOT_RUN` on UC-200 (matrix marks it mandatory) |
| 6 | PR/CI skipped without prototype + exception | YES (skipped-pr & skipped-ci) | `config.yaml` declares `project_kind: standard` AND `git.strategy: direct` → this is the `direct-strategy-on-standard-project` configuration error |

All six conditions fire. The release skill must refuse VERIFIED on
EACH of the six independently — the fixture is structured so each
gate's refusal can be observed by running the skill with the other
conditions one-by-one masked. (Five of six is the minimum required
by the W4 acceptance check; six is the strict reproduction of the
Project-Alpha + project-beta combined episode.)

## What the exceptions/ fixtures show

| File | Demonstrates |
|---|---|
| `EXC-2026-05-22-valid-graph-stale.yaml` | A well-formed signed exception with `expiry > now`, `affected_gates: [graph-stale]`, applied to `project-alpha`. With this file present in `.tl/exceptions/`, condition #3 is suppressed and the release advances past graph-staleness only (the other five gates still refuse). |
| `EXC-2025-12-01-expired-graph-stale.yaml` | The same exception with `expiry: "2025-12-31T23:59:59Z"` (in the past). The release skill MUST treat this file as ABSENT — condition #3 fires again. Workflow detail: `exception-expired`. |
| `EXC-2026-05-22-blanket-rejected.yaml` | An exception with `affected_gates: ["*"]`. The release skill MUST reject this file at load time with workflow detail `exception-affects-blanket-gates`; condition #3 (and any other gate the operator may have intended to cover) fires as if the file did not exist. |
| `EXC-2026-05-22-prototype-on-standard.yaml` | An exception with `affected_gates: [skipped-pr]` filed against a `project_kind: standard` project. The release skill MUST reject with workflow detail `exception-prototype-only-gate-on-standard-project`. |

## Expected verdict

`expected/gate-evaluation.md` lists the per-condition expected
verdict (REFUSE / PASS-with-exception / PASS-clean) under three
scenarios: (a) no exceptions present, (b) the valid exception
present, (c) only the expired exception present.

The end-to-end expected terminal headline for scenario (a) is the
first refusal the skill encounters in step order — typically:

```
RELEASE HALTED — UNVERIFIED (upstream-sync-unverified)
```

(W2 sync evaluation precedes W3 QA evaluation, which precedes
graph evaluation, which precedes SA-validate, which precedes
PROD_GOLDEN_PATH, which precedes the PR/CI carve-out check.)

The W4 acceptance check requires the fixture to demonstrate AT
LEAST four of six conditions firing under scenario (a). This
fixture demonstrates all six.

## How the test harness exercises this fixture (out of scope for W4)

The W4 deliverable is the fixture itself plus the expected file.
A future wave (W11-pilot) will run the actual release skill
against this fixture and assert the refusal headlines match. W4
ships only the fixture inputs + expected outputs.
