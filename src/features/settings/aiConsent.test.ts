import { useSessionStore } from '@/features/auth';

import {
  AI_TERMS_VERSION,
  readConsentRecord,
  reconcileAiConsent,
  resetAiConsentForTests,
  setAiConsent,
} from './aiConsent';

const mockAuth = { updateUser: jest.fn(), getUser: jest.fn() };
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

function signIn(userId: string, aiConsent: boolean) {
  useSessionStore.getState().signedIn({
    userId,
    birthYear: 1980,
    onboardingComplete: true,
    aiConsent,
  });
}

function accountRecord(userId: string, record: unknown) {
  mockAuth.getUser.mockResolvedValue({
    data: { user: { id: userId, user_metadata: { ai_consent: record } } },
    error: null,
  });
}

const granted = {
  granted: true,
  terms_version: AI_TERMS_VERSION,
  decided_at: '2026-11-01T00:00:00Z',
};
const withdrawn = { ...granted, granted: false };

beforeEach(() => {
  resetAiConsentForTests();
});

describe('withdrawing while offline', () => {
  it('closes AI at once and sends the withdrawal on the next reconcile', async () => {
    signIn('user-w', true);
    mockAuth.updateUser.mockRejectedValueOnce(new Error('offline'));
    await setAiConsent(false);
    expect(useSessionStore.getState().aiConsent).toBe(false);

    // The account still says yes, but the unsent withdrawal goes first and wins.
    accountRecord('user-w', granted);
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await reconcileAiConsent();
    expect(mockAuth.updateUser).toHaveBeenLastCalledWith({
      data: { ai_consent: expect.objectContaining({ granted: false }) },
    });
    expect(useSessionStore.getState().aiConsent).toBe(false);
    expect(mockAuth.getUser).not.toHaveBeenCalled();

    // Once sent, nothing is resent and the account record is read normally.
    mockAuth.updateUser.mockClear();
    accountRecord('user-w', withdrawn);
    await reconcileAiConsent();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('keeps retrying while the server stays unreachable', async () => {
    signIn('user-x', true);
    mockAuth.updateUser.mockRejectedValue(new Error('offline'));
    await setAiConsent(false);
    await reconcileAiConsent();
    await reconcileAiConsent();
    expect(mockAuth.updateUser).toHaveBeenCalledTimes(3);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });
});

describe('reconcileAiConsent', () => {
  it('closes AI here when it was turned off on another device', async () => {
    signIn('user-r1', true);
    accountRecord('user-r1', withdrawn);
    await reconcileAiConsent();
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('carries an agreement to a new device', async () => {
    signIn('user-r2', false);
    accountRecord('user-r2', granted);
    await reconcileAiConsent();
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('does not open AI for an agreement to an older explanation', async () => {
    signIn('user-r3', false);
    accountRecord('user-r3', { ...granted, terms_version: AI_TERMS_VERSION - 1 });
    await reconcileAiConsent();
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('leaves the device alone when the account has no record or cannot be read', async () => {
    signIn('user-r4', true);
    accountRecord('user-r4', undefined);
    await reconcileAiConsent();
    expect(useSessionStore.getState().aiConsent).toBe(true);

    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'offline' } });
    await reconcileAiConsent();
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('ignores a record that arrives after the person has answered again', async () => {
    signIn('user-r5', false);
    let answer: (value: unknown) => void = () => undefined;
    mockAuth.getUser.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });

    const pending = reconcileAiConsent();
    await setAiConsent(false);
    answer({
      data: { user: { id: 'user-r5', user_metadata: { ai_consent: granted } } },
      error: null,
    });
    await pending;
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });
});

describe('readConsentRecord', () => {
  it('accepts only a well-formed record', () => {
    expect(readConsentRecord({ ai_consent: granted })).toEqual(granted);
    expect(readConsentRecord({ ai_consent: { granted: 'yes' } })).toBeNull();
    expect(readConsentRecord(null)).toBeNull();
  });
});
