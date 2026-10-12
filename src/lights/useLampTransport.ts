import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clamp01 } from '@/core/format';

import {
  connectLamps,
  disconnectLamps,
  holdLamps,
  isHueBleAvailable,
  releaseLamps,
  requestLamps,
  watchLamps,
  type LampsState,
} from '../../modules/hue-ble';

import {
  fromLampBrightness,
  toLampBrightness,
  type Lamp,
  type LightsStatus,
  type Transport,
} from './lights';

/**
 * Hue lamps over Bluetooth, with no bridge in the house.
 *
 * Almost none of the work is here. The native module holds a connection to
 * each lamp, coalesces writes to what the radio can carry, and pushes state up
 * whenever a lamp says something — including when the Hue app or a wall switch
 * is what changed it. This is the part that decides when to be connected at
 * all, and translates between Hue's 1-to-254 and the bar's 0-to-1.
 */

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'the lamps could not be reached';
}

export function useLampTransport(
  lamps: readonly Lamp[] | null,
  enabled: boolean,
): Transport {
  const [level, setLevel] = useState(0);
  const [known, setKnown] = useState(false);
  const [status, setStatus] = useState<LightsStatus>({ kind: 'off' });
  const dragging = useRef(false);

  // The effect's real dependency is which lamps, not which array object: the
  // source is re-read from storage on every change and would otherwise
  // reconnect on each one.
  const addresses = useMemo(
    () => (lamps ?? []).map((lamp) => lamp.address).join(','),
    [lamps],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'off' });
      setKnown(false);
      return;
    }
    if (!isHueBleAvailable) {
      setStatus({ kind: 'absent' });
      return;
    }
    if (addresses === '') {
      setStatus({ kind: 'unpaired' });
      setKnown(false);
      return;
    }

    let active = true;
    setStatus({ kind: 'reading' });

    const apply = (state: LampsState) => {
      if (!active) return;

      if (state.connected === 0) {
        setKnown(false);
        // A lamp switched off at the wall is not an error worth shouting
        // about until it says something: "connecting" covers both the first
        // second and a lamp that has gone.
        setStatus(
          state.problem === null
            ? { kind: 'reading' }
            : { kind: 'failed', reason: state.problem },
        );
        return;
      }

      setStatus({ kind: 'live' });
      setKnown(true);
      // Never under the finger: a notification carrying the level from before
      // the drag would drag the bar backwards mid-gesture.
      if (!dragging.current) {
        setLevel(fromLampBrightness(state.brightness, state.on));
      }
    };

    const unwatch = watchLamps(apply);
    // Counted, because the settings screen runs a second copy of this hook
    // over the top of the live clock: whichever of the two closes first must
    // not take the other's connections with it.
    holdLamps();

    const open = () => {
      connectLamps(addresses.split(',')).then(apply, (error: unknown) => {
        if (active) setStatus({ kind: 'failed', reason: describe(error) });
      });
    };

    open();

    /*
      A Bluetooth connection is held open for as long as this is on screen, and
      a kiosk is on screen for hours — but there is no reason to hold a radio
      link to three lamps while the phone is in a pocket. The link is dropped
      on the way out and taken again on the way back, which costs a second of
      "connecting" and nothing else.
    */
    const subscription = AppState.addEventListener('change', (state) => {
      if (!active) return;
      if (state === 'active') {
        open();
      } else {
        disconnectLamps();
      }
    });

    return () => {
      active = false;
      unwatch();
      subscription.remove();
      releaseLamps();
    };
  }, [enabled, addresses]);

  const set = useCallback((next: number) => {
    const wanted = clamp01(next);
    setLevel(wanted);
    setKnown(true);

    // The bottom of the slider switches the lamps off rather than setting the
    // dimmest they go, which is all a brightness of zero would mean to Hue.
    if (wanted <= 0) {
      requestLamps(false, null);
    } else {
      requestLamps(true, toLampBrightness(wanted));
    }
  }, []);

  const setDragging = useCallback((value: boolean) => {
    dragging.current = value;
  }, []);

  return { level, known, status, set, setDragging };
}
