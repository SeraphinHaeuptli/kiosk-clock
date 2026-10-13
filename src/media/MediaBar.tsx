import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { batteryLine } from '@/clock/extras';
import { clamp01, formatPercent } from '@/core/format';
import { label, surface, type Tone } from '@/design/palette';
import { MONO_ASPECT, hairline, mono, space, type } from '@/design/tokens';

import {
  trackLine,
  type NowPlayingResult,
  type TransportAction,
} from './nowPlaying';

const FILL = '█';
const EMPTY = '░';
const FONT = 13;
const MIN_CELLS = 8;
const CHARGE_FONT = 10;
const CHARGE_CELLS = 5;

/** A level this bar can drive: the device volume, or a room's brightness. */
export interface RailState {
  /** 0 to 1. */
  level: number;
  /**
   * False draws the rail but refuses the gesture — there is nothing on the
   * other end of it to move.
   */
  controllable: boolean;
  onChange: (level: number) => void;
  onDragChange: (dragging: boolean) => void;
}

export interface LightsRail extends RailState {
  /** The group's name, which takes the place of the gesture hint. */
  name: string;
  /** What is wrong instead, when something is. */
  problem: string | null;
}

interface Props {
  tone: Tone;
  /** The volume bar, or null when the lights have taken its place. */
  volume: RailState | null;
  /** The brightness bar, or null when it is off or no bridge is paired. */
  lights: LightsRail | null;
  nowPlaying: NowPlayingResult | null;
  onControl: (action: TransportAction) => void;
  /** Charge to draw beside the transport keys, or null to draw none. */
  battery: Charge | null;
}

export interface Charge {
  /** 0 to 1. */
  level: number;
  charging: boolean;
}

/**
 * One transport key.
 *
 * Sized well past the glyph it draws: two characters of a 13pt mono face is a
 * target of about twelve points, and this is a device sitting at arm's length
 * on a desk being prodded with a thumb.
 */
function Key({
  mark,
  hint,
  enabled,
  tone,
  onPress,
}: {
  mark: string;
  hint: string;
  enabled: boolean;
  tone: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={!enabled}
      hitSlop={space.sm}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled: !enabled }}
      style={styles.key}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.keyMark,
          { color: enabled ? tone.color : label.quaternary },
        ]}
      >
        {mark}
      </Text>
    </Pressable>
  );
}

/**
 * A level you drag sideways, drawn as block glyphs.
 *
 * The gesture is relative, not absolute: a swipe moves the level by how far
 * the finger travelled rather than jumping to wherever it landed. Absolute
 * positioning would make a stray tap on the bar slam the volume — or the
 * lights — to that point, which is the wrong behaviour for a device left
 * sitting on a desk.
 *
 * Each rail carries its own responder rather than sharing one on the bar.
 * With two of them there is no sensible reading of a swipe that lands between
 * them, and a single responder would have to guess which level it meant.
 */
function Rail({
  tone,
  state,
  title,
  hint,
  caption,
  spaced,
}: {
  tone: Tone;
  state: RailState;
  /** Header line, left: the track, or nothing on a second rail. */
  title: string;
  /** Meta line, left: how to use it, or what is wrong, or which room. */
  hint: string;
  /** Meta line, right: what this rail drives. */
  caption: string;
  /** A rail under another one needs a gap, or the six lines read as one block. */
  spaced?: boolean;
}) {
  const [cells, setCells] = useState(MIN_CELLS);
  const [width, setWidth] = useState(0);

  /**
   * The responder has to outlive the renders its own onChange causes: a
   * PanResponder keeps the gesture's accumulated dx inside the object
   * `create()` returns, so rebuilding it mid-drag resets that to zero and the
   * level stops following the finger. Everything it needs is read through a
   * ref, and it is built once.
   */
  const stateRef = useRef(state);
  stateRef.current = state;
  const widthRef = useRef(0);
  widthRef.current = width;
  const startLevel = useRef(state.level);
  const lastFilled = useRef(-1);

  const onLayout = (event: LayoutChangeEvent) => {
    const available = event.nativeEvent.layout.width;
    setWidth(available);
    // Two cells go to the enclosing brackets.
    setCells(
      Math.max(MIN_CELLS, Math.floor(available / (FONT * MONO_ASPECT)) - 2),
    );
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Not on touch-down, which would swallow every tap on the transport
        // keys below before they saw it. Nothing happens on the press anyway:
        // the level is only read when the finger starts moving, so waiting for
        // movement costs the gesture nothing and gives the keys their taps.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          // Claim the gesture only once it is clearly horizontal, so a vertical
          // swipe still belongs to whatever is behind the bar.
          stateRef.current.controllable &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          startLevel.current = stateRef.current.level;
          lastFilled.current = -1;
          stateRef.current.onDragChange(true);
        },
        onPanResponderMove: (_, gesture) => {
          const span = widthRef.current;
          if (span <= 0) return;
          stateRef.current.onChange(
            clamp01(startLevel.current + gesture.dx / span),
          );
        },
        onPanResponderRelease: () => stateRef.current.onDragChange(false),
        onPanResponderTerminate: () => stateRef.current.onDragChange(false),
      }),
    [],
  );

  const filled = Math.round(clamp01(state.level) * cells);

  // One tick per cell crossed, the way a physical volume wheel detents.
  if (lastFilled.current !== -1 && filled !== lastFilled.current) {
    Haptics.selectionAsync().catch(() => {});
  }
  lastFilled.current = filled;

  const percent = Math.round(clamp01(state.level) * 100);

  return (
    <View
      onLayout={onLayout}
      style={spaced && styles.spaced}
      // A slider, and announced as one: the whole rail is the control, and
      // without this a screen reader reads three unrelated lines of text and
      // a row of block glyphs.
      accessibilityRole="adjustable"
      accessibilityLabel={caption}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      {...responder.panHandlers}
    >
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[styles.level, { color: tone.color }]}
          allowFontScaling={false}
        >
          {formatPercent(state.level)}
        </Text>
      </View>

      <Text style={styles.bar} allowFontScaling={false} numberOfLines={1}>
        <Text style={{ color: label.quaternary }}>[</Text>
        <Text style={{ color: tone.color }}>{FILL.repeat(filled)}</Text>
        <Text style={{ color: label.quaternary }}>
          {EMPTY.repeat(Math.max(0, cells - filled))}
        </Text>
        <Text style={{ color: label.quaternary }}>]</Text>
      </Text>

      <View style={styles.row}>
        <Text style={styles.meta} numberOfLines={1}>
          {hint}
        </Text>
        <Text style={styles.meta} allowFontScaling={false}>
          {caption}
        </Text>
      </View>
    </View>
  );
}

/**
 * A charge gauge, in the same block glyphs as the bars above it.
 *
 * Labelled, because the bar it sits under also ends in a percentage and two
 * unlabelled percentages in one corner is a readout you have to think about.
 *
 * Not coloured by how low the charge is: this palette is one accent over
 * greyscale, so a warning red would be the only saturated colour in the app.
 * A gauge running empty already says empty, which is the whole of the job.
 */
function ChargeGauge({
  level,
  charging,
  tone,
}: {
  level: number;
  charging: boolean;
  tone: Tone;
}) {
  const readout = batteryLine(level, charging);
  // Null is a level the device would not vouch for, which is not the same as a
  // level of zero: drawing an empty gauge for it would claim a phone about to
  // die. Nothing is drawn instead.
  if (readout === null) return null;

  // Any charge at all keeps one cell lit, so an empty gauge means empty and
  // not merely low: five cells put a tenth of a battery below half a cell, and
  // a phone with 9% left reading the same as a dead one is the one rounding
  // error in a charge meter worth spending a line to avoid.
  const fraction = Math.min(1, Math.max(0, level));
  const filled =
    fraction === 0 ? 0 : Math.max(1, Math.round(fraction * CHARGE_CELLS));

  return (
    <View
      style={styles.charge}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Battery ${readout.replace(' +', ', charging')}`}
    >
      <Text style={styles.meta} allowFontScaling={false}>
        bat
      </Text>
      {/* One Text, so the cells butt together the way the bars above do
          rather than picking up the tiny type's letter spacing. */}
      <Text style={styles.chargeCells} allowFontScaling={false}>
        <Text style={{ color: label.quaternary }}>[</Text>
        <Text style={{ color: tone.color }}>{FILL.repeat(filled)}</Text>
        <Text style={{ color: label.quaternary }}>
          {EMPTY.repeat(CHARGE_CELLS - filled)}
        </Text>
        <Text style={{ color: label.quaternary }}>]</Text>
      </Text>
      <Text style={styles.meta} allowFontScaling={false}>
        {readout}
      </Text>
    </View>
  );
}

/**
 * Now playing, over the levels this device can reach: its own volume, and the
 * brightness of a room of Hue lights.
 *
 * Which rails appear is the caller's business. Whichever comes first carries
 * the track name in its header, so the one line that is about the music rather
 * than about a level stays at the top of the bar wherever the lights are put.
 */
export function MediaBar({
  tone,
  volume,
  lights,
  nowPlaying,
  onControl,
  battery,
}: Props) {
  const track = nowPlaying?.track ?? null;

  /*
    Controls appear only for a session this app can actually reach.

    An endpoint track is a report about a player on another machine, so there
    is nothing to send a command to; showing keys for it would be the same
    mistake as showing a live reading for a source that had gone stale.
  */
  const shownTransport =
    nowPlaying?.from === 'device' &&
    track !== null &&
    (track.canPrevious || track.canPlayPause || track.canNext);

  const source =
    nowPlaying?.mode === 'stale'
      ? '[stale]'
      : nowPlaying?.mode === 'none'
        ? '[no source]'
        : null;

  /*
    A bar with no source says nothing about playback, rather than holding a
    permanent "nothing playing [no source]" over a volume slider. Someone who
    has not set an endpoint is not waiting to be told that every day — and on
    a docked phone that line is on screen for weeks.
  */
  const heading =
    nowPlaying === null
      ? ''
      : `${trackLine(track)}${source ? `  ${source}` : ''}`;

  return (
    <View style={styles.block}>
      <View style={styles.rule} />

      {volume && (
        <Rail
          tone={tone}
          state={volume}
          title={heading}
          // Silent while it works. "swipe to adjust" is read once and then
          // sits there for the life of the device; what is worth a line is
          // the case where the bar cannot drive anything.
          hint={volume.controllable ? '' : 'volume unavailable'}
          caption="volume"
        />
      )}

      {lights && (
        <Rail
          tone={tone}
          state={lights}
          // The track line belongs to the first rail on the bar, whichever
          // that turns out to be.
          title={volume ? '' : heading}
          // The room name rather than "swipe to adjust": with two rails the
          // gesture has already been explained once, and which lights this is
          // driving is the thing worth a line.
          hint={lights.problem ?? lights.name}
          caption="lights"
          spaced={volume !== null}
        />
      )}

      {/*
        Both halves share one row: the keys sit on the left and the charge is
        pushed to the right edge by an auto margin, so it lands under the
        'volume' label whether or not there are keys to sit beside.

        The row is held back entirely when it would be empty, so a bar with
        neither keys nor a battery keeps the height it had before either.
      */}
      {(shownTransport || battery !== null) && (
        <View style={styles.bottom}>
          {shownTransport && track && (
            <View style={styles.transport}>
              <Key
                mark="|<<"
                hint="Previous track"
                enabled={track.canPrevious}
                tone={tone}
                onPress={() => onControl('previous')}
              />
              {/* The key shows the action, not the state: what a press does. */}
              <Key
                mark={track.playing ? '||' : '>'}
                hint={track.playing ? 'Pause' : 'Play'}
                enabled={track.canPlayPause}
                tone={tone}
                onPress={() => onControl('playPause')}
              />
              <Key
                mark=">>|"
                hint="Next track"
                enabled={track.canNext}
                tone={tone}
                onPress={() => onControl('next')}
              />
            </View>
          )}

          {battery && (
            <ChargeGauge
              level={battery.level}
              charging={battery.charging}
              tone={tone}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.xs },
  // A status line sits under a rule, not inside a card.
  rule: {
    height: hairline,
    backgroundColor: surface.line,
    marginBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: { ...type.small, color: label.primary, flexShrink: 1 },
  level: { ...type.small },
  bar: { fontFamily: mono, fontSize: FONT, lineHeight: FONT * 1.3 },
  spaced: { marginTop: space.sm },
  meta: { ...type.tiny, color: label.tertiary, flexShrink: 1 },
  bottom: { flexDirection: 'row', alignItems: 'center', paddingTop: space.xs },
  transport: { flexDirection: 'row', gap: space.lg },
  // Auto margin rather than 'space-between': the charge has to hold the right
  // edge even when it is the only thing in the row.
  charge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  chargeCells: { fontFamily: mono, fontSize: CHARGE_FONT },
  // Fixed width so the middle key swapping between '>' and '||' does not
  // shuffle the row sideways every time playback is toggled.
  key: {
    minWidth: 40,
    paddingVertical: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyMark: { fontFamily: mono, fontSize: FONT, lineHeight: FONT * 1.3 },
});
