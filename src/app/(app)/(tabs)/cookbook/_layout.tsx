import { Stack } from 'expo-router';

import { useStackScreenOptions } from '@/ui/navigation';

export default function CookbookStackLayout() {
  const screenOptions = useStackScreenOptions({ largeTitle: true });
  const base = useStackScreenOptions();
  // Screens pushed inside the tab use a regular, opaque bar rather than the large title.
  const pushed = { ...base, headerLargeTitle: false, headerTransparent: false };
  return (
    <Stack screenOptions={screenOptions}>
      {/* The tab root draws its own title row with the glass controls beside it. */}
      <Stack.Screen name="index" options={{ title: 'Cookbook', headerShown: false }} />
      <Stack.Screen name="plan-week" options={{ ...pushed, title: 'Plan my week' }} />
      <Stack.Screen name="two-day-plan" options={{ ...pushed, title: 'Two-day plan' }} />
      <Stack.Screen name="archive" options={{ ...pushed, title: 'Archived weeks' }} />
    </Stack>
  );
}
