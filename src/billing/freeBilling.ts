/**
 * The build with no store behind it.
 *
 * F-Droid will not distribute an app that bundles Google's Play Billing
 * library — it is proprietary, and their build server refuses it — so the
 * F-Droid build cannot sell anything. That leaves two possibilities, and only
 * one of them is honest: ship the pack locked behind a purchase button that
 * cannot work, or give it away.
 *
 * Locked would mean an app that nags for money it is incapable of taking, with
 * a watermark nobody can remove. So everything is unlocked here, permanently
 * and from the first launch. Someone who installs from F-Droid gets the whole
 * app; someone who installs from Play can pay for the same thing if they want
 * to. That asymmetry is deliberate and is the price of being in both places.
 *
 * Not a way to test the paid content locally — `testBilling` is that, and it
 * says so on the purchase screen. This one is silent, because from the user's
 * side there is nothing to say: there is no pack to buy, there is just the
 * app.
 */

import type { Entitlement } from './catalog';
import type { BillingPort, Offer, PurchaseOutcome } from './port';

const EVERYTHING: readonly Entitlement[] = ['founder'];

const NO_STORE =
  'this build has no store — everything is already unlocked';

export const freeBilling: BillingPort = {
  kind: 'free',

  async load() {
    return EVERYTHING;
  },

  /** Null, so the purchase screen shows no price and no button. */
  async offer(): Promise<Offer | null> {
    return null;
  },

  /**
   * Unreachable in practice: the screen offers no way to call this once the
   * entitlement is already held. Answered honestly anyway rather than
   * pretending a purchase happened.
   */
  async purchase(): Promise<PurchaseOutcome> {
    return { status: 'unavailable', reason: NO_STORE };
  },

  async restore() {
    return EVERYTHING;
  },
};
