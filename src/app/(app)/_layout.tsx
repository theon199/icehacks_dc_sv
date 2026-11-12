import { Stack } from 'expo-router';

import { appScreens } from '@/features/shell/appScreens';
import { useTheme } from '@/ui';
import { useStackScreenOptions } from '@/ui/navigation';

/** Signed-in app: the tab bar plus every screen pushed or presented above it. */
export default function AppLayout() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      {appScreens.map((screen) => (
        <Stack.Screen key={screen.name} name={screen.name} options={screen.options(theme)} />
      ))}
    </Stack>
  );
}
