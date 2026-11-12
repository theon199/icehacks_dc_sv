import { useLocalSearchParams } from 'expo-router';

import { CompareScreen } from '@/features/recipe/screens/CompareScreen';
import { stringParam } from '@/lib/params';

export default function AppCompareRoute() {
  const { from, to } = useLocalSearchParams<{ from?: string; to?: string }>();
  return <CompareScreen fromId={stringParam(from)} toId={stringParam(to)} />;
}
