# Fixture: review-panel

Hermetic input for the `nacl-review-panel` workflow's Phase-1 dry-run (and the future
`bench/` A/B sweep vs the markdown `nacl-tl-review` skill). Shape is a realistic NestJS
backend UC task (`.tl/tasks/UC001/`-style), kept tiny so a dry-run is cheap.

## Files

| File | Role |
|------|------|
| `diff.patch` | the code under review (3 new files: service, controller, spec) |
| `task-be.md` | backend task scope |
| `acceptance.md` | acceptance criteria (incl. SC01 authz, SC02 parameterized queries) |
| `result-be.md` | the dev's self-report (deliberately over-optimistic about SC02) |

## Ground truth (labeled — used to score finding-quality)

Two issues are planted, to exercise both stages of the panel:

1. **REAL — should survive adversarial verify.** `OrderService.getOrderById` builds SQL by
   string interpolation (`WHERE id = '${id}'`) → **SQL injection (BLOCKER, Security)**. This
   violates acceptance SC02 even though `result-be.md` claims parameterized queries. A correct
   review must surface it; a skeptic must NOT refute it (it is clearly real and reachable).

2. **SPURIOUS — should be refuted and dropped.** A Security reviewer may flag
   `deleteOrder` as "missing authorization (BLOCKER)". It is **not** missing: `OrdersController`
   applies `@UseGuards(AuthGuard)` controller-wide (visible in the diff and noted in
   `result-be.md`). The adversarial-verify skeptic should refute this finding.

A good panel run therefore ends in **CHANGES REQUESTED** (the SQLi blocker survives) while
the spurious authz finding is dropped at the Verify stage. Exact additional MAJOR/MINOR
findings are not asserted — LLM reviewers are non-deterministic; only the two labeled cases
are ground truth.

## Run (Phase-1 dry-run, hermetic — gates are not executed)

Invoke the workflow with `gateMode:"provided"` and all-GREEN gate results so no real
`pnpm`/`git`/Cypher runs; the panel reviews `diff.patch` directly. See
`.claude/workflows/README.md` for the exact `args`.
