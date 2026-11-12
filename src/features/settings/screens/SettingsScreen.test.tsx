import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import Storage from 'expo-sqlite/kv-store';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';
import { useAppearanceStore, useToastStore } from '@/ui';

import { parsePersistedSettings, resetSettingsDepsForTests, usePreferences } from '../deps';
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

const currentCategories = (): Categories =>
  serverCategories[useSessionStore.getState().userId ?? ''] ?? { social: false, follows: false };

const STORE_KEY = 'famara:settings.user';
const thisYear = new Date().getFullYear();

function signIn(userId = 'user-1', age = 30) {
  useSessionStore.getState().signedIn({
    userId,
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent: false,
  });
}

function stored(userId = 'user-1'): Record<string, unknown> {
  const raw = Storage.getItemSync(STORE_KEY);
  if (!raw) return {};
  const { state } = JSON.parse(raw) as { state: { accounts: Record<string, unknown> } };
  return (state.accounts[userId] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  resetSettingsDepsForTests();
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
  signIn();
});

describe('SettingsScreen', () => {
  it('saves small appetite mode for the signed-in account', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-small-appetite'), 'valueChange', true);

    expect(screen.getByTestId('settings-small-appetite')).toHaveProp('value', true);
    expect(stored()).toMatchObject({
      preferences: expect.objectContaining({ smallAppetite: true }),
    });
  });

  it('keeps one account’s settings away from another account on the same device', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-small-appetite'), 'valueChange', true);
    await act(async () => signIn('user-2'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-small-appetite')).toHaveProp('value', false),
    );
  });

  it('keeps the first account’s settings when a second account changes its own', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-small-appetite'), 'valueChange', true);
    await act(async () => signIn('user-2'));
    await fireEvent(screen.getByTestId('settings-notify-social'), 'valueChange', true);
    await waitFor(() =>
      expect(stored('user-2')).toMatchObject({
        notifications: expect.objectContaining({ social: true }),
      }),
    );

    await act(async () => signIn('user-1'));
    expect(screen.getByTestId('settings-small-appetite')).toHaveProp('value', true);
    expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', false);
  });

  it('starts every notification switch off', async () => {
    await renderWithTheme(<SettingsScreen />);
    for (const key of ['cookTimers', 'social', 'follows']) {
      expect(screen.getByTestId(`settings-notify-${key}`)).toHaveProp('value', false);
    }
  });

  it('saves the units and appearance choices', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('tab', { name: 'Metric' }));
    await user.press(screen.getByRole('tab', { name: 'Dark' }));

    expect(stored()).toMatchObject({ preferences: expect.objectContaining({ units: 'metric' }) });
    expect(useAppearanceStore.getState().preference).toBe('dark');
    expect(Storage.getItemSync('famara:ui.appearance')).toContain('dark');
  });

  it('turns on a notification once permission is granted', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-social'), 'valueChange', true);

    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-social')).toHaveProp('value', true),
    );
    expect(stored()).toMatchObject({
      notifications: expect.objectContaining({ social: true }),
    });
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

  it('keeps cook timer alerts on this device only', async () => {
    await renderWithTheme(<SettingsScreen />);
    await fireEvent(screen.getByTestId('settings-notify-cookTimers'), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notify-cookTimers')).toHaveProp('value', true),
    );
    expect(mockPushApi.save).not.toHaveBeenCalled();
  });

  it('hides the health row until the health feature provides it', async () => {
    await renderWithTheme(<SettingsScreen />);
    expect(screen.queryByTestId('settings-health')).not.toBeOnTheScreen();
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

  it('signs out', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const user = userEvent.setup();
    await renderWithTheme(<SettingsScreen />);
    await user.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockAuth.signOut).toHaveBeenCalled();
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

describe('preferences slice', () => {
  it('reads defaults when nothing is stored', async () => {
    let value: ReturnType<typeof usePreferences> | undefined;
    function Probe() {
      value = usePreferences();
      return null;
    }
    await renderWithTheme(<Probe />);
    expect(value).toMatchObject({ smallAppetite: false, units: 'us', allergens: null });
  });

  it('drops a damaged account entry without losing the others', () => {
    const good = { preferences: { units: 'metric' }, notifications: {} };
    const parsed = parsePersistedSettings({
      accounts: { 'user-1': good, 'user-2': { preferences: { units: 'imperial' } } },
    });
    expect(Object.keys(parsed.accounts)).toEqual(['user-1']);
    expect(parsed.accounts['user-1']?.preferences.units).toBe('metric');
    expect(parsePersistedSettings({ ownerId: 'x' })).toEqual({ accounts: {} });
    expect(parsePersistedSettings(null)).toEqual({ accounts: {} });
  });
});
