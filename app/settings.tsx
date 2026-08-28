import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FacePicker } from '@/clock/FacePicker';
import { useSettings } from '@/clock/SettingsContext';
import type { BackdropId } from '@/clock/settings';
import { useNow } from '@/core/useNow';
import { TONES, label, surface, type ToneId } from '@/design/palette';
import { space, type } from '@/design/tokens';
import {
  ActionRow,
  CheckRow,
  ChoiceRow,
  Heading,
  StatusRow,
  TextRow,
  type Choice,
} from '@/ui/Terminal';
import { resolveEndpoint, useUsage } from '@/usage/useUsage';

const BACKDROPS: readonly Choice<BackdropId>[] = [
  { id: 'void', name: 'void' },
  { id: 'horizon', name: 'horizon' },
  { id: 'stars', name: 'stars' },
  { id: 'dither', name: 'dither' },
];

const TONE_CHOICES: readonly Choice<ToneId>[] = TONES.map((tone) => ({
  id: tone.id,
  name: tone.name,
}));

const USAGE_HINT =
  'any endpoint returning {"session":{"used":0.62,"resetsAt":"<iso>"}}. ' +
  '"used" may be a 0-1 fraction, or a count alongside "limit". an optional ' +
  '"week" object shows beside the session meter. empty = sample data.';

function sourceStatus(
  mode: 'sample' | 'live' | 'stale' | undefined,
  warning: string | undefined,
): string {
  if (mode === 'live') return 'live';
  if (mode === 'stale') return `unreachable - ${warning ?? 'unknown error'}`;
  return 'sample data';
}

export default function SettingsScreen() {
  const { settings, tone, update, reset } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow('second');

  // Mirrors the kiosk's own source, so the status line reflects the real
  // result of whatever endpoint is currently typed in.
  const usage = useUsage(resolveEndpoint(settings.usageEndpoint), true);

  const confirmReset = () => {
    Alert.alert('reset all settings?', 'the clock returns to its defaults.', [
      { text: 'cancel', style: 'cancel' },
      { text: 'reset', style: 'destructive', onPress: reset },
    ]);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.brand}>KIOSK</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={space.md}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[styles.done, { color: tone.color }]}>[done]</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Heading>face</Heading>
        <FacePicker
          now={now}
          settings={settings}
          tone={tone}
          onChange={(face) => update({ face })}
        />

        <Heading>tone</Heading>
        <ChoiceRow
          options={TONE_CHOICES}
          value={settings.tone}
          onChange={(next) => update({ tone: next })}
          tone={tone}
        />

        <Heading>backdrop</Heading>
        <ChoiceRow
          options={BACKDROPS}
          value={settings.backdrop}
          onChange={(backdrop) => update({ backdrop })}
          tone={tone}
        />
        <Text style={styles.note}>
          horizon, stars and dither all shift with the time of day.
        </Text>

        <Heading>display</Heading>
        <CheckRow
          title="24-hour time"
          checked={!settings.hour12}
          onChange={(on) => update({ hour12: !on })}
          tone={tone}
        />
        <CheckRow
          title="seconds"
          checked={settings.showSeconds}
          onChange={(showSeconds) => update({ showSeconds })}
          tone={tone}
        />
        <CheckRow
          title="date"
          checked={settings.showDate}
          onChange={(showDate) => update({ showDate })}
          tone={tone}
        />
        <CheckRow
          title="usage counter"
          checked={settings.showUsage}
          onChange={(showUsage) => update({ showUsage })}
          tone={tone}
        />

        <Heading>kiosk</Heading>
        <CheckRow
          title="keep screen on"
          checked={settings.keepAwake}
          onChange={(keepAwake) => update({ keepAwake })}
          tone={tone}
        />
        <CheckRow
          title="night dimming"
          hint="fades the display between 10pm and 7am"
          checked={settings.nightDim}
          onChange={(nightDim) => update({ nightDim })}
          tone={tone}
        />
        <CheckRow
          title="burn-in protection"
          hint="drifts the clock a few points on a slow cycle"
          checked={settings.burnInGuard}
          onChange={(burnInGuard) => update({ burnInGuard })}
          tone={tone}
        />
        <CheckRow
          title="landscape"
          hint="lock the kiosk sideways for a dock or stand"
          checked={settings.landscape}
          onChange={(landscape) => update({ landscape })}
          tone={tone}
        />

        <Heading>usage</Heading>
        <TextRow
          title="endpoint"
          value={settings.usageEndpoint}
          placeholder="https://..."
          onChangeText={(usageEndpoint) => update({ usageEndpoint })}
        />
        <StatusRow
          title="source"
          value={sourceStatus(usage.result?.mode, usage.result?.warning)}
        />
        <Text style={styles.note}>{USAGE_HINT}</Text>

        <Heading>reset</Heading>
        <ActionRow title="reset all settings" onPress={confirmReset} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  brand: { ...type.body, color: label.primary, letterSpacing: 6 },
  done: { ...type.body },
  pressed: { opacity: 0.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg },
  note: {
    ...type.tiny,
    color: label.tertiary,
    lineHeight: 16,
    marginTop: space.sm,
  },
});
