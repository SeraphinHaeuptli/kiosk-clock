import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useDebounced } from '@/core/useDebounced';

import { controlDevice } from '../../modules/now-playing';

import {
  loadNowPlaying,
  type NowPlayingResult,
  type TransportAction,
} from './nowPlaying';
import {
  chooseSource,
  hasNotificationAccess,
  type SourceChoice,
} from './nowPlayingSource';

/**
 * Tracks change often, and the device read is a cheap local call rather than a
 * network round trip, so poll on the order of seconds.
 */
const REFRESH_MS = 5_000;
const ENDPOINT_SETTLE_MS = 500;

/**
 * How long to wait before reading back a session that has just been told to do
 * something.
 *
 * A transport command is one-way: it returns as soon as it has been handed
 * over, and the player updates its own state a moment later. Reading only at
 * the moment of the press gets the state the press was meant to change, so the
 * pause button would show the wrong glyph until the next poll came round five
 * seconds later.
 */
const SETTLE_MS = 400;

const ENV_ENDPOINT = (
  process.env.EXPO_PUBLIC_NOW_PLAYING_ENDPOINT ?? ''
).trim();

/**
 * https, and nothing else.
 *
 * Cleartext http cannot work anyway: the app targets API 36, where Android
 * refuses it unless the manifest opts back in, and this one does not. Accepting
 * an http:// URL here only bought a confusing failure several seconds later
 * instead of an honest empty source immediately — and it made "everything this
 * app sends is encrypted in transit" a claim that depended on the platform
 * rather than on the app.
 */
function isFetchable(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/** Settings win over the build-time default, which wins over no source. */
export function resolveNowPlayingEndpoint(configured: string): string {
  const chosen = configured.trim() || ENV_ENDPOINT;
  return isFetchable(chosen) ? chosen : '';
}

export function useNowPlaying(endpoint: string, enabled: boolean) {
  const [result, setResult] = useState<NowPlayingResult | null>(null);
  // Re-read rather than subscribe: the grant is given in system settings, and
  // Android offers no callback for it, so the only way to notice is to look.
  const [granted, setGranted] = useState(hasNotificationAccess);
  const generation = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settled = useDebounced(endpoint, ENDPOINT_SETTLE_MS);
  const source: SourceChoice = chooseSource(settled, granted);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const token = ++generation.current;

    const nowGranted = hasNotificationAccess();
    setGranted(nowGranted);

    loadNowPlaying(settled, nowGranted)
      .then((next) => {
        if (token === generation.current) setResult(next);
      })
      .catch(() => {
        // The load reports its failures rather than throwing them, but it
        // reaches across the bridge into a native module every five seconds
        // for as long as the clock is docked. The rejection it was never meant
        // to produce must not become an unhandled one on hour six.
      });
  }, [settled, enabled]);

  /**
   * Send a command, then look again.
   *
   * Both reads are kept: the immediate one catches players that update
   * synchronously, and the delayed one catches the rest. Neither can strand a
   * stale answer on screen, because `refresh` discards anything a newer
   * generation has overtaken.
   */
  const control = useCallback(
    (action: TransportAction) => {
      if (!enabled) return;
      if (!controlDevice(action)) return;

      refresh();
      clearTimeout(settle.current);
      settle.current = setTimeout(refresh, SETTLE_MS);
    },
    [enabled, refresh],
  );

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      return;
    }

    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') refresh();
    });

    return () => {
      generation.current += 1;
      clearInterval(timer);
      clearTimeout(settle.current);
      subscription.remove();
    };
  }, [refresh, enabled]);

  return { result, source, refresh, control };
}
