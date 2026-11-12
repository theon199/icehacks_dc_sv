import { useLocalSearchParams } from 'expo-router';

import { CookDoneScreen } from '@/features/cook/screens/CookDoneScreen';
import { stringParam } from '@/lib/params';

export default function AppCookIdDoneRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CookDoneScreen recipeId={stringParam(id) ?? ''} />;
}
