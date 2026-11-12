import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import Storage from 'expo-sqlite/kv-store';
import { Alert, type AlertButton, type Text } from 'react-native';

import { useSessionStore } from '@/features/auth';
import {
  defaultPreferences,
  resetUserStores,
  selectNotificationSettings,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';
import { useAppearanceStore, useToastStore } from '@/ui';

import { resetPushChoicesForTests } from '../pushChoices';
import { SettingsScreen } from './SettingsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
};
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockNotifications.getPermissionsAsync(),
  requestPermissionsAsync: () => mockNotifications.requestPermissionsAsync(),
}));

const mockAuth = {
  signOut: jest.fn(),
  getSession: jest.fn(),
  updateUser: jest.fn(),
  getUser: jest.fn(),
};
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ auth: mockAuth, rpc: jest.fn() }),
}));

type Categories = { social: boolean; follows: boolean };
/** Push categories as the server holds them, per account. */
let serverCategories: Record<string, Categories> = {};
const mockPushApi = {
  fetch: jest.fn(),
  save: jest.fn(),
  sync: jest.fn(),
};
jest.mock('@/features/notifications', () => ({
  fetchPushCategories: () => mockPushApi.fetch(),
  savePushCategories: (change: unknown) => mockPushApi.save(change),
  syncPushRegistration: (userId: string) => mockPushApi.sync(userId),
  unregisterPushDevice: () => Promise.resolve(),
}));

jest.mock('@/features/health', () => {
  const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
  return { HealthConnections: () => <MockText>apple health card</MockText> };
});

const mockModerator = { isModerator: false };
jest.mock('@/features/moderation', () => ({
  blockedPeopleHref: '/moderation/blocked',
  reviewQueueHref: '/moderation',
  useIsModerator: () => ({
    isModerator: mockModerator.isModerator,
    isLoading: false,
    error: null,
    retry: () => undefined,
  }),
}));

const currentCategories = (): Categories =>
  serverCategories[useSessionStore.getState().userId ?? ''] ?? { social: false, follows: false };

const thisYear = new Date().getFullYear();

function signIn(userId = 'user-1', age = 30) {
  useSessionStore.getState().signedIn({
    userId,
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent: false,
  });
}

const notificationSettings = () => selectNotificationSettings(useSettingsStore.getState());

/** Auth that keeps a session until it is signed out. */
function sessionUntilSignOut() {
  let stored = true;
  mockAuth.signOut.mockImplementation(async () => {
    stored = false;
    return { error: null };
  });
  mockAuth.getSession.mockImplementation(async () => ({
    data: { session: stored ? { access_token: 't' } : null },
    error: null,
  }));
}

beforeEach(() => {
  resetUserStores();
  resetPushChoicesForTests();
  useAppearanceStore.setState({ preference: 'system' });
  useToastStore.getState().clear();
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'offline' } });
  serverCategories = {};
  mockPushApi.fetch.mockImplementation(async () => currentCategories());
  mockPushApi.save.mockImplementation(async (change: Partial<Categories>) => {
    const next = { ...currentCategories(), ...change };
    serverCategories[useSessionStore.getState().userId ?? ''] = next;
    return next;
  });
  mockPushApi.sync.mockResolvedValue('registered');
  mockModerator.isModerator = false;
  signIn();
});

describe('SettingsScreen', () => {
  it('saves small appetite mode to the shared preferences', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-small-appetite'), 'valueChange', true);

    expect(screen.getByTestId('settings-small-appetite')).toHaveProp('value', true);
    expect(usePreferencesStore.getState().prefs.smallAppetite).toBe(true);
  });

  it('never shows one account’s push choices to another account on the same device', async () => {
    serverCategories['user-1'] = { social: true, follows: true };
    await renderWithTheme(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true),
    );
    await act(async () => signIn('user-2'));
    expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', false);
    expect(screen.getByTestId('settings-notify-follows')).toHaveProp('value', false);
  });

  it('starts the push switches off until the server answers', async () => {
    mockPushApi.fetch.mockImplementation(() => new Promise(() => undefined));
    await renderWithTheme(<SettingsScreen />);
    for (const key of ['social', 'follows']) {
      expect(screen.getByTestId(`settings-notify-${key}`)).toHaveProp('value', false);
    }
  });

  it('saves the units and appearance choices', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('tab', { name: 'Metric' }));
    await user.press(screen.getByRole('tab', { name: 'Dark' }));

    expect(useSettingsStore.getState().settings).toMatchObject({
      units: 'metric',
      appearance: 'dark',
    });
    expect(useAppearanceStore.getState().preference).toBe('dark');
    expect(Storage.getItemSync('famara:ui.appearance')).toContain('dark');
  });

  it('turns on a notification once permission is granted', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-social'), 'valueChange', true);

    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true),
    );
    expect(notificationSettings().social).toBe(true);
  });

  it('leaves a notification off and explains when permission is refused', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-follows'), 'valueChange', true);

    await waitFor(() => expect(useToastStore.getState().queue).toHaveLength(1));
    expect(screen.getByTestId('settings-notify-follows')).toHaveProp('value', false);
  });

  it('shows the push categories stored for the account', async () => {
    serverCategories['user-1'] = { social: true, follows: false };
    await renderWithTheme(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true),
    );
    expect(screen.getByTestId('settings-notify-follows')).toHaveProp('value', false);
  });

  it('saves push categories on the server and registers this device', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-follows'), 'valueChange', true);
    await waitFor(() => expect(mockPushApi.save).toHaveBeenCalledWith({ follows: true }));
    expect(serverCategories['user-1']).toEqual({ social: false, follows: true });
    await waitFor(() => expect(mockPushApi.sync).toHaveBeenCalledWith('user-1'));

    await fireEvent(screen.getByTestId('settings-notify-follows'), 'valueChange', false);
    await waitFor(() => expect(mockPushApi.save).toHaveBeenLastCalledWith({ follows: false }));
    expect(serverCategories['user-1']).toEqual({ social: false, follows: false });
    expect(screen.getByTestId('settings-notify-follows')).toHaveProp('value', false);
  });

  it('puts a push switch back when the server cannot save it', async () => {
    serverCategories['user-1'] = { social: true, follows: false };
    await renderWithTheme(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true),
    );
    mockPushApi.save.mockRejectedValueOnce(new Error('offline'));
    await fireEvent(screen.getByTestId('settings-notify-social'), 'valueChange', false);

    await waitFor(() => expect(useToastStore.getState().queue).toHaveLength(1));
    expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true);
    expect(serverCategories['user-1']).toEqual({ social: true, follows: false });
  });

  it('keeps cook timer alerts in the shared settings, not on the push server', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-cookTimers'), 'valueChange', false);
    expect(notificationSettings().cookTimers).toBe(false);
    await fireEvent(screen.getByTestId('settings-notify-cookTimers'), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-cookTimers')).toHaveProp('value', true),
    );
    expect(notificationSettings().cookTimers).toBe(true);
    expect(mockPushApi.save).not.toHaveBeenCalled();
  });

  it('shows the Apple Health connection and opens the Health screen', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    expect(screen.getByTestId('settings-health')).toBeOnTheScreen();
    expect(screen.getByText('apple health card')).toBeOnTheScreen();
    await user.press(screen.getByTestId('settings-health-insights'));
    expect(mockPush).toHaveBeenCalledWith('/health');
  });

  it('opens the blocked people list, and hides the review queue from members', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-blocked-people'));
    expect(mockPush).toHaveBeenCalledWith('/moderation/blocked');
    expect(screen.queryByTestId('settings-review-queue')).not.toBeOnTheScreen();
  });

  it('offers the review queue to moderators', async () => {
    mockModerator.isModerator = true;
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByTestId('settings-review-queue'));
    expect(mockPush).toHaveBeenCalledWith('/moderation');
  });

  it('explains the AI age limit instead of offering the switch to under-18s', async () => {
    signIn('teen', 15);
    await renderWithTheme(<SettingsScreen />);
    expect(screen.queryByTestId('settings-ai-consent')).not.toBeOnTheScreen();
    expect(screen.getByTestId('settings-ai-age')).toBeOnTheScreen();
  });

  it('links to every about page and shows the app version', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Terms of use' }));
    expect(mockPush).toHaveBeenCalledWith('/about/terms');
    expect(screen.getByText(/^Version /)).toBeOnTheScreen();
  });

  it('signs out of this device only and wipes the account’s data here', async () => {
    sessionUntilSignOut();
    usePreferencesStore.getState().setAllergens(['peanut']);
    usePersonalDetailsStore.getState().update({ heightCm: 170 });
    useSettingsStore.getState().setUnits('metric');
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    expect(usePersonalDetailsStore.getState().details.heightCm).toBeNull();
    expect(useSettingsStore.getState().settings.units).toBe('us');
  });

  it('signs out of every device only after confirming', async () => {
    sessionUntilSignOut();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect(mockAuth.signOut).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(useToastStore.getState().queue).toHaveLength(0);
    alert.mockRestore();
  });

  it('stays signed in and explains when this device could not sign out', async () => {
    mockAuth.signOut.mockResolvedValue({ error: new Error('Network request failed') });
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: 't' } },
      error: null,
    });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(useToastStore.getState().queue[0]?.message).toBe(
        'Could not sign out on this device. Try again.',
      ),
    );
    expect(useSessionStore.getState().status).toBe('ready');
  });
});
