/**
 * Deterministic noise. Given the same input it always returns the same value
 * in [0, 1), which is what lets a star field or a sample data series be
 * regenerated identically on every render instead of jittering.
 */
export function noise(value: number): number {
  let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}
