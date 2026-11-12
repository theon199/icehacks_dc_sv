import { Stack } from 'expo-router';

import { DiscoverScreen } from '@/features/discover';

export default function AppTabsDiscoverRoute() {
  return (
    <>
      {/* The deck draws its own compact header so the cards get the full height. */}
      <Stack.Screen options={{ headerShown: false }} />
      <DiscoverScreen />
    </>
  );
}
