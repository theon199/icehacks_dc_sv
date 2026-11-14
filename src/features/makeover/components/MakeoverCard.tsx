import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, fontFamily, space, useTheme } from '@/ui';

export interface MakeoverCardProps {
  /** Where the flow is, e.g. "Step 1 of 2 · Choose goals". */
  status: string;
  testID?: string;
  children: ReactNode;
}

/**
 * The one white card the makeover flow lives in: the feature's name and the current stage on
 * top, then what that stage needs. Every row grows with Dynamic Type; nothing has a fixed height.
 */
export function MakeoverCard({ status, testID, children }: MakeoverCardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.tile,
        },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View>
        <Text variant="overline" color="primary">
          Make it healthier
        </Text>
        <Text
          variant="caption"
          tone="muted"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={styles.status}
        >
          {status}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** One suggested change or notice inside the card: a soft inset tile. */
export function MakeoverItem({
  tone = 'plain',
  testID,
  children,
}: {
  tone?: 'plain' | 'caution';
  testID?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const caution = tone === 'caution';
  return (
    <View
      style={[
        styles.item,
        {
          borderRadius: theme.radii.md,
          backgroundColor: caution ? theme.colors.dangerSoft : theme.colors.primarySoft,
          borderColor: caution ? theme.colors.danger : theme.colors.border,
        },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderWidth: 1, padding: space.md, gap: space.md },
  status: { fontFamily: fontFamily.textBold },
  item: { gap: space.sm, padding: space.md, borderWidth: 1 },
});
