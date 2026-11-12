import { useSessionStore } from '@/features/auth';
import { aiApi, type ChefResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';
import { listCandidates, searchRecipes } from '@/lib/catalog/queries';
import { useChefStore, usePreferencesStore } from '@/stores';

import { askChef, resetChefSession, useChefSession } from './chefSession';
import { answeredPrefs, recipe } from '../__fixtures__/recipe';

jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
}));

let mockIds = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockIds}` }));

const askSpy = jest.spyOn(aiApi, 'askChef');
const initialSession = useSessionStore.getState();
const NOW = Date.parse('2026-11-12T18:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const lentils = recipe('r:lentils', { title: 'Lentil soup' });

function signIn(userId: string) {
  useSessionStore.getState().signedIn({
    userId,
    birthYear: 1990,
    onboardingComplete: true,
    aiConsent: true,
  });
}

function threadWithQuestion(text = 'Dinner?') {
  const store = useChefStore.getState();
  const id = store.startThread(text);
  store.append(id, { role: 'user', text });
  return id;
}

function reply(overrides: Partial<ChefResponse> = {}): ChefResponse {
  return {
    reply: 'Try the lentil soup.',
    recipe_ids: ['r:lentils'],
    follow_ups: ['Make it spicier?'],
    quota: { remaining: 0, reset_at: '2026-11-13T00:00:00.000Z' },
    ...overrides,
  };
}

function quotaError(retryAfterSeconds?: number) {
  return new ApiError({
    kind: 'rate_limited',
    functionName: 'chef',
    status: 429,
    code: 'quota_exceeded',
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  });
}

/** A Chef answer the test settles by hand, to change accounts while it is in flight. */
function deferredAnswer() {
  let settle: { resolve: (value: ChefResponse) => void; reject: (error: unknown) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  askSpy.mockImplementation(
    () => new Promise<ChefResponse>((resolve, reject) => (settle = { resolve, reject })),
  );
  return {
    resolve: (value: ChefResponse) => settle.resolve(value),
    reject: (error: unknown) => settle.reject(error),
  };
}

async function untilAsked() {
  while (askSpy.mock.calls.length === 0) await Promise.resolve();
}

function switchAccount(to: string) {
  useSessionStore.getState().signedOut();
  signIn(to);
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  useSessionStore.setState(initialSession, true);
  useChefStore.getState().reset();
  resetChefSession();
  usePreferencesStore.setState({ prefs: answeredPrefs() });
  askSpy.mockReset();
  jest.mocked(listCandidates).mockResolvedValue([{ ...lentils, ingredientIds: [] }]);
  jest.mocked(searchRecipes).mockResolvedValue({ items: [lentils], nextCursor: null });
  signIn('person-a');
});

afterEach(() => jest.useRealTimers());

describe('askChef across accounts', () => {
  it('drops an answer that arrives after the account changed', async () => {
    const threadId = threadWithQuestion();
    const answer = deferredAnswer();
    const asking = askChef({ threadId, photo: null });
    await untilAsked();

    switchAccount('person-b');
    // The next account starts its own question before the old one comes back.
    useChefSession.setState({ sendingIn: 'thread-of-b' });
    answer.resolve(reply());
    await asking;

    const session = useChefSession.getState();
    expect(session.sendingIn).toBe('thread-of-b');
    expect(session.followUps).toEqual({});
    expect(session.quotaNote).toBeNull();
    expect(session.limitedUntil).toBeNull();
    expect(useChefStore.getState().threads[threadId]?.messages.map((m) => m.role)).toEqual([
      'user',
    ]);
  });

  it('drops a failure that arrives after the account changed', async () => {
    const threadId = threadWithQuestion();
    const answer = deferredAnswer();
    const asking = askChef({ threadId, photo: 'base64-photo' });
    await untilAsked();

    switchAccount('person-b');
    answer.reject(quotaError(3600));
    await asking;

    const session = useChefSession.getState();
    expect(session.failures).toEqual({});
    expect(session.quotaNote).toBeNull();
    expect(session.limitedUntil).toBeNull();
    expect(session.sendingIn).toBeNull();
  });

  it('still lands the answer when the same account stays signed in', async () => {
    const threadId = threadWithQuestion();
    askSpy.mockResolvedValue(
      reply({ quota: { remaining: 12, reset_at: '2026-11-13T00:00:00.000Z' } }),
    );
    await askChef({ threadId, photo: null });

    const session = useChefSession.getState();
    expect(session.sendingIn).toBeNull();
    expect(session.followUps[threadId]).toEqual(['Make it spicier?']);
    expect(useChefStore.getState().threads[threadId]?.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
  });
});

describe('askChef daily limit', () => {
  it('holds the limit until the server reset time on a last answer', async () => {
    askSpy.mockResolvedValue(reply());
    await askChef({ threadId: threadWithQuestion(), photo: null });

    expect(useChefSession.getState().limitedUntil).toBe(Date.parse('2026-11-13T00:00:00.000Z'));
    expect(useChefSession.getState().quotaNote).toBe('That was your last Chef request for today.');
  });

  it('falls back to an hour from now when the reset time cannot be read', async () => {
    askSpy.mockResolvedValue(reply({ quota: { remaining: 0, reset_at: 'not a date' } }));
    await askChef({ threadId: threadWithQuestion(), photo: null });

    expect(useChefSession.getState().limitedUntil).toBe(NOW + HOUR_MS);
  });

  it('clears the limit when allowance remains', async () => {
    useChefSession.setState({ limitedUntil: NOW + HOUR_MS });
    jest.advanceTimersByTime(5000);
    askSpy.mockResolvedValue(
      reply({ quota: { remaining: 3, reset_at: '2026-11-13T00:00:00.000Z' } }),
    );
    await askChef({ threadId: threadWithQuestion(), photo: null });

    expect(useChefSession.getState().limitedUntil).toBeNull();
  });

  it('waits for the retry-after time of a spent allowance', async () => {
    jest.advanceTimersByTime(30_000);
    askSpy.mockRejectedValue(quotaError(2 * 3600));
    const threadId = threadWithQuestion();
    await askChef({ threadId, photo: null });

    const session = useChefSession.getState();
    expect(session.limitedUntil).toBe(NOW + 30_000 + 2 * HOUR_MS);
    expect(session.failures[threadId]?.problem.kind).toBe('daily_limit');
    expect(session.sendingIn).toBeNull();
  });

  it('waits an hour when a spent allowance comes without a retry-after time', async () => {
    askSpy.mockRejectedValue(quotaError());
    await askChef({ threadId: threadWithQuestion(), photo: null });

    expect(useChefSession.getState().limitedUntil).toBe(NOW + HOUR_MS);
  });
});
