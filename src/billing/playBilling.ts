/**
 * The seam for real money.
 *
 * Deliberately not wired up: in-app purchases need a native module, a signed
 * build uploaded to a Play track, and a product configured in Play Console,
 * none of which exist yet. What exists here is the shape the real adapter
 * takes, so switching over is a matter of filling in four method bodies
 * rather than redesigning anything above them.
 *
 * Until then it answers 'unavailable', which the purchase screen already
 * renders honestly.
 *
 * ---------------------------------------------------------------------------
 * To make this real
 *
 * 1. `npx expo install expo-iap`. It is an Expo module, so it works with
 *    prebuild and the existing CI: no Android Studio, nothing to link by
 *    hand. (`react-native-iap` is the same authors' bare-RN equivalent and
 *    would also work; expo-iap is the one that fits this project.) Both
 *    implement the OpenIAP spec, so the call names below are close to either.
 *
 * 2. In Play Console, create a **managed product** (not a subscription) with
 *    the ID in FOUNDER_PRODUCT_ID, set a price, and activate it. The app must
 *    already have a build on some track — internal testing counts — or the
 *    product will not resolve on the device.
 *
 * 3. Add licence testers under Setup → Licence testing. They buy at no charge
 *    with real purchase flows, which is the only way to test this end to end.
 *    Play's reserved test SKUs (android.test.purchased) do not work with
 *    Billing Library 5+.
 *
 * 4. Implement the four methods:
 *
 *      load()     initConnection(), then getAvailablePurchases() and look for
 *                 FOUNDER_PRODUCT_ID. This is also the reinstall path, so it
 *                 has to run on every launch, not just after a purchase.
 *      offer()    fetchProducts({ skus: [FOUNDER_PRODUCT_ID], type: 'in-app' })
 *                 and return the store's own formatted price string. Never
 *                 assemble a price from a number and a currency symbol —
 *                 Play localises and tax-adjusts it per country.
 *      purchase() requestPurchase(), await the purchase listener, then
 *                 ACKNOWLEDGE it. An unacknowledged purchase is automatically
 *                 refunded by Google after three days and the entitlement
 *                 silently disappears. This is the single most common way to
 *                 ship broken billing.
 *      restore()  the same query as load(), triggered by the user.
 *
 * 5. Flip `activeBilling` in ./index.ts.
 *
 * Two things worth knowing before starting:
 *
 * - Play requires digital unlocks inside a Play-distributed app to go through
 *   Play Billing. Stripe or any other processor for this pack is a policy
 *   violation, not merely a worse option.
 * - Purchases verified only on the device are forgeable on a rooted phone. For
 *   a one-off cosmetic unlock that is a fair trade; if it ever matters, the
 *   fix is to verify the purchase token server-side against the Play Developer
 *   API, and this interface does not have to change for that.
 * ---------------------------------------------------------------------------
 */

import type { Entitlement } from './catalog';
import type { BillingPort, Offer, PurchaseOutcome } from './port';

const NOT_WIRED =
  'in-app purchases are not built into this version of the app yet';

const NONE: readonly Entitlement[] = [];

export const playBilling: BillingPort = {
  kind: 'play',

  async load() {
    return NONE;
  },

  async offer(): Promise<Offer | null> {
    return null;
  },

  async purchase(): Promise<PurchaseOutcome> {
    return { status: 'unavailable', reason: NOT_WIRED };
  },

  async restore() {
    return NONE;
  },
};
