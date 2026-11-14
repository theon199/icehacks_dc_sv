import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

/**
 * Informational pages; reachable signed in or out (the account sheet links to the terms and
 * privacy). Each page draws its own glass back row, so the native header is hidden.
 */
export default function AboutLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return <Stack screenOptions={screenOptions} />;
}
