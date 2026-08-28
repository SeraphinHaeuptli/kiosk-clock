import { Platform } from 'react-native';

/**
 * Which source can supply now-playing on this device, and why.
 *
 * The honest answer differs sharply by platform, so the app resolves it once
 * and says so rather than leaving an empty bar unexplained.
 *
 * Android can do it: `MediaSessionManager.getActiveSessions` reports every
 * active session, but it is gated behind `BIND_NOTIFICATION_LISTENER_SERVICE`
 * — the same Notification Access grant scrobblers and lock-screen replacements
 * ask for, which the user must turn on in system settings. It needs a native
 * service, so it is not something this build can switch on by itself.
 *
 * iOS cannot, at all. `MPNowPlayingInfoCenter` is write-only — it publishes
 * what *your* app plays. `MPMusicPlayerController` reads only the built-in
 * Music app, not Spotify or anything else. Reading another app's session means
 * the private MediaRemote framework, which is not permitted on the App Store.
 *
 * So on every platform the portable answer is an HTTP endpoint pointed at
 * whatever is actually playing the audio.
 */

export type SourceKind = 'endpoint' | 'unavailable';

export interface SourceChoice {
  kind: SourceKind;
  /** One line for the settings screen, explaining the choice. */
  reason: string;
}

const ANDROID_REASON =
  'on-device needs notification access and a native service; not built in';
const IOS_REASON = 'ios does not expose other apps’ now playing';
const WEB_REASON = 'browsers cannot read system media sessions';

function platformReason(): string {
  if (Platform.OS === 'android') return ANDROID_REASON;
  if (Platform.OS === 'ios') return IOS_REASON;
  return WEB_REASON;
}

/**
 * Picks the best source available. An endpoint always wins when configured;
 * otherwise there is nothing this platform can offer and the reason says which
 * limitation applies here.
 */
export function chooseSource(endpoint: string): SourceChoice {
  if (endpoint) {
    return { kind: 'endpoint', reason: `endpoint (${Platform.OS})` };
  }
  return { kind: 'unavailable', reason: platformReason() };
}
