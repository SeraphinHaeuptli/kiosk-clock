import { requireOptionalNativeModule } from 'expo';

export interface DeviceTrack {
  title: string;
  artist: string | null;
  playing: boolean;
}

interface NowPlayingNative {
  hasPermission(): boolean;
  openPermissionSettings(): void;
  getNowPlaying(): DeviceTrack | null;
}

/**
 * Optional by design: the module is Android-only, so on iOS and the web this
 * is null and every helper below degrades to "nothing available" rather than
 * throwing.
 */
const native = requireOptionalNativeModule<NowPlayingNative>('NowPlaying');

export const isDeviceSourceAvailable = native !== null;

/** Whether Notification Access has been granted. Cheap; safe to poll. */
export function hasNotificationAccess(): boolean {
  try {
    return native?.hasPermission() ?? false;
  } catch {
    return false;
  }
}

/** Opens the system screen where the grant is toggled. */
export function openNotificationAccessSettings(): void {
  try {
    native?.openPermissionSettings();
  } catch {
    // Nothing to open where the module is absent.
  }
}

export function readDeviceNowPlaying(): DeviceTrack | null {
  try {
    return native?.getNowPlaying() ?? null;
  } catch {
    return null;
  }
}
