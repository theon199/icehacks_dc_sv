import { Stack } from 'expo-router';

import { SnapDishScreen } from '@/features/snap/screens/SnapDishScreen';

export default function AppSnapDishRoute() {
  return (
    <>
      {/* The result draws over its own photo, with the close circle in place of a bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SnapDishScreen />
    </>
  );
}
