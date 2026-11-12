import { useLocalSearchParams } from 'expo-router';

import { ComposeScreen } from '@/features/community/screens/ComposeScreen';
import { stringParam } from '@/lib/params';

export default function AppComposeRoute() {
  const { recipe } = useLocalSearchParams<{ recipe?: string }>();
  return <ComposeScreen recipeId={stringParam(recipe)} />;
}
