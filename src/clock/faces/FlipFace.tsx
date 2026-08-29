import { StyleSheet, Text, View } from 'react-native';

import { timeParts } from '@/core/format';
import { label, surface } from '@/design/palette';
import { hairline, mono, numerals, space, tracking } from '@/design/tokens';

import type { FaceProps } from './types';

/**
 * A split-flap board.
 *
 * The whole effect is one detail: the seam. A flip clock is two half-cards
 * hinged in the middle, and the dark line where they meet is the only thing
 * that separates the look from a digit in a rounded box. Everything else here
 * — the lifted card, the soft radius, the slight inset at the top — exists to
 * make that line read as a hinge rather than as a scratch.
 *
 * There is no flip animation. At a glance across a room the movement would be
 * noise, and on an OLED left running for days it would be a second thing
 * burning in beside the digits.
 */

/** Card proportions, as multiples of the face size. */
const CARD_WIDTH = 0.78;
const CARD_HEIGHT = 1.16;
const CARD_GAP = 0.07;
const RADIUS = 0.09;

function Card({ digit, size, color }: { digit: string; size: number; color: string }) {
  return (
    <View
      style={{
        width: size * CARD_WIDTH,
        height: size * CARD_HEIGHT,
        borderRadius: size * RADIUS,
        backgroundColor: surface.faint,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text
        allowFontScaling={false}
        style={{
          ...numerals,
          fontFamily: mono,
          fontSize: size,
          lineHeight: size * CARD_HEIGHT,
          letterSpacing: tracking(size),
          color,
        }}
      >
        {digit}
      </Text>

      {/* The hinge. Drawn over the digit, which is what makes it a seam
          through the number rather than a rule behind it. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: (size * CARD_HEIGHT) / 2 - hairline,
          height: Math.max(1, size * 0.012),
          backgroundColor: surface.base,
        }}
      />
    </View>
  );
}

export function FlipFace({ now, settings, tone, size }: FaceProps) {
  const { hours, minutes, seconds, suffix } = timeParts(now, settings.hour12);
  const gap = size * CARD_GAP;

  // 12-hour mode drops the leading zero, which would otherwise leave a card
  // showing nothing for the first nine hours of the morning.
  const digits = `${hours}:${minutes}`;

  return (
    <View style={styles.row}>
      {[...digits].map((character, index) =>
        character === ':' ? (
          <View key={index} style={{ width: gap * 1.6, alignItems: 'center' }}>
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: mono,
                fontSize: size * 0.42,
                color: tone.dim,
              }}
            >
              :
            </Text>
          </View>
        ) : (
          <View key={index} style={{ marginHorizontal: gap / 2 }}>
            <Card digit={character} size={size} color={tone.color} />
          </View>
        ),
      )}

      {settings.showSeconds && (
        <Text
          allowFontScaling={false}
          style={{
            ...numerals,
            fontFamily: mono,
            fontSize: size * 0.28,
            color: label.secondary,
            marginLeft: gap,
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
            fontSize: size * 0.2,
            color: label.tertiary,
            marginLeft: gap,
            letterSpacing: 1,
          }}
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
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
});
