import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel } from '@/domain/types';
import { Text } from '@/ui';
import { space } from '@/ui/tokens';

import { RecentSearches } from './RecentSearches';
import { SuggestionChips } from './SuggestionChips';
import { STARTER_TERMS } from '../suggestions';

export interface IdlePanelProps {
  recentTerms: readonly string[];
  lovedCuisines: readonly string[];
  onSearch: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecents: () => void;
  onPickCuisine: (cuisine: string) => void;
}

/**
 * Shown above the browse grid while the search box is empty: recent searches, the person's own
 * cuisines and a few starting points.
 */
export function IdlePanel({
  recentTerms,
  lovedCuisines,
  onSearch,
  onRemoveRecent,
  onClearRecents,
  onPickCuisine,
}: IdlePanelProps) {
  const cuisineItems = useMemo(
    () => lovedCuisines.map((id) => ({ key: id, label: cuisineLabel(id) })),
    [lovedCuisines],
  );
  const starterItems = useMemo(() => STARTER_TERMS.map((term) => ({ key: term, label: term })), []);
  return (
    <View style={styles.panel} testID="search-idle">
      <RecentSearches
        terms={recentTerms}
        onPick={onSearch}
        onRemove={onRemoveRecent}
        onClear={onClearRecents}
      />
      <SuggestionChips
        title="Your cuisines"
        icon="globe"
        items={cuisineItems}
        onPick={onPickCuisine}
      />
      <SuggestionChips title="Try searching" items={starterItems} onPick={onSearch} />
      <Text variant="headline">Healthiest first</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.xl, paddingBottom: space.md },
});
