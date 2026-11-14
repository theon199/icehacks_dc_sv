import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, useTheme, type IconName } from '@/ui';
import { space } from '@/ui/tokens';

export interface SuggestionChipsProps {
  title: string;
  items: readonly { key: string; label: string }[];
  onPick: (key: string) => void;
  icon?: IconName;
}

/** Suggestion pills are 38 pt tall; the slop brings their touch area to the 44 pt minimum. */
const pillSlop = { top: 3, bottom: 3, left: 0, right: 0 };

/** A titled, wrapping row of tappable suggestions as white capsules. */
export function SuggestionChips({
  title,
  items,
  onPick,
  icon = 'magnifyingglass',
}: SuggestionChipsProps) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text variant="title3">{title}</Text>
      <View style={styles.wrap}>
        {items.map((item) => (
          <PressableScale
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => onPick(item.key)}
            hitSlop={pillSlop}
            style={[
              styles.pill,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.pill,
              },
            ]}
          >
            <Icon name={icon} size={14} color="textMuted" weight="semibold" />
            <Text variant="label" numberOfLines={1} accessible={false}>
              {item.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 38,
    paddingHorizontal: space.md + 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
