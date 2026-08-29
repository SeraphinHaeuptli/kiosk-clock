/**
 * The billing port.
 *
 * Everything above this line — the watermark, the pickers, the purchase
 * screen — depends only on this interface. Below it sit two implementations:
 * a local fake for developing against, and a Google Play adapter for the
 * shipped app. Swapping one for the other is a one-line change in `index.ts`
 * and touches no UI, which is the point: the store cannot be run on a desktop
 * or in Expo Go, so the app has to be buildable and demonstrable without it.
 */

import type { Entitlement } from './catalog';

/** What a purchase attempt did. */
export type PurchaseOutcome =
  | { status: 'owned'; entitlements: readonly Entitlement[] }
  /** The user backed out of the store's own sheet. Not an error. */
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

export interface Offer {
  /** Localised, tax-adjusted, and formatted by the store. Never build this. */
  price: string;
}

export interface BillingPort {
  /**
   * Which implementation is live. The UI uses this for one thing only —
   * labelling test purchases as test purchases, so a build with the fake
   * store can never be mistaken for a real one.
   */
  readonly kind: 'test' | 'play';

  /** Entitlements already held, read at startup. Never throws. */
  load(): Promise<readonly Entitlement[]>;

  /** The offer to show on the purchase screen, or null if the store has none. */
  offer(): Promise<Offer | null>;

  /** Run the purchase flow. Never throws; failures come back as outcomes. */
  purchase(): Promise<PurchaseOutcome>;

  /**
   * Re-read entitlements from the store of record.
   *
   * A lifetime purchase outlives the install that made it, so a reinstall or
   * a new device has to be able to get it back without paying twice. Google
   * requires this path to exist for non-consumable products.
   */
  restore(): Promise<readonly Entitlement[]>;

  /**
   * Give the entitlement back. Only the test port implements this — there is
   * no such thing as un-buying on Play, and the purchase screen only offers
   * it when `kind` is 'test'.
   */
  revoke?(): Promise<void>;
}
