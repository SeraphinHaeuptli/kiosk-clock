import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/**
 * Philips Hue lamps over Bluetooth, with no bridge.
 *
 * Optional, Android-only, and absent from the web build and Expo Go — so
 * every caller asks `hueBleCapabilities()` first and says what is missing
 * rather than failing a call that was never going to work.
 */

export interface LampSummary {
  address: string;
  /** What the lamp calls itself, once it has been read. Null until then. */
  name: string | null;
  connected: boolean;
}

export interface LampsState {
  total: number;
  connected: number;
  /** True if any lamp is on. */
  on: boolean;
  /** 1 to 254, Hue's own scale, or null before anything has reported. */
  brightness: number | null;
  /** The first complaint any lamp has, or null. */
  problem: string | null;
  lamps: LampSummary[];
}

export interface HueBleCapabilities {
  /** Whether this phone has Bluetooth LE at all. */
  supported: boolean;
  /** Whether Bluetooth is switched on right now. */
  enabled: boolean;
  /**
   * False below Android 12, where a scan would need the location permission
   * this app refuses to ask for.
   */
  canScan: boolean;
  /** Runtime permissions still to be granted. Empty once they are. */
  missingPermissions: string[];
}

export interface FoundLamp {
  address: string;
  name: string | null;
}

interface HueBleNative {
  capabilities(): HueBleCapabilities;
  scan(seconds: number): Promise<FoundLamp[]>;
  connect(addresses: string[]): Promise<LampsState>;
  disconnect(): boolean;
  state(): LampsState;
  request(on: boolean | null, brightness: number | null): boolean;
  refresh(): boolean;
  addListener(
    event: 'onLamps',
    listener: (state: LampsState) => void,
  ): EventSubscription;
}

const native = requireOptionalNativeModule<HueBleNative>('HueBle');

export const isHueBleAvailable = native !== null;

/** Hue's own range: zero is not off, it is the dimmest the lamp goes. */
export const LAMP_MIN = 1;
export const LAMP_MAX = 254;

const UNAVAILABLE: HueBleCapabilities = {
  supported: false,
  enabled: false,
  canScan: false,
  missingPermissions: [],
};

const NOTHING: LampsState = {
  total: 0,
  connected: 0,
  on: false,
  brightness: null,
  problem: null,
  lamps: [],
};

export function hueBleCapabilities(): HueBleCapabilities {
  try {
    return native?.capabilities() ?? UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

/** Looks for lamps for a few seconds. Throws with a reason worth showing. */
export async function scanForLamps(seconds: number): Promise<FoundLamp[]> {
  if (!native) throw new Error('this build cannot reach a lamp');
  return native.scan(seconds);
}

export async function connectLamps(addresses: string[]): Promise<LampsState> {
  if (!native) throw new Error('this build cannot reach a lamp');
  return native.connect(addresses);
}

/**
 * How many callers want the lamps connected right now.
 *
 * There is more than one: the bar on the clock, and the settings screen that
 * opens as a modal on top of it while still showing live state. Without this,
 * closing settings would drop the connections the clock behind it was using —
 * and nothing would reconnect them, because from the clock's side nothing had
 * changed.
 */
let holders = 0;

export function holdLamps(): void {
  holders += 1;
}

/** The other half of `holdLamps`. The last one out closes the connections. */
export function releaseLamps(): void {
  holders = Math.max(0, holders - 1);
  if (holders === 0) disconnectLamps();
}

/**
 * Drop the connections now, whoever is holding them.
 *
 * For leaving the foreground, where the point is to stop holding a radio link
 * to three lamps while the phone is in a pocket — the holders are still
 * holders, and they reconnect on the way back.
 */
export function disconnectLamps(): void {
  try {
    native?.disconnect();
  } catch {
    // Nothing was connected.
  }
}

export function lampsState(): LampsState {
  try {
    return native?.state() ?? NOTHING;
  } catch {
    return NOTHING;
  }
}

/** Set the lamps. Null leaves that half of the state alone. */
export function requestLamps(
  on: boolean | null,
  brightness: number | null,
): boolean {
  try {
    return native?.request(on, brightness) ?? false;
  } catch {
    return false;
  }
}

export function refreshLamps(): void {
  try {
    native?.refresh();
  } catch {
    // Nothing connected to refresh.
  }
}

/** Every change the lamps report, including the ones made from elsewhere. */
export function watchLamps(
  listener: (state: LampsState) => void,
): () => void {
  if (!native) return () => {};

  try {
    const subscription = native.addListener('onLamps', listener);
    return () => {
      try {
        subscription.remove();
      } catch {
        // Already gone.
      }
    };
  } catch {
    return () => {};
  }
}
