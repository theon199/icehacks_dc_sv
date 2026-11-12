import { z } from 'zod';

import { createApiClient, parseRetryAfter, readErrorBody } from './client';
import { ApiError, apiErrorMessage, kindForStatus, type ApiErrorKind } from './errors';

const greetingSchema = z.object({ greeting: z.string() });

/** Builds a fake HTTP reply. Strings are sent verbatim; anything else is serialised. */
const reply = {
  json(payload: unknown, init: { status?: number; retryAfter?: string } = {}): Response {
    const headers = new Headers([['content-type', 'application/json']]);
    if (init.retryAfter) headers.set('retry-after', init.retryAfter);
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Response(text, { status: init.status ?? 200, headers });
  },
  /** A 200 whose body never finishes downloading. */
  stalledBody(): Response {
    const partial = {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>(() => undefined),
    };
    return partial as unknown as Response;
  },
};

/** A fetch that only settles when its signal aborts, like a request stuck on a dead connection. */
const neverAnswers: typeof fetch = (_input, init) =>
  new Promise<Response>((_never, fail) => {
    const stop = () => fail(new DOMException('stopped', 'AbortError'));
    if (init?.signal?.aborted) stop();
    else init?.signal?.addEventListener('abort', stop);
  });

interface SentRequest {
  url: string;
  init: RequestInit | undefined;
}

interface Harness {
  fetchImpl?: typeof fetch;
  token?: () => Promise<string | null>;
}

function makeClient({
  fetchImpl = async () => reply.json({ greeting: 'hi' }),
  token = async () => 'user-token',
}: Harness = {}) {
  const requests: SentRequest[] = [];
  const call = createApiClient({
    baseUrl: 'https://proj.supabase.co',
    publishableKey: 'sb_publishable_key',
    getAccessToken: token,
    fetch: (input, init) => {
      requests.push({ init, url: String(input) });
      return fetchImpl(input, init);
    },
  });
  return { call, requests };
}

/** Runs the call and hands back the ApiError it failed with (or fails the test). */
async function failureOf(work: Promise<unknown>): Promise<ApiError> {
  const outcome = await work.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof ApiError))
    throw new Error(`expected an ApiError, got ${String(outcome)}`);
  return outcome;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return { ...(init?.headers as Record<string, string> | undefined) };
}

describe('createApiClient', () => {
  it('posts JSON with the user token and strips unknown fields from the reply', async () => {
    const { call, requests } = makeClient({
      fetchImpl: async () => reply.json({ greeting: 'hi', extra: 1 }),
    });
    const result = await call('chef-reply', { text: 'hello' }, greetingSchema);

    expect(result).toEqual({ greeting: 'hi' });
    expect(requests.length).toBe(1);
    const [sent] = requests;
    expect(sent?.url).toBe('https://proj.supabase.co/functions/v1/chef-reply');
    expect(sent?.init?.method).toBe('POST');
    expect(sent?.init?.body).toBe('{"text":"hello"}');
    const headers = headersOf(sent?.init);
    expect(headers.Authorization).toBe('Bearer user-token');
    expect(headers.apikey).toBe('sb_publishable_key');
  });

  it('sends only the apikey header when nobody is signed in', async () => {
    const { call, requests } = makeClient({ token: async () => null });
    await call('public-fn', {}, greetingSchema);
    const headers = headersOf(requests[0]?.init);
    expect('Authorization' in headers).toBe(false);
    expect(headers.apikey).toBe('sb_publishable_key');
  });

  it('treats a failing token lookup as signed out', async () => {
    const { call, requests } = makeClient({
      token: () => Promise.reject(new Error('keychain locked')),
    });
    await call('public-fn', {}, greetingSchema);
    expect('Authorization' in headersOf(requests[0]?.init)).toBe(false);
  });

  it('turns a rate-limit reply into a typed error with the wait time', async () => {
    const { call } = makeClient({
      fetchImpl: async () =>
        reply.json(
          { error: { code: 'too_many', message: 'Slow down' } },
          { status: 429, retryAfter: '120' },
        ),
    });
    const error = await failureOf(call('chef-reply', {}, greetingSchema));
    expect([error.kind, error.code, error.retryAfterSeconds, error.retryable]).toEqual([
      'rate_limited',
      'too_many',
      120,
      false,
    ]);
    expect(error.userMessage).toContain('about 2 minutes');
  });

  it('flags a reply that breaks the schema as a non-retryable server error', async () => {
    const { call } = makeClient({ fetchImpl: async () => reply.json({ greeting: 5 }) });
    const error = await failureOf(call('chef-reply', {}, greetingSchema));
    expect(error.kind).toBe('server');
    expect(error.code).toBe('invalid_response');
    expect(error.retryable).toBe(false);
  });

  it('marks a dropped connection as a retryable network error', async () => {
    const { call } = makeClient({
      fetchImpl: () => Promise.reject(new TypeError('connection reset')),
    });
    const error = await failureOf(call('chef-reply', {}, greetingSchema));
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  describe('timeouts and cancellation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    async function kindAfterTimeout(harness: Harness): Promise<ApiErrorKind> {
      const { call } = makeClient(harness);
      const pending = failureOf(call('slow', {}, greetingSchema, { timeoutMs: 1000 }));
      await jest.advanceTimersByTimeAsync(1001);
      return (await pending).kind;
    }

    it('times out a request that never answers', async () => {
      await expect(kindAfterTimeout({ fetchImpl: neverAnswers })).resolves.toBe('timeout');
    });

    it('times out while the session token is still refreshing', async () => {
      const kind = await kindAfterTimeout({ token: () => new Promise(() => undefined) });
      expect(kind).toBe('timeout');
    });

    it('times out while the body is still downloading', async () => {
      const kind = await kindAfterTimeout({ fetchImpl: async () => reply.stalledBody() });
      expect(kind).toBe('timeout');
    });

    it.each<[string, Harness]>([
      ['the request is in flight', { fetchImpl: neverAnswers }],
      ['the token is refreshing', { token: () => new Promise(() => undefined) }],
      ['the body is downloading', { fetchImpl: async () => reply.stalledBody() }],
    ])('reports cancelled when the caller aborts while %s', async (_label, harness) => {
      const caller = new AbortController();
      const { call } = makeClient(harness);
      const pending = failureOf(call('slow', {}, greetingSchema, { signal: caller.signal }));
      await jest.advanceTimersByTimeAsync(0);
      caller.abort();
      expect((await pending).kind).toBe('cancelled');
    });

    it('never sends a request whose signal is already aborted', async () => {
      const caller = new AbortController();
      caller.abort();
      const { call, requests } = makeClient();
      const error = await failureOf(call('x', {}, greetingSchema, { signal: caller.signal }));
      expect(error.kind).toBe('cancelled');
      expect(requests.length).toBe(0);
    });
  });

  it('refuses function names that could escape the functions path', async () => {
    const { call, requests } = makeClient();
    await expect(call('../admin', {}, greetingSchema)).rejects.toThrow(
      'Invalid edge function name',
    );
    expect(requests.length).toBe(0);
  });
});

describe('error helpers', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [408, 'timeout'],
    [422, 'validation'],
    [429, 'rate_limited'],
    [503, 'server'],
  ] as const)('maps HTTP %i to %s', (status, kind) => {
    expect(kindForStatus(status)).toBe(kind);
  });

  it('understands nested, flat and plain-string error bodies', () => {
    expect(readErrorBody({ error: { code: 'c', message: 'm' } })).toEqual({
      code: 'c',
      message: 'm',
    });
    expect(readErrorBody({ error: 'plain' })).toEqual({ message: 'plain' });
    expect(readErrorBody({ code: 'x', message: 'y' })).toEqual({ code: 'x', message: 'y' });
    expect(readErrorBody('<html>')).toEqual({});
  });

  it('reads Retry-After as seconds or as an HTTP date', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });

  it('has readable copy for every error kind', () => {
    const kinds: ApiErrorKind[] = [
      'network',
      'timeout',
      'cancelled',
      'unauthorized',
      'forbidden',
      'rate_limited',
      'validation',
      'server',
    ];
    const short = kinds.filter(
      (kind) => apiErrorMessage(new ApiError({ kind, functionName: 'f' })).length < 10,
    );
    expect(short).toEqual([]);
  });

  it('passes the server wording through for validation errors', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'f',
      serverMessage: 'Too long',
    });
    expect(error.userMessage).toBe('Too long');
  });
});
