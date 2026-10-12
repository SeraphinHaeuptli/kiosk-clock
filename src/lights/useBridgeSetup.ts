import { useCallback, useEffect, useRef, useState } from 'react';

import { isHueLinkAvailable } from '../../modules/hue-link';

import {
  createKey,
  discoverBridges,
  readBridge,
  readGroups,
} from './bridge';
import { isBridgeAddress, type BridgeLink, type LightGroup } from './lights';
import { clearLink, saveLink, useLink } from './store';

/**
 * The pairing flow, for the settings screen.
 *
 * Deliberately separate from `useLights`: this one runs only while someone is
 * looking at the settings screen, and the clock behind it has no business
 * discovering bridges. The two share the stored link and nothing else.
 */

/** What is happening right now, for a screen that has to say so. */
export type Busy = 'searching' | 'pairing' | 'listing' | null;

export interface Candidate {
  ip: string;
  id: string;
  /** What the bridge calls itself. */
  name: string;
  fingerprint: string;
  /** How many other bridges answered the lookup. Usually none. */
  others: number;
}

export interface BridgeSetup {
  link: BridgeLink | null;
  /** A bridge that has been found but not yet paired with. */
  candidate: Candidate | null;
  /** The groups on the paired bridge, once they have been read. */
  groups: readonly LightGroup[] | null;
  busy: Busy;
  /** The last thing that went wrong, or null. */
  problem: string | null;
  available: boolean;
  /** Ask Signify's lookup service which bridges share this network. */
  find: () => void;
  /** Try a typed address instead. */
  use: (ip: string) => void;
  /** Swap the issued key for a pressed button. */
  pair: () => void;
  choose: (group: LightGroup) => void;
  /** Read the group list again, after a failure or a rename. */
  refresh: () => void;
  forget: () => void;
}

export function useBridgeSetup(): BridgeSetup {
  const { link } = useLink();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [groups, setGroups] = useState<readonly LightGroup[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Settings is a modal, and every request here outlives a fast [done] tap.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const linkRef = useRef<BridgeLink | null>(link);
  linkRef.current = link;

  /**
   * The group list, read from the bridge rather than remembered.
   *
   * Rooms get renamed and deleted in the Hue app, and a picker showing names
   * from the last time this screen was open would offer a room that no longer
   * exists. It doubles as a connection test: this is the request that reports
   * a bridge that has moved address or a key that was revoked.
   */
  const list = useCallback(async (target: BridgeLink) => {
    setBusy('listing');
    const found = await readGroups(target);
    if (!alive.current) return;

    setBusy(null);
    if (found.ok) {
      setGroups(found.value);
      setProblem(null);
    } else {
      setGroups(null);
      setProblem(found.reason);
    }
  }, []);

  // On arrival, and again whenever the bridge changes underneath.
  useEffect(() => {
    if (!link || !isHueLinkAvailable) return;
    void list(link);
  }, [link, list]);

  const find = useCallback(() => {
    setBusy('searching');
    setProblem(null);
    setCandidate(null);

    void (async () => {
      const found = await discoverBridges();
      if (!alive.current) return;

      if (!found.ok) {
        setBusy(null);
        setProblem(found.reason);
        return;
      }

      const first = found.value[0];
      if (!first) {
        setBusy(null);
        setProblem('no bridge answered — type its address instead');
        return;
      }

      // The lookup knows which bridge, not what state it is in; this is the
      // request that proves something is actually there and that its
      // certificate agrees about who it is.
      const facts = await readBridge(first.ip, first.id);
      if (!alive.current) return;

      setBusy(null);
      if (!facts.ok) {
        setProblem(facts.reason);
        return;
      }

      setCandidate({
        ip: first.ip,
        id: facts.value.id,
        name: facts.value.name,
        fingerprint: facts.value.fingerprint,
        others: found.value.length - 1,
      });
    })();
  }, []);

  const use = useCallback((ip: string) => {
    const address = ip.trim();
    if (!isBridgeAddress(address)) {
      setProblem('that is not an address on your network');
      return;
    }

    setBusy('searching');
    setProblem(null);
    setCandidate(null);

    void (async () => {
      // No id to check the certificate against here, because nothing
      // trustworthy told us one. The fingerprint recorded when pairing
      // succeeds is what every later request is held to.
      const facts = await readBridge(address);
      if (!alive.current) return;

      setBusy(null);
      if (!facts.ok) {
        setProblem(facts.reason);
        return;
      }

      setCandidate({
        ip: address,
        id: facts.value.id,
        name: facts.value.name,
        fingerprint: facts.value.fingerprint,
        others: 0,
      });
    })();
  }, []);

  const pair = useCallback(() => {
    const found = candidate;
    if (!found) return;

    setBusy('pairing');
    setProblem(null);

    void (async () => {
      const key = await createKey(found.ip, found.id, found.fingerprint);
      if (!alive.current) return;

      if (!key.ok) {
        setBusy(null);
        setProblem(key.reason);
        return;
      }

      const paired = {
        ip: found.ip,
        id: found.id,
        key: key.value,
        fingerprint: found.fingerprint,
      };

      const rooms = await readGroups(paired);
      if (!alive.current) return;
      setBusy(null);

      /*
        A link has to name a group, so nothing is stored until there is one to
        store. The key is not lost by giving up here: the bridge keeps it, and
        it issues another on the next press of the button.
      */
      if (!rooms.ok) {
        setProblem(rooms.reason);
        return;
      }

      const first = rooms.value[0];
      if (!first) {
        setProblem('that bridge has no lights to dim');
        return;
      }

      // Pairing picks the group rather than leaving a paired bridge that
      // drives nothing. The list is sorted with rooms first and everything-at-
      // once last, so this is a room wherever there is one; the picker under
      // it is how it gets changed.
      await saveLink({
        ...paired,
        groupId: first.id,
        groupName: first.name,
      });
      if (!alive.current) return;

      setGroups(rooms.value);
      setCandidate(null);
      setProblem(null);
    })();
  }, [candidate]);

  const choose = useCallback((group: LightGroup) => {
    const target = linkRef.current;
    if (!target) return;
    void saveLink({ ...target, groupId: group.id, groupName: group.name });
  }, []);

  const refresh = useCallback(() => {
    const target = linkRef.current;
    if (!target) return;
    void list(target);
  }, [list]);

  const forget = useCallback(() => {
    setCandidate(null);
    setGroups(null);
    setProblem(null);
    void clearLink();
  }, []);

  return {
    link,
    candidate,
    groups,
    busy,
    problem,
    available: isHueLinkAvailable,
    find,
    use,
    pair,
    choose,
    refresh,
    forget,
  };
}
