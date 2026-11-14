import { Stack } from 'expo-router';

import { NightTheme, night } from '@/features/auth';
import { useTheme } from '@/ui';
import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

function AuthStack() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="continue"
        options={{
          ...sheetOptions(theme, [0.65, 0.95]),
          sheetCornerRadius: theme.radii.sheet,
          contentStyle: { backgroundColor: night.raised },
        }}
      />
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      <Stack.Screen name="check-email" options={{ title: 'Confirm your email' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}

/** Signed-out flow, always in the night look. Shown only while the session reports `signedOut`. */
export default function AuthLayout() {
  return (
    <NightTheme>
      <AuthStack />
    </NightTheme>
  );
}
