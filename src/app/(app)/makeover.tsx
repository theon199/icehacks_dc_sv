import { Stack, useLocalSearchParams } from 'expo-router';

import { MakeoverScreen } from '@/features/makeover';
import { stringParam } from '@/lib/params';

export default function AppMakeoverRoute() {
  const { recipe } = useLocalSearchParams<{ recipe?: string }>();
  return (
    <>
      {/* The screen draws its own glass close button and title. */}
      <Stack.Screen options={{ headerShown: false }} />
      <MakeoverScreen recipeId={stringParam(recipe)} />
    </>
  );
}
