import { Stack } from 'expo-router';

import { useSessionStore } from '@/features/auth';
import { useStackScreenOptions } from '@/ui/navigation';

/**
 * Top-level stack. `Stack.Protected` exposes exactly one of the (auth), (setup) and (app) groups
 * based on the session status; when the status changes, expo-router moves to the first screen
 * that is allowed. Auth links and the about pages stay reachable in every state.
 */
export function RootNavigator() {
  const status = useSessionStore((s) => s.status);
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsSetup'}>
        <Stack.Screen name="(setup)" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="auth/reset-password" options={{ title: 'New password' }} />
      <Stack.Screen name="about" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </Stack>
  );
}
