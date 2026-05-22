# Fixture: review-gate / green-checks

A minimal pnpm-workspace repo where `pnpm -r lint`, `pnpm -r typecheck`,
and `pnpm -r test` all exit 0.

This fixture exists for the W11 pilot to demonstrate that
`nacl-tl-review` can emit VERIFIED on this wave-tip commit, and that
`repo-checks-GREEN:<commit>` evidence is recorded.

## Expected behavior

When `/nacl-tl-review` is invoked against a wave-tip commit that matches
this fixture's state:

- `pnpm -r lint` exits 0.
- `pnpm -r typecheck` exits 0 (the type error of the red fixture is
  fixed in `packages/app/src/index.ts`).
- `pnpm -r test` exits 0.

The skill MAY emit (subject to the rest of the review — stub gate,
acceptance criteria, test author independence, etc.):

```text
Status: VERIFIED
Workflow detail: REVIEW COMPLETE
verification_evidence: repo-checks-GREEN:<wave-tip-commit-sha>
```

The skill's `repo-checks-GREEN:<commit>` evidence MUST be recorded on
`Task.verification_evidence` per
`skills-for-codex/references/verification-evidence.md`.

This fixture does NOT guarantee that the full review will pass — it only
guarantees that the **repo-wide check gate** would not refuse VERIFIED.
Downstream gates (stub, spec-parity, test author independence) still
apply.

## Files

- `package.json` — workspace root.
- `pnpm-workspace.yaml` — declares `packages/*`.
- `packages/app/package.json` — declares `scripts.lint`, `scripts.typecheck`, `scripts.test`.
- `packages/app/src/index.ts` — clean TS module, no type errors.
- `packages/app/tsconfig.json` — same strict TS config as red fixture.

## Shape

This fixture does not need to actually execute under pnpm in the test
runner. It is an evidence shape — the W11 pilot may stub the command
output or run it for real.
