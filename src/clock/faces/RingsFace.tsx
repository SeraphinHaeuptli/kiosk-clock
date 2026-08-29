import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label, withAlpha } from '@/design/palette';
import { mono, numerals } from '@/design/tokens';

import type { FaceProps } from './types';

/**
 * Concentric dot dials: hours inside, minutes around them, seconds outside.
 *
 * Each ring fills clockwise from twelve, so the time is a shape before it is a
 * number — the outer ring sweeps once a minute, the middle once an hour, the
 * inner twice a day. The digits in the middle are there for when you want to
 * read rather than glance.
 *
 * The dots are placed by trigonometry rather than by rotating a wrapper per
 * dot, as the analog face does for its twelve ticks. At a hundred and thirty
 * dots, a full-size rotated view each would be a hundred and thirty
 * screen-sized layers to composite every second.
 */

const DIAL_SCALE = 3.0;

interface RingSpec {
  /** How many dots go all the way round. */
  count: number;
  /** Ring radius and dot diameter, as fractions of the dial. */
  radius: number;
  dot: number;
  color: string;
}

/**
 * `filled` is inclusive — the dot at the current value is lit, not the one
 * before it. Without that the minute ring is empty on the hour, which reads
 * as a broken clock rather than as a fresh one.
 */
function Ring({
  dial,
  spec,
  filled,
  unlit,
}: {
  dial: number;
  spec: RingSpec;
  filled: number;
  unlit: string;
}) {
  const centre = dial / 2;
  const radius = dial * spec.radius;
  const size = dial * spec.dot;

  return (
    <>
      {Array.from({ length: spec.count }, (_, index) => {
        const angle = (index / spec.count) * Math.PI * 2;

        return (
          <View
            key={index}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: centre + radius * Math.sin(angle) - size / 2,
              top: centre - radius * Math.cos(angle) - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: index <= filled ? spec.color : unlit,
            }}
          />
        );
      })}
    </>
  );
}

export function RingsFace({ now, settings, tone, size }: FaceProps) {
  const dial = size * DIAL_SCALE;
  const { hours, minutes, seconds } = timeParts(now, settings.hour12);

  const unlit = withAlpha(tone.color, 0.1);

  return (
    <View style={[styles.dial, { width: dial, height: dial }]}>
      {settings.showSeconds && (
        <Ring
          dial={dial}
          spec={{ count: 60, radius: 0.46, dot: 0.016, color: tone.dim }}
          filled={now.getSeconds()}
          unlit={unlit}
        />
      )}

      <Ring
        dial={dial}
        spec={{ count: 60, radius: 0.38, dot: 0.022, color: label.primary }}
        filled={now.getMinutes()}
        unlit={unlit}
      />

      <Ring
        dial={dial}
        spec={{ count: 12, radius: 0.29, dot: 0.034, color: tone.color }}
        // The twelve o'clock dot stands for the twelfth hour, not the zeroth,
        // so noon and midnight close the ring instead of emptying it.
        filled={(now.getHours() % 12 || 12) - 1}
        unlit={unlit}
      />

      <View style={styles.centre}>
        <Text
          allowFontScaling={false}
          style={{
            ...numerals,
            fontFamily: mono,
            fontSize: dial * 0.15,
            color: label.primary,
          }}
        >
          {hours}:{minutes}
        </Text>
        {settings.showSeconds && (
          <Text
            allowFontScaling={false}
            style={{
              ...numerals,
              fontFamily: mono,
              fontSize: dial * 0.06,
              color: label.tertiary,
              letterSpacing: 2,
            }}
          >
            {seconds}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', justifyContent: 'center' },
  centre: { alignItems: 'center' },
});
