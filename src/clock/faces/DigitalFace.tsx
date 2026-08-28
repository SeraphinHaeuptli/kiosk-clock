import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label } from '@/design/palette';
import { mono, numerals, space, tracking } from '@/design/tokens';

import type { FaceProps } from './types';

/** Single-line time: HH:MM, with the tone carried by the digits. */
export function DigitalFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, seconds, suffix } = timeParts(now, settings.hour12);

  const digit = {
    ...numerals,
    fontFamily: mono,
    fontSize: size,
    lineHeight: size * 1.1,
    letterSpacing: tracking(size),
    color: tone.color,
  } as const;

  return (
    <View style={styles.row}>
      <Text style={digit} allowFontScaling={false}>
        {hours}
      </Text>
      <Text style={[digit, { color: tone.dim }]} allowFontScaling={false}>
        :
      </Text>
      <Text style={digit} allowFontScaling={false}>
        {minutes}
      </Text>

      {settings.showSeconds && (
        <Text
          style={{
            ...numerals,
            fontFamily: mono,
            fontSize: size * 0.3,
            color: label.secondary,
            marginLeft: size * 0.1,
          }}
          allowFontScaling={false}
        >
          {seconds}
        </Text>
      )}

      {suffix && (
        <Text
          style={{
            fontFamily: mono,
            fontSize: size * 0.2,
            color: label.tertiary,
            marginLeft: size * 0.1,
            letterSpacing: 1,
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
  row: {
    flexDirection: 'row',
    // Baseline keeps the seconds and AM/PM on the numerals' feet rather than
    // floating at their vertical centre.
    alignItems: 'baseline',
    paddingHorizontal: space.xs,
  },
});
