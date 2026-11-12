import { useLocalSearchParams } from 'expo-router';

import { CookModeScreen } from '@/features/cook/screens/CookModeScreen';
import { stringParam } from '@/lib/params';

export default function AppCookIdRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CookModeScreen recipeId={stringParam(id) ?? ''} />;
}
