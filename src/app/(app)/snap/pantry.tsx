import { Stack } from 'expo-router';

import { SnapPantryScreen } from '@/features/snap/screens/SnapPantryScreen';

export default function AppSnapPantryRoute() {
  return (
    <>
      {/* The result draws over its own photo, with the close circle in place of a bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SnapPantryScreen />
    </>
  );
}
