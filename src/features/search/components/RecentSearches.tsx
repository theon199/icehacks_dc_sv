import { StyleSheet, View } from 'react-native';

import { Icon, IconButton, PressableScale, Text, useTheme } from '@/ui';
import { minTouchTarget } from '@/ui/tokens';

export interface RecentSearchesProps {
  terms: readonly string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}

/** The person's last few searches, newest first; each can be rerun or forgotten. */
export function RecentSearches({ terms, onPick, onRemove, onClear }: RecentSearchesProps) {
  const theme = useTheme();
  if (terms.length === 0) return null;
  return (
    <View style={styles.section} testID="recent-searches">
      <View style={styles.header}>
        <Text variant="headline">Recent</Text>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Clear recent searches"
          onPress={onClear}
          style={styles.clear}
        >
          <Text variant="subhead" tone="primary" accessible={false}>
            Clear
          </Text>
        </PressableScale>
      </View>
      {terms.map((term) => (
        <View
          key={term}
          style={[styles.row, { borderBottomColor: theme.colors.border }]}
          testID="recent-search-row"
        >
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Search again for ${term}`}
            onPress={() => onPick(term)}
            pressedScale={1}
            pressedOpacity={0.6}
            style={styles.term}
          >
            <Icon name="clock.arrow.circlepath" android="history" size={18} color="textSubtle" />
            <Text variant="body" numberOfLines={1} accessible={false} style={styles.flex}>
              {term}
            </Text>
          </PressableScale>
          <IconButton
            icon="xmark"
            accessibilityLabel={`Remove ${term} from recent searches`}
            size={20}
            color="textSubtle"
            haptic={false}
            onPress={() => onRemove(term)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { minHeight: minTouchTarget, justifyContent: 'center', paddingLeft: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  term: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: minTouchTarget,
  },
  flex: { flex: 1 },
});
