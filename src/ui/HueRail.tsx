import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { customTone, label } from '@/design/palette';
import { hairline, mono, space, type } from '@/design/tokens';

/**
 * The one place in this app where colour means something.
 *
 * Everywhere else the interface is monochrome on purpose — state is shown with
 * brackets and rules, never with hue, so nothing has to be decoded. A control
 * for choosing a hue is the exception that proves it: the swatches are not
 * decoration, they are the values.
 *
 * Only hue is offered. Saturation and lightness are fixed in the palette, so
 * every choice lands as legible as the built-in phosphors; a free HSL picker
 * would let someone choose a clock they cannot read and conclude the app is
 * broken.
 */

const CELLS = 36;
const RAIL_HEIGHT = 26;
const CARET_WIDTH = 10;

function wrap(hue: number): number {
  return ((Math.round(hue) % 360) + 360) % 360;
}

export function HueRail({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (hue: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  widthRef.current = width;
  const startHue = useRef(hue);

  // The responder has to outlive the renders its own onChange causes. A
  // PanResponder keeps the gesture's accumulated dx inside the object
  // create() returns, so rebuilding it mid-drag resets that to zero and the
  // hue stops following the finger — and the caller's onChange is a fresh
  // arrow every render. Hold it in a ref and build the responder once.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const swatches = useMemo(
    () =>
      Array.from({ length: CELLS }, (_, index) =>
        customTone((index + 0.5) * (360 / CELLS)).color,
      ),
    [],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        // Absolute where the volume bar is relative, and deliberately so: a
        // volume slammed to wherever a stray tap landed is a problem, a colour
        // is not. You point at the one you want.
        onPanResponderGrant: (event) => {
          const span = widthRef.current;
          if (span <= 0) return;
          startHue.current = wrap(
            (event.nativeEvent.locationX / span) * 360,
          );
          onChangeRef.current(startHue.current);
        },

        // Relative from there, because a move event's locationX is only
        // meaningful while the finger is still over the rail — and dragging
        // off the end to keep going round the wheel is the natural gesture.
        onPanResponderMove: (_, gesture) => {
          const span = widthRef.current;
          if (span <= 0) return;
          onChangeRef.current(
            wrap(startHue.current + (gesture.dx / span) * 360),
          );
        },
      }),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const position = (wrap(hue) / 360) * width;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.caption}>hue</Text>
        <Text
          allowFontScaling={false}
          style={[styles.value, { color: customTone(hue).color }]}
        >
          {wrap(hue)}°
        </Text>
      </View>

      {/* box-only: locationX arrives relative to whichever view the finger
          actually landed on, and without this that is a single swatch a
          thirty-sixth of the rail wide — so every touch would read as a few
          degrees from zero, pinning the caret to the left edge. */}
      <View
        onLayout={onLayout}
        pointerEvents="box-only"
        {...responder.panHandlers}
      >
        <View style={styles.rail} accessibilityRole="adjustable">
          {swatches.map((color, index) => (
            <View key={index} style={{ flex: 1, backgroundColor: color }} />
          ))}
        </View>

        {width > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.caret,
              {
                left: Math.min(
                  width - CARET_WIDTH,
                  Math.max(0, position - CARET_WIDTH / 2),
                ),
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingVertical: space.sm, gap: space.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  caption: { ...type.tiny, color: label.tertiary },
  value: { fontFamily: mono, fontSize: type.small.fontSize },
  rail: {
    flexDirection: 'row',
    height: RAIL_HEIGHT,
    borderWidth: hairline,
    borderColor: label.quaternary,
    overflow: 'hidden',
  },
  caret: {
    position: 'absolute',
    bottom: -space.xs,
    width: CARET_WIDTH,
    height: 3,
    backgroundColor: label.primary,
  },
});
