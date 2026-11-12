import { ComingSoon } from '@/ui';

export interface RecipeDetailScreenProps {
  recipeId: string;
}

/** Placeholder until the recipe feature ships. */
export function RecipeDetailScreen(_props: RecipeDetailScreenProps) {
  return (
    <ComingSoon title="Recipe" description="Ingredients, steps and nutrition." icon="fork.knife" />
  );
}
