/**
 * The signed-in layout is where launch-time work starts: Settings' launch sync and the session's
 * background effects must both run as soon as someone signed in reaches the app, whichever screen
 * opens first.
 */
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType, ReactNode } from 'react';
import { Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import { useSessionStore } from '@/features/auth';
import { appScreens } from '@/features/shell/appScreens';
import { ThemeProvider } from '@/ui/ThemeProvider';

const mockLaunchSync = jest.fn();
jest.mock('@/features/settings', () => ({ useSettingsLaunchSync: () => mockLaunchSync() }));
jest.mock('@/features/shell/SignedInEffects', () => {
  const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
  return { SignedInEffects: () => <MockText>signed-in effects</MockText> };
});

function label(text: string) {
  return function StandIn() {
    return <Text>{text}</Text>;
  };
}

// Every screen the layout declares gets a stand-in, so the route tree matches the real one.
const routes: Record<string, ComponentType> = {
  ...Object.fromEntries(appScreens.map((s) => [s.name, label(s.name)])),
  _layout: AppLayout,
  '(tabs)/_layout': () => <Slot />,
  '(tabs)/index': label('home tab'),
  pantry: label('pantry screen'),
};
delete routes['(tabs)'];

function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider scheme="light">{children}</ThemeProvider>;
}

beforeEach(() => {
  mockLaunchSync.mockClear();
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: new Date().getFullYear() - 31,
    onboardingComplete: true,
  });
});

describe('signed-in layout', () => {
  it.each([
    ['the home tab', '/', 'home tab'],
    ['a deep link', '/pantry', 'pantry screen'],
    ['the Health screen Settings links to', '/health', 'health'],
  ])('starts launch sync and the session effects when opening %s', async (_case, url, text) => {
    await renderRouter(routes, { initialUrl: url, wrapper: Providers });
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(screen.getByText('signed-in effects')).toBeOnTheScreen();
    expect(mockLaunchSync).toHaveBeenCalled();
  });
});
