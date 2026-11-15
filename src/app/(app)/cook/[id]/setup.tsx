import { useLocalSearchParams } from 'expo-router';

import { CoachSetupScreen } from '@/features/coachSetup';
import { stringParam } from '@/lib/params';

export default function AppCookSetupRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CoachSetupScreen recipeId={stringParam(id) ?? ''} />;
}
