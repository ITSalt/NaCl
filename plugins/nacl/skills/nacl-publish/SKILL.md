---
name: nacl-publish
description: Render, package, ship, release, deploy, or publish NaCl outputs with explicit external-write authorization and verified evidence.
---

# NaCl Publish

Call `nacl_installation_doctor` once and stop unless it returns
`status=VERIFIED`.

Read
[the publish workflow](../../resources/workflows/nacl-publish/SKILL.md),
[the render workflow](../../resources/workflows/nacl-render/SKILL.md), and
[the gateway binding](../../resources/references/workflow-gateway-contract.md).

Route to one packaged leaf: `nacl-render`, `nacl-publish`, `nacl-tl-ship`,
`nacl-tl-release`, or `nacl-tl-deploy`. Separate local rendering from Git,
deployment, messaging, or other external state changes.

Run the mapped read preflight. Release coordination uses a protected
`ReleaseEnvironment`: claim, mutate with live fence/revision and
`CONFIRM_RELEASE_OPERATION`, read back, then release. Graph-derived rendering,
reconciliation, or Task evidence reading is `BLOCKED` when its named query is
absent; the release-reader evidence taxonomy is not weakened. Every Git,
deployment, documentation, messaging, or other external write needs separate
explicit user authority and the selected leaf's gates.
