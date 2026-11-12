/**
 * Drives the real root navigator through expo-router: an invite link opened before the signed-in
 * app is available is parked, then opened once the session becomes ready.
 */
import { Slot, Stack, useLocalSearchParams } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import type { ComponentType, ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth';
import { ThemeProvider } from '@/ui/ThemeProvider';

import { clearPendingInvite, savePendingInvite, takePendingInvite } from './pendingInvite';
import { RootNavigator } from './RootNavigator';
import { SignedInEffects } from './SignedInEffects';

let mockUrl: string | null = null;
// The router listens for links through expo-linking too, so only the hook is replaced.
jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  useURL: () => mockUrl,
}));
// The notification plumbing and the cook queue have their own tests; here they only need to mount.
jest.mock('@/features/notifications', () => ({ NotificationBridge: () => null }));
jest.mock('@/features/cook', () => ({ useFlushPendingCooks: () => undefined }));

const CODE = 'ABCDEFGH23';

function label(text: string) {
  return function StandIn() {
    return <Text>{text}</Text>;
  };
}

function AppLayoutStandIn() {
  return (
    <>
      <SignedInEffects />
      <Stack />
    </>
  );
}

function InviteStandIn() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Text>{`invite ${code}`}</Text>;
}

const routes: Record<string, ComponentType> = {
  _layout: RootNavigator,
  '(auth)/_layout': () => <Slot />,
  '(auth)/welcome': label('welcome screen'),
  '(setup)/_layout': () => <Slot />,
  '(setup)/onboarding': label('onboarding screen'),
  '(app)/_layout': AppLayoutStandIn,
  '(app)/index': label('app home'),
  '(app)/invite/[code]': InviteStandIn,
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
const adultBirthYear = new Date().getFullYear() - 30;

function signIn(onboardingComplete: boolean) {
  useSessionStore
    .getState()
    .signedIn({ userId: 'person-1', birthYear: adultBirthYear, onboardingComplete });
}

/** The parked invite, left in place. Lets pending storage writes settle first. */
async function parkedInvite(): Promise<string | null> {
  await act(async () => undefined);
  const code = await takePendingInvite();
  if (code) await savePendingInvite(code);
  return code;
}

beforeEach(async () => {
  useSessionStore.setState(initial, true);
  mockUrl = null;
  await clearPendingInvite();
});

describe('invite links before the app is available', () => {
  it('opens an invite tapped while signed out once the person signs in', async () => {
    useSessionStore.getState().signedOut();
    mockUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: `/invite/${CODE}`, wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    expect(await parkedInvite()).toBe(CODE);

    await act(async () => signIn(true));
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();
    // Opened once: nothing is left to open again.
    expect(await takePendingInvite()).toBeNull();
  });

  it('keeps the invite through setup and opens it when setup finishes', async () => {
    signIn(false);
    mockUrl = `famara://invite/${CODE.toLowerCase()}`;
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
    expect(await parkedInvite()).toBe(CODE);

    await act(async () => useSessionStore.getState().completeOnboarding());
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();
  });

  it('ignores a link with an invalid code', async () => {
    useSessionStore.getState().signedOut();
    mockUrl = 'famara://invite/NOT-A-CODE';
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();

    await act(async () => signIn(true));
    expect(await screen.findByText('app home')).toBeOnTheScreen();
    expect(screen.queryByText(/^invite /)).toBeNull();
    expect(await takePendingInvite()).toBeNull();
  });

  it('leaves a link alone when the app is already open', async () => {
    signIn(true);
    mockUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: `/invite/${CODE}`, wrapper: Providers });
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();

    // Signing out later must not park the link the router already opened.
    await act(async () => useSessionStore.getState().signedOut());
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    expect(await takePendingInvite()).toBeNull();
  });
});
