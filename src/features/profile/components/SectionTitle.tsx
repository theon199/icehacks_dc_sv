import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space, Text } from '@/ui';

export interface SectionTitleProps {
  title: string;
  /** Optional trailing element, e.g. a count or a small button. */
  trailing?: ReactNode;
}

/** A sentence-case section label over a profile card or list. */
export function SectionTitle({ title, trailing }: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <Text variant="sectionLabel" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
