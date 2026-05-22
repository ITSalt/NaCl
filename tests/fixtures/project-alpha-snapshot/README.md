# project-alpha-snapshot — W11-pilot fixture

**Purpose:** reconstructed wave-tip snapshot of the Project-Alpha project at
the documented Wave-4 failure point (2026-05-11 17:07 UTC), built from
read-only `.tl/*` artifacts + live Neo4j capture taken in W0
(`tests/fixtures/graph-snapshots/project-alpha/`).

This fixture is the W11-pilot replay surface for every post-W1..W10
gate that fires against the Project-Alpha failure modes. It does NOT
reproduce the full ~200-file Project-Alpha codebase — only the minimum code
shapes required to exercise each gate.

The fixture is also used by the `tl-conductor` reconciliation gate
(W5) as a real-world drift scenario.

---

## Failure modes encoded in this fixture

Each row maps a documented Project-Alpha failure to the gate expected to
fire on it post-W1..W10.

| # | Failure mode | Source episode | Expected firing gate |
|---|---|---|---|
| 1 | `pnpm -r lint && pnpm -r typecheck && pnpm -r test` red on the wave-tip commit | project-alpha-postmortem.md § 3.12; `.tl/fix-plan-wave-4-audit-2026-05-11.md` claims 1–6 | **tl-review repo-wide check gate** (W1) — `REVIEW APPLIED — BLOCKED (repo-checks-red)` |
| 2 | conductor-state.json claims `"typecheck": "clean across packages/shared, frontend, backend"` while CI is red — five-way drift across status / conductor-state / changelog / live graph / release-status | postmortem § 3.12; `.tl/conductor-state.wave-4-2026-05-11.json:30`; project-alpha-postmortem-codex.md § 3 | **tl-conductor Phase 4.5 reconciliation gate** (W5) — `BLOCKED (artifact-drift)` |
| 3 | Live graph 1083 nodes vs handover-snapshot 970 (stale graph baseline at release time) | nacl-postmortems-synthesis.md "Refinement 1"; live capture `tests/fixtures/graph-snapshots/project-alpha/_summary.json:152` (`"total_nodes": 1083`) | **tl-release Strict-Only block-conditions table** (W4) — `BLOCKED (graph-stale)` |
| 4 | Publishers `publishTaskEvent` / `publishNotification` / `pushSseEvent` defined in `task.events.ts` / `notification.events.ts` but never called from `worker.ts` / `engine.ts` (dead code that passed review) | postmortem § 3.12; `.tl/fix-plan-wave-4-audit-2026-05-11.md` claims 1 + 2 | **tl-review repo-wide check gate** (W1) — Wave-4 PASS is impossible while these stubs sit unwired (caught indirectly via lint+typecheck on the import chain) |
| 5 | UC-112 restart-after-failure silently no-ops because of `ON CONFLICT DO NOTHING` on `queue_items` re-enqueue — no Runtime Contract on UC-112 covers the `failed → pending` transition with DELETE-before-INSERT semantics, the `TASK_NOT_RESTARTABLE` 409 branch, or the row-level lock | postmortem § 3.5 (UC-112); fix `67a6a44` | **sa-uc Runtime Contract gate** (W8) — `BLOCKED (runtime-contract-missing)` for UC-112 |
| 6 | `.tl/release-status.json` records `graph.status: "warn"` with `reason: "No IntakeItem nodes exist; Task statuses stale"` and `operator_override.confirmed_by: "user"` carrying the release tag through anyway | `.tl/release-status.json:10,13`; project-alpha-postmortem-codex.md § 3 | **tl-release Strict-Only** (W4) — `BLOCKED (graph-stale)`; operator-override path no longer exists post-W4 |
| 7 | Direct git strategy without PR/CI on a `project_kind: standard` project — `.tl/release-status.json` shows `merge.status: "skipped"`, `ci.status: "skipped"`, `health.status: "skipped"`, `prs: []` | `.tl/release-status.json:3-7`; project-alpha-postmortem-codex.md § 4 | **tl-release Strict-Only** (W4) — `BLOCKED (skipped-pr-without-prototype-exception)` |
| 8 | `a7eb747 docs(SA): UC-105/106/107 post-commit emit timing (L2)` lands AFTER six code-fix commits in the FIX-B chain → spec-first prerequisite missing on the L2 fix-chain | postmortem § 2 (rows for `01f2fcb`, `135b14b`, `6ed12ac`, `a7eb747`); DIAGNOSTIC-REPORT.md (39% of fixes never updated docs) | **tl-fix spec-first prerequisite** (W10) — `BLOCKED (spec-first-prerequisite-missing)` |
| 9 | `8522d1d fix(admin): unstub WORKFLOW_STEPS + categories envelope + WSC dropdown paging` — TODO marker removed, but `WORKFLOW_STEPS` const carried fake dot-notation IDs that didn't match the real workflow step catalog. Stub closed without runtime/shape validation. | postmortem § 3 nacl-tl-stubs; commit `8522d1d` | **tl-stubs shape-validation gate** (W10) — `STUBS APPLIED — UNVERIFIED (shape-unvalidated: STUB-WORKFLOW_STEPS)` |
| 10 | Sub-cluster: clean-checkout failures on first CI run on a clean runner — pnpm version hardcoded mismatch, MinIO command-arg missing, Drizzle migration journal desync, `TEST_DATABASE_URL` unset, `tsconfig.typecheck` vs `tsconfig` divergence | postmortem § 5 pattern 5; commits `f0dd78c`, `1f8efa7`, `9b72bbc`, `49eee5d`, `2ea1eeb` | **tl-deliver Clean-Checkout gate** (W9) — `BLOCKED (clean-checkout-install-failed)` / `(clean-checkout-prisma-generate-missing)` / `(clean-checkout-test-database-url-undefined)` |

## Synthetic UC for the Runtime Contract gate

`.tl/tasks/UC-112/` is a minimally-reconstructed restart-bug UC
manifest. It declares queue / long-running characteristics (which
W8 mandates a RuntimeContract for) but ships no RuntimeContract.

## Empty exceptions directory

`.tl/exceptions/` is **intentionally empty**. No `.tl/exceptions/*.yaml`
files exist in this fixture, so every gate above fires WITHOUT a covering
signed exception. (The W4 schema lives at NaCl/.tl/exceptions/_template.yaml
and projects file their own. Empty here = all blocks unmitigated.)

## Live graph snapshot

The full per-label and per-relationship counts live at:

  `/home/project-owner/projects/NaCl/tests/fixtures/graph-snapshots/project-alpha/_summary.json`

with `total_nodes = 1083` and `total_rels = 2093`. The release-status.json
in this fixture (copied from the source project) describes a stale
handover snapshot of ~970 nodes; the live capture is the source of
truth for the W4 `graph-stale` block.

## How the gates read this fixture

W11-pilot is an ANALYTICAL replay (the SKILL.md files are markdown,
not runnable code). The replay quotes the SKILL.md clause that fires
on each input and asserts BLOCKED / UNVERIFIED. See
`docs/retrospectives/nacl-pilot-W11-report.md` for the full chain.
