import { useLocalSearchParams } from 'expo-router';

import { ChefScreen } from '@/features/chef/screens/ChefScreen';
import { stringParam } from '@/lib/params';

export default function AppChefRoute() {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return <ChefScreen threadId={stringParam(thread)} />;
}
