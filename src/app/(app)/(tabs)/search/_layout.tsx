import { Stack } from 'expo-router';

import { useTheme } from '@/ui';
import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

/**
 * Search tab stack. The tab root is the Ask page: it draws its own glass header and bottom search
 * bar, so the native bar stays hidden there. Filters open as a sheet.
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
