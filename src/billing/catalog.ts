/**
 * What is for sale, and what it unlocks.
 *
 * One product, bought once, kept forever. There is no subscription here and
 * no consumable: a Founder buys the full set of faces and backdrops at
 * whatever price it costs on the day, and later additions come with it.
 *
 * The lists below are the single source of truth for what is gated. The face
 * registry and the backdrop catalogue read from them rather than carrying
 * their own flags, so there is exactly one place to look when asking "is this
 * paid?".
 */

import { DEFAULT_SETTINGS } from '@/clock/settings';
import type { BackdropId, ClockSettings, FaceId } from '@/clock/settings';
import type { ToneId } from '@/design/palette';

/**
 * The Play Console product ID. Managed product, not a subscription.
 *
 * This string is permanent once the product is live: Play will not let it be
 * renamed or reused, and an entitlement recorded against it has to keep
 * resolving for anyone who already bought. Changing it orphans every existing
 * purchase.
 */
export const FOUNDER_PRODUCT_ID = 'founder_lifetime';

/** The one entitlement the app knows about. */
export type Entitlement = 'founder';

/**
 * The free app: a plain clock, on plain black, in a plain colour.
 *
 * It is a narrow tier on purpose. Everything the app is actually *for* — the
 * character art, the fields that move with the day, the phosphor accent — is
 * styling, and styling is what the pack sells. What is left still tells the
 * time perfectly well, keeps the screen awake, dims at night, guards against
 * burn-in and reads what is playing; none of that is gated. Nobody gets a
 * crippled clock, they get an unstyled one.
 */
const FREE_FACES: readonly FaceId[] = ['digital'];
const FREE_BACKDROPS: readonly BackdropId[] = ['void'];
const FREE_TONES: readonly ToneId[] = ['white', 'amber', 'green'];

export function faceNeedsFounder(id: FaceId): boolean {
  return !FREE_FACES.includes(id);
}

export function backdropNeedsFounder(id: BackdropId): boolean {
  return !FREE_BACKDROPS.includes(id);
}

export function toneNeedsFounder(id: ToneId): boolean {
  return !FREE_TONES.includes(id);
}

/**
 * Whether the clock as currently configured is drawing on the pack.
 *
 * One function, used by the watermark and by nothing else, because the answer
 * has to be the same everywhere: it was three separate conditions in
 * KioskScreen before the pack grew features as well as content, and a fourth
 * would eventually have been added in one place and forgotten in another.
 *
 * `face` and `backdrop` are passed in rather than read off `settings`, because
 * with shuffle running the look on screen is derived and is the thing being
 * marked — not what the settings happen to say.
 */
export function usesFounderContent(
  settings: ClockSettings,
  shown: { face: FaceId; backdrop: BackdropId },
): boolean {
  return (
    faceNeedsFounder(shown.face) ||
    backdropNeedsFounder(shown.backdrop) ||
    toneNeedsFounder(settings.tone) ||
    // 'match' is not a colour of its own; it defers to the clock's tone, which
    // the line above already covers.
    (settings.backdropTone !== 'match' &&
      toneNeedsFounder(settings.backdropTone)) ||
    settings.shuffle !== 'off' ||
    // Weather is only using the pack once it is actually asking for somewhere.
    // The switch being on with no location set draws nothing and costs nothing.
    (settings.showWeather && settings.weatherPlace.trim() !== '') ||
    settings.showSecondClock ||
    settings.showBattery ||
    // A date that parses. A half-typed one is not a countdown yet.
    settings.countdownDate.trim() !== '' ||
    usesCustomNight(settings)
  );
}

/**
 * Whether the night window has been moved off its defaults.
 *
 * Night dimming itself stays free — it was free before the pack existed, and
 * taking a working feature away from people who already had it is not
 * something a paid tier should do. What the pack sells is choosing the hours
 * and the depth, so the test is whether any of the three differs from what the
 * app has always done.
 */
function usesCustomNight(settings: ClockSettings): boolean {
  return (
    settings.nightDim &&
    (settings.nightFrom !== DEFAULT_SETTINGS.nightFrom ||
      settings.nightTo !== DEFAULT_SETTINGS.nightTo ||
      settings.nightLevel !== DEFAULT_SETTINGS.nightLevel)
  );
}

/**
 * Display price used before the store has answered — and the only price the
 * test port has. The real one is whatever Google Play reports for the buyer's
 * country, which is the only figure that may be shown next to a buy button:
 * Play localises and tax-adjusts it, so a hardcoded string is wrong for most
 * of the world.
 */
export const PLACEHOLDER_PRICE = '€4.99';

/** Shown on the purchase screen, in the order listed. */
export const FOUNDER_BENEFITS: readonly string[] = [
  'seven more faces: ascii, stack, analog, words, flip, matrix and rings',
  'seven more backdrops: horizon, stars, dither, wave, grid, scan and rain',
  "claude's accent colour, and one you mix yourself from any hue",
  'shuffle: a new look every quarter hour, hour or day',
  'weather in the corners for anywhere you name, with wind and tomorrow',
  'a night schedule on your hours, at your brightness',
  'a second time zone, a countdown, and the battery',
  'every face, backdrop and feature added later',
  'no watermark',
];
