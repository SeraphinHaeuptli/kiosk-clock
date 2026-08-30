/**
 * The three small readouts that share the line under the date: a second time
 * zone, a countdown, and the battery.
 *
 * All pure, and all deliberately free of `Intl`. The rest of this app formats
 * dates by hand so output is identical on every engine, and a world clock is
 * exactly where that discipline earns its keep — `Intl.DateTimeFormat` with a
 * named time zone depends on an ICU database whose presence varies by build.
 */

import { pad2 } from '@/core/format';

/* -- A second clock -------------------------------------------------------- */

/**
 * A fixed offset rather than a named zone, and the trade is worth stating: a
 * fixed offset never needs a database and never disagrees with itself, but it
 * does not follow anyone's daylight saving. Someone tracking a city that
 * observes it has to move the offset twice a year. The alternative is shipping
 * a zone database, or trusting one that may not be there.
 */
export function offsetClock(
  now: Date,
  offsetMinutes: number,
  hour12: boolean,
): string {
  const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Arithmetic on minutes rather than a second Date: constructing one would
  // re-apply the device's own offset, which is the thing being replaced.
  const total = (((utc + offsetMinutes) % 1440) + 1440) % 1440;

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (!hour12) return `${pad2(hours)}:${pad2(minutes)}`;
  const shown = hours % 12 || 12;
  return `${shown}:${pad2(minutes)}${hours < 12 ? 'am' : 'pm'}`;
}

/** "utc+5:30", "utc-8", "utc" — how the offset reads in settings. */
export function offsetName(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'utc';

  const sign = offsetMinutes < 0 ? '-' : '+';
  const total = Math.abs(offsetMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  return minutes === 0
    ? `utc${sign}${hours}`
    : `utc${sign}${hours}:${pad2(minutes)}`;
}

/* -- A countdown ----------------------------------------------------------- */

/**
 * Whole days between two local calendar dates.
 *
 * Both ends are collapsed to local midnight before subtracting, and the result
 * is rounded rather than truncated, because a day that crosses a daylight
 * saving boundary is twenty-three or twenty-five hours long. Dividing raw
 * milliseconds and flooring would put the count off by one for half the year
 * in every country that changes its clocks.
 */
export function daysUntil(target: string, now: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(target.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const then = new Date(Number(year), Number(month) - 1, Number(day));

  // Date rolls impossible values over — the 31st of February becomes March —
  // so a round trip is what catches a date that was never real.
  if (
    then.getFullYear() !== Number(year) ||
    then.getMonth() !== Number(month) - 1 ||
    then.getDate() !== Number(day)
  ) {
    return null;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}

/** "12 days to launch", "launch today", "3 days since launch". */
export function countdownLine(
  target: string,
  label: string,
  now: Date,
): string | null {
  const days = daysUntil(target, now);
  if (days === null) return null;

  const name = label.trim();
  const suffix = name ? ` ${name}` : '';

  if (days === 0) return name ? `${name} today` : 'today';
  if (days === 1) return name ? `${name} tomorrow` : 'tomorrow';
  if (days === -1) return name ? `${name} was yesterday` : 'yesterday';
  if (days > 1) return `${days} days to${suffix}`;
  return `${-days} days since${suffix}`;
}

/* -- Battery --------------------------------------------------------------- */

/** "84%", or "84% +" while it is charging. */
export function batteryLine(level: number, charging: boolean): string | null {
  if (!Number.isFinite(level) || level < 0) return null;
  const percent = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return charging ? `${percent}% +` : `${percent}%`;
}
