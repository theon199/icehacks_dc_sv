import { StyleSheet, View } from 'react-native';

import { Chip, Text, type IconName } from '@/ui';

export interface SuggestionChipsProps {
  title: string;
  items: readonly { key: string; label: string }[];
  onPick: (key: string) => void;
  icon?: IconName;
}

/** A titled, wrapping row of tappable suggestions. */
export function SuggestionChips({
  title,
  items,
  onPick,
  icon = 'magnifyingglass',
}: SuggestionChipsProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="headline">{title}</Text>
      <View style={styles.wrap}>
        {items.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            tone="primary"
            icon={icon}
            onPress={() => onPick(item.key)}
            style={styles.chip}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8 },
});
