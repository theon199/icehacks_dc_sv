import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIngredients } from '@/lib/catalog';
import type { NewPantryItem } from '@/stores/pantry';
import { Chip, Text, space } from '@/ui';

import { missingStaples, QUICK_STAPLE_IDS } from '../staples';

export interface QuickStaplesProps {
  onHand: ReadonlySet<string>;
  onAdd: (input: NewPantryItem) => void;
}

/** One-tap chips for everyday staples the pantry does not have yet, wrapping across the sheet. */
export function QuickStaples({ onHand, onAdd }: QuickStaplesProps) {
  const staples = useIngredients(QUICK_STAPLE_IDS);
  const chips = useMemo(() => {
    const byId = new Map((staples.data ?? []).map((ingredient) => [ingredient.id, ingredient]));
    return missingStaples(QUICK_STAPLE_IDS, onHand).flatMap((id) => {
      const ingredient = byId.get(id);
      return ingredient ? [ingredient] : [];
    });
  }, [staples.data, onHand]);

  if (chips.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text variant="sectionLabel" tone="muted" accessibilityRole="header">
        Quick add staples
      </Text>
      <View style={styles.row}>
        {chips.map((ingredient) => (
          <Chip
            key={ingredient.id}
            testID={`staple-${ingredient.id}`}
            label={ingredient.name}
            icon="plus"
            tone="primary"
            onPress={() =>
              onAdd({
                ingredientId: ingredient.id,
                name: ingredient.name,
                category: ingredient.category,
              })
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
