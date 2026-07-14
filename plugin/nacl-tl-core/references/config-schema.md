# NaCl `config.yaml` Schema

This document is the canonical reference for the per-project `config.yaml`
schema used by every `nacl-tl-*` skill. New fields land here in the same
wave that introduces them (Spec-First discipline).

## `project_kind: standard | prototype`

**Introduced in:** W1-blocking-review.
**Owners:** W1 (this entry, default + irreversibility); W4-blocking-release
(PR/CI carve-out semantics).

### Specification

```yaml
project_kind: standard   # or: prototype
```

- **Type:** string enum.
- **Allowed values:** `standard`, `prototype`.
- **Default (when field absent):** `standard`.
- **Where read:** `nacl-tl-release` (W4) for direct-strategy PR/CI carve-out
  decisions. `nacl-tl-review` (W1) does NOT branch on this field — the
  repo-wide check gate applies in both modes.

### Irreversibility Rule

Switching `prototype → standard` is **irreversible without a signed
exception**. Once a project has been declared `standard` (whether by
default or by explicit declaration), changing it back to `prototype`
requires a signed exception under the schema W4 publishes. This
prevents a release-time downgrade from `standard` (PR/CI required) to
`prototype` (PR/CI carve-out allowed) as a way to bypass the W4 release
gate.

The reverse direction — `standard → prototype` — is unconstrained by
this rule; it would only widen the PR/CI carve-out surface, which is a
separate W4-policy concern (W4 owns whether and how to gate that).

The orchestrator that observes the change reports the violation as
`Status: BLOCKED` with workflow detail `project_kind-downgrade-unsigned`
and refuses to advance until the signed exception is filed.

### Carve-out Semantics (W4 territory)

`project_kind` only governs PR/CI carve-outs for the release gate. It
does **not** govern:

- The repo-wide check gate in `nacl-tl-review` (W1) — that gate applies
  in both modes. A `prototype` project with red `pnpm -r typecheck` has
  VERIFIED refused at review.
- Wire-evidence requirements in `nacl-tl-sync` (W2) — both modes
  require wire-evidence for any UC with `actor != SYSTEM`.
- The QA gate in `nacl-tl-qa` (W3).
- Conductor reconciliation in `nacl-tl-conductor` (W5).

For prototypes, repo-wide-check evidence is still required —
`project_kind` only governs PR/CI carve-outs in W4, not local check
expectations.

#### W4 PR/CI Carve-Out (binding)

`project_kind: prototype` enables a **single, narrow** carve-out at
the release gate: direct-strategy releases (no PR, no CI run) are
permitted, BUT only when **both** conditions hold:

1. `config.yaml` declares `project_kind: prototype` AND
2. A signed exception exists (per `.tl/exceptions/_template.yaml`)
   with `affected_gates` enumerating **exactly** the gate names
   being skipped: `skipped-pr` and `skipped-ci` (one or both,
   matching what the release actually skips).

If `project_kind: prototype` is declared but no signed exception
covers the skipped-PR/skipped-CI gate(s), the release skill refuses
VERIFIED with `Status: BLOCKED` and workflow detail
`skipped-pr-without-prototype-exception` or
`skipped-ci-without-prototype-exception`. The carve-out is
**conjunctive** — prototype-mode alone does NOT bypass PR/CI; a
signed exception alone does NOT bypass PR/CI; both must be present.

For `project_kind: standard` (default), the PR/CI gates apply
unconditionally. A signed exception with
`affected_gates: [skipped-pr]` filed against a `standard` project is
rejected as malformed (workflow detail
`exception-prototype-only-gate-on-standard-project`).

`project_kind: prototype` does NOT carve out:

- The graph-staleness gate.
- The `/nacl-sa-validate` CRITICAL gate.
- The PROD_GOLDEN_PATH gate.
- The upstream `tl-sync` / `tl-qa` VERIFIED requirement.

Each of those gates requires its own signed exception with its own
`affected_gates` entry, identical to a `standard` project.

### Examples

A standard project (most projects):

```yaml
# config.yaml
project_kind: standard
git:
  strategy: feature-branch
  main_branch: main
```

A prototype project (carve-out candidate; still subject to repo-wide
check gate):

```yaml
# config.yaml
project_kind: prototype
git:
  strategy: direct
  main_branch: main
```

### Validation

`nacl-tl-release` (W4) validates the value during its prelude. Unknown
values report `Status: BLOCKED` with workflow detail
`project_kind-unknown` and an enumeration of the allowed values.

## `runtime_assets: [<path>, ...]`

**Introduced in:** W9-ci-clean-checkout.
**Owners:** W9 (this entry, schema + defaults); `nacl-tl-deliver`
(producer at Step 4b clean-checkout gate); `nacl-tl-deploy`
(downstream reader of the resulting evidence artifact).

### Specification

```yaml
runtime_assets:
  - "bin/ffprobe"
  - "worker/dist/llm/prompts/ru/protocol.md"
  - "worker/dist/llm/prompts/en/protocol.md"
  - "dist/index.js"
  - "dist/assets/fonts/Inter-Regular.woff2"
```

- **Type:** list of strings.
- **Path interpretation:** paths are relative to the project root
  AFTER a clean checkout has run install + build. They reference
  the file or directory that MUST exist on disk for the runtime
  entrypoint to function. They are NOT relative to `dist/` —
  multi-workspace monorepos must spell out the workspace prefix
  (e.g. `worker/dist/...`).
- **Default (when field absent):** the empty list. A project with
  no `runtime_assets` declared passes the runtime-asset check
  trivially, but loses the W9 gate's protection against the C1–C7
  category of failures documented in
  `docs/retrospectives/project-beta-runtime-baseline.md`.
- **Where read:** `nacl-tl-deliver` Step 4b (clean-checkout gate)
  iterates the list; every entry must exist after the clean build.
  Missing any entry → `BLOCKED (clean-checkout-runtime-assets-missing)`
  with the specific missing path captured in the evidence artifact
  under `runtime_assets_verified[].present = false`.

### Project-Shape Defaults (RECOMMENDED, not auto-injected)

These are starting points for new projects, derived from the
postmortem catalog. Each project is expected to copy the relevant
block into its `config.yaml` and adjust to local workspace layout.

**Node/TypeScript backend with native binaries (ffmpeg pipeline):**

```yaml
runtime_assets:
  - "bin/ffprobe"           # native binary, must ship with image
  - "bin/ffmpeg"            # ditto
  - "dist/index.js"         # pm2 entrypoint — NOT dist/server.js
```

Worked source: project-beta C5 (ffmpeg seekable input), C6 (ffprobe
`s3://` rejection), C2 (pm2 entry-point: `server.js` is the Fastify
factory `buildApp()`, `index.js` is the `.listen()` caller). See
`docs/retrospectives/project-beta-runtime-baseline.md` rows C1–C7.

**Node/TypeScript with non-TS runtime assets (LLM prompts, locale data):**

```yaml
runtime_assets:
  - "worker/dist/llm/prompts/ru/protocol.md"
  - "worker/dist/llm/prompts/en/protocol.md"
  - "worker/dist/i18n/ru.json"
  - "worker/dist/i18n/en.json"
```

Worked source: project-beta C1 — `tsc` emitted only `.js`, leaving
`dist/llm/prompts/` empty; the worker threw `ENOENT` on the first
UC-300 job after deploy.

**Frontend with embedded fonts / static assets:**

```yaml
runtime_assets:
  - "dist/assets/fonts/Inter-Regular.woff2"
  - "dist/assets/fonts/Inter-Bold.woff2"
  - "dist/locales/en.json"
  - "dist/locales/ru.json"
```

**Backend with Prisma (companion fields):**

```yaml
build:
  package_manager: "pnpm"
  requires_prisma_generate: true
  test_database_url: "postgres://...@localhost:5432/scratch"
  migrate_cmd: "pnpm prisma migrate deploy"
  entrypoint: "dist/index.js"

runtime_assets:
  - "node_modules/.prisma/client/index.js"
  - "node_modules/.prisma/client/schema.prisma"
  - "dist/index.js"
```

Worked source: Project-Alpha pnpm/Prisma cluster — local dev had run
`prisma generate` eagerly at install time, so the generated client
sat warm in `node_modules/.prisma/`. The first clean runner did
not regenerate; the build emitted JS that imported a missing
`.prisma/client` module. The `requires_prisma_generate: true`
field tells the clean-checkout gate to fail with
`clean-checkout-prisma-generate-missing` when build does not
include the generate step.

### Discovery Helper

When a clean-checkout BLOCKED is reported for `runtime_assets-missing`
on a project that has not yet enumerated the list, the gate's
evidence artifact records the actual built tree under
`.tl/clean-checkout/<commit>.json → runtime_assets_verified`. The
operator inspects that capture, identifies the binary / markdown /
font that the runtime actually loaded, and adds it to
`config.yaml → runtime_assets`. The next clean-checkout run then
enforces the new entry. (A future helper, out of W9 scope, would
auto-suggest entries by intersecting `lsof` output during the
smoke step with the built artifact tree.)

### Validation

`nacl-tl-deliver` Step 4b validates entries during the clean-checkout
gate; missing entries report `BLOCKED` with workflow detail
`clean-checkout-runtime-assets-missing` and the specific path in the
evidence artifact. Malformed entries (non-string, absolute path) are
rejected as schema errors with detail
`runtime_assets-entry-malformed`.

## `build.*` (clean-checkout supporting fields)

**Introduced in:** W9-ci-clean-checkout.
**Owners:** W9; consumed by `nacl-tl-deliver` Step 4b.

### Specification

```yaml
build:
  package_manager: "pnpm"      # one of: pnpm | npm | yarn (lockfile-derived if absent)
  requires_prisma_generate: false
  entrypoint: "dist/index.js"  # default: package.json `main`, else dist/index.js
  test_database_url: ""        # required when migrate_cmd is set
  migrate_cmd: ""              # optional; absence = SKIPPED migrate stage
```

- `package_manager` — resolves to a single tool for the clean-checkout
  install step. If absent, derived from `package.json` `packageManager`
  or lockfile presence (`pnpm-lock.yaml` → pnpm, `package-lock.json`
  → npm, `yarn.lock` → yarn). Mixed lockfiles in a single workspace
  → `BLOCKED (clean-checkout-pm-ambiguous)`.
- `requires_prisma_generate` — when `true`, the clean-checkout gate
  asserts that `prisma generate` runs as part of (or before) the
  build step. Missing → `BLOCKED (clean-checkout-prisma-generate-missing)`.
- `entrypoint` — the file the clean-checkout gate boots in the
  run-smoke step. The project-beta `dist/index.js` vs
  `dist/server.js` confusion lives here: `entrypoint` MUST be the
  file that calls `.listen()`, not the factory file.
- `test_database_url` — scratch database URL for the migrate stage.
  When `migrate_cmd` is set and this is empty, the gate emits
  `BLOCKED (clean-checkout-test-database-url-undefined)`.
- `migrate_cmd` — migration command. When absent, the migrate stage
  records `SKIPPED` (not BLOCKED) and the gate proceeds.

## `deploy.smoke.endpoints: [<path>, ...]`

**Introduced in:** W9-ci-clean-checkout.

### Specification

```yaml
deploy:
  smoke:
    endpoints:
      - "/api/health"
      - "/api/jobs"        # one product endpoint that exercises real surface
```

- **Type:** list of strings (URL paths).
- **Default (when field absent):** `["/api/health"]`. A defaulted list
  produces a `PASS_HEALTH_ONLY` smoke status in the clean-checkout
  evidence artifact (not `PASS`) — health-only smoke is NOT
  product-readiness evidence, mirroring the W4 stance on HEALTH_ONLY
  at the release-time gate.
- **Where read:** `nacl-tl-deliver` Step 4b run-smoke step. Each
  path is curl'd against the booted entrypoint; non-2xx →
  `BLOCKED (clean-checkout-smoke-failed)`.

## `intake.*` (self-diagnosis scoring)

**Introduced in:** intake-self-diagnosis (post-2.15).
**Owners:** `nacl-tl-intake` Step 2a.5 PROBE; consumed by `/nacl-goal intake`.

### Specification

```yaml
intake:
  route_threshold: 0.7        # score >= this -> auto-route on the leading hypothesis
  high_confidence: 0.9        # score >= this -> HIGH confidence (no tracked alternative)
  scores:                     # rubric row values (verdict pattern -> score)
    leader_confirmed_all_refuted: 0.95
    leader_confirmed_some_inconclusive: 0.8
    leader_indirect_all_refuted: 0.75
    leader_indirect_inconclusive: 0.55
    contradictory: 0.4
    all_inconclusive: 0.2
```

- **Type:** floats in `(0, 1]`.
- **Default (when field absent):** every key falls back independently to
  the built-in defaults above — canonical home:
  `$(nacl-home)/nacl-tl-core/references/intake-scoring.md` (rubric semantics, resolution
  order, worked examples, tuning guidance).
- **Sanity clamp:** values outside `(0, 1]` or
  `route_threshold > high_confidence` → warn + use defaults for the
  offending key(s); a broken config must not silently disable the
  question gate.
- **Where read:** `nacl-tl-intake` Step 2a.5 (PROBE scoring) and Step 2b
  case table; `/nacl-goal intake` inherits the values via the emitted
  `diagnosis.score` / `diagnosis.threshold_used` (it does not re-read
  config).
- **Effect:** controls only intake routing and the question gate.
  Hard-refuse triggers (billing, auth, schema migration, destructive ops,
  product decisions) are score-independent and never auto-route.
