import { requireOptionalNativeModule } from 'expo';

export interface DeviceTrack {
  title: string;
  artist: string | null;
  playing: boolean;
  canNext: boolean;
  canPrevious: boolean;
  canPlayPause: boolean;
}

/** Play and pause are one command: only the session knows which is meant. */
export type TransportAction = 'playPause' | 'next' | 'previous';

interface NowPlayingNative {
  hasPermission(): boolean;
  openPermissionSettings(): void;
  getNowPlaying(): DeviceTrack | null;
  control(action: TransportAction): boolean;
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

/**
 * Sends a transport command to whatever the device is playing.
 *
 * Answers whether the command was dispatched, not whether the player acted on
 * it — the only honest report of that is the next read of the session.
 */
export function controlDevice(action: TransportAction): boolean {
  try {
    return native?.control(action) ?? false;
  } catch {
    return false;
  }
}
