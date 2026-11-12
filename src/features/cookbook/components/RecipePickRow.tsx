import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/lib/catalog';
import { Icon, PressableScale, space, Text, useTheme } from '@/ui';

import { cardMeta } from './SavedRecipeCard';

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
      pressedOpacity={0.7}
      pressedScale={1}
      testID={`pick-${recipe.id}`}
      style={styles.row}
    >
      <Image
        source={recipe.imageUrl ? { uri: recipe.imageUrl } : null}
        recyclingKey={recipe.id}
        contentFit="cover"
        style={[
          styles.thumb,
          { borderRadius: theme.radii.sm, backgroundColor: theme.colors.surfaceSunken },
        ]}
        accessible={false}
      />
      <View style={styles.text}>
        <Text variant="subhead" numberOfLines={2}>
          {recipe.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Icon name="plus.circle" size={22} color="primary" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  thumb: { width: 52, height: 52 },
  text: { flex: 1, gap: space.xxs },
});
