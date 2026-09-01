import { noise } from './random';

/**
 * Classic 2D Perlin (gradient) noise.
 *
 * Gradient noise rather than value noise: interpolating random *gradients*
 * rather than random values is what gives the field its flowing, organic
 * character instead of a blocky lattice.
 */

const TABLE_SIZE = 256;
const MASK = TABLE_SIZE - 1;

export type NoiseField = (x: number, y: number) => number;

/**
 * Builds a deterministic noise field. The permutation table is shuffled from
 * the shared seeded hash, so a given seed always yields the same field.
 *
 * Returns values in [0, 1].
 */
export function createNoiseField(seed = 1): NoiseField {
  const table = new Uint8Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i += 1) table[i] = i;

  for (let i = TABLE_SIZE - 1; i > 0; i -= 1) {
    const j = Math.floor(noise(seed * 6151 + i) * (i + 1));
    const swap = table[i];
    table[i] = table[j];
    table[j] = swap;
  }

  // Doubled so lookups near the top of the table never need a bounds check.
  const perm = new Uint8Array(TABLE_SIZE * 2);
  for (let i = 0; i < TABLE_SIZE * 2; i += 1) perm[i] = table[i & MASK];

  /*
    Everything below is written out flat rather than as the usual fade/lerp/
    gradient helpers, and it is the one place in the app where that is worth
    the loss of shape.
    
    The wave backdrop calls this between thirty and a hundred thousand times a
    second, and Hermes has no JIT on Android: a helper call is a real frame
    push and pop every time, not something an optimiser folds away. Split into
    helpers this ran nine function calls per sample — two fades, four
    gradients, three lerps — so the call overhead alone was several times the
    arithmetic it was wrapping.

    The arithmetic is unchanged, operation for operation and in the same order,
    which is what keeps the field bit-identical to the readable version; the
    four gradient blocks are spelled out separately rather than folded together
    for the same reason.
  */
  return (x: number, y: number): number => {
    // `| 0` truncates toward zero, so it only agrees with Math.floor once the
    // negative side is stepped down. Exact for anything under 2^31, and the
    // caller's coordinates are single-digit screen offsets plus a drift that
    // would need a century of running to get near that.
    const xTrunc = x | 0;
    const xFloor = x < xTrunc ? xTrunc - 1 : xTrunc;
    const yTrunc = y | 0;
    const yFloor = y < yTrunc ? yTrunc - 1 : yTrunc;

    const xi = xFloor & MASK;
    const yi = yFloor & MASK;
    const xf = x - xFloor;
    const yf = y - yFloor;
    const xg = xf - 1;
    const yg = yf - 1;

    // Ken Perlin's improved fade curve, 6t^5 - 15t^4 + 10t^3.
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);

    const a = perm[xi] + yi;
    const b = perm[xi + 1] + yi;

    // Each corner: a dot product with one of four unit gradients, picked by
    // the low bits of the hash.
    const h00 = perm[a] & 3;
    const p00 = h00 < 2 ? xf : yf;
    const q00 = h00 < 2 ? yf : xf;
    const g00 = ((h00 & 1) === 0 ? p00 : -p00) + ((h00 & 2) === 0 ? q00 : -q00);

    const h10 = perm[b] & 3;
    const p10 = h10 < 2 ? xg : yf;
    const q10 = h10 < 2 ? yf : xg;
    const g10 = ((h10 & 1) === 0 ? p10 : -p10) + ((h10 & 2) === 0 ? q10 : -q10);

    const h01 = perm[a + 1] & 3;
    const p01 = h01 < 2 ? xf : yg;
    const q01 = h01 < 2 ? yg : xf;
    const g01 = ((h01 & 1) === 0 ? p01 : -p01) + ((h01 & 2) === 0 ? q01 : -q01);

    const h11 = perm[b + 1] & 3;
    const p11 = h11 < 2 ? xg : yg;
    const q11 = h11 < 2 ? yg : xg;
    const g11 = ((h11 & 1) === 0 ? p11 : -p11) + ((h11 & 2) === 0 ? q11 : -q11);

    const top = g00 + u * (g10 - g00);
    const bottom = g01 + u * (g11 - g01);

    // Perlin's range is roughly [-1, 1]; shift it into [0, 1] for callers.
    return (top + v * (bottom - top) + 1) / 2;
  };
}
