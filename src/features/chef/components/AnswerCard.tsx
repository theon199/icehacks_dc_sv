import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space, useTheme } from '@/ui';

export interface AnswerCardProps {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The white card that holds one Chef turn: an answer with its recipes, the thinking line or a
 * problem. A soft shadow in light mode and a hairline edge in dark, like the app's other cards.
 */
export function AnswerCard({ children, testID, style }: AnswerCardProps) {
  const theme = useTheme();
  const dark = theme.scheme === 'dark';
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.tile,
          borderColor: theme.colors.border,
          borderWidth: dark ? StyleSheet.hairlineWidth : 0,
        },
        dark ? null : { ...theme.elevation.low, shadowColor: theme.colors.shadow },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: space.lg,
    paddingTop: space.md + 2,
    paddingBottom: space.lg,
    gap: space.sm,
  },
});
