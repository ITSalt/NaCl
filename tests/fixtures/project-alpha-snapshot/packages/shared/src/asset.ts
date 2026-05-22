// Synthetic reconstruction of the wave-tip lint error.
// Source episode: .tl/fix-plan-wave-4-audit-2026-05-11.md claim 4:
//   "`pnpm -r lint` fails on `packages/shared/src/asset.ts:12`
//    Inline `import('./task-105.js').FileType` annotation; rule
//    `@typescript-eslint/consistent-type-imports` forbids it."
//
// FileType is already re-exported on line 4 — drop the inline import to
// satisfy the lint rule. In this fixture the bug is INTENTIONALLY left
// in place so the W1 repo-wide check gate fires.
//
// Wave-tip-equivalent commit: d2d90eb (Project-Alpha main, 2026-05-11 17:07).

import { FileType } from './task-105.js';
export { FileType };

export interface Asset {
  id: string;
  // L12 — the cited offender. ESLint
  // @typescript-eslint/consistent-type-imports forbids inline import().
  file_type: import('./task-105.js').FileType;
}
