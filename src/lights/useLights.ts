import { isHueLinkAvailable } from '../../modules/hue-link';
import { isHueBleAvailable } from '../../modules/hue-ble';

import { lampsName, type LightsStatus } from './lights';
import { useSource } from './store';
import { useBridgeTransport } from './useBridgeTransport';
import { useLampTransport } from './useLampTransport';

/**
 * Owns the brightness of whatever lights this phone has.
 *
 * Shaped like `useVolume` on purpose — a level, whether it can be driven, a
 * setter and a drag flag — because the bar in the kiosk draws either one with
 * the same component. What is behind it is either a bridge on the network or
 * a handful of lamps on Bluetooth, and nothing above this line knows which.
 *
 * Both transports are mounted whatever is stored, because hooks cannot be
 * called conditionally. The one that has nothing to drive sits in 'off' and
 * opens no connection, which is why each of them takes its own enabled flag
 * rather than reading the setting itself.
 */

export interface LightsControl {
  /**
   * Whether there is a bar to draw at all: the setting is on, this build can
   * reach the lights, and something has been set up. Lights that are merely
   * unreachable still count — the bar says so, which is the point.
   */
  shown: boolean;
  /** 0 to 1. Zero until the first reading lands. */
  level: number;
  /** False until the lights have answered once. */
  controllable: boolean;
  /** What to call them, for the bar to label itself with. */
  name: string;
  status: LightsStatus;
  set: (level: number) => void;
  setDragging: (dragging: boolean) => void;
}

export function useLights(enabled: boolean): LightsControl {
  const { source, ready } = useSource();

  // Nothing is claimed about what is set up until storage has been read.
  const live = enabled && ready;

  const bridge = useBridgeTransport(
    source?.kind === 'bridge' ? source.bridge : null,
    live,
  );
  const lamps = useLampTransport(
    source?.kind === 'lamps' ? source.lamps : null,
    live,
  );

  const active = source?.kind === 'lamps' ? lamps : bridge;

  const reachable =
    source === null
      ? false
      : source.kind === 'lamps'
        ? isHueBleAvailable
        : isHueLinkAvailable;

  const name =
    source === null
      ? 'lights'
      : source.kind === 'lamps'
        ? lampsName(source.lamps)
        : source.bridge.groupName;

  return {
    shown: live && source !== null && reachable,
    level: active.level,
    controllable: active.known && source !== null && reachable,
    name,
    status: active.status,
    set: active.set,
    setDragging: active.setDragging,
  };
}
