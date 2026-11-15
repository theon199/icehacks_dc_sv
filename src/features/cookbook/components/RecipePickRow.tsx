import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/lib/catalog';
import { PressableScale, space, Text, useTheme } from '@/ui';

import { cardMeta } from './SavedRecipeRow';

export interface RecipePickRowProps {
  recipe: RecipeSummary;
  onPick: (recipe: RecipeSummary) => void;
}

/** A recipe in the "add a meal" list; tapping it places it in the slot being filled. */
export const RecipePickRow = memo(function RecipePickRow({ recipe, onPick }: RecipePickRowProps) {
  const theme = useTheme();
  const meta = cardMeta(recipe);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}, ${meta}`}
      accessibilityHint="Adds it to this meal"
      onPress={() => onPick(recipe)}
      testID={`pick-${recipe.id}`}
      style={[
        styles.row,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.lg },
      ]}
    >
      <Image
        source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
        recyclingKey={recipe.id}
        contentFit="cover"
        style={[
          styles.thumb,
          { borderRadius: theme.radii.md, backgroundColor: theme.colors.surface },
        ]}
        accessible={false}
      />
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm },
  thumb: { width: 48, height: 48 },
  text: { flex: 1, gap: space.xxs },
});
