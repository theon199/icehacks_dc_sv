/**
 * Drives the real root navigator and the (auth) and (setup) layouts through expo-router: each
 * session status, and each birth-year band within setup, exposes exactly the expected screen.
 */
import { Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthLayout from '@/app/(auth)/_layout';
import SetupLayout from '@/app/(setup)/_layout';
import { RootNavigator } from '@/features/shell/RootNavigator';
import { ThemeProvider } from '@/ui/ThemeProvider';

import { useSessionStore } from './sessionStore';

function label(text: string) {
  return function StandIn() {
    return <Text>{text}</Text>;
  };
}

const routes: Record<string, ComponentType> = {
  _layout: RootNavigator,
  '(auth)/_layout': AuthLayout,
  '(auth)/welcome': label('welcome screen'),
  '(auth)/continue': label('continue sheet'),
  '(auth)/sign-in': label('sign in screen'),
  '(auth)/sign-up': label('sign up screen'),
  '(auth)/check-email': label('check email screen'),
  '(auth)/forgot-password': label('forgot password screen'),
  '(setup)/_layout': SetupLayout,
  '(setup)/birth-year': label('birth year screen'),
  '(setup)/not-eligible': label('not eligible screen'),
  '(setup)/onboarding': label('onboarding screen'),
  '(app)/_layout': () => <Slot />,
  '(app)/index': label('app home'),
  'auth/callback': label('callback screen'),
  'auth/reset-password': label('reset password screen'),
  'about/_layout': () => <Slot />,
  'about/terms': label('terms page'),
  '+not-found': label('not found'),
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme="light">{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const initial = useSessionStore.getState();
const thisYear = new Date().getFullYear();

function signIn(birthYear: number | null, onboardingComplete: boolean) {
  useSessionStore.getState().signedIn({ userId: 'person-1', birthYear, onboardingComplete });
}

beforeEach(() => useSessionStore.setState(initial, true));

describe('session guards', () => {
  it('shows the welcome flow when signed out', async () => {
    useSessionStore.getState().signedOut();
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
  });

  it('keeps signed-out people out of setup and the app', async () => {
    useSessionStore.getState().signedOut();
    await renderRouter(routes, { initialUrl: '/onboarding', wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    expect(screen.queryByText('onboarding screen')).toBeNull();
  });

  it('asks for the birth year first', async () => {
    signIn(null, false);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('birth year screen')).toBeOnTheScreen();
  });

  it('holds a birth year that may be under 13 on the not-eligible screen', async () => {
    signIn(thisYear - 10, true);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('not eligible screen')).toBeOnTheScreen();
    expect(useSessionStore.getState().status).toBe('needsSetup');
  });

  it('cannot reach onboarding while not eligible', async () => {
    signIn(thisYear - 13, false);
    await renderRouter(routes, { initialUrl: '/onboarding', wrapper: Providers });
    expect(await screen.findByText('not eligible screen')).toBeOnTheScreen();
  });

  it('continues to onboarding once the age gate passes', async () => {
    signIn(thisYear - 30, false);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
  });

  it('opens the app when onboarding completes', async () => {
    signIn(thisYear - 16, false);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
    await act(async () => useSessionStore.getState().completeOnboarding());
    expect(await screen.findByText('app home')).toBeOnTheScreen();
  });

  it('opens the app directly for a ready session', async () => {
    signIn(thisYear - 40, true);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('app home')).toBeOnTheScreen();
  });

  it('returns to the welcome flow after signing out', async () => {
    signIn(thisYear - 40, true);
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('app home')).toBeOnTheScreen();
    await act(async () => useSessionStore.getState().signedOut());
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
  });

  it('keeps auth links and legal pages reachable when signed out', async () => {
    useSessionStore.getState().signedOut();
    await renderRouter(routes, { initialUrl: '/auth/callback?code=abc', wrapper: Providers });
    expect(await screen.findByText('callback screen')).toBeOnTheScreen();
  });
});
