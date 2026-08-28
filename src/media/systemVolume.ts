import { VolumeManager } from 'react-native-volume-manager';

import { clampVolume } from './volume';

/**
 * Thin adapter over the device volume module.
 *
 * Every call is guarded. The module is a native one, so it is simply not there
 * in Expo Go or on the web, and a missing native module must degrade the
 * control to read-only rather than crash the clock behind it.
 */

export async function readSystemVolume(): Promise<number | null> {
  try {
    const result = await VolumeManager.getVolume();
    return typeof result?.volume === 'number' ? clampVolume(result.volume) : null;
  } catch {
    return null;
  }
}

export async function writeSystemVolume(level: number): Promise<boolean> {
  try {
    // The OS already draws its own volume overlay on a hardware key press;
    // showing it again for an on-screen control would double up.
    await VolumeManager.setVolume(clampVolume(level), { showUI: false });
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
    const subscription = VolumeManager.addVolumeListener((result) => {
      if (typeof result?.volume === 'number') onChange(clampVolume(result.volume));
    });
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
