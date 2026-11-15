import { StyleSheet } from 'react-native';

import { Icon, PressableScale, Text, fontFamily, space, useTheme, type IconName } from '@/ui';

export interface SuggestionChipProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}

const HEIGHT = 38;

/** A question to send with one tap: starters on the first screen and follow-ups under answers. */
export function SuggestionChip({ label, icon, onPress, testID }: SuggestionChipProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // 38 pt tall to keep rows compact; the slop brings the target to 44.
      hitSlop={(44 - HEIGHT) / 2}
      style={[
        styles.chip,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.pill,
        },
      ]}
    >
      <Icon name={icon} size={15} color="text" />
      <Text variant="subhead" numberOfLines={1} accessible={false} style={styles.label}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md + 2,
    borderWidth: 1,
  },
  label: { fontFamily: fontFamily.textMedium },
});
