import { useSessionStore } from '@/features/auth';

import {
  AI_CONSENT_WRITE_TIMEOUT_MS,
  AI_TERMS_VERSION,
  forgetAiConsentOnDevice,
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

describe('ordering of account writes', () => {
  /** Lets queued writes start: each one begins on a later microtask. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** updateUser calls that wait until released, so writes can overlap on purpose. */
  function heldWrites() {
    const releases: (() => void)[] = [];
    mockAuth.updateUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ data: {}, error: null }));
        }),
    );
    return {
      releaseNext: async () => {
        await settle();
        releases.shift()?.();
        await settle();
      },
      sent: () =>
        mockAuth.updateUser.mock.calls.map(
          (call) => (call[0] as { data: { ai_consent: { granted: boolean } } }).data.ai_consent,
        ),
    };
  }

  beforeEach(() => mockAuth.updateUser.mockReset());

  it('never sends an old withdrawal after a newer yes', async () => {
    signIn('user-o1', true);
    mockAuth.updateUser.mockRejectedValueOnce(new Error('offline'));
    await setAiConsent(false);
    const writes = heldWrites();

    // A reconcile starts resending the withdrawal, then the person says yes again.
    const reconcile = reconcileAiConsent();
    await settle();
    const agree = setAiConsent(true);
    await writes.releaseNext();
    await writes.releaseNext();
    await Promise.all([reconcile, agree]);

    // The resend was already on its way, so it went first; the yes landed last.
    expect(writes.sent().map((record) => record.granted)).toEqual([false, false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('drops a queued resend once a newer answer has been given', async () => {
    signIn('user-o2', true);
    mockAuth.updateUser.mockRejectedValueOnce(new Error('offline'));
    await setAiConsent(false);
    const writes = heldWrites();

    // Something else is being written, so the reconcile's resend waits its turn.
    const first = setAiConsent(false);
    const reconcile = reconcileAiConsent();
    const agree = setAiConsent(true);
    await writes.releaseNext();
    await writes.releaseNext();
    await Promise.all([first, reconcile, agree]);

    expect(writes.sent().map((record) => record.granted)).toEqual([false, false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('does not reopen AI when a yes finishes after a newer withdrawal', async () => {
    signIn('user-o3', false);
    const writes = heldWrites();
    const agree = setAiConsent(true);
    const withdraw = setAiConsent(false);
    expect(useSessionStore.getState().aiConsent).toBe(false);

    await writes.releaseNext();
    await agree;
    expect(useSessionStore.getState().aiConsent).toBe(false);
    await writes.releaseNext();
    await withdraw;
    expect(writes.sent().map((record) => record.granted)).toEqual([true, false]);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('keeps a newer unsent withdrawal when an older write finishes', async () => {
    signIn('user-o4', true);
    let releaseOlder = () => undefined as void;
    mockAuth.updateUser
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOlder = () => resolve({ data: {}, error: null });
          }),
      )
      .mockRejectedValueOnce(new Error('offline'));
    const older = setAiConsent(false);
    const newer = setAiConsent(false);
    await settle();
    // The older withdrawal reaches the server; the newer one then fails.
    releaseOlder();
    await Promise.all([older, newer]);

    // The newer withdrawal is still on the device, so the next reconcile sends it.
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await reconcileAiConsent();
    expect(mockAuth.updateUser).toHaveBeenCalledTimes(3);
    expect(mockAuth.updateUser).toHaveBeenLastCalledWith({
      data: { ai_consent: expect.objectContaining({ granted: false }) },
    });
    expect(mockAuth.getUser).not.toHaveBeenCalled();
  });

  it('never writes one account’s answer into the next account', async () => {
    signIn('user-o5', true);
    const writes = heldWrites();
    const first = setAiConsent(false);
    await settle();
    const agree = setAiConsent(true).then(
      () => 'saved',
      () => 'refused',
    );
    signIn('user-o6', false);
    await writes.releaseNext();
    await first;
    await expect(agree).resolves.toBe('refused');
    expect(writes.sent()).toHaveLength(1);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });
});

describe('an account write that never answers', () => {
  /** The first updateUser call hangs until released; later calls succeed. */
  function oneHungWrite() {
    let release: () => void = () => undefined;
    mockAuth.updateUser.mockReset();
    mockAuth.updateUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: {}, error: null });
        }),
    );
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    return { release: () => release() };
  }

  const sentAnswers = () =>
    mockAuth.updateUser.mock.calls.map(
      (call) => (call[0] as { data: { ai_consent: { granted: boolean } } }).data.ai_consent.granted,
    );

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('gives up on a stuck yes so later answers are not held behind it', async () => {
    signIn('user-t1', false);
    oneHungWrite();
    const agree = setAiConsent(true);
    const outcome = expect(agree).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await outcome;
    expect(useSessionStore.getState().aiConsent).toBe(false);

    await setAiConsent(false);
    expect(sentAnswers()).toEqual([true, false]);
  });

  it('sends a withdrawal again once a stuck earlier write finally lands', async () => {
    signIn('user-t2', false);
    const hung = oneHungWrite();
    const agree = setAiConsent(true).catch(() => undefined);
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await agree;

    // The withdrawal reaches the server, but the stuck yes could still land after it.
    await setAiConsent(false);
    expect(sentAnswers()).toEqual([true, false]);

    // It lands: the withdrawal kept on the device goes out again and wins.
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([true, false, false]);
    expect(useSessionStore.getState().aiConsent).toBe(false);

    // Nothing is left to resend after that.
    mockAuth.updateUser.mockClear();
    accountRecord('user-t2', withdrawn);
    await reconcileAiConsent();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });
});

describe('forgetAiConsentOnDevice', () => {
  it('drops the account’s unsent withdrawal so nothing is resent', async () => {
    signIn('user-f', true);
    mockAuth.updateUser.mockReset();
    mockAuth.updateUser.mockRejectedValueOnce(new Error('offline'));
    await setAiConsent(false);
    await forgetAiConsentOnDevice('user-f');

    mockAuth.getUser.mockClear();
    accountRecord('user-f', withdrawn);
    mockAuth.updateUser.mockClear();
    await reconcileAiConsent();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
    expect(mockAuth.getUser).toHaveBeenCalled();
  });
});

describe('readConsentRecord', () => {
  it('accepts only a well-formed record', () => {
    expect(readConsentRecord({ ai_consent: granted })).toEqual(granted);
    expect(readConsentRecord({ ai_consent: { granted: 'yes' } })).toBeNull();
    expect(readConsentRecord(null)).toBeNull();
  });
});
