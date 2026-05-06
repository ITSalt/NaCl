NaCl 0.12.0 part 1 — TDD Discipline at the Dev Layer

The three dev skills (nacl-tl-dev, nacl-tl-dev-be, nacl-tl-dev-fe) claimed RED-first TDD but had no enforcement: no baseline capture before tests, no verification that new tests actually appeared in the failure output, and no delta comparison to confirm GREEN was real. The same dishonesty class as 0.10.0 — just one layer earlier in the pipeline.

All three now follow a six-sub-step cycle: DISCOVER RUNNER → CAPTURE BASELINE → WRITE TESTS → VERIFY RED → IMPLEMENT → VERIFY GREEN + COMPARE. Every output carries an explicit status headline (DEV COMPLETE / DEV APPLIED — UNVERIFIED / DEV APPLIED — BLOCKED / DEV APPLIED — NO_INFRA / DEV APPLIED — RUNNER_BROKEN / DEV INCOMPLETE — REGRESSION) backed by a baseline diff, not a self-reported claim. nacl-tl-dev also gets a parallel B-path for infra tasks (Docker, CI/CD) with a verification-command baseline and re-run discipline.

Part 2 (Wave 4) propagates the new status vocabulary to all orchestrators. The v0.12.0 git tag ships after part 2.
