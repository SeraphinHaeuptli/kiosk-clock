import {
  JetBrainsMono_400Regular,
  useFonts,
} from '@expo-google-fonts/jetbrains-mono';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BillingProvider } from '@/billing/BillingContext';
import { SettingsProvider } from '@/clock/SettingsContext';
import { surface } from '@/design/palette';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ JetBrainsMono_400Regular });

  // Nothing renders until the grid font is available. A flash of a fallback
  // face would reflow every character-aligned surface in the app.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <BillingProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: surface.base },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen
              name="settings"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="founder"
              options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
            />
          </Stack>
        </BillingProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
