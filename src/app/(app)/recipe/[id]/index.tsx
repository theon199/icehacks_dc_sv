import { useLocalSearchParams } from 'expo-router';

import { RecipeDetailScreen } from '@/features/recipe/screens/RecipeDetailScreen';
import { stringParam } from '@/lib/params';

export default function AppRecipeIdRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RecipeDetailScreen recipeId={stringParam(id) ?? ''} />;
}
