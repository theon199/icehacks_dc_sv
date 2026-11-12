import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { RecipeSummary } from '@/lib/catalog';
import { formatKcal, formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

import { useScreenedRecipes } from '../hooks/useScreenedRecipes';

const CARD_WIDTH = 168;
const IMAGE_HEIGHT = 104;

function details(recipe: RecipeSummary): string {
  const parts = [
    recipe.totalMinutes != null ? formatMinutes(recipe.totalMinutes) : null,
    recipe.nutrition?.kcal != null ? formatKcal(recipe.nutrition.kcal) : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const RecipeCard = memo(function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
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
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
        },
      ]}
    >
      <View style={[styles.image, { backgroundColor: theme.colors.surfaceSunken }]}>
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
          <Icon name="fork.knife" size={28} color="textSubtle" />
        )}
      </View>
      <View style={styles.text}>
        <Text variant="subhead" numberOfLines={2}>
          {recipe.title}
        </Text>
        {meta ? (
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

/**
 * Recipes Chef recommended in one reply. Ids are screened again here against the person's current
 * allergens and diet, so a card only shows while the recipe is safe for them.
 */
export const RecipeCardRow = memo(function RecipeCardRow({ ids }: { ids: readonly string[] }) {
  const recipes = useScreenedRecipes(ids);
  if (recipes.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel="Recipes Chef suggested"
    >
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingVertical: space.xs },
  card: { width: CARD_WIDTH, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  image: { height: IMAGE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  text: { padding: space.sm, gap: 2 },
});
