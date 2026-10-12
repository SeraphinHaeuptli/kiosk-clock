import { useEffect, useState } from 'react';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import { decodeLink, type BridgeLink } from './lights';

/**
 * The one paired bridge, shared by everything that asks for it.
 *
 * Module scope rather than a context, and for a concrete reason: settings is a
 * modal over a live clock, so at the moment a bridge is paired two screens are
 * mounted and both want the result. A context would have to be hoisted above
 * the router to do that, and the weather module already solves the same
 * problem the same way.
 */
const slot = jsonSlot(asyncStorageAdapter, 'kiosk.lights.v1', decodeLink);

let cached: BridgeLink | null = null;
let loaded = false;
let loading: Promise<BridgeLink | null> | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  // A copy, because a listener may unsubscribe while this is running.
  for (const listener of [...listeners]) listener();
}

/** Reads storage once; later callers get the copy in memory. */
export async function loadLink(): Promise<BridgeLink | null> {
  if (loaded) return cached;

  loading ??= slot
    .load()
    .then((link) => {
      cached = link;
      loaded = true;
      loading = null;
      return link;
    })
    .catch(() => {
      // jsonSlot swallows its own failures, so this is belt and braces — but
      // a load left unresolved would leave the lights section saying "reading
      // settings" for the rest of the session.
      loaded = true;
      loading = null;
      return null;
    });

  return loading;
}

export async function saveLink(link: BridgeLink): Promise<void> {
  cached = link;
  loaded = true;
  announce();
  await slot.save(link);
}

/**
 * Forget the bridge.
 *
 * This does not tell the bridge to delete the key it issued — that is done in
 * the Hue app, under the list of connected apps, and the settings screen says
 * so. Removing it here stops this app using it.
 */
export async function clearLink(): Promise<void> {
  cached = null;
  loaded = true;
  announce();
  await slot.clear();
}

export interface StoredLink {
  link: BridgeLink | null;
  /** False until storage has been read, so nothing claims "not paired" early. */
  ready: boolean;
}

export function useLink(): StoredLink {
  const [state, setState] = useState<StoredLink>(() => ({
    link: cached,
    ready: loaded,
  }));

  useEffect(() => {
    let active = true;

    const sync = () => {
      if (!active) return;
      setState((current) =>
        current.link === cached && current.ready === loaded
          ? current
          : { link: cached, ready: loaded },
      );
    };

    listeners.add(sync);
    loadLink().then(sync, sync);

    return () => {
      active = false;
      listeners.delete(sync);
    };
  }, []);

  return state;
}
