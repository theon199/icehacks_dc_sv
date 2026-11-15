import { useLocalSearchParams } from 'expo-router';

import { CoachScreen } from '@/features/cook/coach/CoachScreen';
import { stringParam } from '@/lib/params';

export default function AppCookCoachRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CoachScreen recipeId={stringParam(id) ?? ''} />;
}
