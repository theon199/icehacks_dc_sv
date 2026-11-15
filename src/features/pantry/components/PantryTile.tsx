import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UnitSystem } from '@/domain/units';
import type { IngredientCategory } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';
import {
  PressableScale,
  Text,
  fontFamily,
  minTouchTarget,
  radii,
  space,
  useTheme,
  type Palette,
  type TextTone,
} from '@/ui';

import { expiryHint, quantityLabel, type ExpiryTone } from '../shelves';

export const PANTRY_THUMB = 56;

/** Cold-kept shelves get the soft lime wash; dry goods the stone one. */
const THUMB_TINT: Readonly<Record<IngredientCategory, keyof Palette>> = {
  produce: 'highlightSoft',
  protein: 'highlightSoft',
  dairy: 'highlightSoft',
  beverage: 'primarySoft',
  grain: 'surfaceSunken',
  legume: 'surfaceSunken',
  nut_seed: 'surfaceSunken',
  spice: 'surfaceSunken',
  condiment: 'surfaceSunken',
  oil: 'surfaceSunken',
  sweetener: 'surfaceSunken',
  other: 'surfaceSunken',
};

/** How a use-by hint reads on a tile; one still a while off shows the amount instead. */
const EXPIRY_TONE: Readonly<Record<ExpiryTone, TextTone | null>> = {
  past: 'danger',
  soon: 'accent',
  later: null,
};

/**
 * The picture of a pantry item. Items carry no photo, so it is a quiet tile with the item's
 * initial: no ingredient icon is guessed, so a tile never shows the wrong food.
 */
function PantryThumb({ name, category }: { name: string; category: IngredientCategory }) {
  const theme = useTheme();
  const initial = name.trim().charAt(0).toLocaleUpperCase();
  return (
    <View style={[styles.thumb, { backgroundColor: theme.colors[THUMB_TINT[category]] }]}>
      <Text variant="title1" tone="muted" accessible={false} maxFontSizeMultiplier={1}>
        {initial}
      </Text>
    </View>
  );
}

export interface PantryTileProps {
  item: PantryItem;
  system: UnitSystem;
  now: Date;
  onEdit: (id: string) => void;
}

function PantryTileBase({ item, system, now, onEdit }: PantryTileProps) {
  const amount = quantityLabel(item, system);
  const expiry = expiryHint(item.expiresAt, now);
  const details = [amount ?? 'Some on hand', expiry?.label].filter(Boolean).join(', ');
  const urgentTone = expiry ? EXPIRY_TONE[expiry.tone] : null;

  return (
    <PressableScale
      testID={`pantry-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${details}`}
      accessibilityHint="Edit or remove"
      pressedScale={0.96}
      onPress={() => onEdit(item.id)}
      style={styles.tile}
    >
      <PantryThumb name={item.name} category={item.category} />
      <Text variant="caption" align="center" numberOfLines={2} style={styles.name}>
        {item.name}
      </Text>
      {expiry && urgentTone ? (
        <Text
          variant="caption"
          tone={urgentTone}
          align="center"
          numberOfLines={2}
          style={[styles.quantity, styles.urgent]}
        >
          {expiry.label}
        </Text>
      ) : (
        <Text
          variant="caption"
          tone="muted"
          align="center"
          numberOfLines={1}
          style={styles.quantity}
        >
          {amount ?? 'Some'}
        </Text>
      )}
    </PressableScale>
  );
}

/** One item on a shelf card: its tile, name and amount, or how soon to use it. */
export const PantryTile = memo(PantryTileBase);

const styles = StyleSheet.create({
  tile: {
    width: '25%',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 3,
    paddingBottom: space.md,
    minHeight: minTouchTarget,
  },
  thumb: {
    width: PANTRY_THUMB,
    height: PANTRY_THUMB,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fontFamily.textSemiBold, minHeight: 30 },
  quantity: { marginTop: -space.xs },
  urgent: { fontFamily: fontFamily.textBold },
});
