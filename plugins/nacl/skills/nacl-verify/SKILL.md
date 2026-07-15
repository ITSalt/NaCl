---
name: nacl-verify
description: Verify NaCl code, tests, QA, synchronization, review evidence, or stubs without converting missing runtime proof into success.
---

# NaCl Verify

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the verification workflow](../../resources/workflows/nacl-tl-verify/SKILL.md),
[the evidence taxonomy](../../resources/workflows/references/verification-evidence.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Route to one packaged leaf: `nacl-tl-verify`, `nacl-tl-verify-code`,
`nacl-tl-qa`, `nacl-tl-review`, `nacl-tl-sync`, or `nacl-tl-stubs`. Load only
the selected leaf and report the exact commands and exit codes it requires.

Start with the mapped read preflight. Verification is read-only except for
explicitly requested evidence artifacts and a mapped Task evidence update. Any
such update requires claim, current fence/revision, `APPROVE_TL_WRITE`,
same-mutation evidence, read-back, and release. If the required Task/domain
named read is unavailable, return its exact gap code with `BLOCKED`; never
report a vacuous pass.
