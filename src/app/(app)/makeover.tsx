import { useLocalSearchParams } from 'expo-router';

import { MakeoverScreen } from '@/features/chef/screens/MakeoverScreen';
import { stringParam } from '@/lib/params';

export default function AppMakeoverRoute() {
  const { recipe } = useLocalSearchParams<{ recipe?: string }>();
  return <MakeoverScreen recipeId={stringParam(recipe)} />;
}
