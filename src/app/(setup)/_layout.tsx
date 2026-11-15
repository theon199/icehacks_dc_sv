import { Stack } from 'expo-router';

import { ageBandFor, night, setupStepFor, useSessionStore } from '@/features/auth';
import { useStackScreenOptions } from '@/ui/navigation';

/** The age gate keeps the welcome flow's black canvas. */
const nightCanvas = { contentStyle: { backgroundColor: night.black } };

/**
 * Age gate and onboarding, shown while the session store reports `needsSetup`. Exactly one screen
 * is available at a time, chosen by the birth year: none yet, ruled out, or cleared to continue.
 */
export default function SetupLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  const step = useSessionStore((s) => setupStepFor(ageBandFor(s.birthYear)));
  return (
    <Stack screenOptions={{ ...screenOptions, gestureEnabled: false }}>
      <Stack.Protected guard={step === 'birth-year'}>
        <Stack.Screen name="birth-year" options={nightCanvas} />
      </Stack.Protected>
      <Stack.Protected guard={step === 'not-eligible'}>
        <Stack.Screen name="not-eligible" options={nightCanvas} />
      </Stack.Protected>
      <Stack.Protected guard={step === 'onboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}
