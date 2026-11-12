import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text, space } from '@/ui';

export interface SettingsSectionProps {
  title: string;
  /** Short note under the group, e.g. what a setting affects. */
  footnote?: string;
  children: ReactNode;
  /** Lay the children out on their own, for content that already draws its own cards. */
  bare?: boolean;
  testID?: string;
}

/** A titled group of settings rows on a card. */
export function SettingsSection({
  title,
  footnote,
  children,
  bare = false,
  testID,
}: SettingsSectionProps) {
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="overline" tone="muted" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {bare ? (
        children
      ) : (
        <Card padding="md" style={styles.card}>
          {children}
        </Card>
      )}
      {footnote ? (
        <Text variant="footnote" tone="subtle" style={styles.title}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  title: { paddingHorizontal: space.xs },
  card: { gap: space.xs, paddingVertical: space.xs },
});
