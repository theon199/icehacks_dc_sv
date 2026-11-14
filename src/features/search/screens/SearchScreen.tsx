import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header, SegmentedControl, useTheme, type Segment } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { ChefPane } from '../components/ChefPane';
import { SearchPane } from '../components/SearchPane';
import { useSearchStore, type SearchMode } from '../searchStore';

const SEGMENTS: readonly Segment<SearchMode>[] = [
  { value: 'search', label: 'Search' },
  { value: 'chef', label: 'Chef' },
];

/** The Search tab: instant recipe search, with Chef one segment away. */
export function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useSearchStore((state) => state.mode);
  const setMode = useSearchStore((state) => state.setMode);
  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="search-screen"
    >
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Header size="tab" title="Search" />
        <SegmentedControl
          segments={SEGMENTS}
          value={mode}
          onChange={setMode}
          accessibilityLabel="Search or ask Chef"
        />
      </View>
      {mode === 'search' ? <SearchPane /> : <ChefPane />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { gap: space.md, paddingHorizontal: gutter, paddingBottom: space.md },
});
