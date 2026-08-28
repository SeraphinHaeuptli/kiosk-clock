import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { label, surface, type Tone } from '@/design/palette';
import { hairline, mono, space, type } from '@/design/tokens';

const ROW_HEIGHT = 38;

/** A section title followed by a rule that runs to the edge. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.headingText}>{children}</Text>
      <View style={styles.headingRule} />
    </View>
  );
}

/** `[x] label` — the whole row is the target, not just the box. */
export function CheckRow({
  title,
  hint,
  checked,
  onChange,
  tone,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  tone: Tone;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text
        style={[styles.box, { color: checked ? tone.color : label.tertiary }]}
        allowFontScaling={false}
      >
        {checked ? '[x]' : '[ ]'}
      </Text>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

export interface Choice<T extends string> {
  id: T;
  name: string;
}

/**
 * Inline options; the selection is bracketed and lit, the rest are dim.
 * Brackets are part of the text rather than a border, so the row stays on the
 * character grid.
 */
export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  tone,
}: {
  options: readonly Choice<T>[];
  value: T;
  onChange: (next: T) => void;
  tone: Tone;
}) {
  return (
    <View style={styles.choices}>
      {options.map((option) => {
        const selected = option.id === value;

        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="radio"
            accessibilityLabel={option.name}
            accessibilityState={{ selected }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.choice,
                { color: selected ? tone.color : label.tertiary },
              ]}
            >
              {selected ? `[${option.name}]` : ` ${option.name} `}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled single-line field, underlined rather than boxed. */
export function TextRow({
  title,
  value,
  placeholder,
  onChangeText,
}: {
  title: string;
  value: string;
  placeholder?: string;
  onChangeText: (next: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{title}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={label.quaternary}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        returnKeyType="done"
        selectionColor={label.secondary}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** A read-only `name    value` line. */
export function StatusRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.fieldLabel}>{title}</Text>
      <Text style={styles.statusValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ActionRow({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={[styles.box, { color: label.tertiary }]}>{'>'}</Text>
      <Text style={styles.rowTitle}>{title}</Text>
    </Pressable>
  );
}

/** Three rules in a hairline square. Drawn, so no icon font is needed. */
export function MenuGlyph({ size, color }: { size: number; color: string }) {
  const bar = Math.max(1, size * 0.08);

  return (
    <View style={{ width: size, height: size, justifyContent: 'space-evenly' }}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{ height: bar, backgroundColor: color, opacity: 0.9 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  headingText: {
    ...type.tiny,
    color: label.tertiary,
    textTransform: 'uppercase',
  },
  headingRule: {
    flex: 1,
    height: hairline,
    backgroundColor: surface.line,
    marginLeft: space.md,
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  pressed: { opacity: 0.5 },
  rowText: { flexShrink: 1 },
  rowTitle: { ...type.body, color: label.primary },
  rowHint: { ...type.tiny, color: label.tertiary, marginTop: 2 },
  box: { ...type.body, color: label.tertiary },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.md,
    rowGap: space.xs,
    minHeight: ROW_HEIGHT,
  },
  choice: { ...type.body },
  field: { minHeight: ROW_HEIGHT, justifyContent: 'center', gap: space.xs },
  fieldLabel: { ...type.tiny, color: label.tertiary },
  input: {
    ...type.body,
    color: label.primary,
    paddingVertical: space.xs,
    paddingHorizontal: 0,
    borderBottomWidth: hairline,
    borderBottomColor: surface.line,
  },
  statusRow: {
    minHeight: ROW_HEIGHT,
    justifyContent: 'center',
    gap: space.xs,
  },
  statusValue: { ...type.small, color: label.secondary },
});
