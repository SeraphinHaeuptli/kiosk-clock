import { clampVolume } from './volume';

/**
 * Thin adapter over the device volume module.
 *
 * Every call is guarded. The module is a native one, so it is simply not there
 * in Expo Go or on the web, and a missing native module must degrade the
 * control to read-only rather than crash the clock behind it.
 *
 * The module is reached for lazily for the same reason. It builds two
 * NativeEventEmitters at module scope, and RN's emitter reads `addListener`
 * off whatever it is handed — which, when the native side is absent, is a
 * proxy that throws on any property access at all. A plain top-level import
 * therefore threw while the bundle was still being evaluated, long before any
 * of the guards below could run, and took the whole screen down rather than
 * just the volume bar.
 */

type VolumeModule = typeof import('react-native-volume-manager').VolumeManager;

/** null once the module has been asked for and was not there. */
let resolved: VolumeModule | null | undefined;

function volume(): VolumeModule | null {
  if (resolved === undefined) {
    try {
      resolved = (
        require('react-native-volume-manager') as {
          VolumeManager: VolumeModule;
        }
      ).VolumeManager;
    } catch {
      resolved = null;
    }
  }
  return resolved;
}

export async function readSystemVolume(): Promise<number | null> {
  try {
    const result = await volume()?.getVolume();
    return typeof result?.volume === 'number' ? clampVolume(result.volume) : null;
  } catch {
    return null;
  }
}

export async function writeSystemVolume(level: number): Promise<boolean> {
  try {
    const manager = volume();
    if (!manager) return false;
    // The OS already draws its own volume overlay on a hardware key press;
    // showing it again for an on-screen control would double up.
    await manager.setVolume(clampVolume(level), { showUI: false });
    return true;
  } catch {
    return false;
  }
}

/** Fires when something else changes the volume — hardware keys, other apps. */
export function watchSystemVolume(
  onChange: (level: number) => void,
): () => void {
  try {
    const manager = volume();
    if (!manager) return () => {};

    const subscription = manager.addVolumeListener((result) => {
      if (typeof result?.volume === 'number') onChange(clampVolume(result.volume));
    });

    // The disposer runs from an effect cleanup, where nothing catches a throw
    // and one takes the screen with it. An emitter that handed back something
    // without a `remove` on it is exactly the case this adapter exists for.
    return () => {
      try {
        subscription?.remove();
      } catch {
        // Already gone, or never really there.
      }
    };
  } catch {
    return () => {};
  }
}
