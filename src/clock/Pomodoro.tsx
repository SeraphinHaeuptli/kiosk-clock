import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useNow } from '@/core/useNow';
import { label, type Tone } from '@/design/palette';
import { mono, space, type } from '@/design/tokens';

import { BurnInGuard } from './BurnInGuard';
import {
  CYCLE,
  clockText,
  phaseName,
  position,
  running,
  type Lengths,
} from './pomodoro';
import { usePomodoro } from './usePomodoro';

const FILLED = '●';
const EMPTY = '○';
const FONT = 11;

interface Props {
  lengths: Lengths;
  tone: Tone;
  /** The night-dimming opacity the rest of the screen rides on. */
  dim: Animated.Value;
  /** Rises with the revealed chrome, so the controls arrive with the menu. */
  chrome: Animated.Value;
  /** Whether the chrome is up. Controls are untappable until it is. */
  armed: boolean;
  burnInGuard: boolean;
}

function Key({
  mark,
  hint,
  tone,
  onPress,
}: {
  mark: string;
  hint: string;
  tone: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={space.sm}
      accessibilityRole="button"
      accessibilityLabel={hint}
      style={({ pressed }) => [styles.key, pressed && styles.pressed]}
    >
      <Text style={[styles.keyText, { color: tone.color }]} allowFontScaling={false}>
        {mark}
      </Text>
    </Pressable>
  );
}

/**
 * A pomodoro, in the register of the rest of the readouts.
 *
 * This component owns the app's only per-second tick. The clock face is
 * memoised and the screen above deliberately ticks once a minute unless
 * something is actually moving; putting the timer's tick up there would have
 * re-rendered the character art sixty times a minute to move two digits.
 */
export function Pomodoro({
  lengths,
  tone,
  dim,
  chrome,
  armed,
  burnInGuard,
}: Props) {
  // A paused timer has nothing to count, so the tick settles back to a minute.
  // Set from an effect rather than during render, so the rate changes one
  // frame after the timer starts — which no one can see, and which keeps this
  // out of the render phase.
  const [live, setLive] = useState(false);
  const now = useNow(live ? 'second' : 'minute');
  const nowMs = now.getTime();

  const { state, start, pause, reset, skip } = usePomodoro(lengths, true, nowMs);
  const active = state !== null && running(state);

  useEffect(() => {
    setLive(active);
  }, [active]);

  if (state === null) return null;

  const left = state.endsAt === null ? state.leftMs : Math.max(0, state.endsAt - nowMs);
  const filled = position(state);

  return (
    <BurnInGuard enabled={burnInGuard} style={styles.block}>
      <Animated.View pointerEvents="none" style={{ opacity: dim }}>
        <Text style={styles.readout} allowFontScaling={false} numberOfLines={1}>
          <Text style={{ color: tone.color }}>{FILLED.repeat(filled)}</Text>
          <Text style={{ color: label.quaternary }}>
            {EMPTY.repeat(Math.max(0, CYCLE - filled))}
          </Text>
          <Text style={styles.name}>{`   ${phaseName(state.phase)}   `}</Text>
          <Text style={[styles.time, { color: tone.color }]}>{clockText(left)}</Text>
        </Text>
      </Animated.View>

      <Animated.View
        pointerEvents={armed ? 'auto' : 'none'}
        style={[styles.keys, { opacity: chrome }]}
      >
        <Key
          mark={active ? '[ pause ]' : '[ start ]'}
          hint={active ? 'Pause the timer' : 'Start the timer'}
          tone={tone}
          onPress={active ? pause : start}
        />
        <Key mark="[ skip ]" hint="Skip to the next phase" tone={tone} onPress={skip} />
        <Key mark="[ reset ]" hint="Reset the timer" tone={tone} onPress={reset} />
      </Animated.View>
    </BurnInGuard>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', marginBottom: space.md },
  readout: {
    fontFamily: mono,
    fontSize: FONT,
    lineHeight: FONT * 1.4,
    letterSpacing: 1,
  },
  name: { ...type.tiny, color: label.tertiary, textTransform: 'uppercase' },
  time: { fontFamily: mono, fontSize: FONT, letterSpacing: 1 },
  keys: { flexDirection: 'row', gap: space.lg, paddingTop: space.xs },
  key: { paddingVertical: space.xs },
  keyText: { fontFamily: mono, fontSize: FONT, letterSpacing: 0.5 },
  pressed: { opacity: 0.55 },
});
