---
name: nacl-ba
description: Route NaCl business analysis across context, processes, entities, roles, rules, workflows, validation, sync, and handoff. Use for graph-first BA work.
---

# NaCl Business Analysis

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the BA contract](../../resources/workflows/references/ba-codex-contract.md),
[the core contract](../../resources/workflows/nacl-core/SKILL.md), and
[the gateway binding](../../resources/references/workflow-gateway-contract.md).

Choose exactly the relevant packaged leaf under `../../resources/workflows/`:
`nacl-ba-full`, `nacl-ba-context`, `nacl-ba-import-doc`,
`nacl-ba-from-board`, `nacl-ba-roles`, `nacl-ba-process`, `nacl-ba-entities`,
`nacl-ba-rules`, `nacl-ba-glossary`, `nacl-ba-workflow`, `nacl-ba-analyze`,
`nacl-ba-validate`, `nacl-ba-sync`, or `nacl-ba-handoff`.

State the selected leaf. Run the mapped BA preflight with explicit project and
identity. Only `Board` metadata currently has a protected BA resource route:
allocate or claim, retain lease/fence, mutate with revision CAS and
`APPROVE_BA_WRITE`, read back, then release. Required BA domain labels,
relationships, and named reads are not exposed by this pilot. A graph-complete
claim that needs them is `BLOCKED/BA_DOMAIN_RESOURCE_UNAVAILABLE`; useful
confirmed file-only preparation may still report its own honest status.
