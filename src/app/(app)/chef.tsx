import { Stack, useLocalSearchParams } from 'expo-router';

import { ChefScreen } from '@/features/chef';
import { stringParam } from '@/lib/params';

/** Chef draws its own Ask header with a glass back circle, so the native bar stays hidden. */
const options = { headerShown: false } as const;

export default function AppChefRoute() {
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return (
    <>
      <Stack.Screen options={options} />
      <ChefScreen threadId={stringParam(thread)} />
    </>
  );
}
