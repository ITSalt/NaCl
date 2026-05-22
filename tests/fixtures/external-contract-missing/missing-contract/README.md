# missing-contract — BLOCKED path

Demonstrates a UC-300-style integration with a `api.kie.example.invalid` provider where
`nacl-tl-plan`'s External Contracts Gate (Step 1.6) refuses because the
required artifact is **absent on disk**.

## Shape

- `.tl/tasks/UC300/task-be.md` — the **same** sample UC backend task
  spec as the sibling `with-contract/` fixture. It declares an external
  dependency on `ext-kie` (api.kie.example.invalid).
- `.tl/external-contracts/` — intentionally **does not contain**
  `kie.md`. The directory itself is therefore absent (the fixture has
  no `external-contracts/` subdirectory at all). This replicates the
  false-PASS surface the W6 gate exists to close: a UC declares an
  external dependency, but no contract artifact pins down its endpoint,
  request/response shape, sync vs async, model namespace, failure
  codes, or wire-evidence path.

## Expected `nacl-tl-plan` outcome

- Graph query at Step 1.6.1 returns `(UC-300, ext-kie, api.kie.example.invalid, provider,
  .tl/external-contracts/kie.md)`.
- Filesystem existence check at Step 1.6.2 FAILS: the file is absent.
- Violation recorded: `(uc_id=UC300, contract_id=ext-kie,
  reason=external-contract-missing,
  expected_path=.tl/external-contracts/kie.md)`.
- Gate verdict: REFUSE.
- No TL graph nodes created. No `.tl/tasks/` files generated. No
  `.tl/status.json` / `.tl/master-plan.md` / `.tl/changelog.md`
  entries written.
- Closed Codex status: `BLOCKED`, workflow detail `external-contract-missing`.
- Claude headline: `PLAN HALTED — EXTERNAL_CONTRACT_MISSING`.
- Remedy surfaced to operator:
  1. Run `/nacl-sa-architect` External Contracts phase to author the
     missing contract, OR
  2. File a signed exception under the W4 schema covering the tuple
     `(UC300, ext-kie)`.

This fixture is the negative control for `W11-pilot` replays of the
project-beta UC-300 episode against the post-W6 gate.

## What this fixture is NOT

- It does NOT use an inline `--skip-external-contract` flag — that flag
  does not exist and is not planned.
- It does NOT use `project_kind: prototype` to relax the gate —
  prototypes are the PR/CI carve-out, not the contract carve-out.
- It does NOT include a signed exception — the fixture is the pure
  refusal path; the signed-exception path is exercised by a separate
  fixture once W4 ships its schema.
