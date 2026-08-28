import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { formatDuration, formatPercent } from '@/core/format';
import { useNow } from '@/core/useNow';
import { label, surface, type Tone } from '@/design/palette';
import { MONO_ASPECT, hairline, mono, space, type } from '@/design/tokens';

import { levelOf, timeUntilReset, type UsageResult } from './usage';

const FILL = '█';
const EMPTY = '░';
const FONT = 13;
const MIN_CELLS = 8;

interface Props {
  result: UsageResult | null;
  tone: Tone;
}

/**
 * The Claude session meter, drawn as a character bar.
 *
 * The cell count is measured from the laid-out width rather than fixed, so the
 * bar spans exactly the space available on any display without the ends
 * drifting away from the text above and below it.
 */
export function UsageBar({ result, tone }: Props) {
  // Its own minute tick: the countdown must keep moving even when the face
  // above it is only redrawing once an hour.
  const now = useNow('minute').getTime();
  const [cells, setCells] = useState(MIN_CELLS);

  const onLayout = (event: LayoutChangeEvent) => {
    const available = event.nativeEvent.layout.width;
    // Two cells go to the enclosing brackets.
    const next = Math.floor(available / (FONT * MONO_ASPECT)) - 2;
    setCells(Math.max(MIN_CELLS, next));
  };

  if (!result) return <View onLayout={onLayout} />;

  const { session, week } = result.snapshot;
  const used = session.used;
  const filled = Math.round(used * cells);
  const remaining = timeUntilReset(session, now);
  const critical = levelOf(used) === 'critical';

  const source =
    result.mode === 'live' ? null : result.mode === 'stale' ? '[stale]' : '[sample]';

  return (
    <View style={styles.block} onLayout={onLayout}>
      <View style={styles.rule} />

      <View style={styles.row}>
        <Text style={styles.title} allowFontScaling={false}>
          claude session
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.percent,
            { color: tone.color },
            // Inverse video for the last stretch — a terminal's way of
            // shouting without reaching for a colour.
            critical && { backgroundColor: tone.color, color: surface.base },
          ]}
        >
          {` ${formatPercent(used)} `}
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
        <Text style={styles.meta} allowFontScaling={false}>
          {remaining === 0
            ? 'resetting now'
            : `resets in ${formatDuration(remaining)}`}
          {source ? `  ${source}` : ''}
        </Text>

        {week && (
          <Text style={styles.meta} allowFontScaling={false}>
            week {formatPercent(week.used)}
          </Text>
        )}
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
  },
  title: { ...type.small, color: label.secondary },
  percent: { ...type.small },
  bar: { fontFamily: mono, fontSize: FONT, lineHeight: FONT * 1.3 },
  meta: { ...type.tiny, color: label.tertiary },
});
