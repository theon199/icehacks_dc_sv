import { useLocalSearchParams } from 'expo-router';

import { plannedPortionParam } from '@/features/recipe/model/plannedPortion';
import { RecipeDetailScreen } from '@/features/recipe/screens/RecipeDetailScreen';
import { stringParam } from '@/lib/params';

export default function AppRecipeIdRoute() {
  const { id, portion } = useLocalSearchParams<{ id?: string; portion?: string }>();
  return (
    <RecipeDetailScreen
      recipeId={stringParam(id) ?? ''}
      plannedPortion={plannedPortionParam(portion)}
    />
  );
}
