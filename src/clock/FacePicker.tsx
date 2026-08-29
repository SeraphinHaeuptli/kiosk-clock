import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBilling } from '@/billing/BillingContext';
import { faceNeedsFounder } from '@/billing/catalog';
import { WatermarkTag } from '@/billing/Watermark';
import { label, surface, type Tone } from '@/design/palette';
import { hairline, space, type } from '@/design/tokens';

import { FACES } from './faces';
import type { ClockSettings, FaceId } from './settings';

const CARD_WIDTH = 150;
const CARD_HEIGHT = 94;

/**
 * Each card renders the real face component at thumbnail scale with the user's
 * live settings, so the preview is the product rather than a drawing of it.
 */
export function FacePicker({
  now,
  settings,
  tone,
  onChange,
}: {
  now: Date;
  settings: ClockSettings;
  tone: Tone;
  onChange: (face: FaceId) => void;
}) {
  const { founder } = useBilling();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.track}
    >
      {FACES.map((face) => {
        const selected = face.id === settings.face;
        // Locked faces still render live and stay selectable: seeing the real
        // thing at thumbnail scale is the whole argument for buying it.
        const locked = !founder && faceNeedsFounder(face.id);
        const name = locked ? `${face.name}*` : face.name;

        return (
          <Pressable
            key={face.id}
            onPress={() => onChange(face.id)}
            accessibilityRole="radio"
            accessibilityLabel={
              locked ? `${face.name} face, founder pack` : `${face.name} face`
            }
            accessibilityState={{ selected }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <View
              style={[styles.card, selected && { borderColor: tone.color }]}
            >
              <face.Component
                now={now}
                settings={{ ...settings, face: face.id }}
                tone={tone}
                size={face.previewSize}
              />
              {locked && <WatermarkTag tone={tone} />}
            </View>

            <Text
              style={[
                styles.name,
                selected && { color: tone.color },
              ]}
              numberOfLines={1}
            >
              {selected ? `[${name}]` : ` ${name} `}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: { gap: space.sm, paddingRight: space.lg },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: surface.base,
    borderWidth: hairline,
    borderColor: surface.line,
    alignItems: 'center',
    justifyContent: 'center',
    // Long word-clock phrases are clipped rather than allowed to stretch the card.
    overflow: 'hidden',
  },
  pressed: { opacity: 0.5 },
  name: {
    ...type.tiny,
    color: label.tertiary,
    textAlign: 'center',
    marginTop: space.sm,
  },
});
