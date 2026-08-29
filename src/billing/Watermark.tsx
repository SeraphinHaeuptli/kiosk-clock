import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { label, surface, withAlpha, type Tone } from '@/design/palette';
import { MONO_ASPECT, hairline, mono, space, type } from '@/design/tokens';

/**
 * The mark over unpaid content.
 *
 * It is meant to be unpleasant, and the unpleasantness is doing a specific
 * job: a locked face still runs, in full, on the real clock, so the only
 * thing separating a trial from the product is how much you can stand looking
 * at it. That is a fairer deal than a disabled button — you get to decide
 * whether the thing is worth paying for by using it — but it only works if
 * living with the mark is genuinely worse than paying.
 *
 * Three things make it hard to ignore: it crosses the whole screen rather
 * than sitting in a corner, it breathes on a slow cycle so peripheral vision
 * keeps catching it, and it sits above the night dimming instead of fading
 * with everything else. It stays out of the way in exactly one respect: it
 * never eats a touch except on its own banner.
 */

const LINE = 'UNLICENSED · FOUNDER PACK · ';
const TILT = '-28deg';
const FONT_SIZE = 15;
const ROW_GAP = 46;

/** The pulse. Slow enough to read as breathing, not as a flash. */
const PULSE_MS = 1_600;
const MIN_OPACITY = 0.16;
const MAX_OPACITY = 0.42;

export function Watermark({
  tone,
  onPress,
}: {
  tone: Tone;
  onPress: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Rotating a layer leaves triangles of bare screen at the corners unless the
  // layer is bigger than the box it turns inside. The diagonal is the worst
  // case, and a little over it covers every rotation.
  const span = useMemo(
    () => Math.ceil(Math.hypot(width, height) * 1.15),
    [width, height],
  );

  const rows = Math.ceil(span / ROW_GAP);
  const repeats = Math.ceil(span / (LINE.length * FONT_SIZE * MONO_ASPECT)) + 1;
  const band = LINE.repeat(repeats);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [MIN_OPACITY, MAX_OPACITY],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.field,
          {
            width: span,
            height: span,
            // Pulled back by half its own size, so the oversized layer is
            // centred on the screen and turns about the middle.
            marginLeft: -span / 2,
            marginTop: -span / 2,
            opacity,
          },
        ]}
      >
        {Array.from({ length: rows }, (_, row) => (
          <Text
            key={row}
            numberOfLines={1}
            allowFontScaling={false}
            style={[styles.band, { color: tone.color }]}
          >
            {/* Offset every other row so the columns never line up into a
                readable grid, which the eye would learn to filter out. */}
            {row % 2 === 0 ? band : `····${band}`}
          </Text>
        ))}
      </Animated.View>

      <View style={styles.bannerRow} pointerEvents="box-none">
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Unlock the founder pack"
          style={({ pressed }) => [
            styles.banner,
            { borderColor: withAlpha(tone.color, 0.5) },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.bannerText, { color: tone.color }]}>
            [ founder pack — tap to unlock ]
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The same mark at thumbnail scale, for locked previews in the pickers.
 *
 * Still, and much fainter: a settings screen full of pulsing cards would be
 * unusable, and the card only has to say "this one is locked" — the kiosk
 * says the rest.
 */
export function WatermarkTag({ tone }: { tone: Tone }) {
  return (
    <View style={styles.tag} pointerEvents="none">
      <Text
        allowFontScaling={false}
        style={[styles.tagText, { color: withAlpha(tone.color, 0.75) }]}
      >
        founder
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    position: 'absolute',
    // Anchored at the centre of the screen; the negative margins above pull
    // it back by half its size, so the overhang after rotating is even on all
    // four sides rather than hanging off two of them.
    left: '50%',
    top: '50%',
    justifyContent: 'space-evenly',
    transform: [{ rotate: TILT }],
  },
  band: {
    fontFamily: mono,
    fontSize: FONT_SIZE,
    letterSpacing: 1,
  },
  bannerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: space.xxl + space.lg,
  },
  banner: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: hairline,
    backgroundColor: surface.base,
  },
  bannerText: { ...type.small },
  pressed: { opacity: 0.55 },
  tag: {
    position: 'absolute',
    right: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs,
    backgroundColor: surface.base,
  },
  tagText: { ...type.tiny, color: label.tertiary },
});
