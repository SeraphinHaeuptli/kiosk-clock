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
/**
 * Google Play Billing, through expo-iap.
 *
 * expo-iap wraps OpenIAP, which pins Play Billing Library 9.1 — past the 8.0
 * floor Play began enforcing for new submissions on 31 August 2026.
 *
 * ---------------------------------------------------------------------------
 * Untested against a real product
 *
 * Nothing below has run against Play. It cannot: the product does not resolve
 * on a device until the app is on a track and the account is a licence tester,
 * and neither exists yet. The shapes come from expo-iap's own types, not from
 * a successful purchase. Treat every path here as unverified until a licence
 * tester has bought, reinstalled, and been given the pack back.
 * ---------------------------------------------------------------------------
 *
 * Three things this gets right that are easy to get wrong, and expensive:
 *
 * 1. **Acknowledgement.** Google refunds an unacknowledged purchase after
 *    three days and the entitlement quietly disappears. So it is acknowledged
 *    from `load()` as well as from `purchase()` — an app killed between paying
 *    and acknowledging has to finish the job on next launch, and that path is
 *    reached by far more people than any test will be.
 *
 * 2. **Pending purchases.** Cash and carrier billing arrive as `pending` and
 *    become `purchased` later, or never. Only `purchased` grants anything.
 *
 * 3. **A store that is not there.** The module is required lazily, for the
 *    same reason `systemVolume.ts` does it: this file is imported by
 *    `./index.ts` on every launch, including builds where the native module is
 *    absent, and a throw at module scope takes the whole app down before any
 *    guard can run.
 */

import { FOUNDER_PRODUCT_ID, type Entitlement } from './catalog';
import type { BillingPort, Offer, PurchaseOutcome } from './port';

type Iap = typeof import('expo-iap');
type Purchase = Awaited<ReturnType<Iap['getAvailablePurchases']>>[number];

const HELD: readonly Entitlement[] = ['founder'];
const NONE: readonly Entitlement[] = [];

const NO_STORE = 'the play store is not available on this device';
const PENDING =
  'payment is pending — the pack unlocks by itself once it clears';

/** null once the module has been asked for and was not there. */
let resolved: Iap | null | undefined;

function iap(): Iap | null {
  if (resolved === undefined) {
    try {
      resolved = require('expo-iap') as Iap;
    } catch {
      resolved = null;
    }
  }
  return resolved;
}

/** The connection, opened at most once and shared. */
let connection: Promise<Iap | null> | null = null;

function store(): Promise<Iap | null> {
  connection ??= open();
  return connection;
}

async function open(): Promise<Iap | null> {
  const module = iap();
  if (!module) return null;
  try {
    await module.initConnection();
    return module;
  } catch {
    // Not cached as a permanent "no store": the ordinary cause is Play
    // Services still waking up, and the next call should get a fresh attempt
    // rather than a no for the rest of the process.
    connection = null;
    return null;
  }
}

/**
 * Acknowledge a purchase, so Google does not reverse it.
 *
 * Failure here is deliberately quiet. There is nothing useful to say to
 * someone who has already paid, and the retry is simply the next launch, which
 * calls `load()` and comes back through here.
 */
async function settle(module: Iap, purchase: Purchase): Promise<void> {
  const acknowledged =
    'isAcknowledgedAndroid' in purchase &&
    purchase.isAcknowledgedAndroid === true;
  if (acknowledged) return;

  try {
    await module.finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Left for the next launch.
  }
}

/** What the account owns, acknowledging anything outstanding on the way. */
async function owned(module: Iap): Promise<readonly Entitlement[]> {
  const purchases = await module.getAvailablePurchases();
  const founder = purchases.find(
    (purchase) =>
      purchase.productId === FOUNDER_PRODUCT_ID &&
      purchase.purchaseState === 'purchased',
  );
  if (!founder) return NONE;

  await settle(module, founder);
  return HELD;
}

/**
 * Compared as a plain string rather than against the ErrorCode enum, which
 * would mean importing a value out of a module that is required lazily
 * precisely because it may not be there.
 */
function backedOut(code: unknown): boolean {
  return String(code) === 'user-cancelled';
}

export const playBilling: BillingPort = {
  kind: 'play',

  async load() {
    const module = await store();
    if (!module) return NONE;
    try {
      return await owned(module);
    } catch {
      // A query that failed is not the same as an account that owns nothing,
      // but the caller has no third answer and the pack is cosmetic. Erring
      // towards locked keeps a network blip from handing it out.
      return NONE;
    }
  },

  async offer(): Promise<Offer | null> {
    const module = await store();
    if (!module) return null;
    try {
      const products = await module.fetchProducts({
        skus: [FOUNDER_PRODUCT_ID],
        type: 'in-app',
      });
      const founder = (products ?? []).find(
        (product) => product.id === FOUNDER_PRODUCT_ID,
      );
      // The store's own string, never one assembled here: Play localises and
      // tax-adjusts the price per country, and a hand-built one is wrong in
      // most of them.
      return founder ? { price: founder.displayPrice } : null;
    } catch {
      return null;
    }
  },

  async purchase(): Promise<PurchaseOutcome> {
    const module = await store();
    if (!module) return { status: 'unavailable', reason: NO_STORE };

    return new Promise<PurchaseOutcome>((resolve) => {
      // requestPurchase reports through the listeners, not its return value,
      // so the outcome is whichever of them speaks first.
      let settled = false;
      const subscriptions: { remove: () => void }[] = [];

      const finish = (outcome: PurchaseOutcome) => {
        if (settled) return;
        settled = true;
        for (const subscription of subscriptions) {
          try {
            subscription.remove();
          } catch {
            // Already gone.
          }
        }
        resolve(outcome);
      };

      // Recorded one at a time: both arguments of a single push are evaluated
      // before either is stored, so a second listener that threw would leave
      // the first registered with nothing holding it.
      subscriptions.push(
        module.purchaseUpdatedListener((purchase) => {
          if (purchase.productId !== FOUNDER_PRODUCT_ID) return;

          if (purchase.purchaseState === 'pending') {
            finish({ status: 'pending', reason: PENDING });
            return;
          }
          // 'unknown' is not 'purchased'. Nothing is granted for it.
          if (purchase.purchaseState !== 'purchased') return;

          void settle(module, purchase).then(() =>
            finish({ status: 'owned', entitlements: HELD }),
          );
        }),
      );

      subscriptions.push(
        module.purchaseErrorListener((error) => {
          finish(
            backedOut(error.code)
              ? { status: 'cancelled' }
              : { status: 'failed', reason: error.message },
          );
        }),
      );

      module
        .requestPurchase({
          request: { google: { skus: [FOUNDER_PRODUCT_ID] } },
          type: 'in-app',
        })
        .catch((error: unknown) =>
          finish({
            status: 'failed',
            reason:
              error instanceof Error ? error.message : 'the store refused',
          }),
        );
    });
  },

  async restore() {
    const module = await store();
    if (!module) return NONE;
    try {
      return await owned(module);
    } catch {
      return NONE;
    }
  },
};
