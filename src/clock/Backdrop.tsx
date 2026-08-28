import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { createNoiseField } from '@/core/perlin';
import { noise } from '@/core/random';
import { surface, withAlpha, type Tone } from '@/design/palette';
import { MONO_ASPECT, mono } from '@/design/tokens';

import type { BackdropId, WaveScale, WaveSpeed } from './settings';

interface Props {
  backdrop: BackdropId;
  /** Already resolved: either the clock's tone or the override. */
  tone: Tone;
  /** 0 at midnight, 1 at midday. The time-reactive backdrops read it. */
  light: number;
  waveSpeed: WaveSpeed;
  waveScale: WaveScale;
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

  const columns = Math.floor(width / (DITHER_FONT * MONO_ASPECT));
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

const WAVE_FONT = 12;
const WAVE_LINE = 15;
/** Blank through dense. The leading space is what lets the field breathe. */
const WAVE_RAMP = [' ', '.', ':', '-', '=', '+', '*', '#'];
/** Below this the field is blank, so the wave reads as crests, not a wash. */
const WAVE_FLOOR = 0.42;

/**
 * One frame interval for every speed. Speed changes how far the field
 * advances per frame rather than how often it redraws, so the cost of the
 * animation stays flat no matter how fast it looks.
 */
const WAVE_FRAME_MS = 90;

const WAVE_STEP: Record<WaveSpeed, number> = {
  still: 0,
  slow: 0.006,
  medium: 0.018,
  fast: 0.045,
};

/** Noise frequency per screen point. */
const WAVE_FREQUENCY: Record<WaveScale, number> = {
  fine: 0.022,
  medium: 0.011,
  coarse: 0.005,
};

const field = createNoiseField(7);

/** A drifting Perlin field rendered as characters. */
function Wave({
  tone,
  speed,
  scale,
}: {
  tone: Tone;
  speed: WaveSpeed;
  scale: WaveScale;
}) {
  const { width, height } = useWindowDimensions();
  const [frame, setFrame] = useState(0);

  const step = WAVE_STEP[speed];

  useEffect(() => {
    if (step === 0) return;
    const timer = setInterval(() => setFrame((n) => n + 1), WAVE_FRAME_MS);
    return () => clearInterval(timer);
  }, [step]);

  const columns = Math.floor(width / (WAVE_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / WAVE_LINE);
  const frequency = WAVE_FREQUENCY[scale];
  const drift = frame * step;

  const lines = useMemo(() => {
    const out: string[] = [];

    for (let row = 0; row < rows; row += 1) {
      // Sample in screen points rather than grid indices, so the field stays
      // isotropic despite characters being much taller than they are wide.
      const y = row * WAVE_LINE * frequency;
      let line = '';

      for (let column = 0; column < columns; column += 1) {
        const x = column * WAVE_FONT * MONO_ASPECT * frequency;
        const value = field(x + drift, y - drift * 0.6);
        const shaped = (value - WAVE_FLOOR) / (1 - WAVE_FLOOR);
        const index = Math.floor(Math.max(0, shaped) * WAVE_RAMP.length);
        line += WAVE_RAMP[Math.min(WAVE_RAMP.length - 1, index)];
      }

      out.push(line);
    }

    return out;
  }, [rows, columns, frequency, drift]);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.clip]}
      pointerEvents="none"
    >
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: mono,
          fontSize: WAVE_FONT,
          lineHeight: WAVE_LINE,
          color: tone.color,
          opacity: 0.17,
        }}
      >
        {lines.join('\n')}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Memoised on a quantised `light`, so the backdrop redraws a few times an hour
 * rather than once a second alongside the clock.
 */
export const Backdrop = memo(function Backdrop({
  backdrop,
  tone,
  light,
  waveSpeed,
  waveScale,
}: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]}>
      {backdrop === 'horizon' && <Horizon tone={tone} light={light} />}
      {backdrop === 'stars' && <Stars tone={tone} light={light} />}
      {backdrop === 'dither' && <Dither tone={tone} light={light} />}
      {backdrop === 'wave' && (
        <Wave tone={tone} speed={waveSpeed} scale={waveScale} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  base: { backgroundColor: surface.base, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
});
