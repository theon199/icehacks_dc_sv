import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

/**
 * The Community tab draws its own title row with glass controls, so the native bar stays hidden.
 * The feed and the food map replace each other from the title menu, so the switch fades in place.
 */
export default function CommunityStackLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Community', animation: 'fade' }} />
      <Stack.Screen name="map" options={{ title: 'Food map', animation: 'fade' }} />
    </Stack>
  );
}
