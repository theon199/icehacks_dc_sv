import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export interface BadgeProps {
  /** Number to show; 0 or less hides the badge. Omit for a plain dot. */
  count?: number;
  /** Largest number shown before switching to "N+". */
  max?: number;
  /** e.g. "unread notifications"; read as "3 unread notifications". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function badgeText(count: number, max = 99): string {
  return count > max ? `${max}+` : String(count);
}

/** Small attention marker for counts (notifications) or a status dot. */
export function Badge({ count, max = 99, accessibilityLabel, style }: BadgeProps) {
  const theme = useTheme();
  if (count !== undefined && count <= 0) return null;
  const dot = count === undefined;
  const text = dot ? '' : badgeText(count, max);
  const label = accessibilityLabel ? `${dot ? '' : `${text} `}${accessibilityLabel}`.trim() : text;

  return (
    <View
      accessible={Boolean(label)}
      {...(label ? { accessibilityLabel: label } : {})}
      style={[
        dot ? styles.dot : styles.pill,
        { backgroundColor: theme.colors.accent, borderColor: theme.colors.background },
        style,
      ]}
    >
      {dot ? null : (
        <Text variant="caption" color="onAccent" maxFontSizeMultiplier={1.2} accessible={false}>
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  pill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
