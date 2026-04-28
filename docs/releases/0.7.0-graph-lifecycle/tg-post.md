**NaCl 0.7.0: IntakeItem delivery lifecycle tracking**

Two skills now maintain graph state automatically. `nacl-tl-deliver` marks IntakeItems as delivered (`status='delivered'`, `delivered_at`, `delivered_pr`) after staging health checks pass. `nacl-tl-release` batch-stamps them with the release version after the git tag is pushed. Both steps are WARN+continue — graph unavailability never blocks CI/CD.

The change was motivated by Wave 8 of a production project where five IntakeItems stayed in `draft` despite their code being live. The operator had to reconcile manually. From 0.7.0, that reconciliation is automatic.

Also ships: a stdlib-only skills benchmark harness designed for reproducible, article-publishable performance testing.

Release notes: `docs/releases/0.7.0-graph-lifecycle/release-notes.md`
