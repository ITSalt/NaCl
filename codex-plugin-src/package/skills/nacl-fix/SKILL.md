---
name: nacl-fix
description: Diagnose and repair a bounded NaCl defect with spec-first classification, a regression test, verification, and honest status propagation.
---

# NaCl Fix

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the fix workflow](../../resources/workflows/nacl-tl-fix/SKILL.md),
[the TL contract](../../resources/workflows/nacl-tl-core/references/tl-codex-contract.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Use `nacl-tl-hotfix`, `nacl-tl-reopened`, or `nacl-tl-regression-test` from
`../../resources/workflows/` only when their narrower trigger applies. Preserve
the diagnostic/spec versus implementation/review separation required by the
leaf workflow.

Run the TL Task sequence with the exact project/identity, lease, fence,
revision, idempotency key, and `APPROVE_TL_WRITE`. Code and tests retain the
leaf's user gate. A successful terminal Task mutation must include the
RED-to-GREEN evidence token in the same call; otherwise return
`BLOCKED/TERMINAL_TASK_EVIDENCE_REQUIRED`. Unavailable impact evidence stays
blocked and is never replaced by keyword-only success.
