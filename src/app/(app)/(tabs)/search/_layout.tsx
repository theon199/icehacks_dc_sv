import { Stack } from 'expo-router';

import { useTheme } from '@/ui';
import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

/**
 * Search tab stack. The title stays compact: the segmented control and search box sit right under
 * it and the results grid scrolls beneath them.
 */
export default function SearchStackLayout() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: 'Search' }} />
      <Stack.Screen name="filters" options={sheetOptions(theme, [0.7, 1])} />
    </Stack>
  );
}
