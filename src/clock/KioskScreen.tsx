import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StatusBar as SystemStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBilling } from '@/billing/BillingContext';
import { usesFounderContent } from '@/billing/catalog';
import { Watermark } from '@/billing/Watermark';
import { daylight } from '@/core/daylight';
import { longDate } from '@/core/format';
import { useNow } from '@/core/useNow';
import { label, surface, toneOf } from '@/design/palette';
import { duration, hairline, space, type } from '@/design/tokens';
import { MenuGlyph } from '@/ui/Terminal';
import { MediaBar } from '@/media/MediaBar';
import {
  resolveNowPlayingEndpoint,
  useNowPlaying,
} from '@/media/useNowPlaying';
import { useVolume } from '@/media/useVolume';
import { useBattery } from '@/power/useBattery';
import { WeatherNow, WeatherPlace } from '@/weather/WeatherCorners';
import { useWeather } from '@/weather/useWeather';

import { Backdrop } from './Backdrop';
import { BurnInGuard } from './BurnInGuard';
import { ClockFace } from './ClockFace';
import { InfoLine } from './InfoLine';
import { batteryLine, countdownLine, offsetClock, offsetName } from './extras';
import { faceOf } from './faces';
import { useSettings } from './SettingsContext';
import { lookFor } from './shuffle';
import { isNight } from './settings';

const KEEP_AWAKE_TAG = 'kiosk-clock';
const CHROME_TIMEOUT_MS = 4_000;
/**
 * The face scales with the display, but the audio bar is a fixed-density
 * readout: stretched across a landscape phone or a desktop it strands the
 * track name at one edge and the level at the other, and turns a small swipe
 * into a huge volume jump.
 */
const METER_MAX_WIDTH = 560;
/**
 * Quantising daylight lets the backdrop memo hold: it redraws a few times an
 * hour instead of once a second alongside the clock.
 */
const LIGHT_STEPS = 48;
/** Share of the available box a face may occupy, leaving it room to breathe. */
const FACE_FILL = 0.94;
/** Height the date line and its margin take out of that box. */
const DATE_ALLOWANCE = 44;
/** Floor, so a very short box still renders something legible. */
const MIN_FACE_SIZE = 14;

/**
 * Both system bars, together.
 *
 * Android surfaces them as one immersive state and restores them as one, so
 * splitting this in two would mostly buy a combination nobody wants — a
 * full-bleed clock wearing a status bar and no navigation bar reads as a
 * layout bug rather than as a choice.
 */
function setSystemBarsHidden(hidden: boolean) {
  SystemStatusBar.setHidden(hidden, 'fade');
  if (Platform.OS === 'android') NavigationBar.setHidden(hidden);
}

export function KioskScreen() {
  const { settings, tone, ready } = useSettings();
  const billing = useBilling();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /**
   * Two clocks, because which face is shown decides how fast the other has to
   * tick and shuffle decides which face is shown.
   *
   * The shuffle resolves off a minute clock — its shortest period is a quarter
   * hour, so a minute is exact — and the display clock's rate is then chosen
   * from the face that came out. Reading the rate off `settings.face` instead
   * was wrong the moment shuffle could deal an analog face the settings had
   * never selected: its second hand jumped once a minute.
   */
  const minute = useNow('minute');
  const look = lookFor(settings, minute);

  // Only pay for a per-second re-render when something actually moves each
  // second: the seconds readout, or the analog hands.
  const now = useNow(
    settings.showSeconds || look.face === 'analog' ? 'second' : 'minute',
  );

  // ClockFace is memoised and reads the face off the settings object, so it
  // needs one carrying the shuffled face — rebuilt only when that changes,
  // not on every tick.
  const faceSettings = useMemo(
    () => (look.face === settings.face ? settings : { ...settings, face: look.face }),
    [settings, look.face],
  );

  const nowPlaying = useNowPlaying(
    resolveNowPlayingEndpoint(settings.nowPlayingEndpoint),
    settings.showMedia,
  );
  const volume = useVolume(settings.showMedia);
  const weather = useWeather(settings.weatherPlace, settings.showWeather);
  const battery = useBattery(settings.showBattery);

  /* -- Kiosk behaviours ---------------------------------------------------- */

  useEffect(() => {
    if (!settings.keepAwake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [settings.keepAwake]);

  // Android draws system bars over a full-bleed clock, which it should not
  // have to share. Tied to focus rather than mount: they come back when
  // settings opens, so the app stays navigable.
  const barsHidden = !settings.showSystemBars;

  useFocusEffect(
    useCallback(() => {
      setSystemBarsHidden(barsHidden);

      // Restored on the way out whatever the setting says, because the screens
      // this hands off to are ordinary ones that need a way back.
      return () => setSystemBarsHidden(false);
    }, [barsHidden]),
  );

  // Hiding once on focus is not enough. Android restores the system bars when
  // the window changes configuration, so rotating the device — or flipping the
  // landscape lock, which rotates it — brings them straight back. Re-assert
  // whenever the window changes shape.
  //
  // Re-asserting a *visible* bar is not redundant either: the setting can be
  // turned off while this screen is the one behind the modal, and the effect
  // that restored them ran before it changed.
  useEffect(() => {
    setSystemBarsHidden(barsHidden);
  }, [barsHidden, width, height, settings.landscape]);

  useEffect(() => {
    ScreenOrientation.lockAsync(
      settings.landscape
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {
      // Orientation locking is unavailable on some devices; not fatal.
    });
  }, [settings.landscape]);

  /* -- Night dimming ------------------------------------------------------- */

  const dim = useRef(new Animated.Value(1)).current;
  const shouldDim =
    settings.nightDim && isNight(now, settings.nightFrom, settings.nightTo);

  useEffect(() => {
    Animated.timing(dim, {
      toValue: shouldDim ? settings.nightLevel : 1,
      duration: duration.slow,
      useNativeDriver: true,
    }).start();
  }, [dim, shouldDim, settings.nightLevel]);

  /* -- Tap-to-reveal chrome ------------------------------------------------ */

  const chrome = useRef(new Animated.Value(0)).current;
  /**
   * The right corner holds two things that both want it: the place and range
   * when the clock is just sitting there, and the settings button once you
   * touch it. Rather than crowd them side by side, they trade — one fades out
   * exactly as the other fades in, off the same value.
   */
  const chromeOut = chrome.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const [armed, setArmed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reveal = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setArmed(true);
    Haptics.selectionAsync().catch(() => {});

    Animated.timing(chrome, {
      toValue: 1,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();

    hideTimer.current = setTimeout(() => {
      Animated.timing(chrome, {
        toValue: 0,
        duration: duration.base,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setArmed(false);
      });
    }, CHROME_TIMEOUT_MS);
  }, [chrome]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  /* -- Layout -------------------------------------------------------------- */

  // Measured rather than derived from the window: the face has to fit the box
  // left over after the header, the date and the audio bar, which is what
  // actually ran out in landscape.
  const [box, setBox] = useState({ width: width, height: height * 0.45 });
  const onCenterLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    if (w > 0 && h > 0) setBox({ width: w, height: h });
  };

  /**
   * Whether the clock on screen right now is asking for money.
   *
   * Gated on the billing layer being ready as well as unowned: entitlements
   * load asynchronously, and defaulting to "locked" for those few frames
   * would flash the watermark across a paying customer's clock on every cold
   * start.
   */
  const watermarked =
    billing.ready && !billing.founder && usesFounderContent(settings, look);

  const face = faceOf(look.face);
  const dateAllowance = settings.showDate ? DATE_ALLOWANCE : 0;
  const faceSize = Math.max(
    MIN_FACE_SIZE,
    Math.min(
      (box.width * FACE_FILL) / face.widthRatio,
      ((box.height - dateAllowance) * FACE_FILL) / face.heightRatio,
    ),
  );

  if (!ready) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dim }]}>
        <Backdrop
          backdrop={look.backdrop}
          // Resolved here rather than inside the backdrop, so the backdrop
          // never needs to know the clock's own tone exists.
          tone={
            settings.backdropTone === 'match'
              ? tone
              : toneOf(settings.backdropTone, settings.customHue)
          }
          light={Math.round(daylight(now) * LIGHT_STEPS) / LIGHT_STEPS}
          waveSpeed={settings.waveSpeed}
          waveScale={settings.waveScale}
        />
      </Animated.View>

      {/* Sits below the chrome so a tap anywhere else reveals it. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={reveal}
        accessibilityRole="button"
        accessibilityLabel="Show clock controls"
      />

      <View
        pointerEvents="box-none"
        style={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.xl,
            paddingHorizontal: space.xl,
          },
        ]}
      >
        <BurnInGuard enabled={settings.burnInGuard} style={styles.header}>
          {/* Always rendered, empty or not: it is the left half of the row,
              and without it the right half stops being in the corner. */}
          <Animated.View pointerEvents="none" style={{ opacity: dim }}>
            <WeatherNow
              weather={weather.weather}
              unit={settings.weatherUnit}
              detail={settings.weatherDetail}
              tone={tone}
            />
          </Animated.View>

          <View style={styles.headerRight}>
            <Animated.View
              pointerEvents="none"
              style={{ opacity: Animated.multiply(dim, chromeOut) }}
            >
              <WeatherPlace
                weather={weather.weather}
                place={weather.place?.label ?? ''}
                unit={settings.weatherUnit}
                detail={settings.weatherDetail}
              />
            </Animated.View>

            <Animated.View
              pointerEvents={armed ? 'auto' : 'none'}
              style={[styles.menuSlot, { opacity: chrome }]}
            >
              <Pressable
                onPress={() => router.push('/settings')}
                style={({ pressed }) => [
                  styles.controlButton,
                  pressed && styles.controlButtonPressed,
                ]}
                hitSlop={space.md}
                accessibilityRole="button"
                accessibilityLabel="Clock settings"
              >
                <MenuGlyph size={16} color={label.primary} />
              </Pressable>
            </Animated.View>
          </View>
        </BurnInGuard>

        <Animated.View
          pointerEvents="none"
          onLayout={onCenterLayout}
          style={[styles.center, { opacity: dim }]}
        >
          <BurnInGuard enabled={settings.burnInGuard} style={styles.faceBlock}>
            <ClockFace
              now={now}
              settings={faceSettings}
              tone={tone}
              size={faceSize}
            />
            {settings.showDate && (
              <Text style={styles.date} allowFontScaling={false}>
                {longDate(now)}
              </Text>
            )}

            <InfoLine
              items={[
                settings.showSecondClock
                  ? `${settings.secondClockLabel.trim() || offsetName(settings.secondClockOffset)} ${offsetClock(now, settings.secondClockOffset, settings.hour12)}`
                  : null,
                countdownLine(
                  settings.countdownDate,
                  settings.countdownLabel,
                  now,
                ),
                battery.level === null
                  ? null
                  : batteryLine(battery.level, battery.charging),
              ]}
            />
          </BurnInGuard>
        </Animated.View>

        {settings.showMedia && (
          // Interactive, unlike the rest of the face: the bar has to receive
          // the swipe rather than let it fall through to the reveal tap.
          <Animated.View style={[styles.meter, { opacity: dim }]}>
            <MediaBar
              tone={tone}
              volume={volume.level}
              controllable={volume.controllable}
              onChange={volume.set}
              onDragChange={volume.setDragging}
              nowPlaying={nowPlaying.result}
              onControl={nowPlaying.control}
            />
          </Animated.View>
        )}
      </View>

      {/*
        Last in the tree, and outside every dimming layer, so nothing draws
        over it and night dimming cannot fade it away.
      */}
      {watermarked && (
        <Watermark tone={tone} onPress={() => router.push('/founder')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.kiosk },
  content: { flex: 1, flexDirection: 'column' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerRight: { alignItems: 'flex-end', minHeight: 40, minWidth: 40 },
  menuSlot: { position: 'absolute', top: 0, right: 0 },
  controlButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: hairline,
    borderColor: surface.line,
  },
  controlButtonPressed: { opacity: 0.55 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meter: { width: '100%', maxWidth: METER_MAX_WIDTH, alignSelf: 'center' },
  faceBlock: { alignItems: 'center' },
  date: {
    ...type.small,
    color: label.secondary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: space.xl,
  },
});
