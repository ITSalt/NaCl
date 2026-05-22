// Intentional TS type error — `pnpm -r typecheck` must exit non-zero.
// The W1 repo-wide check gate refuses VERIFIED on this wave-tip commit.

export function add(a: number, b: number): number {
  // TS2322: Type 'string' is not assignable to type 'number'.
  const result: number = "not-a-number";
  return result + a + b;
}
