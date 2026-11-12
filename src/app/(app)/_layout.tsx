import { Stack } from 'expo-router';

import { selectCanUseAi, useSessionStore } from '@/features/auth';
import { useSettingsLaunchSync } from '@/features/settings';
import { appScreens, type AppScreen } from '@/features/shell/appScreens';
import { useTheme } from '@/ui';
import { useStackScreenOptions } from '@/ui/navigation';

const openScreens = appScreens.filter((screen) => !screen.ai);
const aiScreens = appScreens.filter((screen) => screen.ai);

/**
 * Signed-in app: the tab bar plus every screen pushed or presented above it. AI screens exist only
 * while the person may use AI, so links to them fall back to the tabs otherwise.
 */
export default function AppLayout() {
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  const canUseAi = useSessionStore((state) => selectCanUseAi(state));
  // Mounted here, where someone is signed in and set up, rather than in Settings: AI consent is
  // reconciled with the account at launch, and allergens an earlier build kept only in Settings
  // reach the safety filter without the person having to open Settings first.
  useSettingsLaunchSync();
  const toScreen = (screen: AppScreen) => (
    <Stack.Screen key={screen.name} name={screen.name} options={screen.options(theme)} />
  );
  return (
    <Stack screenOptions={screenOptions}>
      {openScreens.map(toScreen)}
      <Stack.Protected guard={canUseAi}>{aiScreens.map(toScreen)}</Stack.Protected>
    </Stack>
  );
}
