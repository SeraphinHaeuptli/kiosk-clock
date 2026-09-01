import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AppState } from 'react-native';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';
import { clearPlaceCache } from '@/weather/useWeather';
import { toneOf, type Tone } from '@/design/palette';

import {
  DEFAULT_SETTINGS,
  decodeSettings,
  type ClockSettings,
} from './settings';

const slot = jsonSlot(asyncStorageAdapter, 'kiosk.settings.v1', decodeSettings);

interface SettingsValue {
  settings: ClockSettings;
  tone: Tone;
  /** False until stored settings have loaded, so nothing flashes defaults. */
  ready: boolean;
  update: (patch: Partial<ClockSettings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ClockSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ClockSettings | null>(null);

  useEffect(() => {
    let active = true;

    // `ready` is set from `finally` rather than from the success path. It gates
    // the whole kiosk, and the one thing worse than a clock that has lost its
    // settings is a clock that shows a black screen for as long as the app
    // stays open because the read never came back with anything.
    slot
      .load()
      .then((stored) => {
        if (active) setSettings(stored);
      })
      .catch(() => {
        // Defaults are already in state. There is nothing else to fall back to.
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // Writes are debounced so dragging a control doesn't hammer storage.
  const persist = useCallback((next: ClockSettings) => {
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      slot.save(next);
      pending.current = null;
    }, 250);
  }, []);

  /** Write whatever the debounce is still holding, now. */
  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pending.current) {
      slot.save(pending.current);
      pending.current = null;
    }
  }, []);

  /**
   * Android can kill a backgrounded app without warning, and the debounce used
   * to be cancelled on the way out rather than flushed — so a setting changed
   * within a quarter second of leaving the app was simply lost. Leaving the
   * foreground is the last reliable moment to write.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });

    return () => {
      subscription.remove();
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (patch: Partial<ClockSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /**
   * Settings, and the remembered weather location that belongs to them.
   *
   * The place cache is cleared here because nothing else owns it; saved presets
   * are cleared by the screen that holds their state, since clearing the store
   * from under a live list would leave rows on screen that no longer exist.
   * The founder entitlement is deliberately kept — resetting your preferences
   * should not look like losing a purchase.
   */
  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
    clearPlaceCache();
  }, [persist]);

  const value = useMemo<SettingsValue>(
    () => ({
      settings,
      tone: toneOf(settings.tone, settings.customHue),
      ready,
      update,
      reset,
    }),
    [settings, ready, update, reset],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error('useSettings must be used inside <SettingsProvider>');
  }
  return value;
}
