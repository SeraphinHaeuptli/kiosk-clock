/**
 * Selling without a store, by signed key.
 *
 * The sideload build cannot reach Play Billing — purchases only work for apps
 * Play itself installed — so payment happens outside the app entirely. Someone
 * taps buy, pays in a browser, and is sent a key. They paste it in once and the
 * app never mentions money again.
 *
 * That shape has a real advantage over an in-app store, and it is worth
 * stating: nothing about the buyer reaches this device or this code. There is
 * no account, no email, no receipt, no network call at any point after the key
 * is pasted. The app verifies a signature and forgets where the key came from.
 *
 * It also has a real cost. A key is a bearer token, so one that gets posted
 * publicly unlocks the app for whoever finds it, and there is no way to revoke
 * it without shipping an update. The repository has always been honest that the
 * entitlement is a product decision rather than a lock, and this does not
 * change that — it only raises the effort from editing a stored value to
 * finding somebody else's key.
 */

import * as Linking from 'expo-linking';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import type { Entitlement } from './catalog';
import {
  FOUNDER_PAYMENT_URL,
  FOUNDER_PRICE,
  verifyLicence,
} from './licence';
import type { BillingPort, Offer, PurchaseOutcome } from './port';

const HELD: readonly Entitlement[] = ['founder'];
const NONE: readonly Entitlement[] = [];

const NO_LINK = 'this build has no payment link set';
const AFTER_PAYING =
  'finish in the browser — your key arrives by email, then paste it below';

/** The key itself is stored, not a decision about it, so it is re-verified
 *  on every launch. A build that changes its public key stops accepting old
 *  keys, which is the point of storing the evidence rather than the verdict. */
function decode(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

const slot = jsonSlot(asyncStorageAdapter, 'kiosk.founder.licence.v1', decode);

async function held(): Promise<readonly Entitlement[]> {
  const key = await slot.load();
  if (key === '') return NONE;
  return verifyLicence(key) === null ? NONE : HELD;
}

export const licenceBilling: BillingPort = {
  kind: 'licence',

  load: held,
  restore: held,

  async offer(): Promise<Offer | null> {
    if (FOUNDER_PAYMENT_URL === '') return null;
    // Written here rather than read from a store, because there is no store to
    // read it from. It is display text only: what is actually charged is
    // whatever the payment link says, and that is the number that binds.
    return { price: FOUNDER_PRICE === '' ? '—' : FOUNDER_PRICE };
  },

  /**
   * Opens the payment page and stops.
   *
   * Reports `pending` because that is the truth: money may be about to move,
   * and this app will not find out. The key that arrives afterwards is what
   * completes the purchase, through `redeem`.
   */
  async purchase(): Promise<PurchaseOutcome> {
    if (FOUNDER_PAYMENT_URL === '') {
      return { status: 'unavailable', reason: NO_LINK };
    }
    try {
      await Linking.openURL(FOUNDER_PAYMENT_URL);
      return { status: 'pending', reason: AFTER_PAYING };
    } catch {
      return { status: 'failed', reason: 'could not open the payment page' };
    }
  },

  async redeem(key: string): Promise<boolean> {
    if (verifyLicence(key) === null) return false;
    await slot.save(key.trim().replace(/\s+/g, ''));
    return true;
  },
};
