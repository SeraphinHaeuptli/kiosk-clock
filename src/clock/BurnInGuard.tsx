import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

/**
 * One full circuit of the drift. Slow enough that nothing on screen appears to
 * move at all, long enough that no pixel holds the same glyph for more than a
 * minute or two.
 */
const CYCLE_MS = 360_000;

/**
 * How often the offset is moved, rather than how smoothly.
 *
 * This used to be a continuous `Animated.loop`, which looked the same and cost
 * a composited frame on every vsync for as long as the clock was on screen —
 * for ever, on a phone parked on a charger. A static screen is otherwise
 * something Android can leave alone entirely.
 *
 * Stepping instead means the display pipeline sleeps between steps. At this
 * rate each step moves the clock by well under a pixel, so there is nothing to
 * see: the motion is below the threshold the old animation was already chosen
 * to stay under.
 */
const STEP_MS = 6_000;

const DRIFT_X = 8;
const DRIFT_Y = 10;

/**
 * Nudges its children a few points on a slow cycle. A kiosk clock holds the
 * same bright pixels for hours, which is exactly what burns OLED panels; the
 * motion is far too slow to notice but enough to spread the load.
 */
export function BurnInGuard({
  enabled,
  style,
  children,
}: {
  enabled: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const drift = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!enabled) {
      drift.setValue(0.5);
      return;
    }

    // Phase from the wall clock rather than a counter, so the drift keeps its
    // place across a re-mount instead of starting over in the middle of the
    // screen every time the setting is touched.
    const step = () => {
      const phase = (Date.now() % CYCLE_MS) / CYCLE_MS;
      drift.setValue((Math.sin(phase * 2 * Math.PI) + 1) / 2);
    };

    step();
    const timer = setInterval(step, STEP_MS);

    return () => {
      clearInterval(timer);
      drift.setValue(0.5);
    };
  }, [enabled, drift]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              translateX: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [-DRIFT_X, DRIFT_X],
              }),
            },
            {
              // Opposed to X so the path traces an arc, not a diagonal line.
              translateY: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [DRIFT_Y, -DRIFT_Y],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
