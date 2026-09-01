import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
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
/* Shared machinery for the character fields                                  */
/* -------------------------------------------------------------------------- */

const SPACE = 32;
const NEWLINE = 10;

/**
 * How many character codes go over to `String.fromCharCode` at a time. It
 * takes its arguments spread, and a screenful is thousands of them — more than
 * an engine will accept in one call — so the buffer goes over in blocks.
 */
const BLOCK = 1024;

/**
 * Turns a screen buffer of character codes into the string a `<Text>` wants.
 *
 * The fields used to append to a string inside the sampling loop, which meant
 * one string allocation per cell — thirty thousand a second on a phone, a
 * hundred thousand on a tablet — and the collector was doing more work than
 * the noise was. Writing codes into a buffer that outlives the frame and
 * converting it in a handful of calls keeps the allocation count flat.
 */
function textFrom(codes: Uint16Array): string {
  const length = codes.length;
  let out = '';

  for (let at = 0; at < length; at += BLOCK) {
    const block = codes.subarray(at, Math.min(at + BLOCK, length));
    // `apply` wants an array-like, which a typed array is; the lib types only
    // admit a real array.
    out += String.fromCharCode.apply(null, block as unknown as number[]);
  }

  return out;
}

/**
 * A blank screen buffer, one row per line with a newline between rows.
 *
 * Laying the newlines in once — they never move for a given screen size — is
 * what lets a frame be drawn by blanking the buffer and writing only the cells
 * that carry ink.
 */
function screenBuffer(rows: number, columns: number): Uint16Array {
  // Guarded because the length expression goes to -1 at zero rows, and a
  // negative typed-array length throws rather than giving back an empty one.
  // A screen measured at zero height is not hypothetical: the static web
  // export renders before useWindowDimensions has anything to report.
  const codes = new Uint16Array(Math.max(0, rows * (columns + 1) - 1));
  codes.fill(SPACE);

  for (let row = 1; row < rows; row += 1) {
    codes[row * (columns + 1) - 1] = NEWLINE;
  }

  return codes;
}

/** Blanks a buffer's cells, leaving the newlines that separate its rows. */
function blank(codes: Uint16Array, rows: number, columns: number): void {
  const stride = columns + 1;

  for (let row = 0; row < rows; row += 1) {
    const start = row * stride;
    codes.fill(SPACE, start, start + columns);
  }
}

/**
 * Whether the app is actually in front of someone.
 *
 * The two animated fields redraw eleven times a second off a timer, and an
 * Android JS timer keeps firing after the user walks away — a docked clock
 * whose screen had gone dark was still sampling a full screen of noise into a
 * string nobody could see, for as long as the process lived. Nothing about the
 * motion is observable while it is away, so the timer stops and the field
 * picks up from where it paused. Defaults to visible: assuming the worst here
 * would be a black backdrop on any device whose first AppState reading is
 * something other than `active`.
 */
function useOnScreen(): boolean {
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setOnScreen(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  return onScreen;
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

  // Two hundred separately placed text nodes, and each one carries a font size
  // and an opacity of its own, so there is no collapsing them into a block the
  // way the wave and rain fields are drawn. Memoising the built nodes was
  // tried and removed: this component only renders when the backdrop's own
  // memo lets a change through, and every such change moves `darkness`, so the
  // cache missed on all of them and hit on none.
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
 * Blank through dense. Deliberately tops out at '*': with '#' in the ramp the
 * midday field turned into a wall of ink that the clock and the meter had to
 * fight through.
 */
const DITHER_RAMP = Uint16Array.from(' .:*', (mark) => mark.charCodeAt(0));

function shadeFor(value: number): number {
  if (value > 0.42) return DITHER_RAMP[3];
  if (value > 0.22) return DITHER_RAMP[2];
  if (value > 0) return DITHER_RAMP[1];
  return DITHER_RAMP[0];
}

/** A character field whose density rises and falls with the day. */
function Dither({ tone, light }: { tone: Tone; light: number }) {
  const { width, height } = useWindowDimensions();

  const columns = Math.floor(width / (DITHER_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / DITHER_LINE);

  // One stable noise value per cell; the threshold moves, the noise does not.
  const grid = useMemo(() => {
    const cells = new Float64Array(rows * columns);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        cells[row * columns + column] = noise(row * 1361 + column * 17 + 1);
      }
    }

    return cells;
  }, [rows, columns]);

  const threshold = DITHER_FLOOR + light * DITHER_GAIN;

  /*
    One `<Text>` per row rather than one for the whole field, unlike the wave
    and rain backdrops. It is not an oversight: a single block would let
    `lineHeight` set the row pitch exactly, where separate elements each carry
    a line box driven by the font's own ascent and descent, which at this size
    is taller than seventeen points. The field would tighten up and get denser.
    The rows are cheap to hold across renders, and the day only moves the
    threshold a few dozen times between midnights.
  */
  const lines = useMemo(() => {
    const out: string[] = [];
    const row = new Uint16Array(columns);

    for (let index = 0; index < rows; index += 1) {
      const base = index * columns;

      for (let column = 0; column < columns; column += 1) {
        row[column] = shadeFor(threshold - grid[base + column]);
      }

      out.push(textFrom(row));
    }

    return out;
  }, [grid, rows, columns, threshold]);

  const style = useMemo(
    () => ({
      fontFamily: mono,
      fontSize: DITHER_FONT,
      lineHeight: DITHER_LINE,
      color: tone.color,
      // Under a tenth the field was drawn at 21/255 at its brightest, which is
      // below what a phone screen shows in a lit room.
      opacity: 0.24,
    }),
    [tone.color],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((line, row) => (
        <Text key={row} allowFontScaling={false} numberOfLines={1} style={style}>
          {line}
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
const WAVE_RAMP_CODES = Uint16Array.from(WAVE_RAMP, (mark) =>
  mark.charCodeAt(0),
);
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
  const onScreen = useOnScreen();

  const step = WAVE_STEP[speed];

  useEffect(() => {
    if (step === 0 || !onScreen) return;
    const timer = setInterval(() => setFrame((n) => n + 1), WAVE_FRAME_MS);
    return () => clearInterval(timer);
  }, [step, onScreen]);

  const columns = Math.floor(width / (WAVE_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / WAVE_LINE);
  const frequency = WAVE_FREQUENCY[scale];
  const drift = frame * step;

  /*
    Where each cell sits in noise space, and the buffer the frame is drawn
    into. All three depend on the screen and the scale, not on the clock, so
    they are cut once and then written over in place. Recomputing the two
    multiplications per cell every frame was three thousand of them eleven
    times a second to arrive at the same numbers.
  */
  const plan = useMemo(() => {
    // Sample in screen points rather than grid indices, so the field stays
    // isotropic despite characters being much taller than they are wide.
    const xs = new Float64Array(columns);
    for (let column = 0; column < columns; column += 1) {
      xs[column] = column * WAVE_FONT * MONO_ASPECT * frequency;
    }

    const ys = new Float64Array(rows);
    for (let row = 0; row < rows; row += 1) {
      ys[row] = row * WAVE_LINE * frequency;
    }

    return { xs, ys, codes: screenBuffer(rows, columns) };
  }, [rows, columns, frequency]);

  const text = useMemo(() => {
    const { xs, ys, codes } = plan;
    const stride = columns + 1;
    const yDrift = drift * 0.6;
    const last = WAVE_RAMP_CODES.length - 1;

    for (let row = 0; row < rows; row += 1) {
      const y = ys[row] - yDrift;
      let at = row * stride;

      for (let column = 0; column < columns; column += 1) {
        const value = field(xs[column] + drift, y);
        const shaped = (value - WAVE_FLOOR) / (1 - WAVE_FLOOR);
        const index = ((shaped > 0 ? shaped : 0) * WAVE_RAMP_CODES.length) | 0;
        codes[at] = WAVE_RAMP_CODES[index < last ? index : last];
        at += 1;
      }
    }

    return textFrom(codes);
  }, [plan, rows, columns, drift]);

  const style = useMemo(
    () => ({
      fontFamily: mono,
      fontSize: WAVE_FONT,
      lineHeight: WAVE_LINE,
      color: tone.color,
      opacity: 0.30,
    }),
    [tone.color],
  );

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.clip]}
      pointerEvents="none"
    >
      <Text allowFontScaling={false} style={style}>
        {text}
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

  // A hundred-odd fixed hairlines. Rebuilding them whenever the day moved the
  // ink was a hundred style objects for a pattern that had not moved a pixel.
  const mask = useMemo(
    () =>
      Array.from({ length: lines }, (_, index) => (
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
      )),
    [lines, ink],
  );

  // Held across renders: a fresh interpolation every render is a fresh node in
  // the native animation graph, created and dropped again each time.
  const translateY = useMemo(
    () =>
      sweep.interpolate({
        inputRange: [0, 1],
        outputRange: [-SCAN_BAND, height],
      }),
    [sweep, height],
  );

  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      {mask}

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
  const onScreen = useOnScreen();

  const step = RAIN_STEP[speed];

  useEffect(() => {
    if (step === 0 || !onScreen) return;
    const timer = setInterval(() => setFrame((n) => n + 1), WAVE_FRAME_MS);
    return () => clearInterval(timer);
  }, [step, onScreen]);

  const columns = Math.floor(width / (RAIN_FONT * MONO_ASPECT));
  const rows = Math.ceil(height / RAIN_LINE);

  // Per column: how fast it falls and where it started. Seeded, so a column
  // keeps its character across renders instead of reshuffling every frame.
  const streams = useMemo(() => {
    const rate = new Float64Array(columns);
    const offset = new Float64Array(columns);

    for (let column = 0; column < columns; column += 1) {
      rate[column] = 0.45 + noise(column * 31 + 3) * 1.1;
      offset[column] = noise(column * 57 + 11) * (rows + RAIN_TRAIL);
    }

    return { rate, offset };
  }, [columns, rows]);

  /*
    Which glyph a cell shows depends on where the cell is and nothing else —
    the tails travel over a fixed field of characters rather than drawing new
    ones as they fall. Hashing it per frame meant eight thousand hashes a
    second, on a phone, to arrive at a table that had not changed since the
    screen was measured.
  */
  const glyphs = useMemo(() => {
    const codes = new Uint16Array(rows * columns);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = Math.floor(
          noise(row * 733 + column * 29 + 5) * RAIN_CHARS.length,
        );
        codes[row * columns + column] = RAIN_CHARS.charCodeAt(index);
      }
    }

    return codes;
  }, [rows, columns]);

  const buffers = useMemo(
    () => ({
      head: screenBuffer(rows, columns),
      near: screenBuffer(rows, columns),
      far: screenBuffer(rows, columns),
    }),
    [rows, columns],
  );

  const layers = useMemo(() => {
    const { head, near, far } = buffers;
    const span = rows + RAIN_TRAIL;
    const stride = columns + 1;
    const nearLimit = RAIN_TRAIL * 0.35;
    const drift = frame * step;

    blank(head, rows, columns);
    blank(near, rows, columns);
    blank(far, rows, columns);

    for (let column = 0; column < columns; column += 1) {
      const position =
        (streams.offset[column] + drift * streams.rate[column]) % span;

      /*
        Only the rows a tail actually covers get touched; everything else is
        the blank above. Walking every cell of every layer instead spent three
        quarters of the loop deciding to write a space — seven thousand of
        them a frame on a phone, twenty-four thousand on a tablet.
      */
      const first = Math.max(0, Math.floor(position - RAIN_TRAIL) + 1);
      const last = Math.min(rows - 1, Math.floor(position));

      for (let row = first; row <= last; row += 1) {
        const behind = position - row;
        const code = glyphs[row * columns + column];
        const at = row * stride + column;

        if (behind < 1) head[at] = code;
        else if (behind < nearLimit) near[at] = code;
        else far[at] = code;
      }
    }

    return {
      head: textFrom(head),
      near: textFrom(near),
      far: textFrom(far),
    };
  }, [buffers, glyphs, streams, rows, columns, frame, step]);

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
        {layers.far}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          StyleSheet.absoluteFill,
          { ...sheet, color: tone.color, opacity: 0.32 },
        ]}
      >
        {layers.near}
      </Text>
      <Text
        allowFontScaling={false}
        style={[
          StyleSheet.absoluteFill,
          { ...sheet, color: '#FFFFFF', opacity: 0.55 },
        ]}
      >
        {layers.head}
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
