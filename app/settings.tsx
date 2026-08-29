import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBilling } from '@/billing/BillingContext';
import { backdropNeedsFounder, toneNeedsFounder } from '@/billing/catalog';
import { FacePicker } from '@/clock/FacePicker';
import { useSettings } from '@/clock/SettingsContext';
import type {
  BackdropId,
  BackdropTone,
  WaveScale,
  WaveSpeed,
} from '@/clock/settings';
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
import { openNotificationAccessSettings } from '@/media/nowPlayingSource';
import {
  resolveNowPlayingEndpoint,
  useNowPlaying,
} from '@/media/useNowPlaying';

const BACKDROP_NAMES: readonly Choice<BackdropId>[] = [
  { id: 'void', name: 'void' },
  { id: 'horizon', name: 'horizon' },
  { id: 'stars', name: 'stars' },
  { id: 'dither', name: 'dither' },
  { id: 'wave', name: 'wave' },
  { id: 'grid', name: 'grid' },
  { id: 'scan', name: 'scan' },
  { id: 'rain', name: 'rain' },
];

/** Backdrops that animate, and so take the speed control. */
const ANIMATED: readonly BackdropId[] = ['wave', 'rain'];

const WAVE_SPEEDS: readonly Choice<WaveSpeed>[] = [
  { id: 'still', name: 'still' },
  { id: 'slow', name: 'slow' },
  { id: 'medium', name: 'medium' },
  { id: 'fast', name: 'fast' },
];

const WAVE_SCALES: readonly Choice<WaveScale>[] = [
  { id: 'fine', name: 'fine' },
  { id: 'medium', name: 'medium' },
  { id: 'coarse', name: 'coarse' },
];

const TONE_NAMES: readonly Choice<ToneId>[] = TONES.map((tone) => ({
  id: tone.id,
  name: tone.name,
}));

const AUDIO_HINT =
  'android reads the device media session directly once notification access ' +
  'is granted. the endpoint is the fallback, and the only option on ios: any ' +
  'url returning {"title":"...","artist":"...","playing":true}, such as a ' +
  'playerctl or mpris wrapper on the machine doing the playing.';

function sourceStatus(
  mode: 'none' | 'live' | 'stale' | undefined,
  from: 'device' | 'endpoint' | 'none' | undefined,
  warning: string | undefined,
): string {
  if (mode === 'live') return `live via ${from}`;
  if (mode === 'stale') return `unreachable - ${warning ?? 'unknown error'}`;
  return 'no source';
}

export default function SettingsScreen() {
  const { settings, tone, update, reset } = useSettings();
  const { founder } = useBilling();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const now = useNow('second');

  // Locked options stay pickable — choosing one is how you see it, complete
  // with the watermark that comes with not having paid for it.
  const backdrops = useMemo<readonly Choice<BackdropId>[]>(
    () =>
      BACKDROP_NAMES.map((choice) => ({
        ...choice,
        locked: !founder && backdropNeedsFounder(choice.id),
      })),
    [founder],
  );

  const tones = useMemo<readonly Choice<ToneId>[]>(
    () =>
      TONE_NAMES.map((choice) => ({
        ...choice,
        locked: !founder && toneNeedsFounder(choice.id),
      })),
    [founder],
  );

  // The same list, plus 'match'. Built from `tones` so the lock marker cannot
  // drift between the clock's colour and the backdrop's.
  const backdropTones = useMemo<readonly Choice<BackdropTone>[]>(
    () => [
      { id: 'match', name: 'match' },
      ...tones.map((choice) => ({ ...choice, id: choice.id as BackdropTone })),
    ],
    [tones],
  );

  // Mirrors the kiosk's own source, so the status line reflects the real
  // result of whatever endpoint is currently typed in.
  const nowPlaying = useNowPlaying(
    resolveNowPlayingEndpoint(settings.nowPlayingEndpoint),
    true,
  );

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
          options={tones}
          value={settings.tone}
          onChange={(next) => update({ tone: next })}
          tone={tone}
        />

        <Heading>backdrop</Heading>
        <ChoiceRow
          options={backdrops}
          value={settings.backdrop}
          onChange={(backdrop) => update({ backdrop })}
          tone={tone}
        />
        <Text style={styles.note}>
          horizon, stars, dither, grid and scan shift with the time of day.
          wave is a perlin noise field and rain is falling glyph columns; both
          take a speed.
          {!founder && ' starred options need the founder pack.'}
        </Text>

        <ChoiceRow
          options={backdropTones}
          value={settings.backdropTone}
          onChange={(backdropTone) => update({ backdropTone })}
          tone={tone}
        />
        <Text style={styles.note}>
          backdrop colour. match follows the clock's tone.
        </Text>

        {ANIMATED.includes(settings.backdrop) && (
          <>
            <Heading>{settings.backdrop} speed</Heading>
            <ChoiceRow
              options={WAVE_SPEEDS}
              value={settings.waveSpeed}
              onChange={(waveSpeed) => update({ waveSpeed })}
              tone={tone}
            />
          </>
        )}

        {settings.backdrop === 'wave' && (
          <>
            <Heading>wave noise</Heading>
            <ChoiceRow
              options={WAVE_SCALES}
              value={settings.waveScale}
              onChange={(waveScale) => update({ waveScale })}
              tone={tone}
            />
            <Text style={styles.note}>
              fine is tight and busy; coarse rolls in broad bands.
            </Text>
          </>
        )}

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
          title="audio bar"
          hint="now playing, and a swipeable volume control"
          checked={settings.showMedia}
          onChange={(showMedia) => update({ showMedia })}
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

        <Heading>now playing</Heading>
        <TextRow
          title="endpoint"
          value={settings.nowPlayingEndpoint}
          placeholder="https://..."
          onChangeText={(nowPlayingEndpoint) => update({ nowPlayingEndpoint })}
        />
        <StatusRow
          title="source"
          value={sourceStatus(
            nowPlaying.result?.mode,
            nowPlaying.result?.from,
            nowPlaying.result?.warning,
          )}
        />
        <StatusRow title="on this device" value={nowPlaying.source.reason} />
        {nowPlaying.source.needsPermission && (
          <ActionRow
            title="grant notification access"
            onPress={openNotificationAccessSettings}
          />
        )}
        <Text style={styles.note}>{AUDIO_HINT}</Text>

        <Heading>founder</Heading>
        <StatusRow
          title="founder pack"
          value={founder ? 'unlocked' : 'not bought'}
        />
        <ActionRow
          title={founder ? 'what the pack includes' : 'unlock the founder pack'}
          onPress={() => router.push('/founder')}
        />

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
