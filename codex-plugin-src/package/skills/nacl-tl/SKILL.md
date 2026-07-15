---
name: nacl-tl
description: Route NaCl team-lead work across intake, planning, development, review, QA, status, release, and deployment. Use for graph-aware delivery work.
---

# NaCl Team Lead

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the TL core](../../resources/workflows/nacl-tl-core/SKILL.md),
[the TL Codex contract](../../resources/workflows/nacl-tl-core/references/tl-codex-contract.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Route to one packaged leaf under `../../resources/workflows/`, beginning with
`nacl-tl-conductor`, `nacl-tl-full`, `nacl-tl-intake`, `nacl-tl-plan`,
`nacl-tl-deliver`, `nacl-tl-status`, or the narrower leaf named by the request.
Load no unrelated leaf.

Run the mapped TL preflight. Protected `Task` work uses allocate or claim,
heartbeat for long work, the live fence and expected revision, mutation with
`APPROVE_TL_WRITE`, read-back, and release or explicit handoff. Preserve user
gates, test evidence, and author/reviewer separation. A `done` or
`verified-pending` write must carry parseable `verification_evidence` in the
same mutation. A `no-test` override additionally requires
`evidence_confirmation: CONFIRM_NO_TEST_EVIDENCE`. Missing Task-level named reads block graph-backed status or
release instead of falling back to local state.
