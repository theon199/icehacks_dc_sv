import { fingerprint, hashText, stableStringify, utf8Bytes } from './fingerprint';
import { compareVersions, memoryLedgerStorage, freshLedger, timestampMs } from './ledger';
import { createSupabaseTransport, toSyncError } from './transport';
import type { FamaraSupabaseClient } from '../supabase/client';

jest.mock('../supabase/client', () => ({ getSupabase: jest.fn() }));

type Respond = (
  name: string,
  args: unknown,
  signal: AbortSignal,
) => Promise<{ data: unknown; error: unknown; status: number }>;

function fakeClient(options: {
  userId?: string | null;
  respond?: Respond;
}): FamaraSupabaseClient & { rpc: jest.Mock } {
  const respond: Respond =
    options.respond ?? (async () => ({ data: null, error: null, status: 200 }));
  const rpc = jest.fn((name: string, args: unknown) => ({
    abortSignal: (signal: AbortSignal) => respond(name, args, signal),
  }));
  return {
    auth: {
      getSession: jest.fn(async () => ({
        data: {
          session: options.userId === null ? null : { user: { id: options.userId ?? 'u1' } },
        },
      })),
    },
    rpc,
  } as unknown as FamaraSupabaseClient & { rpc: jest.Mock };
}

const pullBody = { documents: [], cursor: 7, has_more: false, resync: false };

describe('createSupabaseTransport', () => {
  it('calls sync_pull with the cursor and validates the response', async () => {
    const client = fakeClient({
      respond: async () => ({ data: pullBody, error: null, status: 200 }),
    });
    const transport = createSupabaseTransport('u1', () => client);
    await expect(transport.pull(5, 500, true)).resolves.toEqual(pullBody);
    expect(client.rpc).toHaveBeenCalledWith('sync_pull', {
      p_since: 5,
      p_limit: 500,
      p_full: true,
    });
  });

  it('calls sync_push with the documents', async () => {
    const body = { applied: [{ collection: 'saved', doc_id: 'r1', revision: 3 }], rejected: [] };
    const client = fakeClient({
      respond: async () => ({ data: body, error: null, status: 200 }),
    });
    const transport = createSupabaseTransport('u1', () => client);
    const doc = {
      collection: 'saved',
      doc_id: 'r1',
      data: { recipeId: 'r1' },
      updated_at: '2026-11-11T10:00:00.000Z',
      device_id: 'd1',
      deleted_at: null,
    };
    await expect(transport.push([doc])).resolves.toEqual(body);
    expect(client.rpc).toHaveBeenCalledWith('sync_push', { p_docs: [doc] });
  });

  it('never calls the server without a session, or for another account', async () => {
    const signedOut = fakeClient({ userId: null });
    await expect(
      createSupabaseTransport('u1', () => signedOut).pull(0, 1, false),
    ).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(signedOut.rpc).not.toHaveBeenCalled();

    const other = fakeClient({ userId: 'u2' });
    await expect(
      createSupabaseTransport('u1', () => other).pull(0, 1, false),
    ).rejects.toMatchObject({
      kind: 'wrong_user',
    });
    expect(other.rpc).not.toHaveBeenCalled();
  });

  it('rejects responses that break the contract', async () => {
    const client = fakeClient({
      respond: async () => ({ data: { documents: 'nope' }, error: null, status: 200 }),
    });
    await expect(
      createSupabaseTransport('u1', () => client).pull(0, 1, false),
    ).rejects.toMatchObject({
      kind: 'protocol',
    });
  });

  it('maps thrown fetch errors to network errors', async () => {
    const client = fakeClient({
      respond: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(
      createSupabaseTransport('u1', () => client).pull(0, 1, false),
    ).rejects.toMatchObject({
      kind: 'network',
      retryable: true,
    });
  });
});

describe('request timeout', () => {
  it('aborts a stalled request and reports a network error', async () => {
    jest.useFakeTimers();
    const client = fakeClient({
      respond: (_name, _args, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () =>
            resolve({ data: null, error: { message: 'AbortError', code: '' }, status: 0 }),
          );
        }),
    });
    const pending = createSupabaseTransport('u1', () => client).pull(0, 1, false);
    const outcome = expect(pending).rejects.toMatchObject({ kind: 'network' });
    await jest.advanceTimersByTimeAsync(30_000);
    await outcome;
    jest.useRealTimers();
  });
});

describe('toSyncError', () => {
  it.each([
    [{ code: 'PT413', message: 'sync_quota' }, 413, 'quota', false],
    [{ code: 'PT401', message: 'unauthenticated' }, 401, 'auth', true],
    [{ code: '22023', message: 'invalid_document' }, 400, 'invalid', false],
    [{ code: '23514', message: 'violates check constraint' }, 400, 'invalid', false],
    [{ code: 'PGRST100', message: 'bad request' }, 400, 'invalid', false],
    [{ code: 'PT429', message: 'rate_limited' }, 429, 'server', true],
    [{ code: '', message: 'TypeError: Network request failed' }, 0, 'network', true],
    [{ code: 'XX000', message: 'boom' }, 500, 'server', true],
  ])('maps %p (%p) to %p', (error, status, kind, retryable) => {
    const mapped = toSyncError(error, status);
    expect(mapped.kind).toBe(kind);
    expect(mapped.retryable).toBe(retryable);
  });
});

describe('fingerprints', () => {
  it('ignores key order and undefined fields', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(
      '{"a":[1,{"d":2}],"b":1}',
    );
    expect(fingerprint({ a: 1, b: 2 }).hash).toBe(fingerprint({ b: 2, a: 1 }).hash);
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('')).toHaveLength(16);
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes('🍕')).toBe(4);
    expect(utf8Bytes('€')).toBe(3);
  });
});

describe('ledger helpers', () => {
  it('orders versions by time, then device id', () => {
    const a = { updatedAt: '2026-11-11T10:00:00.000Z', deviceId: 'a' };
    expect(compareVersions(a, { ...a, deviceId: 'b' })).toBe(-1);
    expect(compareVersions(a, a)).toBe(0);
    expect(compareVersions({ ...a, updatedAt: '2026-11-11T10:00:00.001Z' }, a)).toBe(1);
  });

  it('parses server timestamps with microseconds', () => {
    expect(timestampMs('2026-11-11T10:00:00.123456+00:00')).toBe(
      Date.parse('2026-11-11T10:00:00.123Z'),
    );
    expect(timestampMs('garbage')).toBe(0);
  });

  it('only loads a ledger for the same account', () => {
    const storage = memoryLedgerStorage();
    storage.save(freshLedger('u1'), []);
    expect(storage.load('u1')?.userId).toBe('u1');
    expect(storage.load('u2')).toBeNull();
  });
});
