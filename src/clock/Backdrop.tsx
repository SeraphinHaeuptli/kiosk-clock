import { memo, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { noise } from '@/core/random';
import { surface, withAlpha, type Tone } from '@/design/palette';
import { MONO_ASPECT, mono } from '@/design/tokens';

import type { BackdropId } from './settings';

interface Props {
  backdrop: BackdropId;
  tone: Tone;
  /** 0 at midnight, 1 at midday. Every backdrop but `void` reads it. */
  light: number;
}

/* -------------------------------------------------------------------------- */

/** A wash that brightens with the sun and drains to black overnight. */
function Horizon({ tone, light }: { tone: Tone; light: number }) {
  const peak = 0.02 + light * 0.1;

  return (
    <LinearGradient
      colors={[
        withAlpha(tone.color, peak),
        withAlpha(tone.color, peak * 0.45),
        'rgba(0,0,0,0)',
      ]}
      locations={[0, 0.6, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

const STAR_COUNT = 130;
const STAR_CHARS = ['·', '·', '·', '*', '+', '˙'];

/** A field that comes out after dark and is gone by noon. */
function Stars({ tone, light }: { tone: Tone; light: number }) {
  const { width, height } = useWindowDimensions();

  // Seeded from the index, so the sky is identical on every render and only
  // reflows when the screen itself changes size.
  const stars = useMemo(
    () =>
      Array.from({ length: STAR_COUNT }, (_, index) => ({
        left: noise(index * 3 + 1) * width,
        top: noise(index * 7 + 2) * height,
        character: STAR_CHARS[Math.floor(noise(index * 11 + 3) * STAR_CHARS.length)],
        fontSize: 7 + noise(index * 13 + 5) * 9,
        alpha: 0.2 + noise(index * 17 + 7) * 0.8,
      })),
    [width, height],
  );

  const darkness = 1 - light;
  if (darkness <= 0.02) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star, index) => (
        <Text
          key={index}
          allowFontScaling={false}
          style={{
            position: 'absolute',
            left: star.left,
            top: star.top,
            fontFamily: mono,
            fontSize: star.fontSize,
            color: tone.color,
            opacity: star.alpha * darkness * 0.7,
          }}
        >
          {star.character}
        </Text>
      ))}
    </View>
  );
}

const DITHER_FONT = 13;
const DITHER_LINE = 17;
/** Keeps a sparse dusting visible at midnight rather than an empty screen. */
const DITHER_FLOOR = 0.06;
/** How much of the field the sun can fill. Below 1, so noon still breathes. */
const DITHER_GAIN = 0.5;

/**
 * Deliberately tops out at '*'. With '#' in the ramp the midday field turned
 * into a wall of ink that the clock and the meter had to fight through.
 */
function shadeFor(value: number): string {
  if (value > 0.42) return '*';
  if (value > 0.22) return ':';
  if (value > 0) return '.';
  return ' ';
}

/** A character field whose density rises and falls with the day. */
function Dither({ tone, light }: { tone: Tone; light: number }) {
  const { width, height } = useWindowDimensions();

  const columns = Math.ceil(width / (DITHER_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / DITHER_LINE);

  // One stable noise value per cell; the threshold moves, the noise does not.
  const grid = useMemo(
    () =>
      Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) =>
          noise(row * 1361 + column * 17 + 1),
        ),
      ),
    [rows, columns],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {grid.map((cells, row) => (
        <Text
          key={row}
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            fontFamily: mono,
            fontSize: DITHER_FONT,
            lineHeight: DITHER_LINE,
            color: tone.color,
            opacity: 0.09,
          }}
        >
          {cells
            .map((cell) => shadeFor(DITHER_FLOOR + light * DITHER_GAIN - cell))
            .join('')}
        </Text>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Memoised on a quantised `light`, so the backdrop redraws a few times an hour
 * rather than once a second alongside the clock.
 */
export const Backdrop = memo(function Backdrop({ backdrop, tone, light }: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]}>
      {backdrop === 'horizon' && <Horizon tone={tone} light={light} />}
      {backdrop === 'stars' && <Stars tone={tone} light={light} />}
      {backdrop === 'dither' && <Dither tone={tone} light={light} />}
    </View>
  );
});

const styles = StyleSheet.create({
  base: { backgroundColor: surface.base, overflow: 'hidden' },
});
