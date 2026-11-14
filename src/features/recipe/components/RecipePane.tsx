import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, space, useTheme } from '@/ui';

export interface RecipePaneProps {
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** The white rounded surface every tab body of the recipe page sits on. */
export function RecipePane({ testID, style, children }: RecipePaneProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.pane, { backgroundColor: theme.colors.surface }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

/** Corner radius and inset of a recipe pane, shared with the list rows that paint one together. */
export const PANE_RADIUS = radii.tile;
export const PANE_PADDING = space.md;

const styles = StyleSheet.create({
  pane: { gap: space.md, padding: PANE_PADDING, borderRadius: PANE_RADIUS },
});
