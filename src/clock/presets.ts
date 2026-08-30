import { useCallback, useEffect, useState } from 'react';

import { asyncStorageAdapter, jsonSlot } from '@/core/storage';

import { decodeSettings, type ClockSettings } from './settings';

/**
 * Saved looks.
 *
 * A preset stores the *look* and nothing else — not keep-awake, not the night
 * schedule, not the weather location. Those are properties of where the device
 * lives rather than of how it looks, and restoring "bedside" should not
 * silently move somebody's weather to another city.
 */

/** The fields a preset captures. Everything else belongs to the device. */
export const LOOK_KEYS = [
  'face',
  'tone',
  'backdrop',
  'backdropTone',
  'waveSpeed',
  'waveScale',
  'customHue',
] as const;

export type LookFields = Pick<ClockSettings, (typeof LOOK_KEYS)[number]>;

export interface Preset {
  id: string;
  name: string;
  look: LookFields;
}

/**
 * Enough for the rooms a phone actually sits in, and few enough that the list
 * stays a list rather than becoming a screen of its own.
 */
export const MAX_PRESETS = 8;
const NAME_LIMIT = 20;

export function lookOf(settings: ClockSettings): LookFields {
  const look = {} as Record<string, unknown>;
  for (const key of LOOK_KEYS) look[key] = settings[key];
  return look as LookFields;
}

/**
 * A stored look, validated by running it back through the settings decoder.
 *
 * Reusing `decodeSettings` rather than re-checking each field here is what
 * keeps a preset saved by an older build loadable: it already falls back per
 * field, and already knows about faces and backdrops that no longer exist.
 */
function decodeLook(raw: unknown): LookFields {
  return lookOf(decodeSettings(raw));
}

function decodePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_PRESETS)
    .map((entry, index) => {
      const record =
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)
          : {};
      const name =
        typeof record.name === 'string' ? record.name.trim().slice(0, NAME_LIMIT) : '';

      return {
        id: typeof record.id === 'string' ? record.id : `preset-${index}`,
        name: name || `look ${index + 1}`,
        look: decodeLook(record.look),
      };
    });
}

const slot = jsonSlot(asyncStorageAdapter, 'kiosk.presets.v1', decodePresets);

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    slot.load().then((stored) => {
      if (!active) return;
      setPresets(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const write = useCallback((next: Preset[]) => {
    setPresets(next);
    slot.save(next);
  }, []);

  const save = useCallback(
    (name: string, settings: ClockSettings) => {
      const clean = name.trim().slice(0, NAME_LIMIT) || 'untitled';

      setPresets((current) => {
        const look = lookOf(settings);
        // Saving over a name that already exists replaces it rather than
        // making a second entry you then have to tell apart.
        const existing = current.findIndex(
          (preset) => preset.name.toLowerCase() === clean.toLowerCase(),
        );

        const next =
          existing >= 0
            ? current.map((preset, index) =>
                index === existing ? { ...preset, look } : preset,
              )
            : [
                ...current,
                { id: `${Date.now().toString(36)}`, name: clean, look },
              ].slice(-MAX_PRESETS);

        slot.save(next);
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      setPresets((current) => {
        const next = current.filter((preset) => preset.id !== id);
        slot.save(next);
        return next;
      });
    },
    [],
  );

  return { presets, ready, save, remove, write };
}
