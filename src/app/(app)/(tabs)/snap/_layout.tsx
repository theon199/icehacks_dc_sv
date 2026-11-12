import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

export default function SnapStackLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Snap' }} />
    </Stack>
  );
}
