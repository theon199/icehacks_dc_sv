import { Stack } from 'expo-router';

import { ageBandFor, useSessionStore } from '@/features/auth';
import { useStackScreenOptions } from '@/ui/navigation';

/**
 * Age gate and onboarding, shown while the session store reports `needsSetup`. Exactly one screen
 * is available at a time, chosen by the birth year: none yet, ruled out, or cleared to continue.
 */
export default function SetupLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  const band = useSessionStore((s) => ageBandFor(s.birthYear));
  return (
    <Stack screenOptions={{ ...screenOptions, gestureEnabled: false }}>
      <Stack.Protected guard={band === 'unknown'}>
        <Stack.Screen name="birth-year" />
      </Stack.Protected>
      <Stack.Protected guard={band === 'underMinimum' || band === 'notYetEligible'}>
        <Stack.Screen name="not-eligible" />
      </Stack.Protected>
      <Stack.Protected guard={band === 'teen' || band === 'adult'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
