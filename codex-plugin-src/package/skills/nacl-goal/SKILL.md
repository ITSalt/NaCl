---
name: nacl-goal
description: Plan or conduct a bounded NaCl objective with explicit checks and closed statuses. Use for multi-step goals and resumable orchestration.
---

# NaCl Goal

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read [the packaged goal workflow](../../resources/workflows/nacl-goal/SKILL.md),
[the goal contract](../../resources/workflows/references/goal-codex-contract.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).
Run the mapped `read-preflight` sequence, then select one bounded alias/leaf and
state its checks. Any graph mutation must delegate to that leaf's mapped BA,
SA, TL, migration, or release resource sequence with the same resolved project
and identity envelope.

Preserve preview, proof, refusal, and user gates. A missing mapped capability,
lease, fence, revision, confirmation, runtime, or evidence returns its exact
closed status; a goal never promotes child non-success into `VERIFIED`.
