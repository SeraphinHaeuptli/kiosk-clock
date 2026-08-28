import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StatusBar as SystemStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { Backdrop } from './Backdrop';
import { BurnInGuard } from './BurnInGuard';
import { ClockFace } from './ClockFace';
import { useSettings } from './SettingsContext';
import { isNight } from './settings';

const KEEP_AWAKE_TAG = 'kiosk-clock';
const CHROME_TIMEOUT_MS = 4_000;
const NIGHT_OPACITY = 0.45;
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

export function KioskScreen() {
  const { settings, tone, ready } = useSettings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Only pay for a per-second re-render when something actually moves each
  // second: the seconds readout, or the analog hands.
  const now = useNow(
    settings.showSeconds || settings.face === 'analog' ? 'second' : 'minute',
  );

  const nowPlaying = useNowPlaying(
    resolveNowPlayingEndpoint(settings.nowPlayingEndpoint),
    settings.showMedia,
  );
  const volume = useVolume(settings.showMedia);

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
  useFocusEffect(
    useCallback(() => {
      SystemStatusBar.setHidden(true, 'fade');
      if (Platform.OS === 'android') NavigationBar.setHidden(true);

      return () => {
        SystemStatusBar.setHidden(false, 'fade');
        if (Platform.OS === 'android') NavigationBar.setHidden(false);
      };
    }, []),
  );

  // Hiding once on focus is not enough. Android restores the system bars when
  // the window changes configuration, so rotating the device — or flipping the
  // landscape lock, which rotates it — brings them straight back. Re-assert
  // whenever the window changes shape.
  useEffect(() => {
    SystemStatusBar.setHidden(true, 'fade');
    if (Platform.OS === 'android') NavigationBar.setHidden(true);
  }, [width, height, settings.landscape]);

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
  const shouldDim = settings.nightDim && isNight(now);

  useEffect(() => {
    Animated.timing(dim, {
      toValue: shouldDim ? NIGHT_OPACITY : 1,
      duration: duration.slow,
      useNativeDriver: true,
    }).start();
  }, [dim, shouldDim]);

  /* -- Tap-to-reveal chrome ------------------------------------------------ */

  const chrome = useRef(new Animated.Value(0)).current;
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

  // One number drives every face's typography, derived from the shorter axis so
  // the face fits in portrait and landscape alike.
  const faceSize = Math.min(width * 0.28, height * 0.3);

  if (!ready) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dim }]}>
        <Backdrop
          backdrop={settings.backdrop}
          // Resolved here rather than inside the backdrop, so the backdrop
          // never needs to know the clock's own tone exists.
          tone={
            settings.backdropTone === 'match'
              ? tone
              : toneOf(settings.backdropTone)
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
        <Animated.View
          pointerEvents={armed ? 'auto' : 'none'}
          style={[styles.header, { opacity: chrome }]}
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

        <Animated.View
          pointerEvents="none"
          style={[styles.center, { opacity: dim }]}
        >
          <BurnInGuard enabled={settings.burnInGuard} style={styles.faceBlock}>
            <ClockFace
              now={now}
              settings={settings}
              tone={tone}
              size={faceSize}
            />
            {settings.showDate && (
              <Text style={styles.date} allowFontScaling={false}>
                {longDate(now)}
              </Text>
            )}
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
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.kiosk },
  content: { flex: 1, flexDirection: 'column' },
  header: { flexDirection: 'row', justifyContent: 'flex-end' },
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
