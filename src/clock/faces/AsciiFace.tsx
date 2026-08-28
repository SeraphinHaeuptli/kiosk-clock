import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label } from '@/design/palette';
import { MONO_ASPECT, mono, space } from '@/design/tokens';

import { artColumns, artRows } from './glyphs';
import type { FaceProps } from './types';

/**
 * Fine columns in the widest time the face can produce. Sizing against this
 * rather than the current time keeps the block from rescaling as digits come
 * and go — a clock that changed size between 09:59 and 10:00 would be unusable.
 */
const MAX_COLUMNS = artColumns('00:00');
/**
 * How many multiples of the base size the widest block should span. Kept a
 * little under what would fill the screen: the layout assumes a 0.6 advance
 * width, and if the real font is a hair wider the Text wraps and the glyphs
 * are destroyed rather than merely clipped.
 */
const BLOCK_WIDTH_RATIO = 2.95;
/**
 * Row pitch as a fraction of font size. Below 1 so consecutive rows of ink
 * overlap slightly: at full pitch the vertical strokes break into dashes,
 * because a glyph's ink is narrower than its line box is tall.
 */
const LINE_RATIO = 0.85;

/**
 * The time as character art: roughly two thousand small glyphs arranged into
 * the shape of the digits.
 *
 * Unlike the coarse grid, these are ordinary ASCII characters set as text, so
 * there is no exotic glyph to fall back on and the gaps between characters are
 * the point rather than a defect.
 */
export function AsciiFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, seconds, suffix } = timeParts(now, settings.hour12);

  // Keyed on the rendered time, not the Date: with seconds shown the component
  // re-renders every second, but the art only changes once a minute.
  const clock = `${hours}:${minutes}`;
  const lines = useMemo(() => artRows(clock), [clock]);

  const fontSize = (size * BLOCK_WIDTH_RATIO) / (MAX_COLUMNS * MONO_ASPECT);

  const footnote = [settings.showSeconds ? `:${seconds}` : null, suffix]
    .filter(Boolean)
    .join('   ');

  return (
    <View style={styles.block}>
      {/*
        One Text holding newline-separated rows, not one Text per row. Each
        element carries its own line box whose height is driven by the font's
        ascent and descent, which at this size is taller than the line height
        being asked for — the rows drift apart and the block outgrows any
        height computed for it. A single block lets lineHeight set the pitch
        exactly, and lets the container size itself.
      */}
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: mono,
          fontSize,
          lineHeight: fontSize * LINE_RATIO,
          color: tone.color,
        }}
      >
        {lines.join('\n')}
      </Text>

      {footnote.length > 0 && (
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: mono,
            fontSize: fontSize * 4,
            letterSpacing: 2,
            color: label.tertiary,
            marginTop: space.lg,
          }}
        >
          {footnote}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center' },
});
