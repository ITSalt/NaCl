# without-wire-evidence — UNVERIFIED path

Demonstrates a UC-300-style integration with a api.kie.example.invalid-style LLM provider
where `nacl-tl-sync` MUST emit `Status: UNVERIFIED` with workflow detail
`wire-evidence-missing` because the Wire-Evidence Gate is not satisfied.

## Shape

- `src/ProtocolProvider.ts` — identical TS interface and
  `KieAiProtocolProvider` implementation as `with-wire-evidence/`.
- No `wire-evidence/` directory.
- No runnable test that exercises the wire envelope. (A pure `vi.mock(...)`
  unit test of the same code would not change the outcome — in-repo mocks
  are not wire-evidence by the W2 definition.)

## Expected `nacl-tl-sync` outcome

- UC `actor` = `LLM_PROVIDER` ≠ `SYSTEM` → wire-evidence required.
- Zero `wire-evidence:*` artifacts present.
- Type-alignment still passes — BE and FE share the same interface; no DTO
  drift. **This is the false-PASS surface the W2 gate exists to close.**
- Closed Codex status: `UNVERIFIED` with workflow detail
  `wire-evidence-missing`.
- Claude headline: `SYNC APPLIED — UNVERIFIED (wire-evidence missing)`.
- `Task.verification_evidence` does NOT get a `wire-evidence:*` entry
  appended. (It may still carry `repo-checks-GREEN:<commit>` and
  `test-GREEN:<path>` from upstream skills — those are orthogonal
  dimensions.)

This fixture replicates the project-beta api.kie.example.invalid `404 model not found`
episode: under the **old** gate, sync would have emitted `SYNC COMPLETE`
on type-alignment alone (this was the false-PASS surface). Under the
**new** gate, sync emits UNVERIFIED, blocking the chain until either a
`wire-evidence:fixture:<path>` (see `with-wire-evidence/`) or a signed
exception under the W4 schema is provided.

To convert this fixture to a VERIFIED state, copy
`with-wire-evidence/wire-evidence/` and
`with-wire-evidence/tests/wire-format.fixture.test.ts` into this
directory. The TS implementation is already identical between the two
fixtures — only the evidence dimension differs.

This fixture is the negative control for `W11-pilot` replays of the
project-beta UC-300 episode.
