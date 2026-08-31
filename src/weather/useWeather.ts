import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';
import { useDebounced } from '@/core/useDebounced';

import { fetchPlace, fetchWeather, type Fetched } from './source';
import type { Place, Weather } from './weather';

/**
 * A forecast does not change faster than this, and the service is a public
 * one paid for by somebody else. Polling harder would buy nothing and cost
 * them.
 */
const REFRESH_MS = 30 * 60_000;
/** Long enough that typing a city name is one lookup rather than eleven. */
const QUERY_SETTLE_MS = 900;

export type WeatherStatus =
  /** No place set. The corners stay empty and nothing is requested. */
  | { kind: 'off' }
  | { kind: 'resolving' }
  | { kind: 'live' }
  | { kind: 'failed'; reason: string };

interface Cached {
  query: string;
  place: Place;
}

function decodeCached(raw: unknown): Cached | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<Cached>;
  const place = value.place;

  if (
    typeof value.query !== 'string' ||
    typeof place !== 'object' ||
    place === null ||
    typeof place.latitude !== 'number' ||
    typeof place.longitude !== 'number' ||
    typeof place.label !== 'string'
  ) {
    return null;
  }

  return { query: value.query, place };
}

const placeSlot = jsonSlot(
  asyncStorageAdapter,
  'kiosk.weather.place.v1',
  decodeCached,
);

function sameQuery(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/* -- Place resolution, shared across every caller -------------------------- */

/**
 * Both the kiosk and the settings screen run this hook, and settings is a
 * modal over a live clock — so at the moment a city is typed, two copies are
 * asking for the same coordinates at once. The memo and the in-flight map
 * live at module scope rather than in a ref so that is one request rather
 * than two, which is what Nominatim's usage policy asks for and what keeps
 * the settings status line agreeing with the corner behind it.
 */
let memo: Cached | null = null;
let memoLoaded = false;
const inFlight = new Map<string, Promise<Fetched<Place>>>();

/**
 * Forget the remembered place, in memory as well as on disk.
 *
 * Clearing only storage would leave the previous location live in `memo` for
 * the rest of the session, so a reset would appear not to have worked until
 * the app was next launched.
 */
export async function clearPlaceCache(): Promise<void> {
  memo = null;
  memoLoaded = false;
  inFlight.clear();
  await placeSlot.clear();
}

async function resolvePlace(query: string): Promise<Fetched<Place>> {
  if (!memoLoaded) {
    memo = await placeSlot.load();
    memoLoaded = true;
  }

  if (memo && sameQuery(memo.query, query)) {
    return { ok: true, value: memo.place };
  }

  const key = query.trim().toLowerCase();
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetchPlace(query).then((found) => {
    inFlight.delete(key);
    if (found.ok) {
      memo = { query, place: found.value };
      placeSlot.save(memo);
    }
    return found;
  });

  inFlight.set(key, request);
  return request;
}

/**
 * Resolves a typed place name to coordinates, then keeps a forecast for it.
 *
 * The two halves are deliberately on different clocks. A place name is
 * geocoded once and the answer is written to storage, so a city typed today
 * costs one lookup ever, not one per launch — Nominatim's usage policy asks
 * for exactly that, and it is also the difference between a clock that shows
 * weather instantly on a cold start and one that waits on a round trip. Only
 * the forecast is refreshed on a timer.
 */
export function useWeather(query: string, enabled: boolean) {
  const [place, setPlace] = useState<Place | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [status, setStatus] = useState<WeatherStatus>({ kind: 'off' });

  const settled = useDebounced(query.trim(), QUERY_SETTLE_MS);
  const generation = useRef(0);

  /* -- Place: resolved once per name, then remembered --------------------- */

  useEffect(() => {
    if (!enabled || !settled) {
      generation.current += 1;
      setPlace(null);
      setWeather(null);
      setStatus({ kind: 'off' });
      return;
    }

    const token = ++generation.current;
    let active = true;

    // Only announced when a lookup is actually going to happen; a name already
    // in the cache resolves within the frame and would just flicker.
    if (!memo || !sameQuery(memo.query, settled)) {
      setStatus({ kind: 'resolving' });
    }

    resolvePlace(settled).then((found) => {
      if (!active || token !== generation.current) return;

      if (!found.ok) {
        setPlace(null);
        setWeather(null);
        setStatus({ kind: 'failed', reason: found.reason });
        return;
      }

      setPlace(found.value);
    });

    return () => {
      active = false;
    };
  }, [settled, enabled]);

  /* -- Forecast: on the place, on a timer, and on coming back ------------- */

  const refresh = useCallback(() => {
    if (!enabled || !place) return;
    const token = generation.current;

    fetchWeather(place).then((result) => {
      if (token !== generation.current) return;

      if (result.ok) {
        setWeather(result.value);
        setStatus({ kind: 'live' });
      } else {
        // The last reading is kept on screen rather than blanked. Weather an
        // hour old is still roughly true, and a corner that empties itself
        // every time a train goes through a tunnel is worse than one that is
        // slightly stale.
        setStatus({ kind: 'failed', reason: result.reason });
      }
    });
  }, [enabled, place]);

  useEffect(() => {
    if (!enabled || !place) return;

    // The reading on screen belongs to the place it was fetched for. Leaving
    // it up while a new one loads put the old city's temperature under the new
    // city's name — briefly, and wrongly. A blank corner is the honest state.
    setWeather(null);
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh, enabled, place]);

  return { weather, place, status };
}
