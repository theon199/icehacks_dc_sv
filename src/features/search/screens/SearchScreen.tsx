import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui';

import { ChefPane } from '../components/ChefPane';
import { SearchModeSwitch } from '../components/SearchModeSwitch';
import { SearchPane } from '../components/SearchPane';
import { useSearchStore } from '../searchStore';

/**
 * The Search tab, drawn as the Ask page: instant recipe search with Chef one switch away. The tab
 * is the system search island, so the Liquid Glass tab bar stays on screen: on the Search side
 * the island expands into the native search field, on the Chef side the bar stays whole and the
 * question box sits above it.
 *
 * The Search | Chef switch leads the native header. iOS centres a title view only while it fits
 * between the side items, and beside Chef's two buttons it does not, so a centred switch would
 * jump sideways when the mode changes; at the leading edge it stays put. It draws its own glass,
 * so it opts out of the bar's shared background.
 */
export function SearchScreen() {
  const theme = useTheme();
  const mode = useSearchStore((state) => state.mode);
  const setMode = useSearchStore((state) => state.setMode);
  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="search-screen"
    >
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.View hidesSharedBackground>
          <SearchModeSwitch mode={mode} onChange={setMode} />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      {mode === 'search' ? <SearchPane /> : <ChefPane />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
