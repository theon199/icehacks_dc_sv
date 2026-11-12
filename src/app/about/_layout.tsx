import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

/** Informational pages; reachable signed in or out (sign-up links to the terms and privacy). */
export default function AboutLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="how-it-works" options={{ title: 'How it works' }} />
      <Stack.Screen name="sources" options={{ title: 'Sources & credits' }} />
      <Stack.Screen name="ai-use" options={{ title: 'AI use' }} />
      <Stack.Screen name="limitations" options={{ title: 'Limitations' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="terms" options={{ title: 'Terms' }} />
    </Stack>
  );
}
