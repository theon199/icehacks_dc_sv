import { z } from 'zod';

import { createApiClient, parseRetryAfter, readErrorBody } from './client';
import { ApiError, apiErrorMessage, kindForStatus } from './errors';

const schema = z.object({ greeting: z.string() });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup(fetchImpl: typeof fetch, token: string | null = 'user-token') {
  const fetchMock = jest.fn(fetchImpl);
  const call = createApiClient({
    baseUrl: 'https://proj.supabase.co',
    publishableKey: 'sb_publishable_key',
    getAccessToken: async () => token,
    fetch: fetchMock,
  });
  return { call, fetchMock };
}

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('Expected the call to fail');
}

describe('createApiClient', () => {
  it('posts JSON with auth headers and returns the parsed body', async () => {
    const { call, fetchMock } = setup(async () => jsonResponse({ greeting: 'hi', extra: 1 }));
    await expect(call('chef-reply', { text: 'hello' }, schema)).resolves.toEqual({
      greeting: 'hi',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://proj.supabase.co/functions/v1/chef-reply');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"text":"hello"}');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer user-token',
      apikey: 'sb_publishable_key',
    });
  });

  it('falls back to the publishable key when signed out', async () => {
    const { call, fetchMock } = setup(async () => jsonResponse({ greeting: 'hi' }), null);
    await call('public-fn', {}, schema);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer sb_publishable_key',
    });
  });

  it('maps HTTP failures to typed errors with server details', async () => {
    const { call } = setup(async () =>
      jsonResponse({ error: { code: 'too_many', message: 'Slow down' } }, 429, {
        'Retry-After': '120',
      }),
    );
    const error = await expectApiError(call('chef-reply', {}, schema));
    expect(error.kind).toBe('rate_limited');
    expect(error.code).toBe('too_many');
    expect(error.retryAfterSeconds).toBe(120);
    expect(error.retryable).toBe(false);
    expect(error.userMessage).toBe("You've hit the limit for now. Try again in about 2 minutes.");
  });

  it('treats a response that fails the schema as a server error', async () => {
    const { call } = setup(async () => jsonResponse({ greeting: 5 }));
    const error = await expectApiError(call('chef-reply', {}, schema));
    expect(error.kind).toBe('server');
    expect(error.code).toBe('invalid_response');
  });

  it('reports network failures', async () => {
    const { call } = setup(async () => {
      throw new TypeError('Network request failed');
    });
    const error = await expectApiError(call('chef-reply', {}, schema));
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('times out slow calls', async () => {
    jest.useFakeTimers();
    try {
      const { call } = setup(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            if (init?.signal?.aborted) reject(new Error('aborted'));
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const pending = expectApiError(call('slow', {}, schema, { timeoutMs: 1000 }));
      await jest.advanceTimersByTimeAsync(1001);
      expect((await pending).kind).toBe('timeout');
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports caller cancellation as cancelled', async () => {
    const controller = new AbortController();
    const { call } = setup(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) reject(new Error('aborted'));
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = expectApiError(call('slow', {}, schema, { signal: controller.signal }));
    controller.abort();
    expect((await pending).kind).toBe('cancelled');
  });

  it('does not send when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { call, fetchMock } = setup(async () => jsonResponse({ greeting: 'hi' }));
    const error = await expectApiError(call('x', {}, schema, { signal: controller.signal }));
    expect(error.kind).toBe('cancelled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe function names', async () => {
    const { call } = setup(async () => jsonResponse({ greeting: 'hi' }));
    await expect(call('../admin', {}, schema)).rejects.toThrow('Invalid edge function name');
  });
});

describe('error helpers', () => {
  it('maps statuses to kinds', () => {
    expect(kindForStatus(401)).toBe('unauthorized');
    expect(kindForStatus(403)).toBe('forbidden');
    expect(kindForStatus(422)).toBe('validation');
    expect(kindForStatus(429)).toBe('rate_limited');
    expect(kindForStatus(503)).toBe('server');
  });

  it('reads the common error body shapes', () => {
    expect(readErrorBody({ error: { code: 'c', message: 'm' } })).toEqual({
      code: 'c',
      message: 'm',
    });
    expect(readErrorBody({ error: 'plain' })).toEqual({ message: 'plain' });
    expect(readErrorBody({ code: 'x', message: 'y' })).toEqual({ code: 'x', message: 'y' });
    expect(readErrorBody('<html>')).toEqual({});
  });

  it('parses Retry-After seconds and dates', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });

  it('has a user-facing message for every kind', () => {
    const kinds = [
      'network',
      'timeout',
      'cancelled',
      'unauthorized',
      'forbidden',
      'rate_limited',
      'validation',
      'server',
    ] as const;
    for (const kind of kinds) {
      expect(apiErrorMessage(new ApiError({ kind, functionName: 'f' })).length).toBeGreaterThan(10);
    }
  });

  it('shows the server message for validation errors', () => {
    const error = new ApiError({
      kind: 'validation',
      functionName: 'f',
      serverMessage: 'Too long',
    });
    expect(error.userMessage).toBe('Too long');
  });
});
