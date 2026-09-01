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

import { label, surface, type Tone } from '@/design/palette';
import { MONO_ASPECT, hairline, mono, space, type } from '@/design/tokens';

import {
  trackLine,
  type NowPlayingResult,
  type TransportAction,
} from './nowPlaying';
import { clampVolume, formatVolume } from './volume';

const FILL = '█';
const EMPTY = '░';
const FONT = 13;
const MIN_CELLS = 8;

interface Props {
  tone: Tone;
  volume: number;
  controllable: boolean;
  onChange: (level: number) => void;
  onDragChange: (dragging: boolean) => void;
  nowPlaying: NowPlayingResult | null;
  onControl: (action: TransportAction) => void;
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
 * Now playing, over a volume bar you drag sideways.
 *
 * The gesture is relative, not absolute: a swipe moves the level by how far
 * the finger travelled rather than jumping to wherever it landed. Absolute
 * positioning would make a stray tap on the bar slam the volume to that point,
 * which is the wrong behaviour for a device left sitting on a desk.
 */
export function MediaBar({
  tone,
  volume,
  controllable,
  onChange,
  onDragChange,
  nowPlaying,
  onControl,
}: Props) {
  const [cells, setCells] = useState(MIN_CELLS);
  const [width, setWidth] = useState(0);

  // Read inside the responder without re-creating it on every level change.
  const levelRef = useRef(volume);
  levelRef.current = volume;
  const widthRef = useRef(0);
  widthRef.current = width;
  const startLevel = useRef(volume);
  const lastFilled = useRef(-1);

  const onLayout = (event: LayoutChangeEvent) => {
    const available = event.nativeEvent.layout.width;
    setWidth(available);
    // Two cells go to the enclosing brackets.
    setCells(Math.max(MIN_CELLS, Math.floor(available / (FONT * MONO_ASPECT)) - 2));
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
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          startLevel.current = levelRef.current;
          lastFilled.current = -1;
          onDragChange(true);
        },
        onPanResponderMove: (_, gesture) => {
          const span = widthRef.current;
          if (span <= 0) return;
          onChange(clampVolume(startLevel.current + gesture.dx / span));
        },
        onPanResponderRelease: () => onDragChange(false),
        onPanResponderTerminate: () => onDragChange(false),
      }),
    [onChange, onDragChange],
  );

  const filled = Math.round(clampVolume(volume) * cells);

  // One tick per cell crossed, the way a physical volume wheel detents.
  if (lastFilled.current !== -1 && filled !== lastFilled.current) {
    Haptics.selectionAsync().catch(() => {});
  }
  lastFilled.current = filled;

  const track = nowPlaying?.track ?? null;

  /*
    Controls appear only for a session this app can actually reach.

    An endpoint track is a report about a player on another machine, so there
    is nothing to send a command to; showing keys for it would be the same
    mistake as showing a live reading for a source that had gone stale.
  */
  const drivable =
    nowPlaying?.from === 'device' &&
    track !== null &&
    (track.canPrevious || track.canPlayPause || track.canNext);

  const source =
    nowPlaying?.mode === 'stale'
      ? '[stale]'
      : nowPlaying?.mode === 'none'
        ? '[no source]'
        : null;

  return (
    <View style={styles.block} onLayout={onLayout} {...responder.panHandlers}>
      <View style={styles.rule} />

      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {trackLine(nowPlaying?.track ?? null)}
        </Text>
        <Text
          style={[styles.level, { color: tone.color }]}
          allowFontScaling={false}
        >
          {formatVolume(volume)}
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
          {controllable ? 'swipe to adjust' : 'volume unavailable'}
          {source ? `  ${source}` : ''}
        </Text>
        <Text style={styles.meta} allowFontScaling={false}>
          volume
        </Text>
      </View>

      {drivable && track && (
        <View style={styles.transport}>
          <Key
            mark="|<<"
            hint="Previous track"
            enabled={track.canPrevious}
            tone={tone}
            onPress={() => onControl('previous')}
          />
          {/* The key shows the action, not the state: what a press will do. */}
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
  meta: { ...type.tiny, color: label.tertiary, flexShrink: 1 },
  transport: { flexDirection: 'row', gap: space.lg, paddingTop: space.xs },
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
