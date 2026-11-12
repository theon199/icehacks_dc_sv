import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space, Text } from '@/ui';

export interface SectionTitleProps {
  title: string;
  /** Optional trailing element, e.g. a count or a small button. */
  trailing?: ReactNode;
}

export function SectionTitle({ title, trailing }: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <Text variant="title3">{title}</Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.sm,
  },
});
