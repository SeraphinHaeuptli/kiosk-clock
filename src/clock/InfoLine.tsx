import { StyleSheet, Text, View } from 'react-native';

import { label } from '@/design/palette';
import { space, type } from '@/design/tokens';

/**
 * The line under the date: a second time zone, a countdown, the battery.
 *
 * One row rather than three corners. Each of these is a few characters and
 * none of them is the reason anyone looks at the clock, so scattering them
 * around the screen would cost more attention than they are worth; sitting
 * together under the date, in the date's own register, they read as a footnote
 * to it. Items are separated by a middle dot and simply omitted when empty, so
 * the row shrinks to nothing rather than leaving gaps.
 */
export function InfoLine({ items }: { items: readonly (string | null)[] }) {
  const shown = items.filter((item): item is string => !!item);
  if (shown.length === 0) return null;

  return (
    <View style={styles.row}>
      <Text style={styles.text} numberOfLines={1} allowFontScaling={false}>
        {shown.join('  ·  ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md, alignItems: 'center' },
  text: {
    ...type.tiny,
    color: label.tertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
