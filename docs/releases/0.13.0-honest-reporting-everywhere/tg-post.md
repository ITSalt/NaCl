**NaCl 0.13.0 released — honest reporting, everywhere**

0.10.0 made one skill (`nacl-tl-fix`) report PASS honestly. 0.11.0 spread the discipline to verification. 0.12.0 carried it through the dev TDD trio and the seven orchestrators. 0.13.0 closes the gap across the remaining 22 skills.

Highlights:
— Dev skills (`nacl-tl-dev`, `-be`, `-fe`) no longer write their own tests. They delegate to `nacl-tl-regression-test mode=feature-dev` (new in this release) — the same test-author-isolation seam that bug-fix mode has had since 0.10.0.
— `nacl-tl-verify-code` now runs the suite twice and computes `new_failures = postfix − baseline`, properly distinguishing REGRESSION from BLOCKED. `tests_collected > 0` is a precondition for any PASS.
— `nacl-tl-stubs` sanity-seeds against a known stub marker before scanning; `STUBS COMPLETE` is gated on a triple condition (no stubs AND no empty test files AND tests actually scanned).
— `nacl-tl-qa` halts on zero testable criteria; verifies screenshot files exist on disk.
— `nacl-tl-hotfix` `--yes` no longer bypasses the pre-merge gate. Scenarios 1/2 require RED→GREEN evidence on `main` before merge.
— `nacl-tl-reopened` parses the authoritative `Status:` line (not the legacy headline); re-runs the suite on the reopened branch before review.
— Operational/reporting skills (`-deploy`, `-reconcile`, `-intake`, `-sync`, `-docs`, `-review`, `-diagnose`) get the same six-status vocabulary plus contract sections.
— Reliability layer (`-conductor`, `-full`, `-deliver`, `-release`) now treats Neo4j as the primary source; phase advancement is fenced on graph-write success.

Full release notes: docs/releases/0.13.0-honest-reporting-everywhere/release-notes.md
