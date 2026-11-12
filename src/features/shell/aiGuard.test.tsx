/**
 * Exercises the `(app)` layout's AI guard through the real router: a deep link to an AI screen
 * only lands there for an adult who has agreed to the AI terms.
 */
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType, ReactNode } from 'react';
import { Text } from 'react-native';

import AppLayout from '@/app/(app)/_layout';
import { useSessionStore } from '@/features/auth';
import { appScreens } from '@/features/shell/appScreens';
import { ThemeProvider } from '@/ui/ThemeProvider';

// The layout also mounts the session's background work, which needs the app's query client and
// native modules; it has its own tests, and this file is only about the AI guard.
jest.mock('@/features/shell/SignedInEffects', () => ({ SignedInEffects: () => null }));

/** A stand-in screen that just prints its name. */
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
  chef: label('chef screen'),
  'ai-consent': label('consent sheet'),
};
delete routes['(tabs)'];

function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider scheme="light">{children}</ThemeProvider>;
}

const initial = useSessionStore.getState();
const thisYear = new Date().getFullYear();

function signIn(age: number, aiConsent: boolean) {
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    // ageFromBirthYear takes the lower bound, so add one to land on the intended age.
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent,
  });
}

beforeEach(() => useSessionStore.setState(initial, true));
afterEach(() => jest.useRealTimers());

describe('AI route guard', () => {
  it('opens Chef for an adult who agreed to the AI terms', async () => {
    signIn(30, true);
    await renderRouter(routes, { initialUrl: '/chef', wrapper: Providers });
    expect(await screen.findByText('chef screen')).toBeOnTheScreen();
  });

  it.each([
    ['an adult without consent', 30, false],
    ['a 16 year old with consent', 16, true],
  ])('sends %s back to the tabs', async (_who, age, consent) => {
    signIn(age, consent);
    await renderRouter(routes, { initialUrl: '/chef', wrapper: Providers });
    expect(await screen.findByText('home tab')).toBeOnTheScreen();
    expect(screen.queryByText('chef screen')).toBeNull();
  });

  it('keeps the consent sheet reachable without consent', async () => {
    signIn(30, false);
    await renderRouter(routes, { initialUrl: '/ai-consent', wrapper: Providers });
    expect(await screen.findByText('consent sheet')).toBeOnTheScreen();
  });
});
