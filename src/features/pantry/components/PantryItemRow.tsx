import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UnitSystem } from '@/domain/units';
import type { PantryItem } from '@/stores/pantry';
import { Icon, PressableScale, Text, space, useTheme, type TextTone } from '@/ui';

import { expiryHint, quantityLabel, type ExpiryTone } from '../shelves';

export interface PantryItemRowProps {
  item: PantryItem;
  system: UnitSystem;
  now: Date;
  onEdit: (id: string) => void;
}

const EXPIRY_TONE: Readonly<Record<ExpiryTone, TextTone>> = {
  past: 'danger',
  soon: 'accent',
  later: 'muted',
};

function PantryItemRowBase({ item, system, now, onEdit }: PantryItemRowProps) {
  const theme = useTheme();
  const amount = quantityLabel(item, system);
  const expiry = expiryHint(item.expiresAt, now);
  const details = [amount ?? 'Some on hand', expiry?.label].filter(Boolean).join(', ');

  return (
    <PressableScale
      testID={`pantry-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${details}`}
      accessibilityHint="Edit or remove"
      pressedScale={0.99}
      pressedOpacity={0.7}
      onPress={() => onEdit(item.id)}
      style={[styles.row, { borderColor: theme.colors.border }]}
    >
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1}>
          {item.name}
        </Text>
        {expiry ? (
          <Text variant="footnote" tone={EXPIRY_TONE[expiry.tone]} numberOfLines={1}>
            {expiry.label}
          </Text>
        ) : null}
      </View>
      <Text variant="callout" tone={amount ? 'default' : 'subtle'} numberOfLines={1}>
        {amount ?? 'Some'}
      </Text>
      <Icon name="chevron.right" size={14} color="textSubtle" weight="semibold" />
    </PressableScale>
  );
}

export const PantryItemRow = memo(PantryItemRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
