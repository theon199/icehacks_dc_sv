/**
 * Supabase calls for moderation and safety, with every failure turned into a typed `ApiError` so
 * screens can use the shared error UI. RPCs raise `message` = machine code and `details` = a
 * sentence that is safe to show (see docs/BACKEND.md, "Stable error contract").
 */
import type { PostgrestError } from '@supabase/supabase-js';
import type { z } from 'zod';

import { ApiError, INVALID_RESPONSE, type ApiErrorKind } from '@/lib/api/errors';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type PublicFunctions = Database['public']['Functions'];

/** Name of a `public` RPC known to the generated schema types. */
export type RpcName = keyof PublicFunctions;

function kindForSqlState(code: string | undefined): ApiErrorKind {
  switch (code) {
    case 'PT401':
      return 'unauthorized';
    case 'PT403':
      return 'forbidden';
    case 'PT429':
      return 'rate_limited';
    case 'PT404':
    case 'PT409':
    case '22023':
    case '23514':
      return 'validation';
    default:
      return code ? 'server' : 'network';
  }
}

/** Wraps a PostgREST failure (or a thrown fetch error) as an `ApiError`. */
export function toApiError(name: string, error: PostgrestError | Error): ApiError {
  if (!('code' in error))
    return new ApiError({ kind: 'network', functionName: name, cause: error });
  const kind = kindForSqlState(error.code || undefined);
  return new ApiError({
    kind,
    functionName: name,
    ...(error.message ? { code: error.message } : {}),
    ...(error.details ? { serverMessage: error.details } : {}),
    cause: error,
  });
}

/** Validates a successful payload, reporting a mismatch as a non-retryable server error. */
export function parseResult<S extends z.ZodType>(name: string, schema: S, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({
      kind: 'server',
      functionName: name,
      code: INVALID_RESPONSE,
      cause: parsed.error,
    });
  }
  return parsed.data as z.infer<S>;
}

/** Calls a `public` RPC and validates its result. */
export async function callRpc<N extends RpcName, S extends z.ZodType>(
  name: N,
  args: PublicFunctions[N]['Args'],
  schema: S,
): Promise<z.infer<S>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toApiError(name, error);
  return parseResult(name, schema, data);
}
