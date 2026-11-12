import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { ResultCard } from './ResultCard';
import type { SearchResultItem } from '../resultItems';

export const GRID_COLUMNS = 2;
/** Space between the two columns and between rows. */
const GAP = space.md;

export interface ResultsGridProps {
  items: readonly SearchResultItem[];
  onOpen: (item: SearchResultItem) => void;
  onEndReached: () => void;
  loadingMore: boolean;
  header: ReactElement | null;
  empty: ReactElement | null;
}

const keyExtractor = (item: SearchResultItem) => item.recipe.id;

/** Two-column, recycling grid of results that loads the next page near the end. */
export function ResultsGrid({
  items,
  onOpen,
  onEndReached,
  loadingMore,
  header,
  empty,
}: ResultsGridProps) {
  const theme = useTheme();
  const renderItem: ListRenderItem<SearchResultItem> = useCallback(
    ({ item }) => (
      <View style={styles.cell}>
        <ResultCard item={item} onOpen={onOpen} />
      </View>
    ),
    [onOpen],
  );
  return (
    <FlashList
      testID="search-results"
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={GRID_COLUMNS}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header ? <View style={styles.header}>{header}</View> : null}
      ListEmptyComponent={empty ? <View style={styles.empty}>{empty}</View> : null}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator
            accessibilityLabel="Loading more recipes"
            color={theme.colors.textSubtle}
            style={styles.footer}
          />
        ) : null
      }
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter - GAP / 2, paddingBottom: space.huge },
  header: { paddingHorizontal: GAP / 2, paddingTop: space.md },
  empty: { paddingHorizontal: GAP / 2 },
  cell: { flex: 1, paddingHorizontal: GAP / 2, paddingBottom: space.xl },
  footer: { paddingVertical: space.xl },
});
