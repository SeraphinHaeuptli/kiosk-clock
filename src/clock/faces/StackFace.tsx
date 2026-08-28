import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label } from '@/design/palette';
import { mono, numerals, tracking } from '@/design/tokens';

import type { FaceProps } from './types';

const SCALE = 1.9;

/** Hours over minutes at maximum size — readable across a room. */
export function StackFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, suffix } = timeParts(now, settings.hour12);
  const font = size * SCALE;

  const digit = {
    ...numerals,
    fontFamily: mono,
    fontSize: font,
    // Leading below 1.0 tightens the two rows into a single visual block.
    lineHeight: font * 0.95,
    letterSpacing: tracking(font),
    textAlign: 'center',
  } as const;

  return (
    <View style={styles.stack}>
      <Text style={[digit, { color: label.primary }]} allowFontScaling={false}>
        {hours}
      </Text>
      <Text style={[digit, { color: tone.color }]} allowFontScaling={false}>
        {minutes}
      </Text>

      {suffix && (
        <Text
          style={{
            fontFamily: mono,
            fontSize: font * 0.14,
            color: label.tertiary,
            letterSpacing: 3,
            marginTop: font * 0.08,
          }}
          allowFontScaling={false}
        >
          {suffix}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: 'center' },
});
