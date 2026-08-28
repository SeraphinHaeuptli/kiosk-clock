import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useDebounced } from '@/core/useDebounced';

import { loadNowPlaying, type NowPlayingResult } from './nowPlaying';
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

const ENV_ENDPOINT = (
  process.env.EXPO_PUBLIC_NOW_PLAYING_ENDPOINT ?? ''
).trim();

/** Settings win over the build-time default, which wins over no source. */
export function resolveNowPlayingEndpoint(configured: string): string {
  return configured.trim() || ENV_ENDPOINT;
}

export function useNowPlaying(endpoint: string, enabled: boolean) {
  const [result, setResult] = useState<NowPlayingResult | null>(null);
  // Re-read rather than subscribe: the grant is given in system settings, and
  // Android offers no callback for it, so the only way to notice is to look.
  const [granted, setGranted] = useState(hasNotificationAccess);
  const generation = useRef(0);
  const settled = useDebounced(endpoint, ENDPOINT_SETTLE_MS);
  const source: SourceChoice = chooseSource(settled, granted);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const token = ++generation.current;

    const nowGranted = hasNotificationAccess();
    setGranted(nowGranted);

    loadNowPlaying(settled, nowGranted).then((next) => {
      if (token === generation.current) setResult(next);
    });
  }, [settled, enabled]);

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
      subscription.remove();
    };
  }, [refresh, enabled]);

  return { result, source, refresh };
}
