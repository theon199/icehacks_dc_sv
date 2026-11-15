import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/lib/catalog';
import { formatKcal, formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

import { useScreenedRecipes } from '../hooks/useScreenedRecipes';

const THUMB = 42;

function details(recipe: RecipeSummary): string {
  const parts = [
    recipe.totalMinutes != null ? formatMinutes(recipe.totalMinutes) : null,
    recipe.nutrition?.kcal != null ? formatKcal(recipe.nutrition.kcal) : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const RecipeRow = memo(function RecipeRow({ recipe }: { recipe: RecipeSummary }) {
  const theme = useTheme();
  const router = useRouter();
  const meta = details(recipe);
  return (
    <PressableScale
      testID={`chef-recipe-${recipe.id}`}
      accessibilityRole="button"
      accessibilityLabel={[recipe.title, meta].filter(Boolean).join(', ')}
      accessibilityHint="Opens the recipe"
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
      pressedScale={0.99}
      style={styles.row}
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.md },
        ]}
      >
        {recipe.imageUrl ? (
          <Image
            source={{ uri: recipe.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={recipe.id}
            transition={120}
            accessible={false}
          />
        ) : (
          <Icon name="fork.knife" size={18} color="textMuted" />
        )}
      </View>
      <View style={styles.text}>
        <Text variant="label" numberOfLines={2} accessible={false}>
          {recipe.title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1} accessible={false}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron.right" size={16} color="textMuted" />
    </PressableScale>
  );
});

/**
 * Recipes Chef recommended in one reply, as compact rows under a hairline inside the answer card.
 * Ids are screened again here against the person's current allergens and diet, so a row only shows
 * while the recipe is safe for them; with none left, nothing renders, divider included.
 */
export const RecipeRows = memo(function RecipeRows({ ids }: { ids: readonly string[] }) {
  const theme = useTheme();
  const recipes = useScreenedRecipes(ids);
  if (recipes.length === 0) return null;
  return (
    <View
      accessibilityLabel="Recipes Chef suggested"
      style={[styles.list, { borderTopColor: theme.colors.hairline }]}
    >
      {recipes.map((recipe) => (
        <RecipeRow key={recipe.id} recipe={recipe} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { marginTop: space.xs, paddingTop: space.xs, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm - 1 },
  thumb: {
    width: THUMB,
    height: THUMB,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 1 },
});
