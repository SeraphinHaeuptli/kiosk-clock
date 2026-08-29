/**
 * Which store the app talks to.
 *
 * One line, one place. Everything else imports `activeBilling` and never
 * names an implementation, so the day the Play adapter is finished this file
 * is the whole of the change.
 */

import { playBilling } from './playBilling';
import type { BillingPort } from './port';
import { testBilling } from './testBilling';

/**
 * Switch to `playBilling` once the steps in playBilling.ts are done.
 *
 * This must not be flipped by a runtime check or an environment variable: a
 * build either has the native billing module in it or it does not, and a
 * shipped app that can fall back to the test port is a shipped app that gives
 * the pack away.
 */
export const activeBilling: BillingPort = testBilling;

// A release build carrying the fake store gives the pack away to everyone who
// installs it. The purchase screen says so on its face, but that only helps
// someone who opens it; this fires once at startup where the person who built
// the thing will see it.
if (!__DEV__ && activeBilling.kind === 'test') {
  console.warn(
    'kiosk: built with the test billing port — the founder pack unlocks for ' +
      'free. See src/billing/playBilling.ts before shipping.',
  );
}

export { playBilling, testBilling };
export type { BillingPort };
export * from './catalog';
export * from './port';
