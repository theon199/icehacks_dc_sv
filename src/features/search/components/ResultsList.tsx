import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { RecipeResultRow } from './ResultCard';
import type { SearchResultItem } from '../resultItems';

export interface ResultsListProps {
  /** The rows under the header (the header may already show the first few results). */
  items: readonly SearchResultItem[];
  /** Changes when a different search starts; the grid then returns to the top. */
  searchKey: string;
  /** Older results are showing while new ones load; they are dimmed until replaced. */
  updating: boolean;
  onOpen: (item: SearchResultItem) => void;
  onEndReached: () => void;
  loadingMore: boolean;
  header: ReactElement | null;
  empty: ReactElement | null;
}

const keyExtractor = (item: SearchResultItem) => item.recipe.id;

/** The recycling list of recipe rows under Search's header content; loads more near the end. */
export function ResultsList({
  items,
  searchKey,
  updating,
  onOpen,
  onEndReached,
  loadingMore,
  header,
  empty,
}: ResultsListProps) {
  const theme = useTheme();
  const renderItem: ListRenderItem<SearchResultItem> = useCallback(
    ({ item }) => <RecipeResultRow item={item} onOpen={onOpen} />,
    [onOpen],
  );

  // A new search starts at the top; more pages of the same search keep the scroll position.
  const listRef = useRef<FlashListRef<SearchResultItem>>(null);
  const shownKey = useRef(searchKey);
  useEffect(() => {
    if (shownKey.current === searchKey) return;
    shownKey.current = searchKey;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchKey]);

  return (
    <View
      style={[styles.flex, updating && styles.updating]}
      accessibilityState={{ busy: updating }}
    >
      <FlashList
        ref={listRef}
        testID="search-results"
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
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
      {updating ? (
        <ActivityIndicator
          testID="search-updating"
          accessibilityLabel="Updating results"
          color={theme.colors.textSubtle}
          style={styles.updatingCue}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  updating: { opacity: 0.6 },
  updatingCue: { position: 'absolute', top: space.md, alignSelf: 'center' },
  content: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.xl },
  footer: { paddingVertical: space.xl },
});
