import { useLocalSearchParams } from 'expo-router';

import { cookSizeFromParams } from '@/features/cook/logic/ingredients';
import { CookModeScreen } from '@/features/cook/screens/CookModeScreen';
import { stringParam } from '@/lib/params';

export default function AppCookIdRoute() {
  const { id, servings, portion } = useLocalSearchParams<{
    id?: string;
    servings?: string;
    portion?: string;
  }>();
  return (
    <CookModeScreen recipeId={stringParam(id) ?? ''} size={cookSizeFromParams(servings, portion)} />
  );
}
