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
  /** The first updateUser call hangs until released or failed; later calls succeed. */
  function oneHungWrite() {
    let release: () => void = () => undefined;
    let fail: () => void = () => undefined;
    mockAuth.updateUser.mockReset();
    mockAuth.updateUser.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          release = () => resolve({ data: {}, error: null });
          fail = () => reject(new Error('connection reset'));
        }),
    );
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    return { release: () => release(), fail: () => fail() };
  }

  const at = (iso: string) => new Date(iso);
  const decided = (isGranted: boolean, iso: string) => ({
    granted: isGranted,
    terms_version: AI_TERMS_VERSION,
    decided_at: at(iso).toISOString(),
  });

  const sentAnswers = () =>
    mockAuth.updateUser.mock.calls.map(
      (call) => (call[0] as { data: { ai_consent: { granted: boolean } } }).data.ai_consent.granted,
    );

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    mockAuth.getUser.mockReset();
  });

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

  it('never resends a yes after a stuck withdrawal lands; it follows the account instead', async () => {
    signIn('user-t3', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false, at('2026-11-02T10:00:00Z'));
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;
    expect(useSessionStore.getState().aiConsent).toBe(false);

    // The person agrees again and the server confirms it.
    await setAiConsent(true, at('2026-11-02T10:01:00Z'));
    expect(useSessionStore.getState().aiConsent).toBe(true);
    expect(sentAnswers()).toEqual([false, true]);

    // The stuck withdrawal lands after the yes. The account record it leaves cannot show whether
    // another device withdrew in the meantime, so the yes is not replayed: this device closes AI
    // to match the account, and the person can agree again.
    accountRecord('user-t3', decided(false, '2026-11-02T10:00:00Z'));
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(false);

    // Nothing is left to resend, and a reconcile keeps following the account.
    mockAuth.updateUser.mockClear();
    await reconcileAiConsent();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('does not undo a withdrawal made on another device when a stuck withdrawal lands late', async () => {
    signIn('user-t14', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false, at('2026-11-02T11:00:00Z'));
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;
    await setAiConsent(true, at('2026-11-02T11:01:00Z'));
    // Another device withdraws; then this device's stuck withdrawal lands over that record.
    accountRecord('user-t14', decided(false, '2026-11-02T11:00:00Z'));
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    // No yes is sent again, so the other device's withdrawal stands.
    expect(sentAnswers()).toEqual([false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('does not resend a yes over a newer withdrawal from another device', async () => {
    signIn('user-t9', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false, at('2026-11-03T10:00:00Z'));
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;
    await setAiConsent(true, at('2026-11-03T10:01:00Z'));
    expect(sentAnswers()).toEqual([false, true]);

    // Another device withdraws, then the stuck withdrawal from this device fails.
    accountRecord('user-t9', decided(false, '2026-11-03T10:05:00Z'));
    hung.fail();
    await jest.advanceTimersByTimeAsync(0);

    // The yes is not sent again, and this device follows the newer withdrawal.
    expect(sentAnswers()).toEqual([false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('sends nothing when a stuck write fails and the account still holds the yes', async () => {
    signIn('user-t10', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false, at('2026-11-04T10:00:00Z'));
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;
    await setAiConsent(true, at('2026-11-04T10:01:00Z'));

    accountRecord('user-t10', decided(true, '2026-11-04T10:01:00Z'));
    hung.fail();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('does not resend a yes when the account cannot be read', async () => {
    signIn('user-t11', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false, at('2026-11-05T10:00:00Z'));
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;
    await setAiConsent(true, at('2026-11-05T10:01:00Z'));

    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'offline' } });
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([false, true]);
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  /**
   * A server that holds every write until the test decides when it is applied and when it
   * answers, and keeps the account record those writes produce, in the order they were applied.
   */
  function modelledServer(userId: string) {
    let account: unknown;
    const held: { granted: boolean; apply: () => void; respond: () => void }[] = [];
    mockAuth.getUser.mockImplementation(() =>
      Promise.resolve({
        data: { user: { id: userId, user_metadata: { ai_consent: account } } },
        error: null,
      }),
    );
    mockAuth.updateUser.mockReset();
    mockAuth.updateUser.mockImplementation(
      (update: { data: { ai_consent: { granted: boolean } } }) =>
        new Promise((resolve) => {
          held.push({
            granted: update.data.ai_consent.granted,
            apply: () => (account = update.data.ai_consent),
            respond: () => resolve({ data: {}, error: null }),
          });
        }),
    );
    return {
      account: () => account as { granted: boolean } | undefined,
      take: () => held.splice(0),
      /** Applies and answers every later write, in order, until nothing more is sent. */
      settleRest: async () => {
        for (let round = 0; round < 5; round += 1) {
          await jest.advanceTimersByTimeAsync(0);
          for (const write of held.splice(0)) {
            write.apply();
            write.respond();
          }
        }
      },
    };
  }

  it.each([
    ['after', true],
    ['before', false],
  ])(
    'ends with the account and device agreeing when a stuck withdrawal is applied %s a newer yes',
    async (_order, withdrawalLast) => {
      signIn('user-t12', true);
      const server = modelledServer('user-t12');

      // The withdrawal hangs and times out; a yes then starts and is held by the server.
      const withdraw = setAiConsent(false, at('2026-11-06T10:00:00Z'));
      await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
      await withdraw;
      const agree = setAiConsent(true, at('2026-11-06T10:01:00Z'));
      await jest.advanceTimersByTimeAsync(0);
      const [no, yes] = server.take();
      expect([no?.granted, yes?.granted]).toEqual([false, true]);
      if (!no || !yes) return;

      // The server applies both in the order under test. The stuck withdrawal answers while the
      // yes is still on its way, then the yes is confirmed.
      if (withdrawalLast) {
        yes.apply();
        no.apply();
      } else {
        no.apply();
        yes.apply();
      }
      no.respond();
      await jest.advanceTimersByTimeAsync(0);
      yes.respond();
      await agree;
      await server.settleRest();

      // When the stuck withdrawal is applied last the account says no, and this device follows
      // it rather than replaying the yes, which could undo a withdrawal made elsewhere.
      expect(useSessionStore.getState().aiConsent).toBe(!withdrawalLast);
      expect(server.account()?.granted).toBe(useSessionStore.getState().aiConsent);
      expect(sentAnswers()).toEqual([false, true]);
    },
  );

  it('keeps a confirmed no on both sides when a timed-out yes is applied later', async () => {
    signIn('user-t13', true);
    const server = modelledServer('user-t13');

    // A withdrawal that the server applies and confirms.
    const withdraw = setAiConsent(false, at('2026-11-06T11:00:00Z'));
    await jest.advanceTimersByTimeAsync(0);
    for (const write of server.take()) {
      write.apply();
      write.respond();
    }
    await withdraw;
    expect(server.account()?.granted).toBe(false);

    // A yes that is held, times out (the person is told it failed), then lands.
    const agree = setAiConsent(true, at('2026-11-06T11:01:00Z'));
    const outcome = expect(agree).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await outcome;
    expect(useSessionStore.getState().aiConsent).toBe(false);
    const [yes] = server.take();
    expect(yes?.granted).toBe(true);
    yes?.apply();
    yes?.respond();
    await server.settleRest();

    expect(useSessionStore.getState().aiConsent).toBe(false);
    expect(server.account()?.granted).toBe(false);
  });

  it('keeps the account and device in step when a stuck yes lands after a withdrawal', async () => {
    signIn('user-t4', false);
    const hung = oneHungWrite();
    const agree = setAiConsent(true).catch(() => undefined);
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await agree;
    await setAiConsent(false);

    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers().at(-1)).toBe(false);
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('adopts the account record when a stuck write lands and no answer was given here', async () => {
    signIn('user-t5', false);
    const hung = oneHungWrite();
    const agree = setAiConsent(true).catch(() => undefined);
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await agree;
    expect(useSessionStore.getState().aiConsent).toBe(false);

    // The yes did reach the account in the end, so this device follows it.
    accountRecord('user-t5', granted);
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([true]);
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('sends nothing for a stuck write that lands after another account signed in', async () => {
    signIn('user-t6', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false);
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;

    signIn('user-t7', false);
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    expect(sentAnswers()).toEqual([false]);
    expect(mockAuth.getUser).not.toHaveBeenCalled();
  });

  it('ignores a stuck write from before a reset', async () => {
    signIn('user-t8', true);
    const hung = oneHungWrite();
    const withdraw = setAiConsent(false);
    await jest.advanceTimersByTimeAsync(AI_CONSENT_WRITE_TIMEOUT_MS);
    await withdraw;

    resetAiConsentForTests();
    hung.release();
    await jest.advanceTimersByTimeAsync(0);
    // Nothing reacts to it, and the late write count is not left below zero: a withdrawal that
    // reaches the server is forgotten straight away instead of being kept for a resend.
    expect(sentAnswers()).toEqual([false]);
    await setAiConsent(false);
    mockAuth.updateUser.mockClear();
    accountRecord('user-t8', withdrawn);
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
