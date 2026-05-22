# Clean-Checkout Missing Asset — Fixture (W9-ci-clean-checkout)

This fixture reproduces the runtime-asset class of failures from the
project-beta retrospective (rows C1 and C7 in
`docs/retrospectives/project-beta-runtime-baseline.md`): a project
whose build succeeds and whose tests pass, but whose runtime cannot
function because non-TS assets the runtime loads at boot are absent
from the built artifact tree.

## Expected Verdict

When `nacl-tl-deliver` Step 4b (clean-checkout gate) runs against
this fixture, the gate MUST emit:

```
DELIVER HALTED — UNVERIFIED (clean-checkout-runtime-assets-missing)
```

and IntakeItems associated with the wave-tip commit MUST NOT be
stamped `delivered`.

When `nacl-tl-deploy` then attempts to ship that same commit, it MUST
read the resulting evidence artifact, observe `terminal_status:
BLOCKED` plus `blocker_detail: clean-checkout-runtime-assets-missing`,
and emit:

```
DEPLOY HALTED — BLOCKED (clean-checkout-runtime-assets-missing)
```

(Or, if the artifact is absent entirely, the simpler
`DEPLOY HALTED — BLOCKED (clean-checkout-artifact-missing)`.)

## Layout

```
clean-checkout-missing-asset/
├── README.md                       # this file
├── sample-project/
│   ├── config.yaml                 # declares runtime_assets: [bin/ffprobe, dist/llm/prompts/ru/protocol.md]
│   ├── package.json                # minimal Node/TS project
│   └── dist/                       # synthetic build output AFTER `pnpm -r build`
│       └── index.js                # entrypoint exists (smoke would boot it)
│       # NOTE: bin/ffprobe                              -- INTENTIONALLY MISSING
│       # NOTE: dist/llm/prompts/ru/protocol.md          -- INTENTIONALLY MISSING
└── expected/
    ├── clean-checkout-evidence.json   # the BLOCKED evidence artifact
    └── deliver-headline.txt           # exact DELIVER HALTED headline
```

## What the Fixture Hits

| # | Declared in `runtime_assets` | Present in `dist/`? | Source episode |
|---|---|---|---|
| 1 | `bin/ffprobe` | NO | project-beta C7 (ffprobe binary not shipped in image) |
| 2 | `dist/llm/prompts/ru/protocol.md` | NO | project-beta C1 (`tsc` emits only `.js`; prompt markdown disappears from `dist/`) |
| 3 | `dist/index.js` | YES | (control — present asset; smoke would boot this entry) |

The first two failures fire `clean-checkout-runtime-assets-missing`.
Entry 3 is the negative control demonstrating that the gate does NOT
false-positive on present assets.

## How the Gate Should Behave

The clean-checkout gate iterates `config.yaml → runtime_assets` after
the clean install + build. For each entry it stats the path under the
built tree. Any `present: false` entry forces `terminal_status:
BLOCKED` with `blocker_detail: clean-checkout-runtime-assets-missing`.
The evidence artifact records every declared path with its
`present` boolean, so the operator can identify which asset to
restore.

The gate does NOT short-circuit on the first missing asset — it
checks every entry so the evidence artifact captures the complete
gap list. (This matters when fixing the project: knowing one binary
is missing without knowing the other prompts file is missing too
forces a second clean-checkout iteration; capturing both up front is
the productive failure.)

## How the Test Harness Exercises This Fixture (out of scope for W9)

W9 ships only the fixture inputs + expected outputs. A future wave
(W11-pilot) will run the actual clean-checkout gate against this
fixture and assert that:

1. `expected/clean-checkout-evidence.json` matches the gate's output
   modulo timestamps.
2. `expected/deliver-headline.txt` matches the gate's terminal
   headline.
3. `nacl-tl-deploy` reading the BLOCKED evidence emits
   `DEPLOY HALTED — BLOCKED (clean-checkout-runtime-assets-missing)`.

## Cross-References

- `nacl-tl-deliver/SKILL.md` § "Step 4b: CLEAN-CHECKOUT GATE".
- `nacl-tl-deploy/SKILL.md` § "Step 1.0: Pre-monitor clean-checkout
  artifact gate".
- `nacl-tl-core/references/config-schema.md` § "`runtime_assets`".
- `.tl/clean-checkout/_template.json` (evidence artifact schema).
- `docs/retrospectives/project-beta-runtime-baseline.md` rows C1, C7.
