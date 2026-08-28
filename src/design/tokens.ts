import { Platform, StyleSheet, type TextStyle } from 'react-native';

/**
 * One typeface throughout, bundled rather than borrowed.
 *
 * Everything here is laid out on a character grid — the clock glyphs, the
 * meter, the settings rows — which only holds if every glyph has the same
 * advance width. Asking the platform for "monospace" does not guarantee that:
 * Android OEM skins substitute system fonts, and where the alias resolves to a
 * proportional face the grid collapses and the character art smears into
 * illegibility. Shipping the font removes the variable entirely.
 *
 * Web gets a fallback stack because CSS accepts one; native needs a single
 * resolved family name.
 */
export const MONO_FAMILY = 'JetBrainsMono_400Regular';

export const mono = Platform.select({
  web: `${MONO_FAMILY}, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
  default: MONO_FAMILY,
}) as string;

/**
 * Advance width of one character as a fraction of font size. Menlo, DejaVu
 * Sans Mono and their kin all sit at 0.6, which is what lets a glyph grid be
 * sized from a target width.
 */
export const MONO_ASPECT = 0.6;

/** 4-point spacing grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const duration = {
  fast: 180,
  base: 300,
  slow: 700,
} as const;

export const hairline = StyleSheet.hairlineWidth;

export const numerals: TextStyle = {
  fontVariant: ['tabular-nums'],
  includeFontPadding: false,
};

export function tracking(size: number): number {
  return size >= 64 ? -size * 0.02 : 0;
}

export const type = {
  heading: { fontFamily: mono, fontSize: 13, letterSpacing: 3 },
  body: { fontFamily: mono, fontSize: 14, letterSpacing: 0.2 },
  small: { fontFamily: mono, fontSize: 12, letterSpacing: 0.2 },
  tiny: { fontFamily: mono, fontSize: 10, letterSpacing: 0.8 },
} satisfies Record<string, TextStyle>;
