import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useTheme } from '@/ui';

/**
 * The questionnaire's primary action, straight on the canvas: no slab, no shadow, only the
 * home-indicator inset under it.
 */
export function ActionDock({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: theme.colors.background,
          paddingBottom: Math.max(insets.bottom, space.md),
        },
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { paddingTop: 10, paddingHorizontal: space.xl },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xs },
});
