# with-wire-evidence — VERIFIED path

Demonstrates a UC-300-style integration with a api.kie.example.invalid-style LLM provider
where `nacl-tl-sync` can emit `Status: VERIFIED` because the Wire-Evidence
Gate is satisfied.

## Shape

- `src/ProtocolProvider.ts` — TS interface and a `KieAiProtocolProvider`
  implementation. Issues a real HTTP call shape (Anthropic-flavored body,
  Anthropic-flavored response envelope) — matching what the project-beta
  postmortem identified as the correct api.kie.example.invalid shape.
- `wire-evidence/fixture-response.json` — a recorded api.kie.example.invalid response. Real
  envelope (`content: [{ type, text }]`, not OpenAI `choices[0].message.content`).
- `tests/wire-format.fixture.test.ts` — a runnable test that loads
  `wire-evidence/fixture-response.json` and asserts `KieAiProtocolProvider`
  parses it without mocking the response shape. Pass condition: extracted
  text equals the literal string in the fixture; status code in the fixture
  equals 200.

## Expected `nacl-tl-sync` outcome

- UC `actor` = `LLM_PROVIDER` ≠ `SYSTEM` → wire-evidence required.
- One `wire-evidence:fixture:<path>` artifact present and runnable.
- Type-alignment passes (BE and FE both consume the same `ProtocolProvider`
  interface; no DTO drift).
- Runtime tests pass (assuming the host project's `scripts.test` finds the
  fixture's test).
- `Task.verification_evidence` gets the literal string
  `wire-evidence:fixture:tests/fixtures/sync-wire-evidence/with-wire-evidence/wire-evidence/fixture-response.json`
  appended by `nacl-tl-sync`.
- Closed Codex status: `VERIFIED`.
- Claude headline: `SYNC COMPLETE`.

This fixture is the positive control for `W11-pilot` replays of the
project-beta UC-300 episode.
