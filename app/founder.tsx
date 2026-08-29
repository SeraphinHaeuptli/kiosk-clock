import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBilling } from '@/billing/BillingContext';
import { FOUNDER_BENEFITS } from '@/billing/catalog';
import { useSettings } from '@/clock/SettingsContext';
import { label, surface, withAlpha } from '@/design/palette';
import { hairline, space, type } from '@/design/tokens';
import { ActionRow, Heading, StatusRow } from '@/ui/Terminal';

const PITCH =
  'one payment, kept forever. no subscription, no account, and nothing to ' +
  'sign in to — the unlock lives on the device and restores from the store ' +
  'if you reinstall.';

const TEST_NOTE =
  'this build talks to a stand-in for the store: the unlock is written ' +
  'locally and no money moves. it is here so the screen can be built and ' +
  'used before the real product exists.';

export default function FounderScreen() {
  const { tone } = useSettings();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { kind, founder, offer, busy, purchase, restore, revoke } =
    useBilling();

  const [status, setStatus] = useState<string | null>(null);

  const buy = async () => {
    setStatus(null);
    const outcome = await purchase();

    switch (outcome.status) {
      case 'owned':
        setStatus('unlocked. thank you.');
        break;
      case 'cancelled':
        setStatus('cancelled — nothing was charged.');
        break;
      default:
        setStatus(outcome.reason);
    }
  };

  const bringBack = async () => {
    setStatus(null);
    setStatus(
      (await restore())
        ? 'found it — unlocked.'
        : 'no earlier purchase found on this account.',
    );
  };

  const price = offer?.price ?? '—';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.brand}>KIOSK</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={space.md}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={[styles.done, { color: tone.color }]}>[done]</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <Text style={[styles.title, { color: tone.color }]}>founder</Text>
        <Text style={styles.pitch}>{PITCH}</Text>

        <Heading>what it unlocks</Heading>
        {FOUNDER_BENEFITS.map((benefit) => (
          <View key={benefit} style={styles.benefit}>
            <Text style={[styles.bullet, { color: tone.color }]}>+</Text>
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}

        {founder ? (
          <>
            <Heading>status</Heading>
            <StatusRow title="founder" value="unlocked" />
            <Text style={styles.note}>
              every face and backdrop is yours, and the watermark is gone.
            </Text>
          </>
        ) : (
          <>
            <Heading>price</Heading>
            <Pressable
              onPress={buy}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Unlock the founder pack for ${price}`}
              style={({ pressed }) => [
                styles.buy,
                { borderColor: withAlpha(tone.color, 0.55) },
                (pressed || busy) && styles.pressed,
              ]}
            >
              <Text style={[styles.buyText, { color: tone.color }]}>
                {busy ? '[ working... ]' : `[ unlock — ${price} ]`}
              </Text>
            </Pressable>

            <ActionRow title="restore a previous purchase" onPress={bringBack} />
          </>
        )}

        {status && (
          <Text style={[styles.status, { color: tone.color }]}>{status}</Text>
        )}

        {kind === 'test' && (
          <>
            <Heading>test build</Heading>
            <Text style={styles.note}>{TEST_NOTE}</Text>
            {revoke && founder && (
              <ActionRow
                title="lock again (test only)"
                onPress={() => {
                  setStatus(null);
                  revoke().then(() => setStatus('locked again.'));
                }}
              />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  brand: { ...type.body, color: label.primary, letterSpacing: 6 },
  done: { ...type.body },
  pressed: { opacity: 0.5 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg },
  title: {
    ...type.body,
    fontSize: 22,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: space.lg,
  },
  pitch: {
    ...type.small,
    color: label.secondary,
    lineHeight: 20,
    marginTop: space.md,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: 28,
  },
  bullet: { ...type.body },
  benefitText: { ...type.body, color: label.primary, flexShrink: 1 },
  buy: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderWidth: hairline,
    marginTop: space.sm,
  },
  buyText: { ...type.body },
  status: { ...type.small, marginTop: space.lg },
  note: {
    ...type.tiny,
    color: label.tertiary,
    lineHeight: 16,
    marginTop: space.sm,
  },
});
