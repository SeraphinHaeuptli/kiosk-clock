/**
 * A monochrome system. One ink colour on black, in the tradition of phosphor
 * terminals — the interface is drawn with characters and rules, not with hue,
 * so colour carries no meaning here and never has to be decoded.
 */

export type ToneId = 'white' | 'amber' | 'green' | 'claude' | 'custom';

export interface Tone {
  id: ToneId;
  name: string;
  /** Full-strength ink: numerals, active labels, meter fill. */
  color: string;
  /** Stepped back, for supporting text that shares the ink. */
  dim: string;
}

/**
 * Three phosphors — paper-white, IBM amber, P1 green — plus Anthropic's
 * official accent orange, #d97757, and one the user mixes themselves.
 *
 * The custom entry carries no colour of its own: it names a slot in the
 * picker, and `toneOf` builds the actual ink from a hue. Keeping it in this
 * list rather than beside it is what lets the settings decoder, the picker and
 * the backdrop override all keep working without knowing it is special.
 */
export const TONES: readonly Tone[] = [
  { id: 'white', name: 'white', color: '#E8E8E8', dim: 'rgba(232,232,232,0.45)' },
  { id: 'amber', name: 'amber', color: '#FFB000', dim: 'rgba(255,176,0,0.45)' },
  { id: 'green', name: 'green', color: '#33FF66', dim: 'rgba(51,255,102,0.45)' },
  { id: 'claude', name: 'claude', color: '#D97757', dim: 'rgba(217,119,87,0.45)' },
  { id: 'custom', name: 'custom', color: '#E8E8E8', dim: 'rgba(232,232,232,0.45)' },
];

/** Degrees. A cold cyan-blue, which none of the fixed four occupy. */
export const DEFAULT_HUE = 205;

/**
 * Saturation and lightness are fixed; only the hue is the user's.
 *
 * A free choice of all three would let someone pick 8% lightness and end up
 * with a clock they cannot read, then conclude the app is broken. These two
 * numbers sit where the existing phosphors sit — amber is 100/50, green
 * 100/60, claude 62/59 — so a custom tone is as legible as the built-in ones
 * whatever hue it lands on.
 */
const CUSTOM_SATURATION = 0.85;
const CUSTOM_LIGHTNESS = 0.62;

function hueToChannel(p: number, q: number, t: number): number {
  const shifted = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (shifted < 1 / 6) return p + (q - p) * 6 * shifted;
  if (shifted < 1 / 2) return q;
  if (shifted < 2 / 3) return p + (q - p) * (2 / 3 - shifted) * 6;
  return p;
}

/** HSL to 8-bit RGB. Hue in degrees, the rest in [0, 1]. */
function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 360;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ];
}

export function customTone(hue: number): Tone {
  const [r, g, b] = hslToRgb(hue, CUSTOM_SATURATION, CUSTOM_LIGHTNESS);

  return {
    id: 'custom',
    name: 'custom',
    color: `rgb(${r}, ${g}, ${b})`,
    dim: `rgba(${r}, ${g}, ${b}, 0.45)`,
  };
}

export function toneOf(id: ToneId, hue: number = DEFAULT_HUE): Tone {
  if (id === 'custom') return customTone(hue);
  return TONES.find((tone) => tone.id === id) ?? TONES[0];
}

/** Neutral text, independent of the chosen tone. */
export const label = {
  primary: '#E8E8E8',
  secondary: 'rgba(232,232,232,0.55)',
  tertiary: 'rgba(232,232,232,0.32)',
  quaternary: 'rgba(232,232,232,0.16)',
} as const;

export const surface = {
  base: '#000000',
  kiosk: '#000000',
  /** Hairline rules and inactive borders. */
  line: 'rgba(232,232,232,0.18)',
  faint: 'rgba(232,232,232,0.07)',
} as const;

/**
 * Re-express a colour at a given alpha.
 *
 * Takes `#RRGGBB` or the `rgb(r, g, b)` a custom tone is built as — every
 * caller passes `tone.color`, and since the custom tone that is no longer
 * always a hex string.
 */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgb')) {
    const [r = 0, g = 0, b = 0] = color
      .replace(/^rgba?\(|\)$/g, '')
      .split(',')
      .map((part) => Number(part.trim()));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const value = color.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
