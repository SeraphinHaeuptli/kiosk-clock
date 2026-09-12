/**
 * The pomodoro's state, its storage, and the moment a phase ends.
 *
 * The current time arrives as an argument rather than being read here, so the
 * component that draws the timer owns the only per-second tick in the app.
 * Putting it in this hook would have been tidier to read and would have made
 * the whole clock screen re-render every second, undoing the work that keeps
 * the character faces cheap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import {
  expired,
  idle,
  next as advance,
  pause as hold,
  relength,
  running,
  start as begin,
  type Lengths,
  type Phase,
  type Pomodoro,
} from './pomodoro';

const PHASES: readonly Phase[] = ['focus', 'short', 'long'];

/** A day, as an outer bound on anything read back from storage. */
const SANE_MS = 86_400_000;

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, Number.MAX_SAFE_INTEGER)
    : fallback;
}

/**
 * What came out of storage, or nothing.
 *
 * Returns null rather than a default, because the caller has the lengths and
 * this does not — and a timer restored with the wrong lengths would be worse
 * than one that starts fresh.
 */
function decode(raw: unknown): Pomodoro | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const input = raw as Record<string, unknown>;

  const phase = PHASES.includes(input.phase as Phase)
    ? (input.phase as Phase)
    : null;
  if (phase === null) return null;

  const fullMs = number(input.fullMs, 0);
  if (fullMs <= 0 || fullMs > SANE_MS) return null;

  const endsAt =
    typeof input.endsAt === 'number' && Number.isFinite(input.endsAt)
      ? input.endsAt
      : null;

  return {
    phase,
    endsAt,
    leftMs: Math.min(number(input.leftMs, fullMs), fullMs),
    fullMs,
    done: Math.min(number(input.done, 0), 9999),
  };
}

const slot = jsonSlot(asyncStorageAdapter, 'kiosk.pomodoro.v1', decode);

export interface PomodoroControls {
  /** Null until storage has answered, so nothing flashes the wrong state. */
  state: Pomodoro | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Finish this phase now and move to the next one, still paused. */
  skip: () => void;
}

export function usePomodoro(
  lengths: Lengths,
  enabled: boolean,
  nowMs: number,
): PomodoroControls {
  const [state, setState] = useState<Pomodoro | null>(null);

  // Read once. A timer paused yesterday should still be paused today, and one
  // that was running has a deadline that has long since passed — which the
  // expiry effect below picks up on the first tick, exactly as if the app had
  // been watching the whole time.
  useEffect(() => {
    let live = true;
    slot.load().then((stored) => {
      if (live) setState(stored ?? idle(lengths));
    });
    return () => {
      live = false;
    };
    // Lengths deliberately not a dependency: this runs once, and a later
    // change is handled by the relength effect rather than by re-reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Written on every change, including the ones the clock makes by itself.
  const first = useRef(true);
  useEffect(() => {
    if (state === null) return;
    if (first.current) {
      first.current = false;
      return;
    }
    slot.save(state).catch(() => {});
  }, [state]);

  useEffect(() => {
    setState((current) => (current === null ? current : relength(current, lengths)));
  }, [lengths]);

  /**
   * One advance per expiry, and a buzz to say so.
   *
   * Runs off the tick rather than a timeout: a timeout scheduled for twenty-five
   * minutes away is a timeout Android is free to defer, and the tick already
   * re-syncs when the app comes back.
   */
  useEffect(() => {
    if (!enabled || state === null || !expired(state, nowMs)) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    setState((current) =>
      current !== null && expired(current, nowMs) ? advance(current, lengths) : current,
    );
  }, [enabled, state, nowMs, lengths]);

  const start = useCallback(() => {
    setState((current) => (current === null ? current : begin(current, Date.now())));
  }, []);

  const pause = useCallback(() => {
    setState((current) => (current === null ? current : hold(current, Date.now())));
  }, []);

  const reset = useCallback(() => {
    setState(idle(lengths));
  }, [lengths]);

  const skip = useCallback(() => {
    setState((current) => (current === null ? current : advance(current, lengths)));
  }, [lengths]);

  return { state, start, pause, reset, skip };
}

export { running };
