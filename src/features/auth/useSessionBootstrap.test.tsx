import { act, renderHook } from '@testing-library/react-native';

import { useSessionStore } from './sessionStore';
import { useSessionBootstrap } from './useSessionBootstrap';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

const mockAuth = {
  listener: null as AuthListener | null,
  getSession: jest.fn(),
  unsubscribe: jest.fn(),
};

jest.mock('@/lib/env', () => ({ readPublicEnv: () => ({ ok: true }) }));
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockAuth.getSession,
      onAuthStateChange: (listener: AuthListener) => {
        mockAuth.listener = listener;
        return { data: { subscription: { unsubscribe: mockAuth.unsubscribe } } };
      },
    },
  }),
}));

const initial = useSessionStore.getState();

beforeEach(() => {
  useSessionStore.setState(initial, true);
  mockAuth.listener = null;
});

describe('useSessionBootstrap', () => {
  it('moves to signedOut when there is no stored session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('sends a new account to setup and remembers progress per user', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    const { unmount } = await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState()).toMatchObject({ status: 'needsSetup', userId: 'user-1' });

    await act(async () => {
      useSessionStore.getState().setBirthYear(1990);
      useSessionStore.getState().completeOnboarding();
    });
    expect(useSessionStore.getState().status).toBe('ready');
    await unmount();
    expect(mockAuth.unsubscribe).toHaveBeenCalled();

    // A later launch restores straight into the app.
    useSessionStore.setState(initial, true);
    await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('follows sign-out events', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-2' } } } });
    await renderHook(() => useSessionBootstrap());
    await act(async () => mockAuth.listener?.('SIGNED_OUT', null));
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('falls back to signedOut when restoring fails', async () => {
    mockAuth.getSession.mockRejectedValue(new Error('keychain locked'));
    await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
