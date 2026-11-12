import { act, renderHook } from '@testing-library/react-native';

import { queryClient } from '@/lib/query/client';

import { preferences, sync } from './deps';
import { readCachedSetup } from './profileCache';
import { useSessionStore } from './sessionStore';
import { useSessionBootstrap } from './useSessionBootstrap';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

const mockAuth = {
  listener: null as AuthListener | null,
  getSession: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
  unsubscribe: jest.fn(),
  rpc: jest.fn(),
};

jest.mock('@/lib/env', () => ({ readPublicEnv: () => ({ ok: true }) }));
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: mockAuth.rpc,
    auth: {
      getSession: mockAuth.getSession,
      signOut: mockAuth.signOut,
      onAuthStateChange: (listener: AuthListener) => {
        mockAuth.listener = listener;
        return { data: { subscription: { unsubscribe: mockAuth.unsubscribe } } };
      },
    },
  }),
}));

const thisYear = new Date().getFullYear();
const initial = useSessionStore.getState();

function serverAge(ageYears: number | null) {
  return {
    data: {
      user_id: 'user-1',
      handle: 'cook_1',
      has_birth_year: ageYears != null,
      age_years: ageYears,
      is_adult: ageYears != null && ageYears >= 18,
      is_underage: ageYears != null && ageYears < 13,
      suspended_until: null,
      roles: [],
    },
    error: null,
  };
}

const signedIn = (id: string) => ({ data: { session: { user: { id } } } });

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  useSessionStore.setState(initial, true);
  mockAuth.listener = null;
  mockAuth.rpc.mockResolvedValue(serverAge(null));
});

describe('useSessionBootstrap', () => {
  it('moves to signedOut when there is no stored session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('sends a new account to setup', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'needsSetup',
      userId: 'user-1',
      birthYear: null,
    });
    expect(mockAuth.rpc).toHaveBeenCalledWith('my_account_status', undefined);
  });

  it('takes the birth year from the server and remembers it as a launch hint', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().birthYear).toBe(thisYear - 31);
    expect(readCachedSetup('user-1').birthYear).toBe(thisYear - 31);
  });

  it('keeps the launch hint when the server cannot be reached', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    const first = await renderHook(() => useSessionBootstrap());
    await flush();
    await first.unmount();

    useSessionStore.setState(initial, true);
    mockAuth.rpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().birthYear).toBe(thisYear - 31);
  });

  it('reaches ready when onboarding completes in the preferences store', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    const start = jest.spyOn(sync, 'start');
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().status).toBe('needsSetup');
    expect(start).toHaveBeenCalledWith('user-1');

    await act(async () => {
      preferences.completeOnboarding({
        displayName: null,
        cuisines: [],
        diets: [],
        allergens: [],
        goals: [],
        maxMinutes: null,
        effort: null,
        householdSize: 1,
        pantryStaples: [],
        smallAppetite: false,
      });
    });
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('stops sync and clears user data and cached queries on sign-out', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    const stop = jest.spyOn(sync, 'stop');
    const clearQueries = jest.spyOn(queryClient, 'clear');
    await renderHook(() => useSessionBootstrap());
    await flush();
    await act(async () => {
      preferences.completeOnboarding({
        displayName: 'Sam',
        cuisines: ['italian'],
        diets: [],
        allergens: ['peanut'],
        goals: [],
        maxMinutes: 30,
        effort: 'easy',
        householdSize: 2,
        pantryStaples: [],
        smallAppetite: false,
      });
    });

    await act(async () => mockAuth.listener?.('SIGNED_OUT', null));
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(stop).toHaveBeenCalled();
    expect(clearQueries).toHaveBeenCalled();
    expect(preferences.isOnboardingComplete()).toBe(false);
    expect(preferences.readAnswers()).toBeNull();
  });

  it('signs out when the server no longer accepts the session', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT' } });
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it('falls back to signedOut when restoring fails', async () => {
    mockAuth.getSession.mockRejectedValue(new Error('keychain locked'));
    const { unmount } = await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
    await unmount();
    expect(mockAuth.unsubscribe).toHaveBeenCalled();
  });
});
