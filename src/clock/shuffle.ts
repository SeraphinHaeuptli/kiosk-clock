/**
 * The look on screen, which is not always the look that was picked.
 *
 * Shuffle is derived, never written back. The obvious implementation — a timer
 * that saves a new `face` and `backdrop` into settings every hour — would
 * quietly destroy the choice the user made: turn shuffle off after a week and
 * you are left with whatever it happened to land on, with no way back to the
 * clock you set up. Deriving instead means the stored settings are still yours,
 * shuffle is a lens over them, and switching it off restores the original in
 * the same frame.
 *
 * It also means no timer. The kiosk already re-renders every minute, and the
 * period index only changes on a boundary, so the rotation costs one integer
 * division per render and nothing else.
 */

import { noise } from '@/core/random';

import {
  BACKDROP_IDS,
  FACE_IDS,
  type BackdropId,
  type ClockSettings,
  type FaceId,
  type ShufflePeriod,
} from './settings';

export interface Look {
  face: FaceId;
  backdrop: BackdropId;
}

const PERIOD_MS: Record<ShufflePeriod, number> = {
  quarter: 15 * 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
};

/**
 * Backdrops the shuffle may land on.
 *
 * `void` is excluded. It is a legitimate choice and the free default, but
 * arriving at plain black by rotation looks like the feature stopped working
 * rather than like a decision.
 */
const SHUFFLE_BACKDROPS = BACKDROP_IDS.filter((id) => id !== 'void');

/** Which slot of the rotation the given moment falls in. */
export function periodIndex(now: Date, period: ShufflePeriod): number {
  return Math.floor(now.getTime() / PERIOD_MS[period]);
}

/**
 * A stable choice for a slot. Seeded on the slot rather than random, so every
 * render inside the same period agrees — including the settings screen
 * reporting what the kiosk behind it is currently showing.
 */
function pick<T>(pool: readonly T[], index: number, salt: number): T {
  const at = Math.floor(noise(index * 7919 + salt) * pool.length);
  return pool[Math.min(pool.length - 1, at)];
}

export function lookFor(settings: ClockSettings, now: Date): Look {
  if (settings.shuffle === 'off') {
    return { face: settings.face, backdrop: settings.backdrop };
  }

  const index = periodIndex(now, settings.shufflePeriod);

  return {
    // Different salts, so the face and the backdrop do not change in lockstep
    // forever — which is what one shared draw would give.
    backdrop: pick(SHUFFLE_BACKDROPS, index, 101),
    face:
      settings.shuffle === 'everything'
        ? pick(FACE_IDS, index, 977)
        : settings.face,
  };
}
