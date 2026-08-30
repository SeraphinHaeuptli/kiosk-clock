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
    slot.load().then((stored) => {
      if (!active) return;
      setSettings(stored);
      setReady(true);
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

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    persist(DEFAULT_SETTINGS);
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
