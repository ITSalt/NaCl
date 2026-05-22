# with-contract — VERIFIED path

Demonstrates a UC-300-style integration with a `api.kie.example.invalid` provider where
`nacl-tl-plan`'s External Contracts Gate (Step 1.6) passes because the
required artifact is present and complete.

## Shape

- `.tl/tasks/UC300/task-be.md` — sample UC backend task spec that
  references `api.kie.example.invalid` (a `kind: provider` external contract) as an
  external dependency. The contract id `ext-kie` matches the
  `ExternalContract.id` that `nacl-sa-architect` writes during its
  External Contracts phase.
- `.tl/external-contracts/kie.md` — a fully-filled contract per the
  template at `.tl/external-contracts/_template.md`. All required
  sections (1–8, 10, 11) are populated with non-stub content; section 9
  (Model namespace) is populated because `kind == provider`; section 7
  (File URL reachability) is explicitly marked `N/A — no file URLs`.

## Expected `nacl-tl-plan` outcome

- Graph query at Step 1.6.1 returns `(UC-300, ext-kie, api.kie.example.invalid, provider,
  .tl/external-contracts/kie.md)`.
- Filesystem existence check at Step 1.6.2 passes: the file is present.
- Stub check at Step 1.6.2 passes: every required section is filled.
- Gate verdict: PASS.
- Planning proceeds; UC-300 task files are generated.
- Closed Codex status: `VERIFIED`.
- Claude headline: `PLAN COMPLETE`.

This fixture is the positive control for `W11-pilot` replays of the
project-beta UC-300 episode against the post-W6 gate.
