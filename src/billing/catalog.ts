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

import type { BackdropId, FaceId } from '@/clock/settings';

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

/** Faces included in the free app. Everything else needs the pack. */
const FREE_FACES: readonly FaceId[] = ['ascii', 'digital'];

/**
 * Backdrops included in the free app.
 *
 * `void` because a clock with no backdrop must always work, and `wave` because
 * it is the default — a fresh install has to show something worth keeping
 * before it asks for anything.
 */
const FREE_BACKDROPS: readonly BackdropId[] = ['void', 'wave'];

export function faceNeedsFounder(id: FaceId): boolean {
  return !FREE_FACES.includes(id);
}

export function backdropNeedsFounder(id: BackdropId): boolean {
  return !FREE_BACKDROPS.includes(id);
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
  'the stack, analog and words faces',
  'the horizon, stars and dither backdrops',
  'every face and backdrop added later',
  'no watermark',
];
