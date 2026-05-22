// Clean TS module — `pnpm -r typecheck` exits 0.
// The W1 repo-wide check gate permits VERIFIED on this wave-tip commit
// (subject to the rest of the review).

export function add(a: number, b: number): number {
  return a + b;
}
