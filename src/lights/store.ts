import { useEffect, useState } from 'react';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import { rememberLamps } from '../../modules/hue-ble';

import {
  decodeSource,
  lampsName,
  type BridgeLink,
  type Lamp,
  type LightsSource,
} from './lights';

/**
 * The one set of lights this phone drives, shared by everything that asks.
 *
 * Module scope rather than a context, and for a concrete reason: settings is a
 * modal over a live clock, so at the moment lights are set up two screens are
 * mounted and both want the result. A context would have to be hoisted above
 * the router to do that, and the weather module already solves the same
 * problem the same way.
 */
const slot = jsonSlot(asyncStorageAdapter, 'kiosk.lights.v1', decodeSource);

let cached: LightsSource | null = null;
let loaded = false;
let loading: Promise<LightsSource | null> | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  // A copy, because a listener may unsubscribe while this is running.
  for (const listener of [...listeners]) listener();
}

/** Reads storage once; later callers get the copy in memory. */
export async function loadSource(): Promise<LightsSource | null> {
  if (loaded) return cached;

  loading ??= slot
    .load()
    .then((source) => {
      cached = source;
      loaded = true;
      loading = null;
      return source;
    })
    .catch(() => {
      // jsonSlot swallows its own failures, so this is belt and braces — but
      // a load left unresolved would leave the lights section saying
      // "connecting" for the rest of the session.
      loaded = true;
      loading = null;
      return null;
    });

  return loading;
}

async function save(source: LightsSource): Promise<void> {
  cached = source;
  loaded = true;
  announce();
  await slot.save(source);
}

export function saveBridge(bridge: BridgeLink): Promise<void> {
  // A bridge is not something the widget can drive, so it stops offering to.
  rememberLamps([], '');
  return save({ kind: 'bridge', bridge });
}

export function saveLamps(lamps: Lamp[]): Promise<void> {
  // Mirrored for the home screen widget, which has no other way to know.
  rememberLamps(
    lamps.map((lamp) => lamp.address),
    lampsName(lamps),
  );
  return save({ kind: 'lamps', lamps });
}

/**
 * Forget the lights.
 *
 * This does not tell a bridge to delete the key it issued, and it does not
 * un-pair a lamp from the phone — a Bluetooth bond belongs to Android, not to
 * this app. Both of those are done where they live, and settings says so.
 */
export async function clearSource(): Promise<void> {
  rememberLamps([], '');
  cached = null;
  loaded = true;
  announce();
  await slot.clear();
}

export interface StoredSource {
  source: LightsSource | null;
  /** False until storage has been read, so nothing claims "not set up" early. */
  ready: boolean;
}

export function useSource(): StoredSource {
  const [state, setState] = useState<StoredSource>(() => ({
    source: cached,
    ready: loaded,
  }));

  useEffect(() => {
    let active = true;

    const sync = () => {
      if (!active) return;
      setState((current) =>
        current.source === cached && current.ready === loaded
          ? current
          : { source: cached, ready: loaded },
      );
    };

    listeners.add(sync);
    loadSource().then(sync, sync);

    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, []);

  return state;
}
