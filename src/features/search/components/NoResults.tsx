import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState } from '@/ui';
import { space } from '@/ui/tokens';

import { SuggestionChips } from './SuggestionChips';
import { broaderTerm, STARTER_TERMS } from '../suggestions';

export interface NoResultsProps {
  query: string;
  hasFilters: boolean;
  onSearch: (term: string) => void;
  onClearFilters: () => void;
  /** Offered only when the person can use Chef. */
  onAskChef?: (() => void) | undefined;
}

/** Nothing matched: say so plainly and offer the quickest ways to widen the search. */
export function NoResults({
  query,
  hasFilters,
  onSearch,
  onClearFilters,
  onAskChef,
}: NoResultsProps) {
  const broader = broaderTerm(query);
  const trimmed = query.trim();
  const ideas = useMemo(
    () =>
      STARTER_TERMS.filter((term) => term !== trimmed.toLowerCase())
        .slice(0, 6)
        .map((term) => ({ key: term, label: term })),
    [trimmed],
  );
  const message = hasFilters
    ? 'Some filters may be ruling things out. Try removing one.'
    : 'Check the spelling or try a simpler word, like a main ingredient.';
  return (
    <View testID="search-no-results" style={styles.container}>
      <EmptyState
        icon="magnifyingglass"
        title={trimmed ? `No recipes for “${trimmed}”` : 'No recipes match these filters'}
        message={message}
      >
        <View style={styles.actions}>
          {hasFilters ? (
            <Button label="Clear filters" variant="secondary" onPress={onClearFilters} />
          ) : null}
          {broader ? (
            <Button
              label={`Search “${broader}”`}
              variant="secondary"
              onPress={() => onSearch(broader)}
            />
          ) : null}
          {onAskChef && trimmed ? (
            <Button label="Ask Chef instead" variant="ghost" icon="sparkles" onPress={onAskChef} />
          ) : null}
        </View>
      </EmptyState>
      <SuggestionChips title="Ideas to try" items={ideas} onPick={onSearch} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg, paddingBottom: space.xxl },
  actions: { gap: space.sm, alignItems: 'center' },
});
