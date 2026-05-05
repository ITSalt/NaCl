/**
 * deterministic-id — seeded, node-id–keyed RNG for Excalidraw element fields.
 *
 * Excalidraw uses `seed` and `versionNonce` at runtime. When nacl-render
 * populated them with Math.random(), every regeneration produced a different
 * seed/versionNonce even for an unchanged graph — creating git diff noise.
 *
 * This module replaces Math.random() with a deterministic PRNG seeded on the
 * element's stable node id. Two regen runs on the same graph produce the same
 * bytes, so `git diff` is clean.
 *
 * Algorithm: 32-bit xorshift. Fast, non-crypto, deterministic given the seed.
 */
import { createHash } from 'node:crypto';

/**
 * Derive a 32-bit unsigned integer seed from an arbitrary string (node id,
 * element logical id, etc.). Uses sha256 and takes the first 4 bytes.
 */
export function seedFromId(id: string): number {
  const buf = createHash('sha256').update(id).digest();
  // Read 4 bytes as a big-endian uint32
  return ((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0;
}

/**
 * Minimal xorshift32 PRNG — returns a new state and a pseudo-random uint32.
 * Non-zero seed required; the seeder guarantees that via sha256.
 */
function xorshift32(state: number): { next: number; value: number } {
  let x = state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  x = x >>> 0; // force unsigned 32-bit
  if (x === 0) x = 1; // guard against zero state (degenerate case)
  return { next: x, value: x };
}

/**
 * Generate a stable element id string from a logical id + role suffix.
 * Returns an 8-hex-char string (32 bits of sha256).
 *
 * Using a short prefix makes the IDs human-readable in the JSON.
 */
export function elementId(logicalId: string, role = ''): string {
  const h = createHash('sha256').update(`${logicalId}::${role}`).digest('hex');
  return h.slice(0, 16); // 64 bits — unique enough for one board
}

/**
 * Deterministic seed/versionNonce pair for an element keyed on logicalId.
 *
 * `seed` is used by Excalidraw for roughness rendering (cosmetic).
 * `versionNonce` is used for CRDT conflict detection.
 *
 * Both are uint32; both derived from the same base but with different salts so
 * they never collide.
 */
export function deterministicSeeds(logicalId: string): { seed: number; versionNonce: number } {
  const s0 = seedFromId(`seed::${logicalId}`);
  const v0 = seedFromId(`versionNonce::${logicalId}`);
  const { value: seed } = xorshift32(s0 === 0 ? 1 : s0);
  const { value: versionNonce } = xorshift32(v0 === 0 ? 1 : v0);
  return { seed, versionNonce };
}
