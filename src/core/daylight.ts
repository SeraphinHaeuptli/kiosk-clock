/**
 * A single continuous value for "how light is it outside", used by the
 * backdrops so they drift with the day instead of switching between states.
 */

const MINUTES_PER_DAY = 1440;

/**
 * 0 at midnight, 1 at midday, following a cosine rather than a step so the
 * change is imperceptible minute to minute but obvious across an afternoon.
 */
export function daylight(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * minutes) / MINUTES_PER_DAY);
}

/** The inverse: 1 at midnight, 0 at midday. */
export function darkness(date: Date): number {
  return 1 - daylight(date);
}
