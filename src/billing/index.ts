/**
 * Which store the app talks to.
 *
 * One line, one place. Everything else imports `activeBilling` and never
 * names an implementation, so the day the Play adapter is finished this file
 * is the whole of the change.
 */

import { freeBilling } from './freeBilling';
import { licensingConfigured } from './licence';
import { licenceBilling } from './licenceBilling';
import { playBilling } from './playBilling';
import type { BillingPort } from './port';
import { testBilling } from './testBilling';

/**
 * Which store this build was made for.
 *
 * An EXPO_PUBLIC_ variable because Metro substitutes those into the bundle as
 * literals while it builds, on every platform. The obvious alternative,
 * reading `extra` off the app config at runtime, is not equivalent: it is
 * absent from the web bundle entirely, so a storeless web build silently came
 * back as the Play build. It failed the same way it would have failed
 * quietly on a phone — a locked app with nothing to unlock it.
 */
const storeless = process.env.EXPO_PUBLIC_KIOSK_STORE === 'none';

/**
 * The Play adapter, or the storeless one for builds that have no store.
 *
 * The branch is decided when the bundle is built, not while it runs, and it
 * is exactly the branch the native project was configured for: the storeless
 * build has the Play Billing library excluded from it entirely, so talking to
 * Play from it would fail anyway. Anything other than a deliberate
 * `KIOSK_STORE=none` gives the Play build.
 *
 * The test port is still not reachable from here, by either route. A shipped
 * app that can fall back to it is a shipped app that gives the pack away, so
 * developing against the fake store means editing this line — one line, in one
 * place, and visible in a diff.
 */
export const activeBilling: BillingPort = storeless
  ? // A storeless build sells by signed key if one can be checked, and gives
    // everything away if not. The fallback is deliberate: until a public key
    // is pasted into licence.ts there is no way to buy, and an app that gates
    // content it cannot sell is an app that only frustrates people.
    licensingConfigured()
    ? licenceBilling
    : freeBilling
  : playBilling;

// Kept pointing the other way now that Play is live: this fires if the line
// above is ever switched back for local work and the change escapes into a
// release. A release build carrying the fake store gives the pack away to
// everyone who installs it. The purchase screen says so on its face, but that
// only helps someone who opens it; this fires once at startup where the person
// who built the thing will see it.
if (!__DEV__ && activeBilling.kind === 'test') {
  console.warn(
    'kiosk: built with the test billing port — the founder pack unlocks for ' +
      'free. See src/billing/playBilling.ts before shipping.',
  );
}

export { freeBilling, licenceBilling, playBilling, testBilling };
export type { BillingPort };
export * from './catalog';
export * from './port';
