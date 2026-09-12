/**
 * A pomodoro, kept in wall-clock time rather than counted down.
 *
 * The state holds the moment the phase ends, and everything else is derived
 * from the current time. Counting ticks instead would drift, and worse, it
 * would lose whole minutes whenever the OS throttled the timer — which Android
 * does the moment the app stops being the thing on screen. A deadline is
 * immune: come back after an hour and the arithmetic is still right.
 *
 * Pure, and free of any storage or timer. What ticks and what persists is
 * decided in `usePomodoro`, so all of this can be tested by handing it a
 * number.
 */

import { pad2 } from '@/core/format';

export type Phase = 'focus' | 'short' | 'long';

/** Focus phases before the long break. The canonical four. */
export const CYCLE = 4;

export interface Lengths {
  /** All in minutes, as the settings hold them. */
  focus: number;
  short: number;
  long: number;
}

export interface Pomodoro {
  phase: Phase;
  /** When the phase ends, or null while paused. Running is `endsAt !== null`. */
  endsAt: number | null;
  /** What is left, and the truth only while paused. */
  leftMs: number;
  /**
   * What this phase was worth when it began.
   *
   * Carried so a settings change can tell an untouched phase, which should
   * take the new length, from a part-spent one, which must not: banking
   * twenty-four minutes and then nudging the focus length should not hand
   * those minutes back or take them away.
   */
  fullMs: number;
  /** Focus phases finished since the last reset. */
  done: number;
}

const MINUTE = 60_000;

export function lengthMs(phase: Phase, lengths: Lengths): number {
  return (phase === 'focus' ? lengths.focus : phase === 'short' ? lengths.short : lengths.long) * MINUTE;
}

/** A fresh timer: focus, full, and not running. */
export function idle(lengths: Lengths): Pomodoro {
  const full = lengthMs('focus', lengths);
  return { phase: 'focus', endsAt: null, leftMs: full, fullMs: full, done: 0 };
}

export function running(p: Pomodoro): boolean {
  return p.endsAt !== null;
}

/** Never negative, so a deadline long past reads as zero rather than nonsense. */
export function remaining(p: Pomodoro, nowMs: number): number {
  return p.endsAt === null ? p.leftMs : Math.max(0, p.endsAt - nowMs);
}

export function expired(p: Pomodoro, nowMs: number): boolean {
  return p.endsAt !== null && nowMs >= p.endsAt;
}

export function start(p: Pomodoro, nowMs: number): Pomodoro {
  if (running(p)) return p;
  // A phase that ran to zero starts over rather than ending instantly.
  const left = p.leftMs > 0 ? p.leftMs : 0;
  return { ...p, endsAt: nowMs + left };
}

export function pause(p: Pomodoro, nowMs: number): Pomodoro {
  if (!running(p)) return p;
  return { ...p, endsAt: null, leftMs: remaining(p, nowMs) };
}

/**
 * The next phase, paused.
 *
 * Deliberately not started. The alternative — rolling straight into the break
 * — reads well until the app has been in the background, at which point the
 * honest options are to start a phase nobody asked for or to invent a rule
 * about how much lateness is too much. Advancing exactly one phase and waiting
 * behaves identically whether you looked away for a second or a day, and that
 * is worth more than saving a tap.
 */
export function next(p: Pomodoro, lengths: Lengths): Pomodoro {
  const done = p.phase === 'focus' ? p.done + 1 : p.done;
  const phase: Phase =
    p.phase === 'focus' ? (done % CYCLE === 0 ? 'long' : 'short') : 'focus';

  const full = lengthMs(phase, lengths);
  return { phase, endsAt: null, leftMs: full, fullMs: full, done };
}

/**
 * Re-length a paused phase after the settings change.
 *
 * Left alone while running: shortening a phase already under way could put its
 * deadline in the past, which would fire the end of a session someone is in
 * the middle of.
 */
export function relength(p: Pomodoro, lengths: Lengths): Pomodoro {
  if (running(p)) return p;
  // Part-spent, so the new length applies to the next phase and not this one.
  if (p.leftMs !== p.fullMs) return p;

  const full = lengthMs(p.phase, lengths);
  return full === p.fullMs ? p : { ...p, leftMs: full, fullMs: full };
}

/** "24:13", and "1:04:00" for a long break someone has set past the hour. */
export function clockText(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

/** How far into the set of four this is, for the dots. */
export function position(p: Pomodoro): number {
  return p.phase === 'long' ? CYCLE : p.done % CYCLE;
}

export function phaseName(phase: Phase): string {
  return phase === 'focus' ? 'focus' : phase === 'short' ? 'break' : 'long break';
}
