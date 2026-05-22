# Fixture: stub-shape-validation

A NaCl stub-scanner state that reproduces the Project-Alpha `8522d1d` WORKFLOW_STEPS
empty-test-file false-PASS scenario. The W10 Shape-Validation closure
criterion at `nacl-tl-stubs` MUST emit `Status: UNVERIFIED` (and headline
`STUBS APPLIED — UNVERIFIED (shape-unvalidated: <stub-id>)` or
`STUBS APPLIED — UNVERIFIED (shape-mismatch: <stub-id>, field: ...)`)
when run against this fixture — NOT `STUBS COMPLETE`.

This is the canonical replay target for the W10 stubs gate; cross-referenced
from the broader W11 retrospective replay.

## Source episode

Project-Alpha-procontent commit `8522d1d` "fix(admin): unstub WORKFLOW_STEPS +
categories envelope + WSC dropdown paging" (post-mortem § "Stub/mock leak"
row of the bucket table, § 4 nacl-tl-stubs).

Pre-W10: a developer removed a `// TODO: implement workflow steps catalog`
stub from `src/admin/workflow-steps.service.ts` and committed a function
returning a static catalog of fake IDs (`step-001`, `step-002`, ...). The
test file `workflow-steps.test.ts` existed and contained one `it(` call
asserting only `toBeDefined()`. The pre-W10 scanner saw:

- no TODO marker;
- no STUB marker;
- non-empty test file (1 `it(`/`test(` call);
- no empty-describe block;

and emitted `STUBS COMPLETE`. The fake IDs shipped. Downstream consumers
(WSC dropdown, categories filter) read them as load-bearing data; the
next real call returned 422 because the spec required `id` (uuid),
`name` (string), `step_order` (int), and `kind` (enum) — none of which
the fake catalog provided in the correct shape.

## Sources of truth in this fixture

| Source | Path | State |
|---|---|---|
| `stub-registry.json` (prior) | `stub-registry.json` | Carries `STUB-042` on `src/admin/workflow-steps.service.ts:12` with `uc: UC-302`, `severity: WARNING`, `shape_validated: false`. This entry was created in a prior scan; it is a candidate-for-closure in this scan because the marker is no longer at line 12. |
| `src/admin/workflow-steps.service.ts` (current) | `src/admin/workflow-steps.service.ts` | The TODO marker is GONE. The function returns a static catalog of fake IDs (`step-001`, ...). |
| `src/admin/workflow-steps.test.ts` (current) | `src/admin/workflow-steps.test.ts` | One `it(` call, assertion is only `toBeDefined()`. No assertion on required fields. |
| `UC-302 spec` (graph or contract) | `UC-302-spec.md` | Required fields: `id` (uuid), `name` (string), `step_order` (int), `kind` (enum). All non-nullable. |
| `wire-evidence fixture for UC-302` | (absent) | No `wire-evidence:fixture:*` recorded on the UC-302 Task node. |
| `contract test for UC-302` | (absent) | No test exercises the required-field set. |
| `live-smoke for UC-302` | (absent) | No `wire-evidence:live-smoke:*` recorded. |
| `qa-stage fixture for UC-302` | (absent) | No `qa-stage:wire-contract:VERIFIED` or `qa-stage:provider-fixture:VERIFIED` recorded. |

## Detection trace (the gate's reasoning)

Per the W10 procedure in `nacl-tl-stubs/SKILL.md` § "Closure Criterion:
Shape Validation":

1. **Load the spec.** UC-302 `FormField`s: `id` (uuid, required),
   `name` (string, required), `step_order` (int, required), `kind`
   (enum: `transform|filter|aggregate|export`, required).

2. **Sample runtime data.** Sources (a)-(d) inspected:
   - (a) wire-evidence fixture: ABSENT.
   - (b) contract / integration test asserting required-field
     presence and types: ABSENT (the existing test only checks
     `toBeDefined()`).
   - (c) live-smoke: ABSENT.
   - (d) qa-stage fixture: ABSENT.

3. **Outcome.** No runtime data sample available. The closure
   cannot be shape-validated.

## Expected gate outcome

```
Status: UNVERIFIED
Workflow detail: shape-unvalidated:STUB-042
Header: STUBS APPLIED — UNVERIFIED (shape-unvalidated: STUB-042)
```

- `STUB-042` is NOT marked `resolvedAt`. It remains unresolved.
- `shape_validation_blocked: true` is added to the registry entry,
  with reason `no wire-evidence fixture, no contract test, no
  live-smoke, no qa-stage fixture for UC-302`.
- The UC-302 Task `verification_evidence` MUST NOT receive a
  `stub-shape-validated:UC-302:FormField:workflow-step` entry (the
  validation did not pass).
- Downstream skills (`nacl-tl-review`, `nacl-tl-release`) read
  `phases.stubs: unverified` and refuse to advance `nacl-tl-review`
  to APPROVED without an exception or an additional runtime sample.

## What the operator must do to unblock

Three legitimate paths (no flag bypass):

1. **Record a wire-evidence fixture** for UC-302 (via
   `/nacl-tl-sync` or a manual fixture commit). Re-run
   `/nacl-tl-stubs`. The validation procedure compares the fixture
   body to the spec's required-field set; on success, the stub
   closes with `stub-shape-validated:UC-302:FormField:workflow-step`.
2. **Write a contract test** asserting `id` (uuid), `name`
   (string), `step_order` (int), `kind` (enum) on the runtime
   output of `workflow-steps.service.ts`. Re-run.
3. **File a signed exception** (W4 schema) against gate
   `stub-shape-validation`:
   - `affected_gates: [stub-shape-validation]`
   - `reason: <concrete justification, e.g. "UC-302 ships behind
     feature flag; no real consumers; shape-validation deferred
     to next release">`
   - `expiry: <= 24h`
   - `followup_task: <UC or TECH that closes the gap>`

There is no `--skip-shape-validation` flag.

## W11 assertion

For W11 retrospective replay, the assertion against this fixture is:

```
nacl-tl-stubs UC-302
  → Status: UNVERIFIED
  → Headline: STUBS APPLIED — UNVERIFIED (shape-unvalidated: STUB-042)
  → registry entry STUB-042 remains resolvedAt: null
  → No stub-shape-validated:* entry written to UC-302 Task
```

A `STUBS COMPLETE` outcome is a regression bug in W10 and must be
fixed before W11 closes. A `BLOCKED` outcome is also wrong — the
gate's intended terminal status here is `UNVERIFIED`, because the
scanner ran cleanly and produced an observation; it simply cannot
attest to closure without runtime evidence.
