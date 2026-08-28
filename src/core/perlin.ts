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

/** Ken Perlin's improved fade curve, 6t^5 - 15t^4 + 10t^3. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/** Dot product with one of four unit gradients, picked by the low bits. */
function gradient(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

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

  return (x: number, y: number): number => {
    const xFloor = Math.floor(x);
    const yFloor = Math.floor(y);
    const xi = xFloor & MASK;
    const yi = yFloor & MASK;
    const xf = x - xFloor;
    const yf = y - yFloor;

    const u = fade(xf);
    const v = fade(yf);

    const a = perm[xi] + yi;
    const b = perm[xi + 1] + yi;

    const top = lerp(
      gradient(perm[a], xf, yf),
      gradient(perm[b], xf - 1, yf),
      u,
    );
    const bottom = lerp(
      gradient(perm[a + 1], xf, yf - 1),
      gradient(perm[b + 1], xf - 1, yf - 1),
      u,
    );

    // Perlin's range is roughly [-1, 1]; shift it into [0, 1] for callers.
    return (lerp(top, bottom, v) + 1) / 2;
  };
}
