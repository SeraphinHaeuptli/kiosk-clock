import { useEffect, useState } from 'react';
import * as Battery from 'expo-battery';

/**
 * Charge level and whether it is going up.
 *
 * Every call is guarded, in the same spirit as the volume adapter: this is a
 * native module, so it is absent in Expo Go and answers with placeholders on
 * the web, and a clock must degrade to not showing a battery rather than
 * crash. `isAvailableAsync` is asked first because it is false on simulators
 * and in browsers without the battery API, and a readout of "100%" that is
 * really "we have no idea" is worse than no readout.
 */

export interface BatteryReading {
  /** 0 to 1, or null when the device will not say. */
  level: number | null;
  charging: boolean;
}

const NONE: BatteryReading = { level: null, charging: false };

function isCharging(state: Battery.BatteryState): boolean {
  return (
    state === Battery.BatteryState.CHARGING ||
    state === Battery.BatteryState.FULL
  );
}

export function useBattery(enabled: boolean): BatteryReading {
  const [reading, setReading] = useState<BatteryReading>(NONE);

  useEffect(() => {
    if (!enabled) {
      setReading(NONE);
      return;
    }

    let active = true;
    const subscriptions: { remove: () => void }[] = [];

    (async () => {
      try {
        if (!(await Battery.isAvailableAsync())) return;

        const state = await Battery.getPowerStateAsync();
        if (!active) return;
        setReading({
          level: state.batteryLevel,
          charging: isCharging(state.batteryState),
        });

        // Android only reports level changes at significant thresholds, so
        // this is a trickle of events rather than a stream — no polling, and
        // nothing to throttle.
        subscriptions.push(
          Battery.addBatteryLevelListener(({ batteryLevel }) => {
            if (active) {
              setReading((current) => ({ ...current, level: batteryLevel }));
            }
          }),
          Battery.addBatteryStateListener(({ batteryState }) => {
            if (active) {
              setReading((current) => ({
                ...current,
                charging: isCharging(batteryState),
              }));
            }
          }),
        );
      } catch {
        // No module, no permission, no battery. Nothing is shown.
      }
    })();

    return () => {
      active = false;
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [enabled]);

  return reading;
}
