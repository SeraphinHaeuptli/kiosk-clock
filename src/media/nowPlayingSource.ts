import { Platform } from 'react-native';

import {
  hasNotificationAccess,
  isDeviceSourceAvailable,
} from '../../modules/now-playing';

/**
 * Which source can supply now-playing here, and why.
 *
 * The answer differs sharply by platform, so it is resolved once and reported
 * rather than leaving an empty bar unexplained.
 *
 * Android reads it directly: a NotificationListenerService holds the grant and
 * MediaSessionManager hands over structured metadata. It needs the user to
 * turn on Notification Access, which no app can do on their behalf.
 *
 * iOS cannot, at all. MPNowPlayingInfoCenter is write-only — it publishes what
 * *your* app plays. MPMusicPlayerController reads only the built-in Music app.
 * Reading another app's session means the private MediaRemote framework, which
 * is not permitted on the App Store. The endpoint is the only option there.
 */

export type SourceKind = 'device' | 'endpoint' | 'unavailable';

export interface SourceChoice {
  kind: SourceKind;
  /** One line for the settings screen, explaining the choice. */
  reason: string;
  /** True when a grant is missing and the user can be asked for it. */
  needsPermission: boolean;
}

const IOS_REASON = 'ios does not expose other apps’ now playing';
const WEB_REASON = 'browsers cannot read system media sessions';

function endpointChoice(detail: string): SourceChoice {
  return { kind: 'endpoint', reason: detail, needsPermission: false };
}

/**
 * Device first where it exists and is permitted; an endpoint covers everything
 * else, including Android before the grant is given.
 */
export function chooseSource(endpoint: string, granted: boolean): SourceChoice {
  if (Platform.OS === 'android' && isDeviceSourceAvailable) {
    if (granted) {
      return {
        kind: 'device',
        reason: 'device media session',
        needsPermission: false,
      };
    }
    if (endpoint) {
      return endpointChoice('endpoint — notification access not granted');
    }
    return {
      kind: 'unavailable',
      reason: 'needs notification access',
      needsPermission: true,
    };
  }

  if (endpoint) return endpointChoice(`endpoint (${Platform.OS})`);

  return {
    kind: 'unavailable',
    reason: Platform.OS === 'ios' ? IOS_REASON : WEB_REASON,
    needsPermission: false,
  };
}

export { hasNotificationAccess, isDeviceSourceAvailable };
export { openNotificationAccessSettings } from '../../modules/now-playing';
