import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useTheme } from '@/ui';
import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

/** Signed-out flow. Shown only while the session store reports `signedOut`. */
export default function AuthLayout() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  // The detent-based form sheet can present with an empty React Native body on iOS 27.
  const continueOptions =
    Platform.OS === 'ios' && Number.parseInt(Platform.Version, 10) >= 27
      ? {
          presentation: 'pageSheet' as const,
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.surface },
        }
      : sheetOptions(theme, [0.65, 0.95]);
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="continue" options={continueOptions} />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="check-email" options={{ title: 'Confirm your email' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
