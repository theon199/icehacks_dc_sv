/**
 * The root layout's default status bar must not outrank a screen's own. React Native merges
 * mounted status bars in mount order, so a dark screen that is on screen from the first frame
 * (the age gate after a relaunch) only gets its light status bar if the default mounts first.
 */
import { render } from '@testing-library/react-native';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootLayout from '@/app/_layout';
import { useSessionStore, type NightTheme } from '@/features/auth';

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: async () => undefined,
  hideAsync: async () => undefined,
  setOptions: () => undefined,
}));
jest.mock('@/lib/env', () => ({ readPublicEnv: () => ({ ok: true }) }));
jest.mock('@/lib/query/client', () => ({
  ...jest.requireActual<object>('@/lib/query/client'),
  wireQueryManagers: () => () => undefined,
}));
jest.mock('@/features/auth', () => ({
  ...jest.requireActual<object>('@/features/auth'),
  useSessionBootstrap: () => undefined,
}));
// Stands in for the navigator showing the age gate, which draws on the night canvas.
jest.mock('@/features/shell/RootNavigator', () => {
  const auth = jest.requireActual<{ NightTheme: typeof NightTheme }>('@/features/auth');
  return { RootNavigator: () => <auth.NightTheme>{null}</auth.NightTheme> };
});

const pushed = jest.spyOn(StatusBar, 'pushStackEntry');

// Expo Router wraps the root layout in a provider that already knows the window's insets.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

it('lets a dark screen shown on the first frame keep its light status bar', async () => {
  useSessionStore.setState({ status: 'needsSetup' });
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RootLayout />
    </SafeAreaProvider>,
  );
  const styles = pushed.mock.calls.map(([props]) => props.barStyle);
  expect(styles).toContain('light-content');
  expect(styles.at(-1)).toBe('light-content');
});
