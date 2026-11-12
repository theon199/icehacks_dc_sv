import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

/** Age gate and onboarding. Shown while the session store reports `needsSetup`. */
export default function SetupLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="birth-year" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="not-eligible" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
