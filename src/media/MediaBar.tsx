import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { label, surface, type Tone } from '@/design/palette';
import { MONO_ASPECT, hairline, mono, space, type } from '@/design/tokens';

import { trackLine, type NowPlayingResult } from './nowPlaying';
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
        onStartShouldSetPanResponder: () => true,
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
});
