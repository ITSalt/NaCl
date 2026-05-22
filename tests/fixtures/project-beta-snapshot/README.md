# project-beta-snapshot — W11-pilot fixture

**Purpose:** reconstructed wave-tip snapshot of the project-beta project
at the documented "production live" failure point (2026-05-18 22:28
UTC), built from read-only `.tl/*` artifacts + live Neo4j capture
taken in W0 (`tests/fixtures/graph-snapshots/project-beta/`) + the W0
runtime baseline (`docs/retrospectives/project-beta-runtime-baseline.md`).

This fixture is the W11-pilot replay surface for every post-W1..W10
gate that fires against the project-beta failure modes. It is NOT the
full ~136-file project-beta codebase — only the minimum code shapes
required to exercise each gate.

---

## Failure modes encoded in this fixture

| # | Failure mode | Source episode | Expected firing gate |
|---|---|---|---|
| 1 | api.kie.example.invalid LLM integration code (`worker/src/llm/kieai.ts`) ships with NO recorded fixture, no contract test, no live-smoke recording — `nacl-tl-sync` PASS-flagged on TS-type alignment only | project-beta-postmortem.md § 3.3 (api.kie.example.invalid endpoint shape `SPEC MISSING`); fix `1f025b7 fix(UC-300): switch api.kie.example.invalid client to Anthropic /claude/v1/messages` | **tl-sync Wire-Evidence Gate** (W2) — `UNVERIFIED (wire-evidence missing)` for UC-300 (`actor != SYSTEM`) |
| 2 | No upload E2E test exists for UC-200 (ffmpeg pipeline); no provider QA for UC-300; aggregate QA goes "skipped" because no Deepgram + no api.kie.example.invalid key in test env | project-beta-postmortem.md § 3.8 (UC-200 ffmpeg input `SPEC WRONG`); § 3.3; § 5 `nacl-tl-qa` SKIP-on-missing-keys | **tl-qa six-stage decomposition** (W3) — aggregate `UNVERIFIED` because `LIVE_PROVIDER_SMOKE` and `PROD_GOLDEN_PATH` are `NOT_RUN` (mandatory floor) |
| 3 | "deliver(.tl): production live" tagged at `4da4aca` with full upload golden path deferred; `.tl/release-status.json` shows `health.status: "skipped"` (no production URL) | project-beta-postmortem.md § 1 (declared done at 22:28 with 15 fixes following); `.tl/release-status.json:6` | **tl-release Strict-Only block-conditions** (W4) — `BLOCKED (missing-prod-golden-path)`; HEALTH_ONLY ≠ product-readiness |
| 4 | Changelog claims FR-xyz / UC traceability but the live graph lacks the corresponding `FeatureRequest` / `UseCase` nodes | project-beta-runtime-baseline.md C1..C8; graph snapshot has `UCStub` but no full UseCase nodes for UC-200, UC-300 | **tl-conductor Phase 4.5 reconciliation** (W5) — `BLOCKED (artifact-drift)`; pair P-S2 FAIL |
| 5 | Catalog page is missing the "Upload" affordance — UC-100 (upload UC) has zero inbound `HAS_INBOUND_ACTION` edges from any Component reachable from a navigation root | project-beta-postmortem.md § 3.4 (`UC-001 catalog has no upload entry-point — SPEC MISSING`); fix `0ec0a4e fix: add upload button to catalog page header` | **sa-ui / tl-review reachability gate** (W7) — `BLOCKED (nav-actions-missing)` for UC-100 |
| 6 | UC-200 (transcoding queue) has queue / long-running / recoverable characteristics but no `RuntimeContract` documenting ffmpeg seekability requirement, the failed-job retry semantics, or the cancel-while-transcoding race | project-beta-postmortem.md § 3.8 (`SPEC WRONG` on UC-200 ffmpeg input); project-beta-runtime-baseline.md row C8 | **sa-uc Runtime Contract gate** (W8) — `BLOCKED (runtime-contract-missing)` for UC-200 |
| 7 | ffprobe binary missing in build output (declared in `config.yaml.runtime_assets` post-W9); LLM prompt markdown `worker/src/llm/prompts/ru/protocol.md` referenced at runtime but not copied to `dist/` | project-beta-postmortem.md § 3.7 (UC-300 prompts not packaged); commit `66049d5 fix(UC-300): copy llm/prompts/*.md into worker dist on build` | **tl-deliver Clean-Checkout gate** (W9) — `BLOCKED (clean-checkout-runtime-assets-missing)` |
| 8 | TUS Location header used http behind Caddy reverse-proxy; deploy health green, URL not browser-reachable. Plain health-only check would pass but PROD_GOLDEN_PATH (actual file upload) would fail | project-beta-postmortem.md `15c6a20 fix: TUS Location header uses https behind Caddy reverse proxy` | **tl-deliver HEALTH_ONLY-vs-PROD_GOLDEN_PATH** (W4) — `BLOCKED (missing-prod-golden-path)` |
| 9 | A code-first L1 fix attempt would land before any spec update — e.g. patching the api.kie.example.invalid adapter without a preceding `nacl-sa-architect`-authored external-contracts.md update | project-beta-postmortem.md § 3.3; project-beta-postmortem-codex.md Rule-1 patterns | **tl-fix spec-first prerequisite** (W10) — `BLOCKED (spec-first-prerequisite-missing)` |

## Synthetic UC manifests

- `.tl/tasks/UC-200/task-be.md` — transcoding queue UC declaring queue +
  long-running + recoverable traits, no RuntimeContract → W8 fires.
- `.tl/tasks/UC-300/api-contract.md` — api.kie.example.invalid-backed protocol UC
  declaring `actor != SYSTEM` (analyst initiates), no wire-evidence
  fixture → W2 fires.

## Synthetic code shapes

- `worker/src/llm/kieai.ts` — adapter file that imports a shared
  `ILlmProvider` type but contains NO wire-evidence fixture and NO
  contract test (the type-aligned but wire-mismatched shape from § 3.3).
- `api/src/plugins/tus.ts` — declared TUS server mount; no
  X-Forwarded-Proto handling, no production-URL check, replicating
  the proxy-header gap.
- `web/src/routes/catalog/index.tsx` — catalog page WITH only an
  `open_button` and NO upload affordance (UC-001 spec exact shape from
  postmortem § 3.4); the Component has no `HAS_INBOUND_ACTION` edge to
  UC-100 in the graph fixture.

## Empty exceptions directory

`.tl/exceptions/` is intentionally empty. No `.tl/exceptions/*.yaml`
files exist in this fixture, so every gate above fires WITHOUT a
covering signed exception.

## Live graph snapshot

`tests/fixtures/graph-snapshots/project-beta/_summary.json` shows
`UCStub` count (placeholder UC nodes) but full UseCase coverage is
incomplete. The W4 graph-stale block uses this directly; the W5
artifact-drift gate cross-checks the changelog claims against the
live graph (live graph reads only — no `.cypher` fallback).

## Runtime baseline

`docs/retrospectives/project-beta-runtime-baseline.md` (from W0)
enumerates ffmpeg, ffprobe, pm2 entry, prompt markdown, and TUS
proxy-header concerns. The W9 fixture
`tests/fixtures/clean-checkout-missing-asset/` is the materialised
form of the same.
