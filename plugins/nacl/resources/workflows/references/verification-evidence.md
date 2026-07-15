# Verification Evidence (Task.verification_evidence)

`Task.verification_evidence` is a string property on TL `Task` nodes that
records *how* a task was verified. It is **read** by the release workflow
(`nacl-tl-release`) and **must be written** by every Codex skill that
advances a Task to a terminal status. Leaving it empty on a `done` task
causes the release workflow to surface a "Verification gap" — a contract
violation, not normal output.

This file is the Codex-pilot mirror of `nacl-core/SKILL.md`
§ `Task.verification_evidence`. The taxonomy is identical; only the wording
is Codex-adapted.

## Values

| Value | When to write |
|---|---|
| `test-GREEN:<artifact_path>` | Status `VERIFIED` + regression test transitioned RED→GREEN. `<artifact_path>` is a repo-relative path (forward slashes, no leading `./`) of the test file or `.tl/tasks/<TASK_ID>/regression-test.md`. |
| `test-UNVERIFIED` | Status `UNVERIFIED` or `PARTIALLY_VERIFIED` — change applied but RED→GREEN not confirmed. |
| `no-test` | Status `VERIFIED` under an explicit user override (e.g. `--skip-verify` at delivery). |
| `repo-checks-GREEN:<commit>` | Repo-wide gate evidence written by `nacl-tl-review` when `pnpm -r lint`, `pnpm -r typecheck`, and `pnpm -r test` all exit 0 on the wave-tip commit. `<commit>` is the full or short SHA of that commit (forward slash not used; the sha follows `:` directly). This evidence is required for `nacl-tl-review` to emit Status `VERIFIED`; absence of a recorded repo-checks run is `NOT_RUN`, which is not VERIFIED-equivalent downstream. May be recorded alongside a `test-GREEN:` value (separated by a single space) when both apply. |
| `wire-evidence:fixture:<path>` | Wire-Evidence Gate evidence written by `nacl-tl-sync` when a runnable test loads a recorded response fixture (HTTP body, headers, status) and asserts BE/FE code parses/produces it without mocking. `<path>` is a forward-slash, repo-relative path to the fixture file or the test that drives it. The fixture file MUST be a real captured response — not a synthetic shape implied by the TS type. Required for `nacl-tl-sync` to emit Status `VERIFIED` on any UC with `actor != SYSTEM`, unless one of the other two `wire-evidence:*` shapes is present. |
| `wire-evidence:contract-test:<path>` | Wire-Evidence Gate evidence written by `nacl-tl-sync` when a runnable contract test asserts the wire-format contract against the live provider in a sandboxed environment (provider sandbox endpoint, test API key, or provider-supplied mock server hosted by the provider — not an in-repo mock). `<path>` is a forward-slash, repo-relative path to the test file. Required-with-alternatives same as `wire-evidence:fixture:`. |
| `wire-evidence:live-smoke:<timestamp>` | Wire-Evidence Gate evidence written by `nacl-tl-sync` when captured request/response/status of a live call to the real provider is committed to the repo or stored in a release-attached location referenced by the sync report. `<timestamp>` is the ISO-8601 timestamp of capture (e.g. `2026-05-19T22:28:00Z`). Required-with-alternatives same as `wire-evidence:fixture:`. |
| `qa-stage:component:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the closed-set status of the `COMPONENT_QA` stage written by `nacl-tl-qa`. `<status>` is one of `VERIFIED / PARTIALLY_VERIFIED / FAILED / BLOCKED / NOT_RUN / UNVERIFIED`. |
| `qa-stage:local-runtime:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the status of the `LOCAL_RUNTIME_QA` stage (dev-server cluster boot + pre-provider pipeline: storage fetch, ffmpeg, queue transition, route mount). Same `<status>` enum. |
| `qa-stage:wire-contract:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the status of the `WIRE_CONTRACT_QA` stage (browser-to-server or service-to-service wire envelope matches api-contract). Same `<status>` enum. Note: distinct from `wire-evidence:*` — `wire-evidence:*` is sync-layer evidence about test/fixture artifacts; `qa-stage:wire-contract:` is QA-layer evidence about a per-UC stage result. |
| `qa-stage:provider-fixture:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the status of the `PROVIDER_FIXTURE_QA` stage (recorded fixture against the provider's documented request/response shape, including failure-code paths). Same `<status>` enum. |
| `qa-stage:live-provider-smoke:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the status of the `LIVE_PROVIDER_SMOKE` stage (real call against the live provider with a real key — distinct from `provider-fixture` in that it exercises authentication, rate limits, and the current model namespace). Same `<status>` enum. |
| `qa-stage:prod-golden-path:<status>` | Per-stage QA evidence (W3-blocking-qa). Records the status of the `PROD_GOLDEN_PATH` stage (deployed UC end-to-end from a real user's browser against the production stack). Same `<status>` enum. |
| `stub-shape-validated:<spec-ref>` | Stub-closure evidence (W10-fix-discipline) written by `nacl-tl-stubs` when a previously-tracked stub is closed via shape-validation against the spec's required-field set. `<spec-ref>` is either a graph node path (e.g. `UC-302:FormField:workflow-step` or `UC-302:DomainAttribute:step_order`) or a file:line reference (e.g. `.tl/specs/UC-302.md:42`, `.tl/tasks/UC-302/api-contract.md:18`). Required for `nacl-tl-stubs` to emit Status `VERIFIED` on any UC whose registry contains candidate-for-closure stubs (stubs whose marker was removed in this scan cycle). Multiple `stub-shape-validated:<spec-ref>` entries may appear on the same task, one per closed stub, separated by single spaces. |
| (unset / empty) | Status `FAILED` / `BLOCKED` / `NOT_RUN` — task is excluded from the release scope, so no evidence string is required. |

### QA-stage aggregate-status derivation

When `qa-stage:<stage>:<status>` entries appear in a
`verification_evidence` value, the release reader and any downstream
aggregator MUST derive the QA aggregate per the rule documented in
`nacl-tl-qa/SKILL.md` § "Aggregate Status Rule":

```
aggregate = weakest non-NOT_RUN stage status, with weakness ordering:
    VERIFIED < PARTIALLY_VERIFIED < UNVERIFIED < FAILED < BLOCKED

THEN, if ANY mandatory stage (per the UC-type matrix in nacl-tl-qa
SKILL.md, or the project's `config.yaml` → `qa_mandatory_stages`
override) is NOT_RUN AND no signed exception with `affected_gates`
naming that stage exists:
    aggregate := UNVERIFIED   (forced floor)
```

The aggregate is computed on demand from the per-stage entries; the
per-stage entries are the durable record. A reader that observes
`qa-stage:live-provider-smoke:NOT_RUN` on a provider-dep UC MUST
consult the signed-exceptions ledger before classifying the aggregate
as anything other than `UNVERIFIED`.

## Format Rules

- Single string. No JSON. No quoting.
- `test-GREEN` payload after `:` is a forward-slash, repo-relative path.
- `test-UNVERIFIED` and `no-test` carry no payload.
- `wire-evidence:fixture:<path>` and `wire-evidence:contract-test:<path>`
  carry a forward-slash, repo-relative path payload (path follows
  `wire-evidence:<kind>:` directly, no leading `./`).
- `wire-evidence:live-smoke:<timestamp>` carries an ISO-8601 instant
  (e.g. `2026-05-19T22:28:00Z`) following `wire-evidence:live-smoke:`
  directly. Trailing `Z` or numeric offset (`+00:00`) both accepted; no
  whitespace in the timestamp.
- Multiple `wire-evidence:*` entries on the same task are permitted and
  must be separated by single spaces from each other and from any
  `test-GREEN:` / `repo-checks-GREEN:` payload.
- `qa-stage:<stage>:<status>` carries one of the six stage names
  (`component`, `local-runtime`, `wire-contract`, `provider-fixture`,
  `live-provider-smoke`, `prod-golden-path`) and one closed-set status
  value (`VERIFIED`, `PARTIALLY_VERIFIED`, `FAILED`, `BLOCKED`,
  `NOT_RUN`, `UNVERIFIED`) following `qa-stage:<stage>:` directly, no
  whitespace. Multiple `qa-stage:*` entries on the same task are
  permitted and must be separated by single spaces from each other and
  from any other evidence payload. Each stage name appears at most once
  per task.
- `stub-shape-validated:<spec-ref>` carries a `<spec-ref>` payload
  following `stub-shape-validated:` directly, no whitespace within the
  payload. The payload is either:
  - a **graph node path** of the form `<UC>:<NodeLabel>:<node-id-or-name>`
    (e.g. `UC-302:FormField:workflow-step`,
    `UC-104:DomainAttribute:s3_keys`). The first segment matches `UC-\d+`
    (or `TECH-\d+`); the second segment names a graph label from the
    closed set `FormField`, `DomainAttribute`, `Enumeration`,
    `DomainEntity`; the third segment is the slug or id of the node;
  - or a **file:line ref** of the form `<path>:<line>` where `<path>` is
    a forward-slash, repo-relative path with no leading `./` and `<line>`
    is a positive integer (e.g. `.tl/specs/UC-302.md:42`,
    `.tl/tasks/UC-302/api-contract.md:18`).
  Multiple `stub-shape-validated:*` entries on the same task are
  permitted and must be separated by single spaces from each other and
  from any other evidence payload. Each `<spec-ref>` appears at most
  once per task (a second appearance is a writer error and is rejected
  by the reader as `unknown`).

## Writer Contract

A Codex skill that writes a terminal Task status MUST set
`verification_evidence` in the same Cypher statement:

```cypher
MATCH (t:Task {id: $taskId})
SET t.status = $terminalStatus,
    t.verification_evidence = $evidence,
    t.updated = datetime()
```

If the upstream report does not carry a parseable `Regression test:` line
under a `VERIFIED` outcome, the orchestrator MUST report
`Status: BLOCKED` with reason "no regression test path" rather than write a
terminal status with empty evidence.

## Reader Contract

The release workflow reads the property and classifies:

- Prefix `test-GREEN:` → `test-GREEN` (path extracted for the report).
- Prefix `repo-checks-GREEN:` → `repo-checks-GREEN` (commit SHA extracted for the report). A valid `repo-checks-GREEN:<commit>` value identifies the wave-tip commit on which `pnpm -r lint`, `pnpm -r typecheck`, and `pnpm -r test` all exited 0 — it is the only shape that makes the entry valid.
- Prefix `wire-evidence:fixture:` → `wire-evidence-fixture` (path
  extracted for the report). Indicates that `nacl-tl-sync` confirmed a
  runnable test loads a recorded response fixture and asserts the
  wire-format contract.
- Prefix `wire-evidence:contract-test:` → `wire-evidence-contract-test`
  (path extracted for the report). Indicates that `nacl-tl-sync`
  confirmed a runnable contract test asserts the wire-format contract
  against the live provider in a sandboxed environment.
- Prefix `wire-evidence:live-smoke:` → `wire-evidence-live-smoke`
  (timestamp extracted for the report). Indicates that `nacl-tl-sync`
  recorded a captured live call to the real provider with the named
  timestamp.
- Prefix `qa-stage:<stage>:` → `qa-stage-<stage>` with the status
  extracted. The release reader groups all `qa-stage:*` entries and
  computes the QA aggregate per the "QA-stage aggregate-status
  derivation" rule above (weakest non-NOT_RUN, then mandatory-NOT_RUN
  floor). A reader that observes `qa-stage:live-provider-smoke:NOT_RUN`
  on a provider-dep UC MUST consult the signed-exceptions ledger before
  classifying the QA aggregate as anything other than `UNVERIFIED`.
- Prefix `stub-shape-validated:` → `stub-shape-validated` with the
  `<spec-ref>` extracted. The release reader groups all
  `stub-shape-validated:*` entries on a Task and cross-references them
  against the project's stub registry (`.tl/stub-registry.json`): for
  every registry entry on this UC with `shape_validated: true`, the
  reader expects to find a matching `stub-shape-validated:<spec-ref>`
  entry on the Task. A missing match is reported as
  `stub-shape-validated-evidence-missing` in the release notes
  (release-report-only; the gate fires at `nacl-tl-stubs`, not at
  release).
- Literal `test-UNVERIFIED` → `test-UNVERIFIED`.
- Literal `no-test` → `no-test`.
- Empty / unrecognised → `unknown` → release report's "Verification gap" footer.

A single `verification_evidence` value MAY combine any of
`repo-checks-GREEN:<commit>`, `test-GREEN:<path>`, one or more
`wire-evidence:*` entries, one or more `qa-stage:*` entries, and one or
more `stub-shape-validated:<spec-ref>` entries — separated by single
spaces. For example:

```
repo-checks-GREEN:abc1234 test-GREEN:.tl/tasks/UC042/regression-test.md wire-evidence:fixture:tests/fixtures/kie-ai/protocol-response.json
```

or:

```
wire-evidence:fixture:tests/fixtures/kie-ai/protocol-response.json wire-evidence:live-smoke:2026-05-19T22:28:00Z
```

or, with a stub closure:

```
repo-checks-GREEN:abc1234 test-GREEN:.tl/tasks/UC-302/regression-test.md stub-shape-validated:UC-302:FormField:workflow-step
```

The release reader extracts each prefix independently. The
Wire-Evidence Gate at `nacl-tl-sync` is satisfied when at least one
`wire-evidence:*` entry is present for any UC with `actor != SYSTEM`;
the Stub-Shape Gate at `nacl-tl-stubs` is satisfied when every
candidate-for-closure stub on a UC has a recorded
`stub-shape-validated:<spec-ref>` entry on that UC's Task; release
VERIFIED status further requires `repo-checks-GREEN:<commit>` from
`nacl-tl-review` and `test-GREEN:<path>` (or one of the documented
exception evidences). The four dimensions — repo checks, RED→GREEN
test, wire evidence, stub shape validation — are orthogonal; each is
required when its corresponding gate applies.

## Writers

Every Codex skill that advances a Task to terminal status:

- `nacl-tl-review` (writes `repo-checks-GREEN:<commit>` on a clean
  repo-wide gate at the wave-tip commit)
- `nacl-tl-sync` (writes one or more `wire-evidence:*` entries when
  the Wire-Evidence Gate is satisfied for UCs with `actor != SYSTEM`)
- `nacl-tl-qa` (writes one `qa-stage:<stage>:<status>` entry per
  in-scope stage; per the six-stage decomposition introduced in
  W3-blocking-qa)
- `nacl-tl-stubs` (writes one `stub-shape-validated:<spec-ref>` entry
  per closed stub when the shape-validation procedure passes; W10
  binding)
- `nacl-tl-conductor` (Phase 3 / development gate)
- `nacl-tl-full` (per-task aggregation)
- `nacl-tl-fix` (terminal write of fix-only flows)
- `nacl-tl-deliver` (under explicit `--skip-verify`)
- `nacl-tl-hotfix` (after RED→GREEN seam confirms)

## Gate

Every orchestrator that aggregates child statuses MUST verify, before
declaring its own COMPLETE, that every terminal Task carries non-empty
`verification_evidence`. Failing this check is a `BLOCKED` outcome, not a
silent pass — see `nacl-core/SKILL.md` § Task.verification_evidence.
