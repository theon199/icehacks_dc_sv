import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, fontFamily, useTheme } from '@/ui';
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
  const theme = useTheme();
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
      <View
        style={[
          styles.notice,
          { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.lg },
        ]}
      >
        <Text variant="headline" accessibilityRole="header" style={styles.title}>
          {trimmed ? `No recipes for “${trimmed}”` : 'No recipes match these filters'}
        </Text>
        <Text variant="subhead" tone="muted">
          {message}
        </Text>
        <View style={styles.actions}>
          {hasFilters ? (
            <Button label="Clear filters" variant="secondary" size="sm" onPress={onClearFilters} />
          ) : null}
          {broader ? (
            <Button
              label={`Search “${broader}”`}
              variant="secondary"
              size="sm"
              onPress={() => onSearch(broader)}
            />
          ) : null}
          {onAskChef && trimmed ? (
            <Button label="Ask Chef instead" variant="ghost" size="sm" onPress={onAskChef} />
          ) : null}
        </View>
      </View>
      <SuggestionChips title="Ideas to try" items={ideas} onPick={onSearch} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xl, paddingBottom: space.xxl },
  notice: { gap: space.sm, padding: space.md },
  title: { fontFamily: fontFamily.textBold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.xs },
});
