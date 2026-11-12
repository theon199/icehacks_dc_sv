import { StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme } from '@/ui';

export interface SafetyBadgeProps {
  label: string;
}

/**
 * Marks a result that does not fit the person's allergies or diet. Decorative for assistive
 * technology: the card's own label carries the full reasons.
 */
export function SafetyBadge({ label }: SafetyBadgeProps) {
  const theme = useTheme();
  return (
    <View
      testID="safety-badge"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.badge,
        { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radii.pill },
      ]}
    >
      <Icon name="exclamationmark.triangle.fill" android="warning" size={12} color="onDangerSoft" />
      <Text variant="caption" color="onDangerSoft" numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
