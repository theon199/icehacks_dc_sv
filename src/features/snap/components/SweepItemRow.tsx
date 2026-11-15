import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, space, Text, useTheme } from '@/ui';

import { SweepTag } from './SweepTag';
import { sweepItemLabel, type SweepItem } from '../logic/sweepItems';

export interface SweepItemRowProps {
  item: SweepItem;
  /** Just found: wears a brief "New" tag. */
  fresh: boolean;
}

/**
 * One line of the live sweep list: what was seen and how much. Editing waits for the review
 * screen, so the row is read-only while the camera is still moving.
 */
export const SweepItemRow = memo(function SweepItemRow({ item, fresh }: SweepItemRowProps) {
  const theme = useTheme();
  const label = sweepItemLabel(item);
  const said = item.origin === 'said';
  return (
    <View
      accessible
      accessibilityLabel={`${label}${said ? ', you said' : ''}${fresh ? ', new' : ''}`}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
      ]}
      testID={`sweep-item-${item.key}`}
    >
      <View style={[styles.check, { backgroundColor: theme.colors.highlight }]}>
        <Icon name="checkmark" size={13} color="onHighlight" weight="bold" />
      </View>
      <Text variant="callout" style={styles.name} numberOfLines={1} accessible={false}>
        {label}
      </Text>
      {fresh ? <SweepTag label="New" tone="highlight" /> : null}
      {said ? <SweepTag label="You said" tone="accent" /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md + space.xxs,
    marginBottom: space.sm - space.xxs,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1 },
});
