import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useIngredients } from '@/lib/catalog';
import type { NewPantryItem } from '@/stores/pantry';
import { Chip, Text, space } from '@/ui';

import { missingStaples, QUICK_STAPLE_IDS } from '../staples';

export interface QuickStaplesProps {
  onHand: ReadonlySet<string>;
  onAdd: (input: NewPantryItem) => void;
}

/** One-tap chips for everyday staples the pantry does not have yet. */
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
      <Text variant="subhead" tone="muted">
        Quick add staples
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  row: { gap: space.sm, paddingRight: space.lg },
});
