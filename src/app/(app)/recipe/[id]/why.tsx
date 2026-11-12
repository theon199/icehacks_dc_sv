import { useLocalSearchParams } from 'expo-router';

import { WhyThisFitsScreen } from '@/features/recipe/screens/WhyThisFitsScreen';
import { stringParam } from '@/lib/params';

export default function AppRecipeIdWhyRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <WhyThisFitsScreen recipeId={stringParam(id) ?? ''} />;
}
