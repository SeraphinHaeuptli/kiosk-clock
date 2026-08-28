import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  readSystemVolume,
  watchSystemVolume,
  writeSystemVolume,
} from './systemVolume';
import { clampVolume, type VolumeState } from './volume';

/**
 * Owns the volume level.
 *
 * The displayed level is optimistic: a drag updates it immediately and the
 * write follows, because waiting for the native round trip would make the bar
 * lag the finger. The listener then keeps it honest when the volume changes
 * from somewhere else.
 */
export function useVolume(enabled: boolean) {
  const [state, setState] = useState<VolumeState>({
    level: 0.5,
    controllable: false,
  });
  const dragging = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    readSystemVolume().then((level) => {
      if (!active) return;
      setState(
        level === null
          ? { level: 0.5, controllable: false }
          : { level, controllable: true },
      );
    });

    const unwatch = watchSystemVolume((level) => {
      // Ignore echoes of our own writes while the finger is down.
      if (!dragging.current) setState({ level, controllable: true });
    });

    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      readSystemVolume().then((level) => {
        if (level !== null) setState({ level, controllable: true });
      });
    });

    return () => {
      active = false;
      unwatch();
      subscription.remove();
    };
  }, [enabled]);

  const set = useCallback((next: number) => {
    const level = clampVolume(next);
    setState((current) => ({ ...current, level }));
    writeSystemVolume(level).then((ok) => {
      if (ok) setState((current) => ({ ...current, controllable: true }));
    });
  }, []);

  const setDragging = useCallback((value: boolean) => {
    dragging.current = value;
  }, []);

  return { ...state, set, setDragging };
}
