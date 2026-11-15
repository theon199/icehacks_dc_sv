import { Stack } from 'expo-router';

import { NightTheme, night } from '@/features/auth';
import { useStackScreenOptions } from '@/ui/navigation';

function AuthStack() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return (
    <Stack screenOptions={{ ...screenOptions, contentStyle: { backgroundColor: night.black } }}>
      <Stack.Screen name="welcome" />
      {/* Old entry points; each opens the account sheet on the welcome screen. */}
      <Stack.Screen name="continue" options={{ animation: 'none' }} />
      <Stack.Screen name="sign-in" options={{ animation: 'none' }} />
      <Stack.Screen name="sign-up" options={{ animation: 'none' }} />
      <Stack.Screen name="check-email" />
      <Stack.Screen name="forgot-password" />
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
