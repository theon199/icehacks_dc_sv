import { useLocalSearchParams } from 'expo-router';

import { MyRecipeScreen } from '@/features/myRecipes/screens/MyRecipeScreen';
import { stringParam } from '@/lib/params';

export default function AppMyRecipeRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  return <MyRecipeScreen id={stringParam(id) ?? null} />;
}
