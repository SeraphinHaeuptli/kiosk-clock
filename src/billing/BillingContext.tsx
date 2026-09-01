import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { activeBilling } from './index';
import type { Entitlement } from './catalog';
import type { Offer, PurchaseOutcome } from './port';

interface BillingValue {
  /** Which store answered. 'test' means no money changed hands. */
  kind: 'test' | 'play';
  /**
   * False until the stored entitlement has been read.
   *
   * Everything that gates on `founder` must wait for this. Reading it too
   * early flashes a watermark across a paying customer's clock for a frame,
   * which is a worse bug than showing nothing.
   */
  ready: boolean;
  founder: boolean;
  /** The store's own price line, or null if it has none to give. */
  offer: Offer | null;
  /** True while a purchase or restore is in flight. */
  busy: boolean;
  purchase: () => Promise<PurchaseOutcome>;
  restore: () => Promise<boolean>;
  /** Present only on the test port; the purchase screen hides it otherwise. */
  revoke: (() => Promise<void>) | null;
}

const BillingContext = createContext<BillingValue | null>(null);

function has(entitlements: readonly Entitlement[]): boolean {
  return entitlements.includes('founder');
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const [founder, setFounder] = useState(false);
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    // Entitlements gate the UI, so they are awaited; the offer is only a price
    // string on one screen and is allowed to arrive late or not at all.
    //
    // The port undertakes not to throw, and both implementations keep to it —
    // but `ready` is what tells the rest of the app the answer has arrived, so
    // it is set from `finally`. A rejection that left it false would suppress
    // the watermark for the life of the process, which is the failure that
    // costs money rather than the one that shows an error.
    activeBilling
      .load()
      .then((entitlements) => {
        if (active) setFounder(has(entitlements));
      })
      .catch(() => {
        // Not bought, which is where the state already is.
      })
      .finally(() => {
        if (active) setReady(true);
      });

    activeBilling
      .offer()
      .then((next) => {
        if (active) setOffer(next);
      })
      .catch(() => {
        // No price line. The screen already renders that case.
      });

    return () => {
      active = false;
    };
  }, []);

  const purchase = useCallback(async (): Promise<PurchaseOutcome> => {
    setBusy(true);
    try {
      const outcome = await activeBilling.purchase();
      if (mounted.current && outcome.status === 'owned') {
        setFounder(has(outcome.entitlements));
      }
      return outcome;
    } catch (error) {
      // The purchase screen renders outcomes and has nowhere to put a
      // rejection, so a store adapter that threw instead of answering left the
      // buy button doing nothing at all with no explanation. Turned into the
      // outcome it should have been.
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : 'the store failed',
      };
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const entitlements = await activeBilling.restore();
      const owned = has(entitlements);
      if (mounted.current) setFounder(owned);
      return owned;
    } catch {
      // Same rationale as purchase: nothing found is a result the screen knows
      // how to say, and a rejection is not.
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const revoke = useMemo(() => {
    const give = activeBilling.revoke;
    if (!give) return null;
    return async () => {
      await give.call(activeBilling);
      if (mounted.current) setFounder(false);
    };
  }, []);

  const value = useMemo<BillingValue>(
    () => ({
      kind: activeBilling.kind,
      ready,
      founder,
      offer,
      busy,
      purchase,
      restore,
      revoke,
    }),
    [ready, founder, offer, busy, purchase, restore, revoke],
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBilling(): BillingValue {
  const value = useContext(BillingContext);
  if (!value) {
    throw new Error('useBilling must be used inside <BillingProvider>');
  }
  return value;
}
