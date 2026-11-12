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

import { savePendingInvite, takePendingInvite } from './pendingInvite';
import { RootNavigator } from './RootNavigator';
import { SignedInEffects } from './SignedInEffects';

type UrlListener = (event: { url: string }) => void;

/** The link that launched the app, as the OS reports it. */
let mockInitialUrl: string | null = null;
const mockUrlListeners = new Set<UrlListener>();
// Links reach the app as OS events: the launch link, then one event per link opened while running.
jest.mock('expo-linking', () => ({
  ...jest.requireActual<object>('expo-linking'),
  createURL: (path: string) => `famara://${path}`,
  resolveScheme: () => 'famara',
  getInitialURL: () => Promise.resolve(mockInitialUrl),
  addEventListener: (_type: 'url', listener: UrlListener) => {
    mockUrlListeners.add(listener);
    return { remove: () => mockUrlListeners.delete(listener) };
  },
}));

/** The OS hands Famara a link while it is running. */
async function openLink(url: string) {
  await act(async () => {
    for (const listener of [...mockUrlListeners]) listener({ url });
  });
}

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
  mockInitialUrl = null;
  // Taking always clears, so it doubles as a reset between tests.
  await takePendingInvite();
});

describe('invite links before the app is available', () => {
  it('opens an invite tapped while signed out once the person signs in', async () => {
    useSessionStore.getState().signedOut();
    mockInitialUrl = `famara://invite/${CODE}`;
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
    mockInitialUrl = `famara://invite/${CODE.toLowerCase()}`;
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('onboarding screen')).toBeOnTheScreen();
    expect(await parkedInvite()).toBe(CODE);

    await act(async () => useSessionStore.getState().completeOnboarding());
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();
  });

  it('ignores a link with an invalid code', async () => {
    useSessionStore.getState().signedOut();
    mockInitialUrl = 'famara://invite/NOT-A-CODE';
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();

    await act(async () => signIn(true));
    expect(await screen.findByText('app home')).toBeOnTheScreen();
    expect(screen.queryByText(/^invite /)).toBeNull();
    expect(await takePendingInvite()).toBeNull();
  });

  it('leaves a link alone when the app is already open', async () => {
    signIn(true);
    mockInitialUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: `/invite/${CODE}`, wrapper: Providers });
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();

    // Signing out later must not park the link the router already opened.
    await act(async () => useSessionStore.getState().signedOut());
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    expect(await takePendingInvite()).toBeNull();
  });

  it('parks the same invite again when it is tapped again after signing out', async () => {
    signIn(true);
    mockInitialUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: `/invite/${CODE}`, wrapper: Providers });
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();

    await act(async () => useSessionStore.getState().signedOut());
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    await openLink(`famara://invite/${CODE}`);
    expect(await parkedInvite()).toBe(CODE);

    await act(async () => signIn(true));
    expect(await screen.findByText(`invite ${CODE}`)).toBeOnTheScreen();
  });

  it('parks an invite tapped while the app is running signed out', async () => {
    useSessionStore.getState().signedOut();
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    expect(await screen.findByText('welcome screen')).toBeOnTheScreen();
    await openLink(`https://famara.app/invite/${CODE}`);
    expect(await parkedInvite()).toBe(CODE);
  });

  it('waits for the stored session before deciding about the launch link', async () => {
    mockInitialUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    await act(async () => undefined);
    expect(await parkedInvite()).toBeNull();

    // The session turns out to be signed out: the link is parked now.
    await act(async () => useSessionStore.getState().signedOut());
    expect(await parkedInvite()).toBe(CODE);
  });

  it('drops the launch link when the stored session turns out to be ready', async () => {
    mockInitialUrl = `famara://invite/${CODE}`;
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    await act(async () => undefined);
    await act(async () => signIn(true));
    await act(async () => useSessionStore.getState().signedOut());
    expect(await parkedInvite()).toBeNull();
  });
});
