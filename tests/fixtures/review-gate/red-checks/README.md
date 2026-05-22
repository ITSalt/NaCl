# Fixture: review-gate / red-checks

A minimal pnpm-workspace repo where `pnpm -r typecheck` would fail
(intentional TS type error in `packages/app/src/index.ts`).

This fixture exists for the W11 pilot to demonstrate that
`nacl-tl-review` refuses VERIFIED on this wave-tip commit.

## Expected behavior

When `/nacl-tl-review` is invoked against a wave-tip commit that matches
this fixture's state:

- `pnpm -r lint` exits 0 (no lint errors in this fixture).
- `pnpm -r typecheck` exits non-zero (the type error in `index.ts`).
- `pnpm -r test` is not reached (the gate refuses after the failing
  command — though some runners may proceed; either is acceptable).

The skill MUST emit:

```text
Status: BLOCKED
Workflow detail: repo-checks-RED
```

with headline `REVIEW APPLIED — BLOCKED (repo-checks-RED)` (Claude
flavor) or the equivalent Codex closed-vocabulary reporting.

The skill MUST NOT emit:

- `Status: VERIFIED`
- Any `APPROVED` verdict
- `repo-checks-GREEN:<commit>` evidence

## Files

- `package.json` — workspace root.
- `pnpm-workspace.yaml` — declares `packages/*`.
- `packages/app/package.json` — declares `scripts.lint`, `scripts.typecheck`, `scripts.test`.
- `packages/app/src/index.ts` — contains the intentional TS type error.
- `packages/app/tsconfig.json` — strict TS config that surfaces the error.

## Shape

This fixture does not need to actually execute under pnpm in the test
runner. It is an evidence shape — the W11 pilot may stub the command
output or run it for real.
