import { TONES, type ToneId } from '@/design/palette';

export type FaceId = 'ascii' | 'digital' | 'stack' | 'analog' | 'words';
export type BackdropId = 'void' | 'horizon' | 'stars' | 'dither';

export interface ClockSettings {
  face: FaceId;
  tone: ToneId;
  backdrop: BackdropId;

  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showUsage: boolean;

  /** Hold the screen on while the kiosk is in the foreground. */
  keepAwake: boolean;
  /** Fade the face down overnight instead of glaring in a dark room. */
  nightDim: boolean;
  /** Drift the face a few pixels to spare OLED panels on long runs. */
  burnInGuard: boolean;
  landscape: boolean;

  /** Optional HTTP source for live Claude usage. Empty means sample data. */
  usageEndpoint: string;
}

export const DEFAULT_SETTINGS: ClockSettings = {
  face: 'ascii',
  tone: 'white',
  backdrop: 'horizon',

  hour12: false,
  showSeconds: false,
  showDate: true,
  showUsage: true,

  keepAwake: true,
  nightDim: true,
  burnInGuard: true,
  landscape: false,

  usageEndpoint: '',
};

const FACES: readonly FaceId[] = ['ascii', 'digital', 'stack', 'analog', 'words'];
const BACKDROPS: readonly BackdropId[] = ['void', 'horizon', 'stars', 'dither'];

function oneOf<T extends string>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Build valid settings from anything that came out of storage. Unknown or
 * missing fields fall back to their default, so settings written by an older
 * build stay loadable — including ones naming faces, backdrops or accent
 * colours that no longer exist.
 */
export function decodeSettings(raw: unknown): ClockSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const input = raw as Partial<Record<keyof ClockSettings, unknown>>;

  return {
    face: oneOf(FACES, input.face, DEFAULT_SETTINGS.face),
    tone: oneOf(
      TONES.map((t) => t.id),
      input.tone,
      DEFAULT_SETTINGS.tone,
    ) as ToneId,
    backdrop: oneOf(BACKDROPS, input.backdrop, DEFAULT_SETTINGS.backdrop),

    hour12: bool(input.hour12, DEFAULT_SETTINGS.hour12),
    showSeconds: bool(input.showSeconds, DEFAULT_SETTINGS.showSeconds),
    showDate: bool(input.showDate, DEFAULT_SETTINGS.showDate),
    showUsage: bool(input.showUsage, DEFAULT_SETTINGS.showUsage),

    keepAwake: bool(input.keepAwake, DEFAULT_SETTINGS.keepAwake),
    nightDim: bool(input.nightDim, DEFAULT_SETTINGS.nightDim),
    burnInGuard: bool(input.burnInGuard, DEFAULT_SETTINGS.burnInGuard),
    landscape: bool(input.landscape, DEFAULT_SETTINGS.landscape),

    usageEndpoint:
      typeof input.usageEndpoint === 'string'
        ? input.usageEndpoint.trim()
        : DEFAULT_SETTINGS.usageEndpoint,
  };
}

const NIGHT_STARTS_AT = 22;
const NIGHT_ENDS_AT = 7;

export function isNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_STARTS_AT || hour < NIGHT_ENDS_AT;
}
