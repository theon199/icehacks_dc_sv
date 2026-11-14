import { Pressable, StyleSheet, View } from 'react-native';

import { Text, minTouchTarget, space } from '@/ui';

import { RowAction, SectionHeading, TermRow } from './SearchRows';

export interface RecentSearchesProps {
  terms: readonly string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}

/** The person's last few searches, newest first; each can be rerun or forgotten. */
export function RecentSearches({ terms, onPick, onRemove, onClear }: RecentSearchesProps) {
  if (terms.length === 0) return null;
  return (
    <View style={styles.section} testID="recent-searches">
      <SectionHeading
        title="Recently searched"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear recent searches"
            hitSlop={10}
            onPress={onClear}
            style={styles.clear}
          >
            <Text variant="label" tone="muted" accessible={false}>
              Clear
            </Text>
          </Pressable>
        }
      />
      <View>
        {terms.map((term) => (
          <TermRow
            key={term}
            term={term}
            subtitle="Search"
            icon="clock.arrow.circlepath"
            accessibilityLabel={`Search again for ${term}`}
            onPress={() => onPick(term)}
            testID="recent-search-row"
            trailing={
              <RowAction
                icon="xmark"
                accessibilityLabel={`Remove ${term} from recent searches`}
                onPress={() => onRemove(term)}
              />
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
  clear: { minHeight: minTouchTarget, justifyContent: 'center', paddingLeft: space.md },
});
