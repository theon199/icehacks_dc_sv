/**
 * Drives the real root navigator, the (setup) layout and the real auth link screens through
 * expo-router. Those screens sit outside the guarded groups, so when they finish they must go to
 * the screen the guards allow for the person's status; a guarded route would be silently dropped.
 */
import { userEvent } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthLayout from '@/app/(auth)/_layout';
import SetupLayout from '@/app/(setup)/_layout';
import NotFoundRoute from '@/app/+not-found';
import AuthCallbackRoute from '@/app/auth/callback';
import AuthResetPasswordRoute from '@/app/auth/reset-password';
import { RootNavigator } from '@/features/shell/RootNavigator';
import { ThemeProvider } from '@/ui/ThemeProvider';

import { completeCallback, hasSession, updatePassword } from './authActions';
import { authFailure } from './authErrors';
import { useSessionStore, type SignedInProfile } from './sessionStore';

// The router's test helpers replace Reanimated with its bundled mock, which lacks the
// `useReducedMotion` the real buttons on these screens call; hand them the library itself instead.
jest.mock('react-native-reanimated/mock', () => jest.requireActual('react-native-reanimated'));
jest.mock('./authActions', () => ({
  completeCallback: jest.fn(),
  hasSession: jest.fn(),
  updatePassword: jest.fn(),
}));

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
  'auth/callback': AuthCallbackRoute,
  'auth/reset-password': AuthResetPasswordRoute,
  'about/_layout': () => <Slot />,
  'about/terms': label('terms page'),
  '+not-found': NotFoundRoute,
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

const brandNew: SignedInProfile = { userId: 'new-1', birthYear: null, onboardingComplete: false };
const returning: SignedInProfile = {
  userId: 'back-1',
  birthYear: thisYear - 40,
  onboardingComplete: true,
};

/** The auth library reports SIGNED_IN while the exchange is still settling, as on a device. */
function linkSignsIn(profile: SignedInProfile, recovery = false) {
  jest.mocked(completeCallback).mockImplementationOnce(async () => {
    useSessionStore.getState().signedIn(profile);
    return { ok: true, value: { recovery } };
  });
}

const openCallback = () =>
  renderRouter(routes, { initialUrl: '/auth/callback?code=abc', wrapper: Providers });

beforeEach(() => {
  useSessionStore.setState(initial, true);
  useSessionStore.getState().signedOut();
  jest.mocked(hasSession).mockResolvedValue(false);
});

describe('auth callback hand-over', () => {
  it('takes a brand-new account to the birth year screen', async () => {
    linkSignsIn(brandNew);
    await openCallback();
    expect(await screen.findByText('birth year screen')).toBeOnTheScreen();
    expect(screen.queryByText('Signing you in…')).toBeNull();
    expect(useSessionStore.getState().status).toBe('needsSetup');
  });

  it('skips the age gate for a new account whose birth year is already known', async () => {
    linkSignsIn({ userId: 'new-2', birthYear: thisYear - 30, onboardingComplete: false });
    await openCallback();
    expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
    expect(screen.queryByText('birth year screen')).toBeNull();
  });

  it('opens the app for a returning account', async () => {
    linkSignsIn(returning);
    await openCallback();
    expect(await screen.findByText('app home')).toBeOnTheScreen();
  });

  it('asks for a new password after a recovery link, whatever the setup state', async () => {
    jest.mocked(hasSession).mockResolvedValue(true);
    linkSignsIn(brandNew, true);
    await openCallback();
    expect(await screen.findByText('Choose a new password.')).toBeOnTheScreen();
    expect(screen.queryByText('birth year screen')).toBeNull();
  });

  it('moves on when the link was already used but a session exists', async () => {
    jest.mocked(completeCallback).mockImplementationOnce(async () => {
      useSessionStore.getState().signedIn(brandNew);
      return { ok: false, failure: authFailure('link_expired') };
    });
    jest.mocked(hasSession).mockResolvedValue(true);
    await openCallback();
    expect(await screen.findByText('birth year screen')).toBeOnTheScreen();
  });

  it('still explains a link that failed', async () => {
    jest.mocked(completeCallback).mockResolvedValueOnce({
      ok: false,
      failure: authFailure('link_expired'),
    });
    await openCallback();
    expect(await screen.findByText('That link didn’t work')).toBeOnTheScreen();
  });
});

describe('other unguarded screens hand over the same way', () => {
  it('leaves the new password screen for setup when the account is not set up yet', async () => {
    jest.mocked(hasSession).mockResolvedValue(true);
    jest.mocked(updatePassword).mockResolvedValue({ ok: true, value: undefined });
    useSessionStore.getState().signedIn(brandNew);
    await renderRouter(routes, { initialUrl: '/auth/reset-password', wrapper: Providers });
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('new-password'), 'a much longer passphrase');
    await user.press(screen.getByTestId('new-password-submit'));
    expect(await screen.findByText('birth year screen')).toBeOnTheScreen();
  });

  it('sends a signed-out person from the not-found page to the welcome flow', async () => {
    await renderRouter(routes, { initialUrl: '/no-such-page', wrapper: Providers });
    await userEvent.setup().press(await screen.findByText('Go to Famara'));
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
  });

  it('sends someone in setup from the not-found page to their setup screen', async () => {
    useSessionStore.getState().signedIn(brandNew);
    await renderRouter(routes, { initialUrl: '/no-such-page', wrapper: Providers });
    await userEvent.setup().press(await screen.findByText('Go to Famara'));
    expect(await screen.findByText('birth year screen')).toBeOnTheScreen();
  });
});
