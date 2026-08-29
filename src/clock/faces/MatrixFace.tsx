import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label, withAlpha } from '@/design/palette';
import { mono, numerals, space } from '@/design/tokens';

import { glyphRows } from './glyphs';
import type { FaceProps } from './types';

/**
 * An LED dot matrix.
 *
 * The same 5x7 table the ASCII face draws from, rendered as discrete lamps
 * instead of characters. The dark dots are the point: a real matrix panel
 * shows its unlit lamps, and drawing only the lit ones gives a constellation
 * rather than a display. They sit at a low alpha of the tone rather than a
 * fixed grey, so the panel reads as one object in whichever colour is set.
 */

/** Lamp diameter and pitch, as multiples of the face size. */
const DOT = 0.115;
const PITCH = 0.155;

/** How much of the tone an unlit lamp keeps. */
const UNLIT_ALPHA = 0.08;

export function MatrixFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, seconds, suffix } = timeParts(now, settings.hour12);

  const rows = glyphRows(`${hours}:${minutes}`);
  const dot = size * DOT;
  const pitch = size * PITCH;
  const unlit = withAlpha(tone.color, UNLIT_ALPHA);

  return (
    <View style={styles.block}>
      <View>
        {rows.map((cells, row) => (
          <View key={row} style={{ flexDirection: 'row', height: pitch }}>
            {[...cells].map((cell, column) => (
              <View
                key={column}
                style={{
                  width: pitch,
                  height: pitch,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: dot,
                    height: dot,
                    borderRadius: dot / 2,
                    backgroundColor: cell === '#' ? tone.color : unlit,
                  }}
                />
              </View>
            ))}
          </View>
        ))}
      </View>

      {(settings.showSeconds || suffix) && (
        <View style={styles.footer}>
          {settings.showSeconds && (
            <Text
              allowFontScaling={false}
              style={{
                ...numerals,
                fontFamily: mono,
                fontSize: size * 0.3,
                color: label.secondary,
              }}
            >
              {seconds}
            </Text>
          )}
          {suffix && (
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: mono,
                fontSize: size * 0.22,
                color: label.tertiary,
                letterSpacing: 1,
              }}
            >
              {suffix}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', paddingHorizontal: space.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginTop: space.sm,
  },
});
