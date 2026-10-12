import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clamp01 } from '@/core/format';

import { isHueLinkAvailable } from '../../modules/hue-link';

import { readBrightness, writeBrightness } from './bridge';
import {
  fromGroupState,
  type BridgeLink,
  type LightsStatus,
  type Transport,
} from './lights';

/**
 * A room on a Hue bridge, driven over the local network.
 *
 * The displayed level leads and the writes follow, coalesced: this is a
 * request over wifi to a box in another room, which can be slow, asleep, or
 * gone, and a bar that waited for each round trip would lag the finger.
 */

/**
 * Signify asks for no more than one command per second to a group, ten to a
 * single light. A finger crossing a slider generates far more than that, and a
 * bridge pushed past it starts answering 503 — so intermediate values are
 * dropped rather than queued. This is the floor between two writes; the level
 * under the finger is never delayed by it, and the value the finger stops on
 * always gets sent.
 *
 * Above Signify's figure, and deliberately: a full second of lag between a
 * drag and the room responding reads as a broken control, and a dropped
 * command costs nothing here because the next write carries the whole state.
 */
const WRITE_INTERVAL_MS = 400;

/**
 * Someone else — the Hue app, a wall switch, a routine at sunset — can change
 * these lights, and this bar may be on screen for hours. Slow, because it is
 * only here to stop the slider drifting away from the room it claims to show.
 */
const POLL_MS = 30_000;

/** One retry, so the value a finger stopped on cannot be lost to a busy bridge. */
const RETRY_MS = 700;

export function useBridgeTransport(
  link: BridgeLink | null,
  enabled: boolean,
): Transport {
  const [level, setLevel] = useState(0);
  const [known, setKnown] = useState(false);
  const [status, setStatus] = useState<LightsStatus>({ kind: 'off' });

  // Read by callbacks that outlive the render they were made in.
  const linkRef = useRef<BridgeLink | null>(link);
  linkRef.current = link;

  const dragging = useRef(false);
  const pending = useRef<number | null>(null);
  const inFlight = useRef(false);
  const retried = useRef(false);
  const lastWrite = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -- Writing ------------------------------------------------------------- */

  const flush = useCallback(async () => {
    const target = linkRef.current;
    const next = pending.current;
    if (target === null || next === null || inFlight.current) return;

    pending.current = null;
    inFlight.current = true;
    lastWrite.current = Date.now();

    const result = await writeBrightness(target, next);
    inFlight.current = false;

    if (result.ok) {
      retried.current = false;
      setStatus((current) => (current.kind === 'live' ? current : { kind: 'live' }));
    } else {
      setStatus({ kind: 'failed', reason: result.reason });
      // Only the value nothing has superseded is worth retrying, and only
      // once: a bridge that refuses twice is not busy, it is unreachable.
      if (pending.current === null && !retried.current) {
        retried.current = true;
        pending.current = next;
      }
    }

    if (pending.current !== null) scheduleRef.current(result.ok ? 0 : RETRY_MS);
  }, []);

  /**
   * The two halves call each other — a finished write schedules the next one —
   * and two `useCallback`s cannot name each other in their dependency arrays.
   * A ref breaks the circle in the one direction that needs it.
   */
  const scheduleRef = useRef<(extraMs?: number) => void>(() => {});

  const schedule = useCallback(
    (extraMs = 0) => {
      if (timer.current) return;
      const since = Date.now() - lastWrite.current;
      const wait = Math.max(extraMs, WRITE_INTERVAL_MS - since);

      timer.current = setTimeout(
        () => {
          timer.current = null;
          void flush();
        },
        Math.max(0, wait),
      );
    },
    [flush],
  );

  scheduleRef.current = schedule;

  const set = useCallback(
    (next: number) => {
      const wanted = clamp01(next);
      setLevel(wanted);
      // A reading has not necessarily arrived, but a level someone just chose
      // is a level this knows.
      setKnown(true);
      pending.current = wanted;
      retried.current = false;
      schedule();
    },
    [schedule],
  );

  const setDragging = useCallback((value: boolean) => {
    dragging.current = value;
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* -- Reading ------------------------------------------------------------- */

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'off' });
      setKnown(false);
      return;
    }
    if (!isHueLinkAvailable) {
      setStatus({ kind: 'absent' });
      return;
    }
    if (!link) {
      setStatus({ kind: 'unpaired' });
      setKnown(false);
      return;
    }

    let active = true;
    setStatus((current) => (current.kind === 'live' ? current : { kind: 'reading' }));

    const refresh = async () => {
      // Never while the finger is down or a write is still settling: the
      // bridge would answer with the level from before the drag and the bar
      // would jump backwards under the thumb.
      if (dragging.current || inFlight.current || pending.current !== null) return;

      const result = await readBrightness(link);
      if (!active) return;

      if (result.ok) {
        setLevel(fromGroupState(result.value));
        setKnown(true);
        setStatus({ kind: 'live' });
      } else {
        setStatus({ kind: 'failed', reason: result.reason });
      }
    };

    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);

    // A kiosk comes back to the foreground to be looked at, and the lights may
    // have been changed by anything at all while it was away.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      active = false;
      clearInterval(poll);
      subscription.remove();
    };
  }, [enabled, link]);

  return { level, known, status, set, setDragging };
}
