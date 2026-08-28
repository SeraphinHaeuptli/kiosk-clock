import { TONES, type ToneId } from '@/design/palette';

export type FaceId = 'ascii' | 'digital' | 'stack' | 'analog' | 'words';
export type BackdropId = 'void' | 'horizon' | 'stars' | 'dither' | 'wave';

/** How fast the wave field drifts. 'still' stops the animation entirely. */
export type WaveSpeed = 'still' | 'slow' | 'medium' | 'fast';
/** Noise frequency: fine is busy and tight, coarse is broad and slow-rolling. */
export type WaveScale = 'fine' | 'medium' | 'coarse';
/** 'match' follows the clock's own tone; anything else overrides it. */
export type BackdropTone = 'match' | ToneId;

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
}

export const DEFAULT_SETTINGS: ClockSettings = {
  face: 'ascii',
  tone: 'white',
  backdrop: 'wave',
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
};

const FACES: readonly FaceId[] = ['ascii', 'digital', 'stack', 'analog', 'words'];
const BACKDROPS: readonly BackdropId[] = [
  'void',
  'horizon',
  'stars',
  'dither',
  'wave',
];
const WAVE_SPEEDS: readonly WaveSpeed[] = ['still', 'slow', 'medium', 'fast'];
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
    face: oneOf(FACES, input.face, DEFAULT_SETTINGS.face),
    tone: oneOf(
      TONES.map((t) => t.id),
      input.tone,
      DEFAULT_SETTINGS.tone,
    ) as ToneId,
    backdrop: oneOf(BACKDROPS, input.backdrop, DEFAULT_SETTINGS.backdrop),
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
  };
}

const NIGHT_STARTS_AT = 22;
const NIGHT_ENDS_AT = 7;

export function isNight(date: Date): boolean {
  const hour = date.getHours();
  return hour >= NIGHT_STARTS_AT || hour < NIGHT_ENDS_AT;
}
