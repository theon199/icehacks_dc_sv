import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { queryClient as appQueryClient } from '@/lib/query/client';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { AccountScreen } from './AccountScreen';
import { accountUserQueryKey, signOutLocally } from '../account/accountApi';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `famara://${path}` }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { cache: {} } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockAuth = {
  getUser: jest.fn(),
  updateUser: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ auth: mockAuth, rpc: jest.fn() }),
}));

const people = {
  'user-a': { email: 'ana@example.com', new_email: 'ana@new.example.com', providers: ['email'] },
  'user-b': { email: 'ben@example.com', new_email: null, providers: ['apple'] },
} as const;

type PersonId = keyof typeof people;

function signIn(userId: PersonId) {
  useSessionStore.getState().signedIn({ userId, birthYear: 1990, onboardingComplete: true });
}

/** `getUser` answers for whoever the session store says is signed in, like the real client. */
function serveCurrentUser() {
  mockAuth.getUser.mockImplementation(() => {
    const id = useSessionStore.getState().userId as PersonId;
    const person = people[id];
    return Promise.resolve({
      data: {
        user: {
          id,
          email: person.email,
          new_email: person.new_email,
          app_metadata: { providers: person.providers },
          user_metadata: {},
        },
      },
      error: null,
    });
  });
}

function renderScreen(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return renderWithTheme(
    <QueryClientProvider client={client}>
      <AccountScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useToastStore.getState().clear();
  appQueryClient.clear();
  serveCurrentUser();
  signIn('user-a');
});

describe('AccountScreen', () => {
  it('shows the signed-in email, the pending change and the password form', async () => {
    await renderScreen();
    expect(await screen.findByTestId('account-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByText('Waiting for you to confirm ana@new.example.com.')).toBeOnTheScreen();
    expect(screen.getByTestId('account-password-current')).toBeOnTheScreen();
  });

  it('never shows the previous account after someone else signs in on the device', async () => {
    // Long stale time: the old fixed key would have served the cached first account.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    await renderScreen(client);
    expect(await screen.findByTestId('account-email')).toHaveTextContent('ana@example.com');

    await act(async () => signIn('user-b'));
    await waitFor(() =>
      expect(screen.getByTestId('account-email')).toHaveTextContent('ben@example.com'),
    );
    expect(screen.queryByText(/ana@new\.example\.com/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('account-password-current')).not.toBeOnTheScreen();
    expect(screen.getByText('Set a password')).toBeOnTheScreen();
  });

  it('changes the password after checking the current one against this account', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    await renderScreen();
    await user.type(await screen.findByTestId('account-password-current'), 'old-secret');
    await user.type(screen.getByTestId('account-password-new'), 'new-secret-1');
    await user.type(screen.getByTestId('account-password-confirm'), 'new-secret-1');
    await user.press(screen.getByTestId('account-password-submit'));

    await waitFor(() =>
      expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'new-secret-1' }),
    );
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'old-secret',
    });
    expect(screen.getByTestId('account-password-new')).toHaveDisplayValue('');
  });
});

describe('signing out', () => {
  it('drops cached account details', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    appQueryClient.setQueryData(accountUserQueryKey('user-a'), { id: 'user-a' });
    await signOutLocally();
    expect(appQueryClient.getQueryData(accountUserQueryKey('user-a'))).toBeUndefined();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
