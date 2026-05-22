# verify-code-enum-drift-snapshot — Step 2.5 regression fixture

**Purpose:** reproduce the recurring false-positive class where
`nacl-tl-verify-code` flagged stale enum vocabulary in a spec document
as a CODE defect even though the code was internally consistent and an
upstream BE review had already catalogued the drift as non-blocking.

Trigger episode shape (private project name is intentionally NOT
encoded — the public fixture uses `WidgetStatus` / `INACTIVE → ARCHIVED`
throughout):

- An entity-status enum was renamed in a development wave, with the
  rename recorded in the project changelog and in `shared/src/enums.*`
  plus the Prisma schema.
- All code paths (BE service, worker, FE component) migrated to the
  new canonical name and stayed internally consistent.
- The `task-be.md` for the affected UC was not regenerated and still
  used the pre-rename token.
- The phase BE re-review catalogued the drift as a non-blocking minor
  routed to `/nacl-tl-reconcile`, with the verdict `APPROVED`.
- A subsequent `/nacl-tl-verify <UC> → /nacl-tl-verify-code` run
  re-flagged the same drift as a code defect, generating user-visible
  noise on the already-APPROVED UC.

---

## Layout

```
verify-code-enum-drift-snapshot/
├── README.md                                  ← this file
├── package.json                               scripts.test = "node --test ..."
├── api/
│   ├── prisma/schema.prisma                   canonical enum WidgetStatus { ACTIVE, ARCHIVED, DELETED }
│   └── src/services/
│       ├── widget.service.js                  uses WidgetStatus.ARCHIVED (canonical)
│       └── widget.service.test.js             three passing tests to satisfy scripts.test
├── shared/src/enums.js                        canonical WidgetStatus object (ESM)
└── .tl/
    └── tasks/UC-EXP-001/
        ├── task-be.md                         spec STILL says INACTIVE (stale)
        ├── review-be.md                       m-1 pre-flag: vocabulary drift → /nacl-tl-reconcile
        └── status.json                        phases.be / review-be: approved
```

Plain ESM JavaScript was chosen over TypeScript to keep the fixture
dependency-free: `node --test` runs against the `.js` files directly
without a TS loader.

## Scenarios

### Scenario S1 — SPEC_DRIFT with pre-flag suppression (default)

Run `/nacl-tl-verify-code UC-EXP-001` against this fixture as-shipped.

Expected output:

- top-level `result`: `PASS` (or `UNVERIFIED` if no test imports
  `widget.service.ts` — depends on test runner coverage discovery),
  **never `FAIL`**.
- `findings[]` contains exactly one entry referring to `WidgetStatus`:
  - `kind: spec-drift`
  - `status: INFO` (downgraded by Step 2.5.5 pre-flag suppression
    matching `m-1` in `review-be.md`)
  - `routedTo: /nacl-tl-reconcile`
  - `note: pre-flagged in review-be.md:<line>`

The orchestrator (`/nacl-tl-verify`) must render this finding in the
Suggestions block as `[INFO → /nacl-tl-reconcile] ...` and the YouGile
column move must NOT be Reopened.

### Scenario S2 — CODE_DRIFT escalation (manual extension)

To test the escalation guard from Step 2.5.5, add a second service file
that uses the stale token in actual code:

```js
// api/src/services/widget-alt.service.js (not shipped by default)
import { WidgetStatus } from "../../../shared/src/enums.js";

export function isInactive(status) {
  return status === "INACTIVE"; // stale literal, not in WidgetStatus values
}
```

Re-run the verifier. Expected:

- top-level `result`: `FAIL`.
- the same `WidgetStatus` finding upgrades to:
  - `kind: code-defect`
  - `status: ISSUE`
  - `note: escalated from prior review-be.md:<line> SPEC_DRIFT classification`
- pre-flag suppression does NOT fire (Step 2.5.5 explicit escalation
  rule for `F.kind > P.kind`).

### Scenario S3 — pre-fix replay (audit only)

To prove that the pre-fix version of `nacl-tl-verify-code` produced the
false positive, check out the SKILL.md from before the Step 2.5 patch
and re-run S1. Expected pre-fix output:

- one finding with `status: ISSUE` on `WidgetStatus.INACTIVE` — a
  code-defect classification even though no code file uses
  `INACTIVE`.

This is the RED state the regression test guards against.

---

## Why a fixture not a unit test

`nacl-tl-verify-code` is a prompt, not a Python/TypeScript function;
there is no direct API to unit-test. The fixture encodes the input
shape (project files + spec + prior review) such that a future
`nacl-tl-verify-code` test harness — or a manual replay by an
operator — can drive the skill end-to-end and assert on the output
report.

## Generalisation note

Token rename `INACTIVE → ARCHIVED` and entity name `Widget` were
chosen because:

- `WidgetStatus` is enum-shaped and likely to match the Step 2.5
  spec-token regex `[A-Z][A-Z0-9_]{2,}`.
- Neither `Widget` nor `INACTIVE/ARCHIVED` is in the Step 2.5.2
  acronym filter list, so they exercise the live cross-check.
- The names contain no reference to any private project or domain.
