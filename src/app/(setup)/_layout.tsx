import { Stack } from 'expo-router';

import { ageBandFor, night, useSessionStore } from '@/features/auth';
import { useStackScreenOptions } from '@/ui/navigation';

/** The age gate keeps the welcome flow's black canvas. */
const nightCanvas = { contentStyle: { backgroundColor: night.black } };

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
        <Stack.Screen name="birth-year" options={nightCanvas} />
      </Stack.Protected>
      <Stack.Protected guard={band === 'underMinimum' || band === 'notYetEligible'}>
        <Stack.Screen name="not-eligible" options={nightCanvas} />
      </Stack.Protected>
      <Stack.Protected guard={band === 'teen' || band === 'adult'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
