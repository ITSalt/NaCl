# QA Stage Decomposition Fixtures (W3-blocking-qa)

Three reference scenarios for the six-stage QA decomposition introduced
in W3-blocking-qa. Each subdirectory contains a synthetic UC manifest
plus a `README.md` documenting the expected per-stage statuses and the
expected aggregate under the rules in
`/home/project-owner/projects/NaCl/nacl-tl-qa/SKILL.md`.

The W11-pilot subagent uses these fixtures to assert that the
aggregate-status rule (weakest non-`NOT_RUN`, with mandatory-stage
`NOT_RUN` floor forcing `UNVERIFIED`) fires correctly.

| Subdirectory | UC shape | Expected aggregate |
|---|---|---|
| `no-provider-dep/` | `actor != SYSTEM`, no provider dep, all four mandatory stages green | `VERIFIED` |
| `provider-dep-with-fixture/` | `actor != SYSTEM`, provider dep, `LIVE_PROVIDER_SMOKE` = `NOT_RUN` (mandatory) | `UNVERIFIED` (forced floor — unless signed exception) |
| `provider-dep-no-fixture/` | `actor != SYSTEM`, provider dep, `PROVIDER_FIXTURE_QA` = `NOT_RUN` AND `LIVE_PROVIDER_SMOKE` = `NOT_RUN` (both mandatory) | `UNVERIFIED` (BLOCKED on `PROVIDER_FIXTURE_QA` mandatory `NOT_RUN`) |
