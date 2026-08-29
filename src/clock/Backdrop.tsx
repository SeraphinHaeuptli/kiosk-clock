import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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

/**
 * Time reactivity, with a floor.
 *
 * The backdrops drove straight off `light`, which gave each one an hour where
 * it drew nothing at all: the star field was empty at midday, the horizon wash
 * reached two parts in 255 at midnight. Picking a backdrop and getting a black
 * screen reads as a broken app rather than a subtle one, so the day still
 * moves them — between `floor` and full, instead of between nothing and full.
 */
function withFloor(value: number, floor: number): number {
  return floor + (1 - floor) * value;
}

/** How much of the wash survives midnight. */
const HORIZON_FLOOR = 0.35;

/** A wash that brightens with the sun without draining to black overnight. */
function Horizon({ tone, light }: { tone: Tone; light: number }) {
  // A gradient has no local contrast to help it, so it needs more ink than a
  // character field does to read as anything at all.
  const peak = 0.15 + withFloor(light, HORIZON_FLOOR) * 0.17;

  return (
    <LinearGradient
      colors={[
        withAlpha(tone.color, peak),
        withAlpha(tone.color, peak * 0.5),
        'rgba(0,0,0,0)',
      ]}
      // Reaches transparent just short of the bottom rather than exactly at it,
      // so the wash is a band with an end and not an even veil over everything.
      locations={[0, 0.5, 0.95]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

const STAR_COUNT = 200;
const STAR_CHARS = ['·', '·', '·', '*', '+', '˙'];
/** How much of the field survives midday. */
const STAR_FLOOR = 0.3;

/** A field that comes out after dark and thins, without emptying, by noon. */
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

  // Floored rather than `1 - light`, which put the field at exactly zero every
  // midday. Full darkness still gives full brightness, so nights are unchanged.
  const darkness = withFloor(1 - light, STAR_FLOOR);

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
const DITHER_FLOOR = 0.2;
/** How much of the field the sun can fill. Below 1, so noon still breathes. */
const DITHER_GAIN = 0.4;

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
            // Under a tenth the field was drawn at 21/255 at its brightest,
            // which is below what a phone screen shows in a lit room.
            opacity: 0.24,
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
const WAVE_FLOOR = 0.46;

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
          opacity: 0.30,
        }}
      >
        {lines.join('\n')}
      </Text>
    </View>
  );
}


/* -------------------------------------------------------------------------- */

/**
 * Where the horizon sits, as a fraction of screen height. Below the centre,
 * so the vanishing point falls under the clock rather than through it.
 */
const GRID_HORIZON = 0.6;
/** Lines each way. More than this and the far end packs into a solid band. */
const GRID_DEPTH = 13;
const GRID_COLUMNS = 15;
/** How hard the rows bunch toward the horizon. 1 would be no perspective. */
const GRID_FALLOFF = 2.4;
const GRID_FLOOR = 0.4;

/**
 * A ground plane running to a vanishing point.
 *
 * Rows are spaced on a power curve so they crowd toward the horizon, and the
 * columns are placed by where they cross the bottom edge rather than by even
 * angles — that is what makes the fan converge like a plane seen edge-on
 * instead of like a paper fan.
 *
 * Each column is a line inside a box twice its length, centred on the
 * vanishing point, so rotating the box turns the line about the point where
 * they all meet. React Native has no transform-origin, and this is the same
 * trick the analog face uses to pivot its hands.
 */
function Grid({ tone, light }: { tone: Tone; light: number }) {
  const { width, height } = useWindowDimensions();

  const horizon = height * GRID_HORIZON;
  const depth = height - horizon;
  const centre = width / 2;
  // Long enough to leave the screen at the widest angle it is drawn at.
  const reach = Math.hypot(width, depth) * 1.2;

  const strength = withFloor(light, GRID_FLOOR);
  // Measured against the other backdrops rather than guessed: at twice this
  // the grid peaked around 137 of 255 where the wave and dither fields sit at
  // 55 to 70, and it stopped being a backdrop and started being the subject.
  const ink = withAlpha(tone.color, 0.055 + strength * 0.1);
  const glow = withAlpha(tone.color, 0.04 + strength * 0.08);

  const rows = useMemo(
    () =>
      Array.from(
        { length: GRID_DEPTH },
        (_, index) =>
          horizon + depth * Math.pow((index + 1) / GRID_DEPTH, GRID_FALLOFF),
      ),
    [horizon, depth],
  );

  const angles = useMemo(
    () =>
      Array.from({ length: GRID_COLUMNS }, (_, index) => {
        // Spread the columns across three screen widths at the bottom edge, so
        // the outermost pair leaves the frame rather than stopping inside it.
        const spread = (index / (GRID_COLUMNS - 1) - 0.5) * width * 3;
        return (Math.atan2(spread, depth) * 180) / Math.PI;
      }),
    [width, depth],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {/* A haze at the horizon, where a real plane meets the sky. */}
      <LinearGradient
        colors={[glow, 'rgba(0,0,0,0)']}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: horizon - depth * 0.28,
          height: depth * 0.28,
        }}
      />

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: horizon,
          height: 1,
          // The one line allowed to be brighter than the rest: it is the
          // edge the whole construction reads from.
          backgroundColor: withAlpha(tone.color, 0.1 + strength * 0.14),
        }}
      />

      {rows.map((top, index) => (
        <View
          key={`row-${index}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            height: 1,
            backgroundColor: ink,
          }}
        />
      ))}

      {angles.map((angle, index) => (
        <View
          key={`column-${index}`}
          style={{
            position: 'absolute',
            left: centre - 1,
            top: horizon - reach,
            width: 2,
            height: reach * 2,
            transform: [{ rotate: `${angle}deg` }],
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: reach,
              width: 1,
              height: reach,
              backgroundColor: ink,
            }}
          />
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Distance between scanlines, in points. Opened up from six alongside the
 * brightness below: the lines had to get stronger to be visible at all, and
 * at the old pitch that turned an even texture into a veil.
 */
const SCAN_PITCH = 8;
/** How far down the screen the bright band travels, and how long it takes. */
const SCAN_SWEEP_MS = 7_000;
const SCAN_BAND = 220;
const SCAN_FLOOR = 0.45;

/**
 * A CRT.
 *
 * Two effects at once: the fixed line structure of a shadow mask, and the slow
 * bright roll of a tube that is very slightly out of sync. The roll is the
 * part that makes it read as a screen rather than as a hatch pattern, and it
 * runs on the native driver so it costs nothing per frame on the JS thread.
 */
function Scan({ tone, light }: { tone: Tone; light: number }) {
  const { height } = useWindowDimensions();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: SCAN_SWEEP_MS,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const strength = withFloor(light, SCAN_FLOOR);
  const lines = Math.ceil(height / SCAN_PITCH);
  // At half this the whole effect peaked at 30 of 255 — under what a phone
  // shows in a lit room, which is the same failure the dither field had.
  const ink = withAlpha(tone.color, 0.09 + strength * 0.15);

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCAN_BAND, height],
  });

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {Array.from({ length: lines }, (_, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: index * SCAN_PITCH,
            height: 1,
            backgroundColor: ink,
          }}
        />
      ))}

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: SCAN_BAND,
          transform: [{ translateY }],
        }}
      >
        <LinearGradient
          colors={[
            'rgba(0,0,0,0)',
            withAlpha(tone.color, 0.06 + strength * 0.1),
            'rgba(0,0,0,0)',
          ]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const RAIN_FONT = 13;
const RAIN_LINE = 16;
/** Characters in one falling tail. */
const RAIN_TRAIL = 14;
/** Glyphs that read as data rather than as language. */
const RAIN_CHARS = '01<>[]{}/\\|=+*#$%&?!';

const RAIN_STEP: Record<WaveSpeed, number> = {
  still: 0,
  slow: 0.05,
  medium: 0.14,
  fast: 0.3,
};

/**
 * Falling columns, drawn in three passes rather than per character.
 *
 * A tail is bright at the head and fades behind it, which would normally mean
 * one text node per character — several thousand of them. Instead each column
 * is sorted into three depth bands and the whole screen is drawn three times,
 * once per band, at three opacities. Three text nodes for the fade, and the
 * eye reads the steps as a gradient at this size.
 */
function Rain({ tone, speed }: { tone: Tone; speed: WaveSpeed }) {
  const { width, height } = useWindowDimensions();
  const [frame, setFrame] = useState(0);

  const step = RAIN_STEP[speed];

  useEffect(() => {
    if (step === 0) return;
    const timer = setInterval(() => setFrame((n) => n + 1), WAVE_FRAME_MS);
    return () => clearInterval(timer);
  }, [step]);

  const columns = Math.floor(width / (RAIN_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / RAIN_LINE);

  // Per column: how fast it falls and where it started. Seeded, so a column
  // keeps its character across renders instead of reshuffling every frame.
  const streams = useMemo(
    () =>
      Array.from({ length: columns }, (_, column) => ({
        rate: 0.45 + noise(column * 31 + 3) * 1.1,
        offset: noise(column * 57 + 11) * (rows + RAIN_TRAIL),
      })),
    [columns, rows],
  );

  const layers = useMemo(() => {
    const head: string[] = [];
    const near: string[] = [];
    const far: string[] = [];
    const span = rows + RAIN_TRAIL;
    const drift = frame * step;

    for (let row = 0; row < rows; row += 1) {
      let headLine = '';
      let nearLine = '';
      let farLine = '';

      for (let column = 0; column < columns; column += 1) {
        const stream = streams[column];
        const position = (stream.offset + drift * stream.rate) % span;
        const behind = position - row;

        if (behind < 0 || behind >= RAIN_TRAIL) {
          headLine += ' ';
          nearLine += ' ';
          farLine += ' ';
          continue;
        }

        const index = Math.floor(
          noise(row * 733 + column * 29 + 5) * RAIN_CHARS.length,
        );
        const character = RAIN_CHARS[index];

        headLine += behind < 1 ? character : ' ';
        nearLine += behind >= 1 && behind < RAIN_TRAIL * 0.35 ? character : ' ';
        farLine += behind >= RAIN_TRAIL * 0.35 ? character : ' ';
      }

      head.push(headLine);
      near.push(nearLine);
      far.push(farLine);
    }

    return { head, near, far };
  }, [rows, columns, streams, frame, step]);

  const sheet = {
    fontFamily: mono,
    fontSize: RAIN_FONT,
    lineHeight: RAIN_LINE,
  } as const;

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <Text
        allowFontScaling={false}
        style={{ ...sheet, color: tone.color, opacity: 0.14 }}
      >
        {layers.far.join('\n')}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          StyleSheet.absoluteFill,
          { ...sheet, color: tone.color, opacity: 0.32 },
        ]}
      >
        {layers.near.join('\n')}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          StyleSheet.absoluteFill,
          { ...sheet, color: '#FFFFFF', opacity: 0.55 },
        ]}
      >
        {layers.head.join('\n')}
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
      {backdrop === 'grid' && <Grid tone={tone} light={light} />}
      {backdrop === 'scan' && <Scan tone={tone} light={light} />}
      {backdrop === 'rain' && <Rain tone={tone} speed={waveSpeed} />}
    </View>
  );
});

const styles = StyleSheet.create({
  base: { backgroundColor: surface.base, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
});
