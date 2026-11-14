import { Stack } from 'expo-router';

import { useTheme } from '@/ui';
import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

/**
 * Search tab stack. The tab root draws its own title row, with the segmented control and search box
 * right under it and the results grid scrolling beneath them, so the native bar stays hidden there.
 */
export default function SearchStackLayout() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Search', headerShown: false }} />
      <Stack.Screen name="filters" options={sheetOptions(theme, [0.7, 1])} />
    </Stack>
  );
}
