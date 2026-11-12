import { router } from 'expo-router';

import { Chip } from '@/ui';

import { useRecipeSummary } from '../hooks/useRecipes';

/** Link from a post to the recipe it is about. Hidden when the recipe is not in this catalog. */
export function RecipeChip({ recipeId }: { recipeId: string }) {
  const recipe = useRecipeSummary(recipeId);
  if (!recipe) return null;
  return (
    <Chip
      label={recipe.title}
      icon="fork.knife"
      tone="primary"
      onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
    />
  );
}
