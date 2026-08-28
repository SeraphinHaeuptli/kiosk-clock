import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label } from '@/design/palette';
import { mono, space } from '@/design/tokens';

import { GLYPH_HEIGHT, glyphRows, rowRuns } from './glyphs';
import type { FaceProps } from './types';

/** Widest the block ever gets: "HH:MM", five cells per digit plus the colon. */
const MAX_COLUMNS = 25;
/** How many multiples of the base size that widest block should span. */
const BLOCK_WIDTH_RATIO = 3.15;
/** Cells are slightly taller than wide, as display fonts tend to be. */
const CELL_ASPECT = 1.25;

/**
 * The time drawn on a character grid.
 *
 * The glyphs are authored as strings of '#' and ' ', but each inked run is
 * painted as a rectangle rather than set as block characters: the metrics of
 * U+2588 vary by font and platform, and where the glyph is shorter than its
 * line box the strokes break into disconnected chips. Drawing the cells makes
 * the result identical everywhere.
 *
 * Cell size is fixed against the widest time the face can produce rather than
 * the current one, so the block never resizes as digits come and go — a clock
 * that changed scale between 09:59 and 10:00 would be unusable.
 */
export function AsciiFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, seconds, suffix } = timeParts(now, settings.hour12);
  const rows = glyphRows(`${hours}:${minutes}`);

  const cell = (size * BLOCK_WIDTH_RATIO) / MAX_COLUMNS;
  const cellHeight = cell * CELL_ASPECT;
  const columns = rows[0].length;

  const footnote = [settings.showSeconds ? `:${seconds}` : null, suffix]
    .filter(Boolean)
    .join('   ');

  return (
    <View style={styles.block}>
      <View
        style={{ width: columns * cell, height: GLYPH_HEIGHT * cellHeight }}
      >
        {rows.flatMap((row, rowIndex) =>
          rowRuns(row).map((run) => (
            <View
              key={`${rowIndex}-${run.start}`}
              style={{
                position: 'absolute',
                left: run.start * cell,
                top: rowIndex * cellHeight,
                width: run.length * cell,
                height: cellHeight,
                backgroundColor: tone.color,
              }}
            />
          )),
        )}
      </View>

      {footnote.length > 0 && (
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: mono,
            fontSize: cell * 1.6,
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
