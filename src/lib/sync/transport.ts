/**
 * `sync_push` / `sync_pull` over the Supabase client, with responses validated by zod and failures
 * mapped to typed `SyncError`s. Every call first checks that the stored session belongs to the
 * account being synced, so one account's local data can never be written into another's.
 */
import { z } from 'zod';

import {
  SyncError,
  type OutgoingDoc,
  type PullResult,
  type PushResult,
  type SyncTransport,
} from './types';
import { getSupabase, type FamaraSupabaseClient } from '../supabase/client';
import type { Json } from '../supabase/database.types';

const serverDocSchema = z.object({
  collection: z.string(),
  doc_id: z.string(),
  data: z.record(z.string(), z.unknown()),
  updated_at: z.string(),
  device_id: z.string(),
  deleted_at: z.string().nullable(),
  revision: z.number(),
});

export const pullResultSchema = z.object({
  documents: z.array(serverDocSchema),
  cursor: z.number(),
  has_more: z.boolean(),
  resync: z.boolean(),
});

export const pushResultSchema = z.object({
  applied: z.array(z.object({ collection: z.string(), doc_id: z.string(), revision: z.number() })),
  rejected: z.array(
    z.object({
      collection: z.string(),
      doc_id: z.string(),
      reason: z.enum(['stale', 'conflict', 'future_timestamp']),
      server: serverDocSchema.omit({ collection: true, doc_id: true }).nullable(),
    }),
  ),
});

const INVALID_CODES = new Set([
  'invalid_input',
  'invalid_document',
  'document_too_large',
  'too_many_documents',
]);

interface RpcErrorLike {
  message?: string;
  code?: string;
}

/** Maps a PostgREST error (see the error contract in docs/BACKEND.md) to a SyncError. */
export function toSyncError(error: RpcErrorLike, status: number): SyncError {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'PT413' || message === 'sync_quota' || status === 413) {
    return new SyncError('quota', 'Synced data is over the account limit.');
  }
  if (code === 'PT401' || status === 401 || status === 403 || code === 'PGRST301') {
    return new SyncError('auth', 'The session is missing or expired.');
  }
  if (code === '22023' || INVALID_CODES.has(message)) {
    return new SyncError('invalid', message || 'The server refused the documents.');
  }
  if (status === 0 || code === '') {
    return new SyncError('network', 'The sync request did not reach the server.');
  }
  return new SyncError('server', `Sync failed (${code || status}).`);
}

function parse<S extends z.ZodType>(schema: S, value: unknown, rpc: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new SyncError('protocol', `Unexpected ${rpc} response.`, { cause: parsed.error });
  }
  return parsed.data;
}

export function createSupabaseTransport(
  expectedUserId: string,
  getClient: () => FamaraSupabaseClient = getSupabase,
): SyncTransport {
  async function client(): Promise<FamaraSupabaseClient> {
    const instance = getClient();
    let sessionUser: string | undefined;
    try {
      const { data } = await instance.auth.getSession();
      sessionUser = data.session?.user.id;
    } catch (cause) {
      throw new SyncError('auth', 'Could not read the session.', { cause });
    }
    if (!sessionUser) throw new SyncError('auth', 'Not signed in.');
    if (sessionUser !== expectedUserId) {
      throw new SyncError('wrong_user', 'The session belongs to a different account.');
    }
    return instance;
  }

  async function call(run: () => PromiseLike<{ data: unknown; error: unknown; status: number }>) {
    let response: { data: unknown; error: unknown; status: number };
    try {
      response = await run();
    } catch (cause) {
      throw new SyncError('network', 'The sync request failed.', { cause });
    }
    if (response.error) throw toSyncError(response.error as RpcErrorLike, response.status);
    return response.data;
  }

  return {
    async push(docs: OutgoingDoc[]): Promise<PushResult> {
      const instance = await client();
      const data = await call(() => instance.rpc('sync_push', { p_docs: docs as unknown as Json }));
      return parse(pushResultSchema, data, 'sync_push');
    },

    async pull(since: number, limit: number, full: boolean): Promise<PullResult> {
      const instance = await client();
      const data = await call(() =>
        instance.rpc('sync_pull', { p_since: since, p_limit: limit, p_full: full }),
      );
      return parse(pullResultSchema, data, 'sync_pull');
    },
  };
}
