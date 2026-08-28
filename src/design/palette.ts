/**
 * A monochrome system. One ink colour on black, in the tradition of phosphor
 * terminals — the interface is drawn with characters and rules, not with hue,
 * so colour carries no meaning here and never has to be decoded.
 */

export type ToneId = 'white' | 'amber' | 'green';

export interface Tone {
  id: ToneId;
  name: string;
  /** Full-strength ink: numerals, active labels, meter fill. */
  color: string;
  /** Stepped back, for supporting text that shares the ink. */
  dim: string;
}

/** The three phosphors: paper-white, IBM amber, and P1 green. */
export const TONES: readonly Tone[] = [
  { id: 'white', name: 'white', color: '#E8E8E8', dim: 'rgba(232,232,232,0.45)' },
  { id: 'amber', name: 'amber', color: '#FFB000', dim: 'rgba(255,176,0,0.45)' },
  { id: 'green', name: 'green', color: '#33FF66', dim: 'rgba(51,255,102,0.45)' },
];

export function toneOf(id: ToneId): Tone {
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

/** Re-express a `#RRGGBB` colour at a given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
