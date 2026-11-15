import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

/** The Community tab draws its own title row with glass controls, so the native bar stays hidden. */
export default function CommunityStackLayout() {
  const screenOptions = useStackScreenOptions({ headerless: true });
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Community' }} />
    </Stack>
  );
}
