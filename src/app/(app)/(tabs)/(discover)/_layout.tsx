import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

export default function DiscoverStackLayout() {
  const screenOptions = useStackScreenOptions({ largeTitle: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Discover' }} />
    </Stack>
  );
}
