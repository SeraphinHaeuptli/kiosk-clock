import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, type Permission } from 'react-native';

import {
  hueBleCapabilities,
  isHueBleAvailable,
  lampsState,
  scanForLamps,
  watchLamps,
  type FoundLamp,
  type HueBleCapabilities,
  type LampsState,
} from '../../modules/hue-ble';

import { groupName, type Lamp } from './lights';
import { saveLamps, clearSource, useSource } from './store';

/**
 * Finding Hue lamps over Bluetooth, for the settings screen.
 *
 * Choosing a lamp stores it immediately rather than behind a confirm button,
 * because the bar behind this modal picks the change up at once: tapping a
 * lamp and watching the slider start working is the only proof that matters,
 * and it is the same gesture as undoing it.
 */

/** Long enough for a lamp across a room, short enough to stand still for. */
const SCAN_SECONDS = 6;

export type LampBusy = 'asking' | 'scanning' | null;

export interface LampSetup {
  /** False where there is no native client at all: the web, Expo Go. */
  available: boolean;
  capabilities: HueBleCapabilities;
  /** The lamps this phone is set up to drive. */
  chosen: readonly Lamp[];
  /** What the last scan turned up. */
  found: readonly FoundLamp[];
  /** Whether the chosen ones are actually answering. */
  live: LampsState;
  busy: LampBusy;
  problem: string | null;
  /** Ask for permission if needed, then look for lamps. */
  scan: () => void;
  /** Add or remove one lamp. */
  toggle: (lamp: FoundLamp) => void;
  forget: () => void;
}

const NOTHING: LampsState = {
  total: 0,
  connected: 0,
  on: false,
  brightness: null,
  problem: null,
  lamps: [],
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'the scan failed';
}

export function useLampSetup(): LampSetup {
  const { source } = useSource();
  const chosen = source?.kind === 'lamps' ? source.lamps : [];

  const [capabilities, setCapabilities] = useState<HueBleCapabilities>(
    hueBleCapabilities,
  );
  const [found, setFound] = useState<readonly FoundLamp[]>([]);
  const [live, setLive] = useState<LampsState>(lampsState);
  const [busy, setBusy] = useState<LampBusy>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // The connection itself belongs to the bar, which is live behind this
  // screen; this only listens in, so the rows can say which lamps answered.
  useEffect(() => watchLamps(setLive), []);

  const chosenRef = useRef<readonly Lamp[]>(chosen);
  chosenRef.current = chosen;

  /**
   * Lamps carry the name they were given in the Hue app, but only once one
   * has been connected to and asked. Until then all a scan has is whatever is
   * in the advertisement, which is usually the model. This quietly upgrades
   * the stored names the moment the real ones arrive.
   */
  useEffect(() => {
    const stored = chosenRef.current;
    if (stored.length === 0) return;

    let changed = false;
    const renamed = stored.map((lamp) => {
      const reported = live.lamps.find((it) => it.address === lamp.address)?.name;
      if (!reported || reported === lamp.name) return lamp;
      changed = true;
      return { ...lamp, name: groupName(reported, lamp.name) };
    });

    if (changed) void saveLamps(renamed);
  }, [live]);

  const look = useCallback(() => {
    setBusy('scanning');
    setProblem(null);

    scanForLamps(SCAN_SECONDS).then(
      (lamps) => {
        if (!alive.current) return;
        setBusy(null);
        setFound(lamps);
        if (lamps.length === 0) {
          setProblem(
            'no lamps answered — they have to be powered on and in the same room',
          );
        }
      },
      (error: unknown) => {
        if (!alive.current) return;
        setBusy(null);
        setProblem(describe(error));
      },
    );
  }, []);

  const scan = useCallback(() => {
    const now = hueBleCapabilities();
    setCapabilities(now);
    setProblem(null);

    if (!now.supported) {
      setProblem('this phone has no bluetooth le');
      return;
    }
    if (!now.enabled) {
      setProblem('switch bluetooth on first');
      return;
    }
    if (!now.canScan) {
      // The honest version of a silent failure: a scan below Android 12 needs
      // the location permission, and this app does not have one.
      setProblem('finding lamps needs android 12 or newer');
      return;
    }

    if (now.missingPermissions.length === 0) {
      look();
      return;
    }

    setBusy('asking');
    PermissionsAndroid.requestMultiple(
      now.missingPermissions as Permission[],
    ).then(
      (result) => {
        if (!alive.current) return;
        setCapabilities(hueBleCapabilities());

        const refused = Object.values(result).some(
          (answer) => answer !== PermissionsAndroid.RESULTS.GRANTED,
        );
        if (refused) {
          setBusy(null);
          setProblem(
            'bluetooth permission was refused — android settings, apps, kiosk, permissions',
          );
          return;
        }
        look();
      },
      () => {
        if (!alive.current) return;
        setBusy(null);
        setProblem('could not ask for bluetooth permission');
      },
    );
  }, [look]);

  const toggle = useCallback((lamp: FoundLamp) => {
    const stored = chosenRef.current;
    const already = stored.some((it) => it.address === lamp.address);

    const next = already
      ? stored.filter((it) => it.address !== lamp.address)
      : [...stored, { address: lamp.address, name: groupName(lamp.name, 'lamp') }];

    if (next.length === 0) {
      void clearSource();
      return;
    }
    void saveLamps(next);
  }, []);

  const forget = useCallback(() => {
    setFound([]);
    setProblem(null);
    void clearSource();
  }, []);

  return {
    available: isHueBleAvailable,
    capabilities,
    chosen,
    found,
    live: live ?? NOTHING,
    busy,
    problem,
    scan,
    toggle,
    forget,
  };
}
