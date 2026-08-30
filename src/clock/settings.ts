import { DEFAULT_HUE, TONES, type ToneId } from '@/design/palette';
import type { TemperatureUnit } from '@/weather/weather';

export type FaceId =
  | 'ascii'
  | 'digital'
  | 'stack'
  | 'analog'
  | 'words'
  | 'flip'
  | 'matrix'
  | 'rings';

export type BackdropId =
  | 'void'
  | 'horizon'
  | 'stars'
  | 'dither'
  | 'wave'
  | 'grid'
  | 'scan'
  | 'rain';

/** How fast the wave field drifts. 'still' stops the animation entirely. */
export type WaveSpeed = 'still' | 'slow' | 'medium' | 'fast';
/** Noise frequency: fine is busy and tight, coarse is broad and slow-rolling. */
export type WaveScale = 'fine' | 'medium' | 'coarse';
/** 'match' follows the clock's own tone; anything else overrides it. */
export type BackdropTone = 'match' | ToneId;

/** What the shuffle is allowed to change, if anything. */
export type ShuffleMode = 'off' | 'backdrops' | 'everything';
/** How long a shuffled look holds before the next one. */
export type ShufflePeriod = 'quarter' | 'hour' | 'day';

export interface ClockSettings {
  face: FaceId;
  tone: ToneId;
  backdrop: BackdropId;
  backdropTone: BackdropTone;
  waveSpeed: WaveSpeed;
  waveScale: WaveScale;

  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showMedia: boolean;

  /** Hold the screen on while the kiosk is in the foreground. */
  keepAwake: boolean;
  /** Fade the face down overnight instead of glaring in a dark room. */
  nightDim: boolean;
  /** Drift the face a few pixels to spare OLED panels on long runs. */
  burnInGuard: boolean;
  landscape: boolean;

  /** Optional HTTP source for now-playing metadata. Empty means no source. */
  nowPlayingEndpoint: string;

  /** Weather in the top corners. Silent until a place is set. */
  /**
   * Rotate the look on a timer.
   *
   * This never writes back to `face` or `backdrop`: the shown look is derived
   * from these two fields and the clock, so turning shuffle off returns you to
   * exactly what you picked rather than to wherever the rotation stopped.
   */
  shuffle: ShuffleMode;
  shufflePeriod: ShufflePeriod;

  /** Hue in degrees for the 'custom' tone. Ignored by the other four. */
  customHue: number;

  showWeather: boolean;
  /** Free text, geocoded once: "zurich", "10 Downing Street", "Kyoto". */
  weatherPlace: string;
  weatherUnit: TemperatureUnit;
}

export const DEFAULT_SETTINGS: ClockSettings = {
  // A plain clock on plain black. Everything with a look to it is behind the
  // founder pack, so the default has to be the one combination that is not.
  face: 'digital',
  tone: 'white',
  backdrop: 'void',
  backdropTone: 'match',
  waveSpeed: 'slow',
  waveScale: 'medium',

  hour12: false,
  showSeconds: false,
  showDate: true,
  showMedia: true,

  keepAwake: true,
  nightDim: true,
  burnInGuard: true,
  landscape: false,

  nowPlayingEndpoint: '',

  shuffle: 'off',
  shufflePeriod: 'hour',
  customHue: DEFAULT_HUE,

  showWeather: true,
  weatherPlace: '',
  weatherUnit: 'celsius',
};

/** Exported so the shuffle can pick from them without importing components. */
export const FACE_IDS: readonly FaceId[] = [
  'ascii',
  'digital',
  'stack',
  'analog',
  'words',
  'flip',
  'matrix',
  'rings',
];
export const BACKDROP_IDS: readonly BackdropId[] = [
  'void',
  'horizon',
  'stars',
  'dither',
  'wave',
  'grid',
  'scan',
  'rain',
];
const WAVE_SPEEDS: readonly WaveSpeed[] = ['still', 'slow', 'medium', 'fast'];
const TEMPERATURE_UNITS: readonly TemperatureUnit[] = ['celsius', 'fahrenheit'];
const SHUFFLE_MODES: readonly ShuffleMode[] = ['off', 'backdrops', 'everything'];
const SHUFFLE_PERIODS: readonly ShufflePeriod[] = ['quarter', 'hour', 'day'];

/** Wraps rather than clamps: a hue is a circle, and 400 degrees is 40. */
function hue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return ((Math.round(value) % 360) + 360) % 360;
}
const WAVE_SCALES: readonly WaveScale[] = ['fine', 'medium', 'coarse'];

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
    face: oneOf(FACE_IDS, input.face, DEFAULT_SETTINGS.face),
    tone: oneOf(
      TONES.map((t) => t.id),
      input.tone,
      DEFAULT_SETTINGS.tone,
    ) as ToneId,
    backdrop: oneOf(BACKDROP_IDS, input.backdrop, DEFAULT_SETTINGS.backdrop),
    backdropTone: oneOf(
      ['match', ...TONES.map((t) => t.id)] as const,
      input.backdropTone,
      DEFAULT_SETTINGS.backdropTone,
    ) as BackdropTone,
    waveSpeed: oneOf(WAVE_SPEEDS, input.waveSpeed, DEFAULT_SETTINGS.waveSpeed),
    waveScale: oneOf(WAVE_SCALES, input.waveScale, DEFAULT_SETTINGS.waveScale),

    hour12: bool(input.hour12, DEFAULT_SETTINGS.hour12),
    showSeconds: bool(input.showSeconds, DEFAULT_SETTINGS.showSeconds),
    showDate: bool(input.showDate, DEFAULT_SETTINGS.showDate),
    showMedia: bool(input.showMedia, DEFAULT_SETTINGS.showMedia),

    keepAwake: bool(input.keepAwake, DEFAULT_SETTINGS.keepAwake),
    nightDim: bool(input.nightDim, DEFAULT_SETTINGS.nightDim),
    burnInGuard: bool(input.burnInGuard, DEFAULT_SETTINGS.burnInGuard),
    landscape: bool(input.landscape, DEFAULT_SETTINGS.landscape),

    nowPlayingEndpoint:
      typeof input.nowPlayingEndpoint === 'string'
        ? input.nowPlayingEndpoint.trim()
        : DEFAULT_SETTINGS.nowPlayingEndpoint,

    shuffle: oneOf(SHUFFLE_MODES, input.shuffle, DEFAULT_SETTINGS.shuffle),
    shufflePeriod: oneOf(
      SHUFFLE_PERIODS,
      input.shufflePeriod,
      DEFAULT_SETTINGS.shufflePeriod,
    ),
    customHue: hue(input.customHue, DEFAULT_SETTINGS.customHue),

    showWeather: bool(input.showWeather, DEFAULT_SETTINGS.showWeather),
    weatherPlace:
      typeof input.weatherPlace === 'string'
        ? input.weatherPlace.trim()
        : DEFAULT_SETTINGS.weatherPlace,
    weatherUnit: oneOf(
      TEMPERATURE_UNITS,
      input.weatherUnit,
      DEFAULT_SETTINGS.weatherUnit,
    ),
  };
}

const NIGHT_STARTS_AT = 22;
const NIGHT_ENDS_AT = 7;

export function isNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_STARTS_AT || hour < NIGHT_ENDS_AT;
}
