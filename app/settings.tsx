import { useMemo, useState } from 'react';
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
  ShuffleMode,
  ShufflePeriod,
  WaveScale,
  WaveSpeed,
  WeatherPosition,
} from '@/clock/settings';
import { lookFor } from '@/clock/shuffle';
import { usePresets, MAX_PRESETS, type Preset } from '@/clock/presets';
import { countdownLine, offsetName } from '@/clock/extras';
import { pad2 } from '@/core/format';
import { useNow } from '@/core/useNow';
import { TONES, label, surface, type ToneId } from '@/design/palette';
import { space, type } from '@/design/tokens';
import { HueRail } from '@/ui/HueRail';
import {
  ActionRow,
  CheckRow,
  ChoiceRow,
  Heading,
  StatusRow,
  StepRow,
  TextRow,
  type Choice,
} from '@/ui/Terminal';
import { openNotificationAccessSettings } from '@/media/nowPlayingSource';
import {
  resolveNowPlayingEndpoint,
  useNowPlaying,
} from '@/media/useNowPlaying';
import { useWeather, type WeatherStatus } from '@/weather/useWeather';
import type { TemperatureUnit } from '@/weather/weather';

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

const SHUFFLE_MODES: readonly Choice<ShuffleMode>[] = [
  { id: 'off', name: 'off' },
  { id: 'backdrops', name: 'backdrops' },
  { id: 'everything', name: 'everything' },
];

const SHUFFLE_PERIODS: readonly Choice<ShufflePeriod>[] = [
  { id: 'quarter', name: 'quarter hour' },
  { id: 'hour', name: 'hour' },
  { id: 'day', name: 'day' },
];

const UNITS: readonly Choice<TemperatureUnit>[] = [
  { id: 'celsius', name: 'celsius' },
  { id: 'fahrenheit', name: 'fahrenheit' },
];

/**
 * Named for the corners rather than for an edge, because that is what
 * actually moves: the readout keeps its shape and swaps which pair of corners
 * it is pinned to.
 *
 * Not marked locked, unlike the rows around it. The position is a layout
 * preference rather than any of the weather itself, and putting an asterisk
 * on it would suggest the founder pack sells somewhere to put a temperature.
 */
const WEATHER_POSITIONS: readonly Choice<WeatherPosition>[] = [
  { id: 'top', name: 'top corners' },
  { id: 'bottom', name: 'bottom corners' },
];

/**
 * Attribution, which is not decoration: both services are free to use on the
 * condition that they are credited, and this line is where that is paid.
 */
const WEATHER_HINT =
  'a city, a postcode or an address — looked up once and remembered. ' +
  'forecast by the norwegian meteorological institute (met.no), places by ' +
  'openstreetmap nominatim, both under cc by 4.0.';

const AUDIO_HINT =
  'android reads the device media session directly once notification access ' +
  'is granted. the endpoint is the fallback, and the only option on ios: any ' +
  'url returning {"title":"...","artist":"...","playing":true}, such as a ' +
  'playerctl or mpris wrapper on the machine doing the playing.';

/** "22:00" from a bare hour. */
function hourLabel(hour: number): string {
  return `${pad2(hour)}:00`;
}

/** A row that applies its look on the name, and deletes on the cross. */
function PresetRow({
  preset,
  tone,
  onApply,
  onRemove,
}: {
  preset: Preset;
  tone: ReturnType<typeof useSettings>['tone'];
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.presetRow}>
      <Pressable
        onPress={onApply}
        accessibilityRole="button"
        accessibilityLabel={`apply ${preset.name}`}
        style={({ pressed }) => [styles.presetName, pressed && styles.pressed]}
      >
        <Text style={styles.presetText} numberOfLines={1}>
          {`> ${preset.name}`}
        </Text>
        <Text style={styles.presetHint} numberOfLines={1}>
          {`${preset.look.face} · ${preset.look.backdrop} · ${preset.look.tone}`}
        </Text>
      </Pressable>

      <Pressable
        onPress={onRemove}
        hitSlop={space.md}
        accessibilityRole="button"
        accessibilityLabel={`delete ${preset.name}`}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={[styles.presetDelete, { color: tone.dim }]}>[x]</Text>
      </Pressable>
    </View>
  );
}

function weatherStatus(status: WeatherStatus, place: string | null): string {
  switch (status.kind) {
    case 'off':
      return 'no location set';
    case 'resolving':
      return 'looking up the location...';
    case 'live':
      return place ? `live for ${place}` : 'live';
    case 'failed':
      return `unavailable - ${status.reason}`;
  }
}

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
  const {
    presets,
    save: savePreset,
    remove: removePreset,
    clear: clearPresets,
  } = usePresets();
  const [presetName, setPresetName] = useState('');

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

  const shuffleModes = useMemo<readonly Choice<ShuffleMode>[]>(
    () =>
      SHUFFLE_MODES.map((choice) => ({
        ...choice,
        locked: !founder && choice.id !== 'off',
      })),
    [founder],
  );

  // What the kiosk behind this modal is showing this minute, so the shuffle
  // section reports the real thing rather than only what was picked.
  const shown = lookFor(settings, now);

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

  // Mirrors the kiosk's own weather, so the status line reports the real
  // result of whatever is currently typed in the field below it.
  const weather = useWeather(settings.weatherPlace, settings.showWeather);

  const confirmReset = () => {
    Alert.alert(
      'reset all settings?',
      'the clock returns to its defaults, and saved presets and the remembered weather location are cleared. the founder pack is kept.',
      [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'reset',
        style: 'destructive',
        onPress: () => {
          reset();
          clearPresets();
        },
      },
      ],
    );
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
        {/* Shown whenever the custom tone is in play, from either end: the
            clock's own colour or the backdrop's override. */}
        {(settings.tone === 'custom' || settings.backdropTone === 'custom') && (
          <HueRail
            hue={settings.customHue}
            onChange={(customHue) => update({ customHue })}
          />
        )}

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

        <Heading>presets</Heading>
        {presets.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            tone={tone}
            onApply={() => update(preset.look)}
            onRemove={() => removePreset(preset.id)}
          />
        ))}
        {presets.length < MAX_PRESETS ? (
          <>
            <TextRow
              title="save this look as"
              value={presetName}
              placeholder="bedside"
              onChangeText={setPresetName}
              kind="text"
            />
            <ActionRow
              title="save"
              onPress={() => {
                savePreset(presetName, settings);
                setPresetName('');
              }}
            />
          </>
        ) : (
          <Text style={styles.note}>
            {`${MAX_PRESETS} saved, which is the limit. delete one to make room.`}
          </Text>
        )}
        <Text style={styles.note}>
          a preset holds the look — face, colour, backdrop — and nothing else.
          the night schedule, the weather location and the rest belong to the
          device rather than to the look.
        </Text>

        <Heading>shuffle</Heading>
        <ChoiceRow
          options={shuffleModes}
          value={settings.shuffle}
          onChange={(shuffle) => update({ shuffle })}
          tone={tone}
        />
        {settings.shuffle !== 'off' && (
          <>
            <ChoiceRow
              options={SHUFFLE_PERIODS}
              value={settings.shufflePeriod}
              onChange={(shufflePeriod) => update({ shufflePeriod })}
              tone={tone}
            />
            <StatusRow
              title="showing now"
              value={`${shown.face} on ${shown.backdrop}`}
            />
          </>
        )}
        <Text style={styles.note}>
          rotates the look on a timer. what you picked above is kept — turn
          shuffle off and the clock goes straight back to it.
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
          title="audio bar"
          hint="now playing, and a swipeable volume control"
          checked={settings.showMedia}
          onChange={(showMedia) => update({ showMedia })}
          tone={tone}
        />
        <CheckRow
          title="battery"
          hint="charge level under the date, for a phone left on a dock"
          checked={settings.showBattery}
          onChange={(showBattery) => update({ showBattery })}
          tone={tone}
          locked={!founder}
        />
        <CheckRow
          title="battery gauge"
          hint="a charge meter in the corner of the audio bar"
          checked={settings.showBatteryMeter}
          onChange={(showBatteryMeter) => update({ showBatteryMeter })}
          tone={tone}
          locked={!founder}
        />

        <Heading>kiosk</Heading>
        <CheckRow
          title="keep screen on"
          checked={settings.keepAwake}
          onChange={(keepAwake) => update({ keepAwake })}
          tone={tone}
        />
        <CheckRow
          title="system bars"
          hint="keeps Android's status and navigation bars on screen"
          checked={settings.showSystemBars}
          onChange={(showSystemBars) => update({ showSystemBars })}
          tone={tone}
        />
        <CheckRow
          title="night dimming"
          hint="fades the display through the hours you set"
          checked={settings.nightDim}
          onChange={(nightDim) => update({ nightDim })}
          tone={tone}
        />
        {settings.nightDim && (
          <>
            <StepRow
              title="from"
              value={hourLabel(settings.nightFrom)}
              onStep={(step) =>
                update({ nightFrom: (settings.nightFrom + step + 24) % 24 })
              }
              tone={tone}
              locked={!founder}
            />
            <StepRow
              title="until"
              value={hourLabel(settings.nightTo)}
              onStep={(step) =>
                update({ nightTo: (settings.nightTo + step + 24) % 24 })
              }
              tone={tone}
              locked={!founder}
            />
            <StepRow
              title="brightness"
              value={`${Math.round(settings.nightLevel * 100)}%`}
              onStep={(step) =>
                update({
                  nightLevel: Math.min(
                    1,
                    Math.max(0.1, settings.nightLevel + step * 0.05),
                  ),
                })
              }
              tone={tone}
              locked={!founder}
            />
          </>
        )}
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

        <Heading>weather</Heading>
        <CheckRow
          title="weather corners"
          hint="temperature and conditions across the top of the clock"
          checked={settings.showWeather}
          onChange={(showWeather) => update({ showWeather })}
          tone={tone}
          locked={!founder}
        />
        <TextRow
          title="location"
          value={settings.weatherPlace}
          placeholder="zurich"
          onChangeText={(weatherPlace) => update({ weatherPlace })}
          kind="text"
        />
        <ChoiceRow
          options={UNITS}
          value={settings.weatherUnit}
          onChange={(weatherUnit) => update({ weatherUnit })}
          tone={tone}
        />
        <CheckRow
          title="detail"
          hint="wind, rain and tomorrow, from the forecast already fetched"
          checked={settings.weatherDetail}
          onChange={(weatherDetail) => update({ weatherDetail })}
          tone={tone}
          locked={!founder}
        />
        <ChoiceRow
          options={WEATHER_POSITIONS}
          value={settings.weatherPosition}
          onChange={(weatherPosition) => update({ weatherPosition })}
          tone={tone}
        />
        <StatusRow
          title="source"
          value={weatherStatus(weather.status, weather.place?.label ?? null)}
        />
        <Text style={styles.note}>{WEATHER_HINT}</Text>

        <Heading>second clock</Heading>
        <CheckRow
          title="second time"
          hint="another zone on the line under the date"
          checked={settings.showSecondClock}
          onChange={(showSecondClock) => update({ showSecondClock })}
          tone={tone}
          locked={!founder}
        />
        {settings.showSecondClock && (
          <>
            <TextRow
              title="label"
              value={settings.secondClockLabel}
              placeholder="nyc"
              onChangeText={(secondClockLabel) => update({ secondClockLabel })}
              kind="text"
            />
            <StepRow
              title="offset"
              value={offsetName(settings.secondClockOffset)}
              onStep={(step) =>
                update({
                  secondClockOffset: Math.min(
                    840,
                    Math.max(-720, settings.secondClockOffset + step * 15),
                  ),
                })
              }
              tone={tone}
            />
          </>
        )}
        <Text style={styles.note}>
          a fixed offset from utc, in quarter hours. fixed rather than a named
          zone, so it never depends on a timezone database that may not be in
          the build — but it does not follow anyone's daylight saving, so a
          city that observes it needs moving twice a year.
        </Text>

        <Heading>countdown</Heading>
        <TextRow
          title={founder ? 'date' : 'date*'}
          value={settings.countdownDate}
          placeholder="2026-12-25"
          onChangeText={(countdownDate) => update({ countdownDate })}
          kind="text"
        />
        <TextRow
          title="label"
          value={settings.countdownLabel}
          placeholder="christmas"
          onChangeText={(countdownLabel) => update({ countdownLabel })}
          kind="text"
        />
        <StatusRow
          title="shows"
          value={
            countdownLine(
              settings.countdownDate,
              settings.countdownLabel,
              now,
            ) ?? (settings.countdownDate ? 'not a date' : 'nothing')
          }
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
  presetRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  presetName: { flexShrink: 1 },
  presetText: { ...type.body, color: label.primary },
  presetHint: { ...type.tiny, color: label.tertiary, marginTop: 2 },
  presetDelete: { ...type.body },
  note: {
    ...type.tiny,
    color: label.tertiary,
    lineHeight: 16,
    marginTop: space.sm,
  },
});
