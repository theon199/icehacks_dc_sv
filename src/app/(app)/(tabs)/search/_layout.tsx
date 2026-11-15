import { Stack } from 'expo-router';

import { sheetOptions, useStackScreenOptions } from '@/ui/navigation';

/**
 * Search tab stack, behind the tab bar's search island. The tab root is the Ask page, which uses
 * the native header: the Search | Chef switch as its title view, system glass buttons on the right
 * and, on the Search side, the native search field the island expands into. Filters open as a
 * glass sheet over it.
 */
export default function SearchStackLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="filters" options={sheetOptions()} />
    </Stack>
  );
}
