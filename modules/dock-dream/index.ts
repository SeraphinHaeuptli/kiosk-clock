import { requireOptionalNativeModule } from 'expo';

interface DockDreamNative {
  setRules(
    enabled: boolean,
    wirelessOnly: boolean,
    landscapeOnly: boolean,
  ): boolean;
  openScreenSaverSettings(): boolean;
}

/**
 * Optional by design: Android-only, and absent from Expo Go and the web, where
 * every call below degrades to "nothing happened" rather than throwing.
 */
const native = requireOptionalNativeModule<DockDreamNative>('DockDream');

export const isDockAvailable = native !== null;

export interface DockRules {
  enabled: boolean;
  /** Ignore a cable; only a wireless charger counts. */
  wirelessOnly: boolean;
  /** Only when the phone is lying on its side. Unreliable under rotation lock. */
  landscapeOnly: boolean;
}

/**
 * Hand the rules to the screen saver.
 *
 * It runs before any of this app's JavaScript does — often on a locked phone
 * with nothing else awake — so the flags live in shared preferences where a
 * native service can read them cold. This keeps that copy in step.
 */
export function setDockRules(rules: DockRules): void {
  try {
    native?.setRules(rules.enabled, rules.wirelessOnly, rules.landscapeOnly);
  } catch {
    // Nothing to mirror where the module is absent.
  }
}

/** Opens the system screen where a screen saver is chosen. */
export function openScreenSaverSettings(): boolean {
  try {
    return native?.openScreenSaverSettings() ?? false;
  } catch {
    return false;
  }
}
