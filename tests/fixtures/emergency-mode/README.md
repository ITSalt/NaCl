# Emergency Mode — Fixtures (W4-blocking-release)

These fixtures exercise the emergency-mode invocation pattern,
the loud-bypass behavior, the event file written under
`.tl/emergencies/`, and the side-effect contract (banner per
gate, append to release-status.json, append to .tl/changelog.md,
postmortem-feed tag).

## Layout

```
emergency-mode/
├── README.md                          # this file
├── invocation.sh                      # invocation example (env vars + skill launch)
├── expected/
│   ├── emergency-event.yaml           # the event file the skill MUST write
│   ├── banner-per-gate.txt            # the exact bypass banners (six, one per gate)
│   ├── release-status.json.delta      # the "emergency" key the skill MUST append
│   └── changelog.md.delta             # the blockquote line the skill MUST append
└── refusal-source.txt                 # the underlying refusals being bypassed
```

## Invocation pattern

```bash
NACL_EMERGENCY=1 \
NACL_EMERGENCY_REASON="prod 500s on /api/release/v0.18.0 — rolling back" \
NACL_EMERGENCY_OWNER="magznikitin" \
  claude --skill nacl-tl-release
```

All three env vars are REQUIRED. The skill refuses to enter
emergency mode if any is missing or empty.

## Behavior under emergency mode

The fixture is paired with `release-gate-strict/project-project-alpha-
blocked/` (which hits all six conditions). Under emergency mode
applied to that project:

1. Every Strict-Only gate still evaluates and still computes its
   refusal.
2. The skill prints **one bypass banner per gate** on stderr —
   six total, in workflow order:
   1. `EMERGENCY-BYPASS — direct-strategy-on-standard-project`
   2. `EMERGENCY-BYPASS — upstream-sync-unverified`
   3. `EMERGENCY-BYPASS — upstream-qa-unverified`
   4. `EMERGENCY-BYPASS — missing-prod-golden-path`
   5. `EMERGENCY-BYPASS — graph-stale`
   6. `EMERGENCY-BYPASS — sa-validate-critical`
3. The skill writes `.tl/emergencies/<UTC-timestamp>-prod-rollback.yaml`
   with `bypassed_gates[]` of length 6.
4. The skill appends to `release-status.json` under an
   `"emergency"` key.
5. The skill appends a blockquote line to `.tl/changelog.md`.
6. The skill emits terminal headline
   `RELEASE COMPLETE — emergency-bypass`.
7. Closed Status is `PARTIALLY_VERIFIED`. NEVER `VERIFIED`.
8. `postmortem_feed.tagged: true` is set in the event file.

## What this fixture asserts

The W11-pilot harness will assert:

- `expected/emergency-event.yaml` matches the file the skill
  wrote (modulo the UTC-timestamp in the filename and inside
  `invocation.timestamp_utc`).
- `expected/banner-per-gate.txt` matches what was printed on
  stderr, line-by-line (modulo absolute paths to the event file).
- `expected/release-status.json.delta` is exactly the
  `"emergency"` key that the skill added.
- `expected/changelog.md.delta` is exactly the blockquote that
  the skill appended under the in-flight `## ` heading.
- `expected/emergency-event.yaml` carries `side_effects.*: true`
  for all four side effects.

## What this fixture does NOT assert (out of scope for W4)

- The actual stderr capture is performed by the W11-pilot
  harness, not by W4. W4 ships the expected output only.
- The actual file-system writes (event file, status JSON, changelog
  line) are performed by the release skill, not by the fixture.
  W4 documents the contract; W11 runs it.
