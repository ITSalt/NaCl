**NaCl 0.12.0 released — TDD discipline across the full pipeline**

Two-part release. Part 1 (already shipped) hardened the three dev skills to actually enforce TDD: baseline capture before tests are written, RED verification that new tests appear in the failure set, and delta comparison at GREEN. Part 2 (this post) makes the seven orchestrator skills consume that honest status — conductor, full, ship, deliver, release, deploy, and reconcile. A task that was "unverified" now gets `t.status = 'verified-pending'` in the graph instead of silently receiving `done`. Merge to main, deploy, and ship all gate on PASS; UNVERIFIED tasks require explicit per-step user confirmation. Health failures in deploy now halt the pipeline rather than report-and-continue. All seven skills gain a `## Contract` section documenting the change-propagation discipline introduced in 0.10.1.

Full release notes: docs/releases/0.12.0-orchestrator-status-propagation/release-notes.md
