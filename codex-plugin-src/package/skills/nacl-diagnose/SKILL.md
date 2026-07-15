---
name: nacl-diagnose
description: Diagnose NaCl project health, drift, status, reconciliation, or next work using read-only evidence and actionable closed outcomes.
---

# NaCl Diagnose

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the diagnostic workflow](../../resources/workflows/nacl-tl-diagnose/SKILL.md),
[the evidence taxonomy](../../resources/workflows/references/verification-evidence.md),
and [the gateway binding](../../resources/references/workflow-gateway-contract.md).

Route to one packaged leaf: `nacl-tl-diagnose`, `nacl-tl-next`,
`nacl-tl-status`, `nacl-tl-reconcile`, or `nacl-postmortem`. Keep the run
read-only unless the user separately asks for a resulting artifact.

Run installation, explicit project resolution, trusted worker derivation,
health, schema status, and the packaged summary read. When Task-level or domain
diagnosis requires an unavailable named query, return the mapped exact gap code
with `BLOCKED`. Never infer graph truth from a stale local status file.
