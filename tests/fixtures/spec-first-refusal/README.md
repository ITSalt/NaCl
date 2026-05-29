# Fixture: spec-first-refusal

A NaCl fix-chain that reproduces the Project-Alpha 39%-undocumented-fixes pattern.
The W10 Spec-First Prerequisite gate (nacl-tl-fix Step 6.SF) MUST emit
`Status: BLOCKED` with workflow detail `spec-first-prerequisite-missing`
when run against this fix chain on an L1+ classification.

This is the canonical replay target for W11.

## Source episode

Project-Alpha Wave 4 close → FIX-B audit (post-mortem § 3.12 and
§ "Process/docs catch-up" row of the bucket table):

- Wave 4 closed at 17:07 on 2026-05-11 with lint red, typecheck red,
  publishers defined but never called.
- The 17:35 audit reproduced the failures and triggered the FIX-B
  remediation wave: seven commits across `01f2fcb`, `c83e84f`, `92da5c7`,
  `135b14b`, `6ed12ac`, `3acb2fd` (all code-fix), then `a7eb747`
  (docs(SA): UC-105/UC-106/UC-107 post-commit emit timing).
- DIAGNOSTIC-REPORT.md (2026-05-18) measured **39% of fixes never
  updated documentation**. `a7eb747` is the canonical example: the
  spec caught up to code, instead of leading it.

## Sources of truth in this fixture

| Source | Path | State |
|---|---|---|
| `chain.txt` | `chain.txt` | Ordered fix-chain commits (SHA + classification + subject). Reproduces the seven-commit Project-Alpha FIX-B wave. |
| `status.json` | `status.json` | `phases.spec: pending` at the moment the first code-fix commit lands. No `phases.docs: done` entry predates the first code-fix. |
| `changelog.md` | `changelog.md` | Mentions the FIX-B wave but has no L2 doc-update entry timestamped before the first code-fix commit. |
| `graph-snapshot.json` | `graph-snapshot.json` | Live graph at the moment the first code-fix commit lands — no `UseCase {id: 'UC-105'}` / `UC-106` / `UC-107` updates between the previous spec snapshot and the first code-fix commit. |
| `exceptions/` | (empty) | No active or expired signed exceptions. No `spec-first-prerequisite` carve-out exists. |
| `classification.txt` | `classification.txt` | `L1` — the fix author classified the work as code-only. (The post-mortem retroactively classified it L2, but the at-the-time classification was L1.) |

## Detection trace (the gate's reasoning)

Per the W10 detection logic in `nacl-tl-fix/SKILL.md` § "Spec-First
Prerequisite (Strict-Only)":

| Commit (chain index) | Classification | Reason |
|---|---|---|
| `01f2fcb` (0) | code-fix | touches only `backend/src/**` + `frontend/src/**` |
| `c83e84f` (1) | code-fix | touches only `backend/src/__tests__/**` (fixtures excluded by W10's `tests/` carve-out from spec-update detection) |
| `92da5c7` (2) | code-fix | touches only `backend/src/__tests__/**` |
| `135b14b` (3) | code-fix | touches only `backend/src/services/**` |
| `6ed12ac` (4) | code-fix | touches only `backend/src/services/**` |
| `3acb2fd` (5) | code-fix | touches only `backend/src/services/**` |
| `a7eb747` (6) | spec-update | touches `docs/14-usecases/UC-105.md`, `docs/14-usecases/UC-106.md`, `docs/14-usecases/UC-107.md` |

Verdict at Step 6.SF entry for commit `01f2fcb` (the first code-fix
commit the operator tries to apply):

- `first_code_fix_idx = 0`
- `last_spec_idx_before_code = none`
- Secondary signals from W5 sources: `phases.spec` not `done` before
  first code-fix; no L2-shaped changelog entry timestamped before
  first code-fix; no graph mutation between previous snapshot and
  first code-fix.
- **PASS check: FAIL.** No spec-update commit precedes the first
  code-fix commit.

## Expected gate outcome

```
Status: BLOCKED
Workflow detail: spec-first-prerequisite-missing
Header: FIX HALTED — SPEC-FIRST PREREQUISITE MISSING
```

The refusal advisory MUST list:
- the seven chain commits with their classifications;
- `first_code_fix_idx: 0`;
- `last_spec_idx_before_code: none`;
- the three operator paths (re-commit spec first, re-classify, file
  signed exception).

Phase 6 (code application) MUST NOT run. No production code is
touched. The fix chain is left intact for the operator to reorder.

## What the operator must do to unblock

Three legitimate paths (no flag bypass exists):

1. **Reorder the chain.** Apply `a7eb747` (or a fresh spec update
   commit) BEFORE any of `01f2fcb`...`3acb2fd`. Rebase. Re-invoke
   `/nacl-tl-fix`. The gate passes by construction.
2. **Re-classify.** If Step 3 (GAP-CHECK) was wrong and this is
   actually L1 (docs are current), document the L1 reasoning. The
   gate will still refuse unless a `phases.docs: done` or
   spec-update changelog entry predates the first code-fix — i.e.
   the docs were already current in a PRIOR session. If they are
   not, the work is L2, not L1.
3. **File a signed exception** (W4 schema) against gate
   `spec-first-prerequisite`:
   - `affected_gates: [spec-first-prerequisite]`
   - `reason: <concrete justification + why no spec update needed>`
   - `expiry: <= 24h`
   - `followup_task: <UC or TECH that audits the classification>`

There is no `--skip-spec-first` flag. There is no `--force`.

## W11 assertion

For W11 retrospective replay, the assertion against this fixture is:

```
nacl-tl-fix --uc UC-105 "wire post-commit emit timing"
  → Status: BLOCKED
  → Workflow detail: spec-first-prerequisite-missing
  → No commits touched after the refusal
```

Any other outcome (especially `FIX COMPLETE` or `FIX APPLIED —
UNVERIFIED` without the spec-first refusal) is a regression bug in
W10 and must be fixed before W11 closes.
