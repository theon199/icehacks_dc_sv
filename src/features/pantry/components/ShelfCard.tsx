import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UnitSystem } from '@/domain/units';
import type { IngredientCategory } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';
import { Icon, Text, fontFamily, radii, space, useTheme, type IconName } from '@/ui';

import { PantryTile } from './PantryTile';

/** Glyph beside each shelf's title; shelves without a clear picture share the cupboard. */
const SHELF_ICON: Readonly<Record<IngredientCategory, IconName>> = {
  produce: 'carrot',
  protein: 'fork.knife',
  dairy: 'refrigerator',
  grain: 'cabinet',
  legume: 'leaf',
  nut_seed: 'leaf',
  spice: 'leaf',
  condiment: 'cabinet',
  oil: 'cabinet',
  sweetener: 'cabinet',
  beverage: 'cabinet',
  other: 'cabinet',
};

/** The row that opens a shelf card: its glyph, then "Fruit & veg · 4". */
export const ShelfHeading = memo(function ShelfHeading({
  category,
  title,
  count,
}: {
  category: IngredientCategory;
  title: string;
  count: number;
}) {
  const theme = useTheme();
  return (
    <View
      testID={`pantry-shelf-${category}`}
      style={[styles.head, { backgroundColor: theme.colors.surface }]}
    >
      <Icon name={SHELF_ICON[category]} size={18} color="text" />
      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        {`${title} · ${count}`}
      </Text>
    </View>
  );
});

/** Up to four item tiles across a shelf card; the last row of a shelf rounds the card's foot. */
export const ShelfTiles = memo(function ShelfTiles({
  items,
  closes,
  system,
  now,
  onEdit,
}: {
  items: readonly PantryItem[];
  closes: boolean;
  system: UnitSystem;
  now: Date;
  onEdit: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[styles.tiles, { backgroundColor: theme.colors.surface }, closes ? styles.foot : null]}
    >
      {items.map((item) => (
        <PantryTile key={item.id} item={item} system={system} now={now} onEdit={onEdit} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.md,
    paddingTop: space.md,
    paddingHorizontal: space.sm + 6,
    paddingBottom: space.md,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
  },
  title: { flex: 1, fontFamily: fontFamily.textBold },
  tiles: { flexDirection: 'row', paddingHorizontal: space.sm },
  foot: { borderBottomLeftRadius: radii.card, borderBottomRightRadius: radii.card },
});
