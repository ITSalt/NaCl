NaCl 0.10.1 — Honor Fix Contract in Downstream Skills

0.10.0 made the bug-fix skill honest about test coverage: six statuses, status-aware report headers, `--auto-ship` only on PASS. But two skills that consume `nacl-tl-fix` output — `nacl-tl-reopened` and `nacl-tl-hotfix` — weren't updated alongside. Result: reopened tasks with UNVERIFIED or NO_INFRA fixes could be auto-shipped; hotfix could send an UNVERIFIED fix to main without any additional prompt.

0.10.1 closes the gap. `nacl-tl-reopened` gets a new Step 7.5 that branches on all six statuses and gates auto-ship on PASS only. `nacl-tl-hotfix` treats anything other than PASS as halt-and-confirm before the PR step — the default answer is no. Both skills now carry a `## Contract` section that lists inputs, outputs, downstream consumers, and a standing rule: when a skill's output contract changes, its consumers must be audited in the same release.

The broader fix: this is now a documented discipline, not just a convention. Any future contract change to `nacl-tl-fix` (or any other skill) starts with reading its `## Contract` section to find who consumes its output.

https://github.com/magznikitin/NaCl
