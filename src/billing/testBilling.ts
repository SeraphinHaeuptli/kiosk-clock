/**
 * A local stand-in for the store.
 *
 * It writes the entitlement to the same key-value storage the settings use,
 * which means a "purchase" survives a reload and nothing else. It is not a
 * security boundary and does not pretend to be one — anything a device owner
 * can reach, a device owner can edit. That is true of the real client-side
 * check too: the only tamper-proof entitlement is one the server verifies,
 * and this app has no server. The gate is a product decision, not a lock.
 *
 * The deliberate slowness is load-bearing. A store round trip takes seconds
 * and can fail, so the UI has to have a pending state and an error state from
 * the start; an instant fake would let both go unwritten until the day the
 * real store arrives.
 */

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import { PLACEHOLDER_PRICE, type Entitlement } from './catalog';
import type { BillingPort, Offer, PurchaseOutcome } from './port';

const HELD: readonly Entitlement[] = ['founder'];
const NONE: readonly Entitlement[] = [];

/** Long enough that a spinner is visibly necessary. */
const LATENCY_MS = 900;

function decode(raw: unknown): boolean {
  return raw === true;
}

const slot = jsonSlot(asyncStorageAdapter, 'kiosk.founder.test.v1', decode);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const testBilling: BillingPort = {
  kind: 'test',

  async load() {
    return (await slot.load()) ? HELD : NONE;
  },

  async offer(): Promise<Offer | null> {
    return { price: PLACEHOLDER_PRICE };
  },

  async purchase(): Promise<PurchaseOutcome> {
    await wait(LATENCY_MS);
    await slot.save(true);
    return { status: 'owned', entitlements: HELD };
  },

  async restore() {
    await wait(LATENCY_MS);
    return (await slot.load()) ? HELD : NONE;
  },

  async revoke() {
    await slot.clear();
  },
};
