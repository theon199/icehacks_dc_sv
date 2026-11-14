import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, fontFamily, radii, space, useTheme } from '@/ui';

/** A white section card on an informational page, with an optional heading. */
export function InfoCard({
  heading,
  children,
  testID,
}: {
  heading?: string;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View
      {...(testID ? { testID } : {})}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
        theme.elevation.medium,
      ]}
    >
      {heading ? (
        <Text variant="title2" style={styles.heading}>
          {heading}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.xl,
    padding: space.section,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontFamily: fontFamily.display, letterSpacing: -0.4 },
});
