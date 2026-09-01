import {
  JetBrainsMono_400Regular,
  useFonts,
} from '@expo-google-fonts/jetbrains-mono';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BillingProvider } from '@/billing/BillingContext';
import { SettingsProvider } from '@/clock/SettingsContext';
import { ErrorBoundary } from '@/core/ErrorBoundary';
import { surface } from '@/design/palette';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ JetBrainsMono_400Regular });

  // Nothing renders until the grid font is available. A flash of a fallback
  // face would reflow every character-aligned surface in the app.
  //
  // A font that failed is a different question from one that is still
  // arriving, and waiting on both amounted to never rendering: `useFonts`
  // leaves `loaded` false for good once it has an error, so a bad asset or a
  // device that ran out of memory mid-load meant a dock showing black until
  // somebody came and restarted it. Android substitutes its own face and the
  // clock still tells the time, which is the part that matters.
  if (!fontsLoaded && !fontError) return null;

  return (
    // Outside the providers rather than inside them. Both read storage on
    // mount and both throw from their hook when their context is missing, so a
    // boundary underneath would sit below the failures most likely to happen.
    <ErrorBoundary>
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
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="founder"
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
            </Stack>
          </BillingProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
